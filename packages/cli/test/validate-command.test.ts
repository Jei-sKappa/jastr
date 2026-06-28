import { describe, expect, it } from "vitest";
import {
  createTempProject,
  readProjectFile,
  runCli,
  writeProjectFile,
} from "./support/helpers";

describe("jastr validate", () => {
  it("confirms a well-formed template and writes nothing", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/demo/TEMPLATE.md",
        `---
targets:
  agent-skill:
    frontmatter:
      name: demo
      description: Demo skill
inputs:
  language:
    type: string
    required: true
---
Selected: {{language}}
`,
      );

      const result = await runCli(["validate", "demo"], project.root);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("Template `demo` is valid.");
      expect(result.stderr).toBe("");
      // validate writes nothing: a sibling SKILL.md must not appear.
      await expect(
        readProjectFile(project.root, "out/SKILL.md"),
      ).rejects.toThrow();
    } finally {
      await project.cleanup();
    }
  });

  it("passes a runnable template that declares no agent-skill target", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/demo/TEMPLATE.md",
        `---
inputs:
  language:
    type: string
    required: true
---
Selected: {{language}}
`,
      );

      const result = await runCli(["validate", "demo"], project.root);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("Template `demo` is valid.");
      expect(result.stderr).toBe("");
    } finally {
      await project.cleanup();
    }
  });

  it("rejects malformed declared agent-skill metadata", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/demo/TEMPLATE.md",
        `---
targets:
  agent-skill:
    frontmatter:
      name: Bad-Name
      description: Demo skill
---
Body
`,
      );

      const result = await runCli(["validate", "demo"], project.root);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        "Error: targets.agent-skill.frontmatter.name must be 1-64 lowercase letters, numbers, and hyphens with no leading, trailing, or consecutive hyphens.",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("surfaces a missing include through the static render", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/demo/TEMPLATE.md",
        `---
---
Root
::include{path="missing.md"}
`,
      );

      const result = await runCli(["validate", "demo"], project.root);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        "Error: Include file `missing.md` was not found.",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("validates a selected variant and echoes the variant ref", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/review/TEMPLATE.md",
        `---
targets:
  agent-skill:
    frontmatter:
      name: review-base
      description: Review with the base policy.
      allowed-tools: Read
inputs:
  depth:
    type: enum
    values: [quick, deep]
    required: true
  language:
    type: string
    required: true
---
Review {{depth}} {{language}}
`,
      );
      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `variants:
  review:
    deep:
      locked-inputs:
        depth: deep
      agent-skill:
        frontmatter:
          name: review-deep
          description: Review with the deep policy.
`,
      );

      const result = await runCli(["validate", "review#deep"], project.root);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("Template `review#deep` is valid.");
      expect(result.stderr).toBe("");
    } finally {
      await project.cleanup();
    }
  });

  it("reports a missing variant", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/review/TEMPLATE.md",
        `---
inputs:
  depth:
    type: enum
    values: [quick, deep]
    required: true
---
Review {{depth}}
`,
      );

      const result = await runCli(["validate", "review#deep"], project.root);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        "Error: Variant `review#deep` was not found in .jastr/config.yml.",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("validates a direct .md ref without reading .jastr/config.yml", async () => {
    const project = await createTempProject();
    try {
      // A config that would raise invalid_config if read proves the direct
      // ref never consults it.
      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        "inputs: not-a-mapping\n",
      );
      await writeProjectFile(
        project.root,
        "templates/notes.md",
        `---
inputs:
  topic:
    type: string
    required: true
---
Notes about {{topic}}
`,
      );

      const result = await runCli(
        ["validate", "templates/notes.md"],
        project.root,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("Template `templates/notes.md` is valid.");
      expect(result.stderr).toBe("");
    } finally {
      await project.cleanup();
    }
  });
});
