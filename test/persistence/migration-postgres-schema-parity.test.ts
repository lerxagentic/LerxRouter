import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { dbDescribe, getTestPool } from "../helpers/database";

const MIGRATION_ID = "0044_postgres_schema_parity_fields.sql";

async function tableColumns(tableName: string): Promise<string[]> {
  const pool = await getTestPool();
  const result = await pool.query(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
      order by column_name`,
    [tableName],
  );
  return result.rows.map((row) => String(row.column_name));
}

async function selectedColumns(tableName: string, names: string[]): Promise<string[]> {
  const pool = await getTestPool();
  const result = await pool.query(
    `select column_name
       from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
        and column_name = any($2::text[])
      order by column_name`,
    [tableName, names],
  );
  return result.rows.map((row) => String(row.column_name));
}

async function telemetryIndexPreflightSql(): Promise<string> {
  const source = await readFile(
    new URL("../../migrations/0044_postgres_schema_parity_fields.sql", import.meta.url),
    "utf8",
  );
  const block = source.match(/DO \$migration\$[\s\S]*?\$migration\$;/)?.[0];
  if (!block) throw new Error("migration 0044 is missing the telemetry duplicate preflight");
  return block;
}

dbDescribe("PostgreSQL schema parity migration", () => {
  test("adds the missing network-pool probe state columns", async () => {
    expect(
      await selectedColumns("network_pools", [
        "provider_probe_provider_id",
        "provider_probe_status",
        "provider_probe_http_status",
        "provider_probe_reason",
        "provider_probe_latency_ms",
        "provider_probe_at",
        "provider_probe_endpoint",
        "provider_cooldowns",
      ]),
    ).toEqual([
      "provider_cooldowns",
      "provider_probe_at",
      "provider_probe_endpoint",
      "provider_probe_http_status",
      "provider_probe_latency_ms",
      "provider_probe_provider_id",
      "provider_probe_reason",
      "provider_probe_status",
    ]);
  });

  test("adds telemetry client and reported-model columns", async () => {
    expect(await selectedColumns("telemetry_events", ["client_name", "reported_model"])).toEqual([
      "client_name",
      "reported_model",
    ]);
  });

  test("creates the Buddy usage snapshot table", async () => {
    expect(await tableColumns("buddy_usage_snapshots")).toEqual([
      "account_id",
      "credit",
      "day_key",
      "model",
      "synced_at",
    ]);
  });

  test("creates encrypted InferHub config storage", async () => {
    expect(await tableColumns("inferhub_config_keys")).toEqual([
      "ciphertext",
      "fingerprint",
      "id",
      "updated_at",
    ]);
  });

  test("creates telemetry reconciliation state", async () => {
    expect(await tableColumns("telemetry_reconciliation_state")).toEqual([
      "byte_offset",
      "conflicts",
      "events_examined",
      "events_inserted",
      "file_name",
      "files_completed",
      "job_name",
      "lease_expires_at",
      "lease_owner",
      "updated_at",
    ]);
  });

  test("creates the unique telemetry request idempotency index", async () => {
    const pool = await getTestPool();
    const result = await pool.query(
      `select indexdef
         from pg_indexes
        where schemaname = 'public'
          and tablename = 'telemetry_events'
          and indexname = 'telemetry_events_tenant_request_uidx'`,
    );
    expect(result.rows).toHaveLength(1);
    const indexDefinition = String(result.rows[0]?.indexdef ?? "");
    expect(indexDefinition).toContain("CREATE UNIQUE INDEX");
    expect(indexDefinition).toContain("(tenant_id, request_id)");
  });

  test("allows the index preflight when request identities are unique", async () => {
    const pool = await getTestPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "CREATE TEMP TABLE telemetry_events (tenant_id uuid NOT NULL, request_id text NOT NULL) ON COMMIT DROP",
      );
      await client.query(
        "INSERT INTO telemetry_events (tenant_id, request_id) VALUES ($1, $2)",
        ["00000000-0000-4000-8000-000000000001", "request-1"],
      );
      await client.query(await telemetryIndexPreflightSql());
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  test("refuses duplicate identities without deleting telemetry rows", async () => {
    const pool = await getTestPool();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "CREATE TEMP TABLE telemetry_events (tenant_id uuid NOT NULL, request_id text NOT NULL) ON COMMIT DROP",
      );
      await client.query(
        "INSERT INTO telemetry_events (tenant_id, request_id) VALUES ($1, $2), ($1, $2)",
        ["00000000-0000-4000-8000-000000000001", "duplicate-request"],
      );
      await client.query("SAVEPOINT before_telemetry_preflight");
      await expect(client.query(await telemetryIndexPreflightSql())).rejects.toThrow(
        "Cannot create telemetry_events_tenant_request_uidx",
      );
      await client.query("ROLLBACK TO SAVEPOINT before_telemetry_preflight");
      const rows = await client.query("SELECT count(*)::int AS count FROM telemetry_events");
      expect(rows.rows[0]?.count).toBe(2);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  test("records the forward migration", async () => {
    const pool = await getTestPool();
    const result = await pool.query(
      "select migration_id from cartethyia_schema_migrations where migration_id = $1",
      [MIGRATION_ID],
    );
    expect(result.rows).toEqual([{ migration_id: MIGRATION_ID }]);
  });
});
