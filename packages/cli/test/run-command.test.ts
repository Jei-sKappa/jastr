import { describe, expect, it } from "vitest";
import {
  createEmptyTempProject,
  createTempProject,
  runCli,
  writeProjectFile,
} from "./support/helpers";

describe("jastr run", () => {
  it("renders a named template from a nested cwd and prints markdown only", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/demo/TEMPLATE.md",
        `---
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

  it("renders a direct markdown file without a project root", async () => {
    const project = await createEmptyTempProject();
    try {
      await writeProjectFile(
        project.root,
        "templates/direct.md",
        `---
inputs:
  dry-run:
    type: boolean
    required: false
---
Direct dry-run={{dry-run}}
`,
      );

      const result = await runCli(
        ["run", "templates/direct.md", "--dry-run"],
        project.root,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("Direct dry-run=true");
      expect(result.stderr).toBe("");
    } finally {
      await project.cleanup();
    }
  });

  it("keeps CLI-shaped wording for input flag errors", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/demo/TEMPLATE.md",
        `---
inputs:
  language:
    type: enum
    values: [typescript]
    required: true
---
Hello
`,
      );

      const result = await runCli(
        ["run", "demo", "--unknown=value"],
        project.root,
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("Error: Unknown input flag --unknown.");
    } finally {
      await project.cleanup();
    }
  });
});
