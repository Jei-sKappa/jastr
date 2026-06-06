import { describe, expect, it } from "vitest";
import { createFileIncludeResolver } from "../src/templates/includes";
import { loadTemplateReference } from "../src/templates/template-ref";
import {
  createEmptyTempProject,
  createTempProject,
  writeProjectFile,
} from "./support/helpers";

describe("template references", () => {
  it("loads a named template from the nearest .jastr root", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/demo/template.md",
        "Hello\n",
      );
      await writeProjectFile(project.root, "nested/.keep", "");

      await expect(
        loadTemplateReference({
          cwd: `${project.root}/nested`,
          templateRef: "demo",
        }),
      ).resolves.toMatchObject({
        mode: "named",
        templateRef: "demo",
        source: "Hello\n",
      });
    } finally {
      await project.cleanup();
    }
  });

  it("loads a direct .md template without requiring .jastr", async () => {
    const project = await createEmptyTempProject();
    try {
      await writeProjectFile(project.root, "templates/direct.md", "Direct\n");

      await expect(
        loadTemplateReference({
          cwd: project.root,
          templateRef: "templates/direct.md",
        }),
      ).resolves.toMatchObject({
        mode: "direct",
        templateRef: "templates/direct.md",
        source: "Direct\n",
      });
    } finally {
      await project.cleanup();
    }
  });

  it("uses syntactic disambiguation and stable lookup errors", async () => {
    const project = await createEmptyTempProject();
    try {
      await expect(
        loadTemplateReference({ cwd: project.root, templateRef: "BadName" }),
      ).rejects.toThrow(
        "Template reference BadName must be a template id or a .md file path.",
      );

      await expect(
        loadTemplateReference({ cwd: project.root, templateRef: "missing" }),
      ).rejects.toThrow(
        "No .jastr directory found from the current directory.",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("uses different include containment messages for named and direct templates", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/demo/template.md",
        "Template\n",
      );
      await writeProjectFile(project.root, "templates/direct.md", "Direct\n");

      const named = await loadTemplateReference({
        cwd: project.root,
        templateRef: "demo",
      });
      const direct = await loadTemplateReference({
        cwd: project.root,
        templateRef: "templates/direct.md",
      });

      await expect(
        createFileIncludeResolver(named)({
          path: "../../../outside.md",
          from: named.templatePath,
          raw: false,
          stack: [named.templatePath],
        }),
      ).rejects.toThrow(
        "Include path ../../../outside.md escapes the project root.",
      );

      await expect(
        createFileIncludeResolver(direct)({
          path: "../outside.md",
          from: direct.templatePath,
          raw: false,
          stack: [direct.templatePath],
        }),
      ).rejects.toThrow(
        "Include path ../outside.md escapes the template directory.",
      );
    } finally {
      await project.cleanup();
    }
  });
});
