import { afterAll, beforeAll, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { createProviderDetailRoutes } from "../../src/console/providers/detail/routes";
import { DrizzleProviderDetailStore } from "../../src/console/providers/detail/store";
import { fullSchema, type CartethyiaDatabase } from "../../src/persistence/postgres";
import { createAccessDecision, consoleSessionScopes } from "../../src/security/access-control";
import { createProvider, createTenant } from "../helpers/fixtures";
import { createRunId, dbDescribe, getTestPool } from "../helpers/database";

let pool: Pool | undefined;
let db: CartethyiaDatabase | undefined;
let providerId: string | undefined;
let tenantId: string | undefined;

function adminAccess() {
  if (!tenantId) throw new Error("usage-floor fixture tenant is not initialized");
  return createAccessDecision({
    id: "usage-floor-http-test",
    tenantId,
    scopes: consoleSessionScopes(true),
    admissionIdentity: "usage-floor-http-test",
  });
}

function app() {
  if (!db || !providerId) throw new Error("usage-floor fixture is not initialized");
  return createProviderDetailRoutes({
    store: new DrizzleProviderDetailStore(db),
    accessResolver: () => adminAccess(),
  } as never);
}

dbDescribe("usage floor over isolated HTTP routes", () => {
  beforeAll(async () => {
    pool = await getTestPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const runId = createRunId("usage-floor-http");
      const tenant = await createTenant(client, runId);
      tenantId = tenant.tenantId;
      providerId = await createProvider(client, runId, { tenantId });
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    db = drizzle(pool, { schema: fullSchema });
  });

  afterAll(async () => {
    if (pool && tenantId) {
      await pool.query("DELETE FROM tenants WHERE id = $1", [tenantId]);
    }
  });

  test("round-trips a percent floor through PATCH then GET", async () => {
    const responseApp = app();
    const patchResponse = await responseApp.handle(
      new Request(`http://localhost/providers/${providerId}/routing`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usageFloor: 25, usageFloorUnit: "percent" }),
      }),
    );
    expect(patchResponse.status).toBe(200);
    const patched = (await patchResponse.json()) as Record<string, unknown>;
    expect(patched.usageFloor).toBe(25);
    expect(patched.usageFloorUnit).toBe("percent");

    const getResponse = await responseApp.handle(
      new Request(`http://localhost/providers/${providerId}/routing`),
    );
    expect(getResponse.status).toBe(200);
    const read = (await getResponse.json()) as Record<string, unknown>;
    expect(read.usageFloor).toBe(25);
    expect(read.usageFloorUnit).toBe("percent");
    expect(typeof read.creditLimit).toBe("number");
  });

  test("accepts the credit unit", async () => {
    const response = await app().handle(
      new Request(`http://localhost/providers/${providerId}/routing`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usageFloor: 250, usageFloorUnit: "credit" }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.usageFloor).toBe(250);
    expect(body.usageFloorUnit).toBe("credit");
  });

  test("clearing the floor stores null rather than zero", async () => {
    const response = await app().handle(
      new Request(`http://localhost/providers/${providerId}/routing`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usageFloor: null }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.usageFloor).toBeNull();
  });

  test("rejects an out-of-range floor and an unknown unit", async () => {
    const tooBig = await app().handle(
      new Request(`http://localhost/providers/${providerId}/routing`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usageFloor: 1_000_001 }),
      }),
    );
    expect(tooBig.status).toBeGreaterThanOrEqual(400);
    expect(tooBig.status).toBeLessThan(500);

    const badUnit = await app().handle(
      new Request(`http://localhost/providers/${providerId}/routing`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usageFloor: 10, usageFloorUnit: "percentage" }),
      }),
    );
    expect(badUnit.status).toBeGreaterThanOrEqual(400);
    expect(badUnit.status).toBeLessThan(500);
  });
});
