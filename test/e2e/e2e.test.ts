import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCases } from "./case-manifest";
import { runCase } from "./case-runner";
import { loadRequirements } from "./requirements";
import { validateTraceability } from "./traceability";

const repoRoot = path.resolve(import.meta.dirname, "../..");

describe("e2e case tree", () => {
  it("has valid requirement traceability", async () => {
    const requirements = await loadRequirements(repoRoot);
    const cases = await loadCases(repoRoot);
    expect(() =>
      validateTraceability(
        requirements,
        cases.map((entry) => entry.manifest),
      ),
    ).not.toThrow();
  });

  it("runs every e2e case through the real CLI", async () => {
    const cases = await loadCases(repoRoot);
    for (const testCase of cases) {
      await runCase(repoRoot, testCase);
    }
  }, 30_000);
});
