import { expect, test } from "bun:test";
import { resolveTuringSdkRoot } from "../../src/providers/integrations/buddy/turing-device-token";

test("does not resolve a bundled proprietary TuringShield SDK by default", () => {
  const previous = process.env.CARTETHYIA_TURING_SDK_PATH;
  try {
    delete process.env.CARTETHYIA_TURING_SDK_PATH;
    expect(resolveTuringSdkRoot()).toBeNull();
  } finally {
    if (previous === undefined) delete process.env.CARTETHYIA_TURING_SDK_PATH;
    else process.env.CARTETHYIA_TURING_SDK_PATH = previous;
  }
});
