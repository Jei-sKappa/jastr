import { describe, expect, it } from "vitest";
import { renderSkillTemplate, validateSkillTemplate } from "../src/compiler/render";
import { createTempProject, writeProjectFile } from "./helpers";

describe("render pipeline", () => {
  it("renders selected branches includes raw includes and interpolation byte-for-byte", async () => {
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
  target-file:
    type: string
    required: false
  dry-run:
    type: boolean
    required: false
---
# Demo

::::if{condition="\${language} == 'typescript'"}
TypeScript for {{target-file}}
:::include{path="fragments/typescript.md"}
::::

::::else-if{condition="\${language} == 'python'"}
Python
::::

::::else
Other
::::

:::include-raw{path="raw.md"}
`,
      );
      await writeProjectFile(project.root, ".skillrouter/demo/fragments/typescript.md", "Nested {{language}}\n");
      await writeProjectFile(project.root, ".skillrouter/demo/raw.md", "Raw {{language}}\n:::include{path=\"ignored.md\"}\n");

      await expect(
        renderSkillTemplate({
          projectRoot: project.root,
          templatePath: `${project.root}/.skillrouter/demo/SKILL.template.md`,
          rawFlags: [
            { name: "language", form: "value", value: "typescript" },
            { name: "target-file", form: "value", value: "src/index.ts" },
          ],
        }),
      ).resolves.toBe(`# Demo

TypeScript for src/index.ts
Nested typescript



Raw {{language}}
:::include{path="ignored.md"}
`);
    } finally {
      await project.cleanup();
    }
  });

  it("statically validates generate templates without invocation values", async () => {
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
    values: [typescript]
    required: true
---
:::include{path="missing.md"}
`,
      );

      await expect(
        validateSkillTemplate(project.root, `${project.root}/.skillrouter/demo/SKILL.template.md`),
      ).rejects.toThrow("Include file missing.md was not found.");
    } finally {
      await project.cleanup();
    }
  });

  it("does not resolve includes from unselected run branches", async () => {
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
:::if{condition="\${language} == 'typescript'"}
Selected
:::

:::else-if{condition="\${language} == 'python'"}
:::include{path="missing.md"}
:::
`,
      );

      await expect(
        renderSkillTemplate({
          projectRoot: project.root,
          templatePath: `${project.root}/.skillrouter/demo/SKILL.template.md`,
          rawFlags: [{ name: "language", form: "value", value: "typescript" }],
        }),
      ).resolves.toContain("Selected");
    } finally {
      await project.cleanup();
    }
  });

  it("statically validates directives and interpolation inside included fragments for generate", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".skillrouter/demo/SKILL.template.md",
        `---
name: demo
description: Demo skill
---
:::include{path="fragment.md"}
`,
      );
      await writeProjectFile(project.root, ".skillrouter/demo/fragment.md", "Bad {{missing}}\n");

      await expect(
        validateSkillTemplate(project.root, `${project.root}/.skillrouter/demo/SKILL.template.md`),
      ).rejects.toThrow("Interpolation references undeclared input missing.");
    } finally {
      await project.cleanup();
    }
  });

  it("renders included frontmatter-like content as ordinary markdown", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".skillrouter/demo/SKILL.template.md",
        `---
name: demo
description: Demo
---
:::include{path="fragment.md"}
`,
      );
      await writeProjectFile(project.root, ".skillrouter/demo/fragment.md", "---\nnot: metadata\n---\nBody\n");

      await expect(
        renderSkillTemplate({
          projectRoot: project.root,
          templatePath: `${project.root}/.skillrouter/demo/SKILL.template.md`,
          rawFlags: [],
        }),
      ).resolves.toBe("---\nnot: metadata\n---\nBody\n");
    } finally {
      await project.cleanup();
    }
  });
});
