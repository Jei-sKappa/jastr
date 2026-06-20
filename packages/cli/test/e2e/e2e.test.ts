import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCases } from "./harness/case-manifest";
import { runCase } from "./harness/case-runner";
import { loadRequirements } from "./harness/requirements";
import { validateTraceability } from "./harness/traceability";

const repoRoot = path.resolve(import.meta.dirname, "../..");

// Load the cases once at collection time so each becomes its own test. Each case
// spawns a cold `bun` CLI subprocess, so a single aggregate loop put every case
// under one shared timeout — a slow full-suite run could starve those spawns and
// trip that one ceiling regardless of any individual case being fine. Per-case
// tests give each its own timeout and run isolated cases concurrently, and a
// failure now names the exact case instead of "the loop timed out".
const cases = await loadCases(repoRoot);

describe("e2e case tree", () => {
  it("has valid requirement traceability", async () => {
    const requirements = await loadRequirements(repoRoot);
    expect(() =>
      validateTraceability(
        requirements,
        cases.map((entry) => entry.manifest),
      ),
    ).not.toThrow();
  });

  it.concurrent.each(
    cases,
  )("runs e2e case $manifest.id through the real CLI", async (testCase) => {
    await runCase(repoRoot, testCase);
  }, 30_000);
});
