import { describe, expect, test } from "bun:test";
import { antigravityWireModelId } from "../../src/providers/integrations/antigravity/antigravity-protocol";

describe("Antigravity model-to-wire routing", () => {
  test("routes the discovered Gemini 4 Argon family through a supported default tier", () => {
    // The catalog collapses low/medium/high variants to this logical id, but
    // Cloud Code Assist rejects the bare id with upstream 404.
    expect(antigravityWireModelId("gemini-4-argon")).toBe("gemini-4-argon-medium");
  });

  test("preserves an explicitly tiered Argon wire id", () => {
    expect(antigravityWireModelId("gemini-4-argon-high")).toBe("gemini-4-argon-high");
  });
});
