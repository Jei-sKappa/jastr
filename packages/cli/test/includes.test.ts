import { mkdir, realpath, symlink } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileIncludeResolver } from "../src/templates/includes";
import { loadTemplateReference } from "../src/templates/template-ref";
import {
  createEmptyTempProject,
  createTempProject,
  type TempProject,
  writeProjectFile,
} from "./support/helpers";

describe("createFileIncludeResolver", () => {
  // Keep the suite hermetic: point JASTR_HOME at a controlled empty base so a
  // case that does not opt into a global root never reads the developer's real
  // ~/.jastr. Cases exercising global resolution override JASTR_HOME themselves.
  let originalJastrHome: string | undefined;
  let emptyHome: TempProject;

  beforeEach(async () => {
    originalJastrHome = process.env.JASTR_HOME;
    emptyHome = await createEmptyTempProject();
    process.env.JASTR_HOME = emptyHome.root;
  });

  afterEach(async () => {
    if (originalJastrHome === undefined) {
      delete process.env.JASTR_HOME;
    } else {
      process.env.JASTR_HOME = originalJastrHome;
    }
    await emptyHome.cleanup();
  });

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

  it("returns absolute included-file ids for a globally-resolved template (AC-8.3)", async () => {
    const cwd = await createEmptyTempProject();
    const home = await createTempProject();
    try {
      process.env.JASTR_HOME = home.root;
      await writeProjectFile(
        home.root,
        ".jastr/demo/TEMPLATE.md",
        "Template\n",
      );
      await writeProjectFile(home.root, ".jastr/demo/fragment.md", "Inside\n");

      const template = await loadTemplateReference({
        cwd: cwd.root,
        templateRef: "demo",
      });
      expect(template.mode).toBe("named");
      if (template.mode === "named") {
        expect(template.resolvedRootKind).toBe("global");
      }

      const resolver = createFileIncludeResolver(template);
      const from = template.templatePath;
      const expectedId = path.join(
        await realpath(home.root),
        ".jastr",
        "demo",
        "fragment.md",
      );

      const resolved = await resolver({
        path: "fragment.md",
        from,
        raw: false,
        stack: [from],
      });

      expect(path.isAbsolute(resolved.id)).toBe(true);
      expect(resolved.id).toBe(expectedId);
      expect(resolved.source).toBe("Inside\n");
    } finally {
      await cwd.cleanup();
      await home.cleanup();
    }
  });

  it("returns cwd-relative included-file ids for a locally-resolved template (AC-8.3)", async () => {
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

      // Use the realpath'd root as cwd so the relative id is not skewed by the
      // macOS /var -> /private/var symlink (templatePath/resolved are realpath'd).
      const root = await realpath(project.root);
      const template = await loadTemplateReference({
        cwd: root,
        templateRef: "demo",
      });
      expect(template.mode).toBe("named");
      if (template.mode === "named") {
        expect(template.resolvedRootKind).toBe("local");
      }

      const resolver = createFileIncludeResolver(template);
      const from = path.relative(root, template.templatePath);
      const expectedId = path.join(".jastr", "demo", "fragment.md");

      const resolved = await resolver({
        path: "fragment.md",
        from,
        raw: false,
        stack: [from],
      });

      expect(path.isAbsolute(resolved.id)).toBe(false);
      expect(resolved.id).toBe(expectedId);
      expect(resolved.source).toBe("Inside\n");
    } finally {
      await project.cleanup();
    }
  });
});
