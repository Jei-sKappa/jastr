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

  it("rejects --check combined with --force", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/demo/TEMPLATE.md",
        "---\n---\nBody\n",
      );

      const result = await runCli(
        [
          "generate",
          "agent-skill",
          "demo",
          "--out=out/SKILL.md",
          "--check",
          "--force",
        ],
        project.root,
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        "Error: --check cannot be combined with --force.",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("reports an up-to-date agent-skill under --check", async () => {
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
---
Hello
`,
      );

      const generated = await runCli(
        ["generate", "agent-skill", "demo", "--out", "out/SKILL.md"],
        project.root,
      );
      expect(generated.exitCode).toBe(0);
      const before = await readProjectFile(project.root, "out/SKILL.md");

      const checked = await runCli(
        ["generate", "agent-skill", "demo", "--out", "out/SKILL.md", "--check"],
        project.root,
      );

      expect(checked.exitCode).toBe(0);
      expect(checked.stdout).toBe("agent-skill at out/SKILL.md is up to date.");
      expect(checked.stderr).toBe("");
      await expect(readProjectFile(project.root, "out/SKILL.md")).resolves.toBe(
        before,
      );
    } finally {
      await project.cleanup();
    }
  });

  it("reports a stale agent-skill when the committed bytes differ under --check", async () => {
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
---
Hello
`,
      );
      await runCli(
        ["generate", "agent-skill", "demo", "--out", "out/SKILL.md"],
        project.root,
      );
      const fresh = await readProjectFile(project.root, "out/SKILL.md");
      // A trailing-newline-only drift must still be stale: comparison is exact
      // bytes with no normalization.
      await writeProjectFile(project.root, "out/SKILL.md", `${fresh}\n`);

      const checked = await runCli(
        ["generate", "agent-skill", "demo", "--out", "out/SKILL.md", "--check"],
        project.root,
      );

      expect(checked.exitCode).toBe(1);
      expect(checked.stdout).toBe("");
      expect(checked.stderr).toBe(
        "Error: Generated agent-skill at out/SKILL.md is stale; regenerate it with jastr generate agent-skill demo --out out/SKILL.md --force.",
      );
      await expect(readProjectFile(project.root, "out/SKILL.md")).resolves.toBe(
        `${fresh}\n`,
      );
    } finally {
      await project.cleanup();
    }
  });

  it("reports a missing agent-skill when no file exists under --check", async () => {
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
---
Hello
`,
      );

      const checked = await runCli(
        ["generate", "agent-skill", "demo", "--out", "out/SKILL.md", "--check"],
        project.root,
      );

      expect(checked.exitCode).toBe(1);
      expect(checked.stdout).toBe("");
      expect(checked.stderr).toBe(
        "Error: No agent-skill found at out/SKILL.md to check; generate it with jastr generate agent-skill demo --out out/SKILL.md.",
      );
      await expect(
        readProjectFile(project.root, "out/SKILL.md"),
      ).rejects.toThrow();
    } finally {
      await project.cleanup();
    }
  });

  it("surfaces template defects before freshness under --check", async () => {
    const project = await createTempProject();
    try {
      // Template lacks targets.agent-skill, so the build fails before any
      // compare step is reached.
      await writeProjectFile(
        project.root,
        ".jastr/demo/TEMPLATE.md",
        "---\n---\nBody\n",
      );
      // A committed file that would otherwise be stale proves the template
      // error takes precedence over the comparison.
      await writeProjectFile(project.root, "out/SKILL.md", "not even close");

      const result = await runCli(
        ["generate", "agent-skill", "demo", "--out", "out/SKILL.md", "--check"],
        project.root,
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe(
        "Error: Template must declare targets.agent-skill metadata for generate agent-skill.",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("compares against variant-specific content under --check", async () => {
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
      await runCli(
        ["generate", "agent-skill", "review#deep", "--out", "out/SKILL.md"],
        project.root,
      );

      const checked = await runCli(
        [
          "generate",
          "agent-skill",
          "review#deep",
          "--out",
          "out/SKILL.md",
          "--check",
        ],
        project.root,
      );

      expect(checked.exitCode).toBe(0);
      expect(checked.stdout).toBe("agent-skill at out/SKILL.md is up to date.");
      expect(checked.stderr).toBe("");
    } finally {
      await project.cleanup();
    }
  });
});
