import { realpath } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createTempProject,
  readProjectFile,
  runCli,
  writeProjectFile,
} from "./helpers";

describe("skillrouter cli", () => {
  it("runs a skill from a nested cwd and prints rendered markdown only", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".skillrouter/demo/SKILL.template.md",
        `---
name: demo
description: Demo skill
inputs:
  language:
    type: enum
    values: [typescript, python]
    required: true
---
Hello {{language}}
`,
      );
      await writeProjectFile(project.root, "nested/.keep", "");

      const result = await runCli(
        ["run", "demo", "--language=typescript"],
        `${project.root}/nested`,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("Hello typescript");
      expect(result.stderr).toBe("");
    } finally {
      await project.cleanup();
    }
  });

  it("prints errors to stderr and keeps stdout empty", async () => {
    const project = await createTempProject();
    try {
      const result = await runCli(["run", "Missing"], project.root);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("Error: Invalid skill name Missing.");
    } finally {
      await project.cleanup();
    }
  });

  it("generates a router skill after shared static validation", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".skillrouter/demo/SKILL.template.md",
        `---
name: demo
description: Demo skill
license: Apache-2.0
my-field: kept
inputs:
  dry-run:
    type: boolean
    required: false
---
Hello
`,
      );

      const result = await runCli(
        ["generate", "demo", "--out", "out/SKILL.md"],
        project.root,
      );

      expect(result.exitCode).toBe(0);
      const realProjectRoot = await realpath(project.root);
      expect(result.stdout).toBe(expectedGenerateOutput(realProjectRoot));
      expect(result.stderr).toBe("");
      const generated = await readProjectFile(project.root, "out/SKILL.md");
      expect(generated).toContain("license: Apache-2.0");
      expect(generated).toContain("my-field: kept");
      expect(generated).not.toContain("inputs:");
      expect(generated).toContain("skillrouter run demo $ARGUMENTS");
    } finally {
      await project.cleanup();
    }
  });

  it("fails generate when --out is completely absent", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".skillrouter/demo/SKILL.template.md",
        `---
name: demo
description: Demo skill
---
Hello
`,
      );

      const result = await runCli(["generate", "demo"], project.root);

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("Error: Missing required --out <path>.");
    } finally {
      await project.cleanup();
    }
  });

  it("surfaces shared generate validation errors without wrapping", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".skillrouter/demo/SKILL.template.md",
        `---
name: demo
description: Demo skill
---
{{missing}}
`,
      );

      const result = await runCli(
        ["generate", "demo", "--out", "out/SKILL.md"],
        project.root,
      );

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        "Error: Interpolation references undeclared input missing.",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("refuses to overwrite generated output unless force is passed", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".skillrouter/demo/SKILL.template.md",
        `---
name: demo
description: Demo skill
---
Hello
`,
      );
      await writeProjectFile(project.root, "out/SKILL.md", "existing");

      const blocked = await runCli(
        ["generate", "demo", "--out=out/SKILL.md"],
        project.root,
      );
      expect(blocked.exitCode).not.toBe(0);
      expect(blocked.stdout).toBe("");
      expect(blocked.stderr).toBe(
        "Error: Output file out/SKILL.md already exists. Use --force to overwrite it.",
      );

      const forced = await runCli(
        ["generate", "demo", "--out=out/SKILL.md", "--force"],
        project.root,
      );
      expect(forced.exitCode).toBe(0);
      const realProjectRoot = await realpath(project.root);
      expect(forced.stdout).toBe(expectedGenerateOutput(realProjectRoot));
      await expect(
        readProjectFile(project.root, "out/SKILL.md"),
      ).resolves.toContain("skillrouter run demo $ARGUMENTS");
    } finally {
      await project.cleanup();
    }
  });
});

function expectedGenerateOutput(projectRoot: string): string {
  return `Generated \`${path.join(projectRoot, "out", "SKILL.md")}\` from template \`${path.join(projectRoot, ".skillrouter", "demo", "SKILL.template.md")}\``;
}
