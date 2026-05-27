import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadExamples, validateExampleReferences } from "./example-manifest";
import { runExample } from "./example-runner";

const repoRoot = path.resolve(import.meta.dirname, "../..");

describe("docs executable examples", () => {
  it("validates docs example references", async () => {
    await expect(validateExampleReferences(repoRoot)).resolves.toBeUndefined();
  });

  it("runs every docs example", async () => {
    const examples = await loadExamples(repoRoot);
    expect(examples.length).toBeGreaterThan(0);

    for (const example of examples) {
      await runExample(repoRoot, example);
    }
  }, 30_000);
});
