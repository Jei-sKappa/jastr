import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildRouterSkillContent,
  writeRouterSkill,
} from "../src/generate/router-skill";
import { createTempProject, readProjectFile } from "./helpers";

describe("router skill generation", () => {
  it("builds minimal router skill content", () => {
    expect(
      buildRouterSkillContent({
        skill: "demo",
        name: "demo",
        description: "Demo skill",
      }),
    ).toBe(`---
name: demo
description: Demo skill
---

Run this command and follow its output exactly:

\`\`\`bash
skillrouter run demo $ARGUMENTS
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`);
  });

  it("passes through official and kebab-case extension frontmatter fields", () => {
    expect(
      buildRouterSkillContent({
        skill: "demo",
        name: "demo",
        description: "Demo skill",
        frontmatter: {
          name: "demo",
          description: "Demo skill",
          inputs: {},
          license: "Apache-2.0",
          "allowed-tools": "Read Bash(git:*)",
          metadata: { author: "example-org" },
          "anthropic-version": "1.0",
        },
      }),
    ).toBe(`---
name: demo
description: Demo skill
license: Apache-2.0
allowed-tools: Read Bash(git:*)
metadata:
  author: example-org
anthropic-version: "1.0"
---

Run this command and follow its output exactly:

\`\`\`bash
skillrouter run demo $ARGUMENTS
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`);
  });

  it("rejects invalid generated skill frontmatter", () => {
    let error: unknown;
    try {
      buildRouterSkillContent({
        skill: "demo",
        name: "demo",
        description: "Demo skill",
        frontmatter: {
          name: "demo",
          description: "Demo skill",
          customField: "value",
        },
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      code: "generate_validation_failed",
      message:
        "Generated skill frontmatter field customField must be kebab-case.",
    });
  });

  it("writes to explicit paths creates parents and protects existing files", async () => {
    const project = await createTempProject();
    try {
      await writeRouterSkill({
        cwd: project.root,
        out: "generated/skills/demo/SKILL.md",
        force: false,
        content: "content",
      });
      await expect(
        readProjectFile(project.root, "generated/skills/demo/SKILL.md"),
      ).resolves.toBe("content");

      await expect(
        writeRouterSkill({
          cwd: project.root,
          out: "generated/skills/demo/SKILL.md",
          force: false,
          content: "new",
        }),
      ).rejects.toThrow(
        "Output file generated/skills/demo/SKILL.md already exists. Use --force to overwrite it.",
      );

      await writeRouterSkill({
        cwd: project.root,
        out: "generated/skills/demo/SKILL.md",
        force: true,
        content: "new",
      });
      await expect(
        readProjectFile(project.root, "generated/skills/demo/SKILL.md"),
      ).resolves.toBe("new");
    } finally {
      await project.cleanup();
    }
  });

  it("allows absolute output paths outside the project root", async () => {
    const project = await createTempProject();
    try {
      const outside = path.join(path.dirname(project.root), "outside-skill.md");
      await mkdir(path.dirname(outside), { recursive: true });
      await writeFile(outside, "", "utf8");
      await writeRouterSkill({
        cwd: project.root,
        out: outside,
        force: true,
        content: "outside",
      });
    } finally {
      await project.cleanup();
    }
  });
});
