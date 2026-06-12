import { mkdir, realpath, symlink } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFileIncludeResolver } from "../src/templates/includes";
import { loadTemplateReference } from "../src/templates/template-ref";
import {
  createEmptyTempProject,
  createTempProject,
  writeProjectFile,
} from "./support/helpers";

describe("createFileIncludeResolver", () => {
  it("resolves template, group, and file roots inside one grouped boundary", async () => {
    const project = await createEmptyTempProject();
    try {
      await writeProjectFile(project.root, "team/.jastrgroup", "");
      await writeProjectFile(
        project.root,
        "team/templates/demo/TEMPLATE.md",
        "Template\n",
      );
      await writeProjectFile(
        project.root,
        "team/templates/demo/fragments/local.md",
        "Local\n",
      );
      await writeProjectFile(
        project.root,
        "team/templates/demo/fragments/sibling.md",
        "Sibling\n",
      );
      await writeProjectFile(
        project.root,
        "team/shared/preamble.md",
        "Shared\n",
      );

      const template = await loadTemplateReference({
        cwd: project.root,
        templateRef: "team/templates/demo/TEMPLATE.md",
      });
      const resolver = createFileIncludeResolver(template);
      const fromTemplate = path.relative(project.root, template.templatePath);
      const fromFragment = path.join(
        "team",
        "templates",
        "demo",
        "fragments",
        "local.md",
      );

      await expect(
        resolver({
          path: "fragments/local.md",
          from: fromTemplate,
          raw: false,
          stack: [fromTemplate],
        }),
      ).resolves.toMatchObject({ source: "Local\n" });

      await expect(
        resolver({
          root: "group",
          path: "shared/preamble.md",
          from: fromTemplate,
          raw: false,
          stack: [fromTemplate],
        }),
      ).resolves.toMatchObject({ source: "Shared\n" });

      await expect(
        resolver({
          root: "file",
          path: "sibling.md",
          from: fromFragment,
          raw: false,
          stack: [fromTemplate, fromFragment],
        }),
      ).resolves.toMatchObject({ source: "Sibling\n" });
    } finally {
      await project.cleanup();
    }
  });

  it("rejects unknown include roots and group root on standalone templates", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/demo/TEMPLATE.md",
        "Template\n",
      );

      const template = await loadTemplateReference({
        cwd: project.root,
        templateRef: "demo",
      });
      const resolver = createFileIncludeResolver(template);

      await expect(
        resolver({
          root: "workspace",
          path: "fragment.md",
          from: path.relative(project.root, template.templatePath),
          raw: false,
          stack: [],
        }),
      ).rejects.toMatchObject({
        code: "invalid_include_root",
        message: "Include root workspace must be template, group, or file.",
      });

      await expect(
        resolver({
          root: "group",
          path: "fragment.md",
          from: path.relative(project.root, template.templatePath),
          raw: false,
          stack: [],
        }),
      ).rejects.toMatchObject({
        code: "include_group_missing",
        message:
          "Include root group requires the template to be inside a .jastrgroup.",
      });
    } finally {
      await project.cleanup();
    }
  });

  it("uses realpath containment without absolute, dotfile, tilde, or dotdot denylists", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/demo/TEMPLATE.md",
        "Template\n",
      );
      await writeProjectFile(
        project.root,
        ".jastr/demo/fragment.md",
        "Inside\n",
      );
      await writeProjectFile(project.root, ".jastr/demo/.env", "ENV=ok\n");
      await writeProjectFile(
        project.root,
        ".jastr/demo/~/secret.md",
        "Tilde\n",
      );
      await writeProjectFile(
        project.root,
        ".jastr/demo/..keep.md",
        "Dotdot prefix\n",
      );
      await writeProjectFile(project.root, "outside.md", "Outside\n");
      await mkdir(path.join(project.root, ".jastr", "demo"), {
        recursive: true,
      });
      await symlink(
        "../../outside.md",
        path.join(project.root, ".jastr", "demo", "leak.md"),
      );

      const template = await loadTemplateReference({
        cwd: project.root,
        templateRef: "demo",
      });
      const resolver = createFileIncludeResolver(template);
      const from = path.relative(project.root, template.templatePath);
      const root = await realpath(project.root);

      await expect(
        resolver({
          path: path.join(root, ".jastr", "demo", "fragment.md"),
          from,
          raw: false,
          stack: [from],
        }),
      ).resolves.toMatchObject({ source: "Inside\n" });

      await expect(
        resolver({
          path: "fragments/../fragment.md",
          from,
          raw: false,
          stack: [from],
        }),
      ).resolves.toMatchObject({ source: "Inside\n" });

      await expect(
        resolver({ path: ".env", from, raw: false, stack: [from] }),
      ).resolves.toMatchObject({ source: "ENV=ok\n" });

      await expect(
        resolver({ path: "~/secret.md", from, raw: false, stack: [from] }),
      ).resolves.toMatchObject({ source: "Tilde\n" });

      await expect(
        resolver({ path: "..keep.md", from, raw: false, stack: [from] }),
      ).resolves.toMatchObject({ source: "Dotdot prefix\n" });

      await expect(
        resolver({ path: "leak.md", from, raw: false, stack: [from] }),
      ).rejects.toMatchObject({
        code: "include_outside_root",
        message: "Include path leak.md escapes the allowed include boundary.",
      });
    } finally {
      await project.cleanup();
    }
  });
});
