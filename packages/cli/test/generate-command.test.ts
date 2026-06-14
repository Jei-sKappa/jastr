import { describe, expect, it } from "vitest";
import {
  createEmptyTempProject,
  createTempProject,
  readProjectFile,
  runCli,
  writeProjectFile,
} from "./support/helpers";

describe("jastr generate agent-skill", () => {
  it("generates an Agent Skill wrapper from a named template", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/review/TEMPLATE.md",
        `---
targets:
  agent-skill:
    frontmatter:
      name: review-code
      description: Review code with Jastr.
      allowed-tools: Read
inputs:
  language:
    type: string
    required: true
---
Review {{language}}
`,
      );

      const result = await runCli(
        ["generate", "agent-skill", "review", "--out", "out/SKILL.md"],
        project.root,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(
        "Generated `out/SKILL.md` from template `.jastr/review/TEMPLATE.md`",
      );
      expect(result.stderr).toBe("");
      await expect(
        readProjectFile(project.root, "out/SKILL.md"),
      ).resolves.toContain("jastr run review $ARGUMENTS");
    } finally {
      await project.cleanup();
    }
  });

  it("generates a wrapper using a direct file reference as supplied", async () => {
    const project = await createEmptyTempProject();
    try {
      await writeProjectFile(
        project.root,
        "templates/review.md",
        `---
targets:
  agent-skill:
    frontmatter:
      name: review-code
      description: Review code with Jastr.
---
Review
`,
      );

      const result = await runCli(
        [
          "generate",
          "agent-skill",
          "templates/review.md",
          "--out=out/SKILL.md",
        ],
        project.root,
      );

      expect(result.exitCode).toBe(0);
      const skill = await readProjectFile(project.root, "out/SKILL.md");
      expect(skill).toContain("jastr run templates/review.md\n");
      expect(skill).not.toContain("$ARGUMENTS");
    } finally {
      await project.cleanup();
    }
  });

  it("rejects unsupported targets and protects existing output", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/review/TEMPLATE.md",
        "---\n---\nBody\n",
      );
      await writeProjectFile(project.root, "out/SKILL.md", "existing");

      const unsupported = await runCli(
        ["generate", "typescript", "review", "--out", "out.ts"],
        project.root,
      );
      expect(unsupported.exitCode).toBe(1);
      expect(unsupported.stderr).toBe(
        "Error: Unsupported generate target typescript.",
      );

      const blocked = await runCli(
        ["generate", "agent-skill", "review", "--out=out/SKILL.md"],
        project.root,
      );
      expect(blocked.exitCode).toBe(1);
      expect(blocked.stderr).toBe(
        "Error: Output file out/SKILL.md already exists. Use --force to overwrite it.",
      );
      await expect(readProjectFile(project.root, "out/SKILL.md")).resolves.toBe(
        "existing",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("generates a variant wrapper with merged frontmatter and unlocked arguments", async () => {
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

      const result = await runCli(
        ["generate", "agent-skill", "review#deep", "--out", "out/SKILL.md"],
        project.root,
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe(
        "Generated `out/SKILL.md` from template `.jastr/review/TEMPLATE.md`",
      );
      expect(result.stderr).toBe("");
      const skill = await readProjectFile(project.root, "out/SKILL.md");
      expect(skill).toContain("name: review-deep");
      expect(skill).toContain("description: Review with the deep policy.");
      expect(skill).toContain("allowed-tools: Read");
      expect(skill).toContain("jastr run review#deep $ARGUMENTS");
    } finally {
      await project.cleanup();
    }
  });

  it("omits arguments for a variant that locks every declared input", async () => {
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
inputs:
  depth:
    type: enum
    values: [quick, deep]
    required: true
---
Review {{depth}}
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
`,
      );

      const result = await runCli(
        ["generate", "agent-skill", "review#deep", "--out=out/SKILL.md"],
        project.root,
      );

      expect(result.exitCode).toBe(0);
      const skill = await readProjectFile(project.root, "out/SKILL.md");
      expect(skill).toContain("jastr run review#deep\n");
      expect(skill).not.toContain("$ARGUMENTS");
    } finally {
      await project.cleanup();
    }
  });

  it("allows variant frontmatter to supply all required Agent Skill metadata", async () => {
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

      const result = await runCli(
        ["generate", "agent-skill", "review#deep", "--out=out/SKILL.md"],
        project.root,
      );

      expect(result.exitCode).toBe(0);
      const skill = await readProjectFile(project.root, "out/SKILL.md");
      expect(skill).toContain("name: review-deep");
      expect(skill).toContain("description: Review with the deep policy.");
      expect(skill).toContain("jastr run review#deep\n");
    } finally {
      await project.cleanup();
    }
  });

  it("uses locked values during variant generation static render validation", async () => {
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
inputs:
  depth:
    type: enum
    values: [quick, deep]
    required: true
---
Review {{depth}}
`,
      );
      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `variants:
  review:
    bad:
      locked-inputs:
        depth: standard
`,
      );

      const result = await runCli(
        ["generate", "agent-skill", "review#bad", "--out=out/SKILL.md"],
        project.root,
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        "Error: Input depth must be one of: quick, deep.",
      );
    } finally {
      await project.cleanup();
    }
  });
});
