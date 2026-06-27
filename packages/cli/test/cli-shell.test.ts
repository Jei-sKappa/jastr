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
      expect(result.stdout).toContain("validate");
      expect(result.stderr).toBe("");
    } finally {
      await project.cleanup();
    }
  });

  it("mentions named, variant, and direct file references in command help", async () => {
    const project = await createEmptyTempProject();
    try {
      const runHelp = await runCli(["run", "--help"], project.root);
      expect(runHelp.exitCode).toBe(0);
      expect(runHelp.stdout).toContain("Template id");
      expect(runHelp.stdout).toContain("#");
      expect(runHelp.stdout).toContain(".md file path");

      const generateHelp = await runCli(["generate", "--help"], project.root);
      expect(generateHelp.exitCode).toBe(0);
      expect(generateHelp.stdout).toContain("Template id");
      expect(generateHelp.stdout).toContain("#");
      expect(generateHelp.stdout).toContain(".md file path");
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
        "Error: Expected command shape: jastr run <template-ref> [input flags...], jastr generate agent-skill <template-ref> --out <path> [--check] [--force], jastr validate <template-ref>, jastr add <repo-source> <name> [--ref <ref>] [--path <subdir>] [-g], jastr list [--local] [--global], jastr remove <id>... [-g] [--force], or jastr update [<id>...] [-g] [--force] [--check].",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("rejects validate with no template reference", async () => {
    const project = await createEmptyTempProject();
    try {
      const result = await runCli(["validate"], project.root);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        "Error: Missing template reference for validate.",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("rejects an unknown validate option", async () => {
    const project = await createEmptyTempProject();
    try {
      const result = await runCli(
        ["validate", "demo", "--force"],
        project.root,
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("Error: Unknown validate option --force.");
    } finally {
      await project.cleanup();
    }
  });

  it("rejects an extra validate positional argument", async () => {
    const project = await createEmptyTempProject();
    try {
      const result = await runCli(["validate", "demo", "extra"], project.root);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("Error: Invalid validate argument extra.");
    } finally {
      await project.cleanup();
    }
  });
});
