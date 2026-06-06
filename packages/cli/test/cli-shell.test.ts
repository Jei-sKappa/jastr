import { describe, expect, it } from "vitest";
import { createEmptyTempProject, runCli } from "./support/helpers";

describe("jastr cli shell", () => {
  it("prints version from the cli package with the dev marker when run from source", async () => {
    const project = await createEmptyTempProject();
    try {
      const result = await runCli(["--version"], project.root);

      expect(result.exitCode).toBe(0);
      expect(result.stdout.trim()).toBe("0.1.0 (dev)");
      expect(result.stderr).toBe("");
    } finally {
      await project.cleanup();
    }
  });

  it("prints root help for jastr commands", async () => {
    const project = await createEmptyTempProject();
    try {
      const result = await runCli(["--help"], project.root);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Usage: jastr");
      expect(result.stdout).toContain("run");
      expect(result.stdout).toContain("generate");
      expect(result.stderr).toBe("");
    } finally {
      await project.cleanup();
    }
  });

  it("reports no arguments as one Error-prefixed line", async () => {
    const project = await createEmptyTempProject();
    try {
      const result = await runCli([], project.root);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        "Error: Expected command shape: jastr run <template-ref> [input flags...] or jastr generate agent-skill <template-ref> --out <path> [--force].",
      );
    } finally {
      await project.cleanup();
    }
  });
});
