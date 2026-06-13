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

  it("uses named-template config values as supplied inputs", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/review/TEMPLATE.md",
        `---
inputs:
  depth:
    type: enum
    values: [quick, standard, deep]
    required: true
  dry-run:
    type: boolean
    required: false
---
Depth {{depth}} dry-run={{dry-run}}
`,
      );
      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `inputs:
  review:
    depth: deep
    dry-run: true
`,
      );

      const result = await runCli(["run", "review"], project.root);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("Depth deep dry-run=true");
      expect(result.stderr).toBe("");
    } finally {
      await project.cleanup();
    }
  });

  it("uses precedence CLI flags over config values over template defaults", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/review/TEMPLATE.md",
        `---
inputs:
  depth:
    type: enum
    values: [quick, standard, deep]
    required: false
    default: quick
  output:
    type: string
    required: false
    default: template
---
depth={{depth}} output={{output}}
`,
      );
      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `inputs:
  review:
    depth: standard
    output: config
`,
      );

      const result = await runCli(
        ["run", "review", "--depth=deep"],
        project.root,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("depth=deep output=config");
      expect(result.stderr).toBe("");
    } finally {
      await project.cleanup();
    }
  });

  it("ignores project config for direct markdown runs", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        "templates/direct.md",
        `---
inputs:
  depth:
    type: enum
    values: [quick, standard, deep]
    required: false
    default: quick
---
depth={{depth}}
`,
      );
      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `inputs:
  templates/direct.md:
    depth: deep
`,
      );

      const result = await runCli(["run", "templates/direct.md"], project.root);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("depth=quick");
      expect(result.stderr).toBe("");
    } finally {
      await project.cleanup();
    }
  });

  it("does not validate an invalid config value that a CLI flag overrides", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/review/TEMPLATE.md",
        `---
inputs:
  depth:
    type: enum
    values: [quick, standard, deep]
    required: true
---
depth={{depth}}
`,
      );
      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `inputs:
  review:
    depth: typo
`,
      );

      const result = await runCli(
        ["run", "review", "--depth=deep"],
        project.root,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("depth=deep");
      expect(result.stderr).toBe("");
    } finally {
      await project.cleanup();
    }
  });

  it("validates an invalid config value when it wins precedence", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/review/TEMPLATE.md",
        `---
inputs:
  dry-run:
    type: boolean
    required: true
---
dry-run={{dry-run}}
`,
      );
      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `inputs:
  review:
    dry-run: "true"
`,
      );

      const result = await runCli(["run", "review"], project.root);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("Error: Input dry-run must be a boolean.");
    } finally {
      await project.cleanup();
    }
  });
});
