import { mkdir, realpath, symlink } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadTemplateReference } from "../src/templates/template-ref";
import {
  createEmptyTempProject,
  createTempProject,
  type TempProject,
  writeProjectFile,
} from "./support/helpers";

describe("template references", () => {
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

  it("loads a one-segment named template from the nearest .jastr root as standalone", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/demo/TEMPLATE.md",
        "Hello\n",
      );
      await writeProjectFile(project.root, "nested/.keep", "");

      const loaded = await loadTemplateReference({
        cwd: `${project.root}/nested`,
        templateRef: "demo",
      });
      const root = await realpath(project.root);

      expect(loaded).toMatchObject({
        mode: "named",
        templateRef: "demo",
        source: "Hello\n",
        includeContext: {
          kind: "standalone",
          boundary: path.join(root, ".jastr", "demo"),
          templateRoot: path.join(root, ".jastr", "demo"),
        },
      });
    } finally {
      await project.cleanup();
    }
  });

  it("loads a grouped named template from .jastr/<group>/templates/<id>/TEMPLATE.md", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/team/.jastrgroup",
        "ignored\n",
      );
      await writeProjectFile(
        project.root,
        ".jastr/team/templates/demo/TEMPLATE.md",
        "Grouped\n",
      );

      const loaded = await loadTemplateReference({
        cwd: project.root,
        templateRef: "team/demo",
      });
      const root = await realpath(project.root);

      expect(loaded).toMatchObject({
        mode: "named",
        templateRef: "team/demo",
        source: "Grouped\n",
        includeContext: {
          kind: "grouped",
          boundary: path.join(root, ".jastr", "team"),
          groupRoot: path.join(root, ".jastr", "team"),
          templateRoot: path.join(root, ".jastr", "team", "templates", "demo"),
        },
      });
    } finally {
      await project.cleanup();
    }
  });

  it("rejects invalid non-md references with the grouped grammar in the message", async () => {
    const project = await createEmptyTempProject();
    try {
      await expect(
        loadTemplateReference({ cwd: project.root, templateRef: "BadName" }),
      ).rejects.toThrow(
        "Template reference `BadName` must be a template id, a group/template id, a template id#variant id, a group/template id#variant id, or a .md file path.",
      );

      await expect(
        loadTemplateReference({
          cwd: project.root,
          templateRef: "team/demo/extra",
        }),
      ).rejects.toThrow(
        "Template reference `team/demo/extra` must be a template id, a group/template id, a template id#variant id, a group/template id#variant id, or a .md file path.",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("does not fall back when a grouped named template is missing its marker", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/team/templates/demo/TEMPLATE.md",
        "Grouped\n",
      );

      await expect(
        loadTemplateReference({
          cwd: project.root,
          templateRef: "team/demo",
        }),
      ).rejects.toThrow(
        `Template \`team/demo\` was not found. Searched local \`${path.join(
          ".jastr",
          "team",
          "templates",
          "demo",
          "TEMPLATE.md",
        )}\`.`,
      );
    } finally {
      await project.cleanup();
    }
  });

  it("classifies a direct template as grouped from its realpath shape", async () => {
    const project = await createEmptyTempProject();
    try {
      await writeProjectFile(project.root, "team/.jastrgroup", "");
      await writeProjectFile(
        project.root,
        "team/templates/demo/TEMPLATE.md",
        "Grouped\n",
      );
      await mkdir(path.join(project.root, "links"), { recursive: true });
      await symlink(
        "../team/templates/demo/TEMPLATE.md",
        path.join(project.root, "links", "demo.md"),
      );

      const loaded = await loadTemplateReference({
        cwd: project.root,
        templateRef: "links/demo.md",
      });
      const root = await realpath(project.root);

      expect(loaded).toMatchObject({
        mode: "direct",
        templateRef: "links/demo.md",
        source: "Grouped\n",
        includeContext: {
          kind: "grouped",
          boundary: path.join(root, "team"),
          groupRoot: path.join(root, "team"),
          templateRoot: path.join(root, "team", "templates", "demo"),
        },
      });
    } finally {
      await project.cleanup();
    }
  });

  it("loads named variant references through their base template", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/demo/TEMPLATE.md",
        "Variant base\n",
      );
      await writeProjectFile(project.root, ".jastr/team/.jastrgroup", "");
      await writeProjectFile(
        project.root,
        ".jastr/team/templates/review/TEMPLATE.md",
        "Grouped variant base\n",
      );

      const standalone = await loadTemplateReference({
        cwd: project.root,
        templateRef: "demo#deep",
      });
      expect(standalone).toMatchObject({
        mode: "named",
        templateRef: "demo",
        requestedTemplateRef: "demo#deep",
        variantId: "deep",
        source: "Variant base\n",
      });

      const grouped = await loadTemplateReference({
        cwd: project.root,
        templateRef: "team/review#deep",
      });
      expect(grouped).toMatchObject({
        mode: "named",
        templateRef: "team/review",
        requestedTemplateRef: "team/review#deep",
        variantId: "deep",
        source: "Grouped variant base\n",
      });
    } finally {
      await project.cleanup();
    }
  });

  it("rejects malformed variant references before template loading", async () => {
    const project = await createTempProject();
    try {
      const invalidRefs = [
        "demo#",
        "demo#deep#extra",
        "demo#Deep",
        "bad/ref/shape#deep",
        "templates/direct.md#deep",
      ];

      for (const templateRef of invalidRefs) {
        await expect(
          loadTemplateReference({ cwd: project.root, templateRef }),
        ).rejects.toThrow(
          `Template reference \`${templateRef}\` must be a template id, a group/template id, a template id#variant id, a group/template id#variant id, or a .md file path.`,
        );
      }
    } finally {
      await project.cleanup();
    }
  });

  it("classifies a direct template beside .jastrgroup as standalone", async () => {
    const project = await createEmptyTempProject();
    try {
      await writeProjectFile(project.root, "team/.jastrgroup", "");
      await writeProjectFile(project.root, "team/TEMPLATE.md", "Standalone\n");

      const loaded = await loadTemplateReference({
        cwd: project.root,
        templateRef: "team/TEMPLATE.md",
      });
      const root = await realpath(project.root);

      expect(loaded).toMatchObject({
        mode: "direct",
        templateRef: "team/TEMPLATE.md",
        source: "Standalone\n",
        includeContext: {
          kind: "standalone",
          boundary: path.join(root, "team"),
          templateRoot: path.join(root, "team"),
        },
      });
    } finally {
      await project.cleanup();
    }
  });

  it("resolves a ref present only in the global root from global (AC-2.1)", async () => {
    const cwd = await createEmptyTempProject();
    const home = await createTempProject();
    try {
      process.env.JASTR_HOME = home.root;
      await writeProjectFile(home.root, ".jastr/demo/TEMPLATE.md", "Global\n");

      const loaded = await loadTemplateReference({
        cwd: cwd.root,
        templateRef: "demo",
      });

      expect(loaded).toMatchObject({
        mode: "named",
        templateRef: "demo",
        source: "Global\n",
        resolvedRootKind: "global",
        roots: { global: home.root },
      });
      if (loaded.mode === "named") {
        expect(loaded.roots.local).toBeUndefined();
      }
    } finally {
      await cwd.cleanup();
      await home.cleanup();
    }
  });

  it("resolves a ref present in both roots from local (AC-2.2)", async () => {
    const local = await createTempProject();
    const home = await createTempProject();
    try {
      process.env.JASTR_HOME = home.root;
      await writeProjectFile(local.root, ".jastr/demo/TEMPLATE.md", "Local\n");
      await writeProjectFile(home.root, ".jastr/demo/TEMPLATE.md", "Global\n");

      const loaded = await loadTemplateReference({
        cwd: local.root,
        templateRef: "demo",
      });

      expect(loaded).toMatchObject({
        mode: "named",
        templateRef: "demo",
        source: "Local\n",
        resolvedRootKind: "local",
        roots: { local: local.root, global: home.root },
      });
    } finally {
      await local.cleanup();
      await home.cleanup();
    }
  });

  it("resolves a ref present only in the local root from local (AC-2.3)", async () => {
    const local = await createTempProject();
    try {
      await writeProjectFile(local.root, ".jastr/demo/TEMPLATE.md", "Local\n");

      const loaded = await loadTemplateReference({
        cwd: local.root,
        templateRef: "demo",
      });

      expect(loaded).toMatchObject({
        mode: "named",
        templateRef: "demo",
        source: "Local\n",
        resolvedRootKind: "local",
        roots: { local: local.root },
      });
      if (loaded.mode === "named") {
        expect(loaded.roots.global).toBeUndefined();
      }
    } finally {
      await local.cleanup();
    }
  });

  it("falls through a structural-miss standalone local dir to a valid global (AC-2.6)", async () => {
    const local = await createTempProject();
    const home = await createTempProject();
    try {
      process.env.JASTR_HOME = home.root;
      // Local entry present but incomplete: directory with no TEMPLATE.md.
      await writeProjectFile(local.root, ".jastr/demo/.keep", "");
      await writeProjectFile(home.root, ".jastr/demo/TEMPLATE.md", "Global\n");

      const loaded = await loadTemplateReference({
        cwd: local.root,
        templateRef: "demo",
      });

      expect(loaded).toMatchObject({
        mode: "named",
        source: "Global\n",
        resolvedRootKind: "global",
        roots: { local: local.root, global: home.root },
      });
    } finally {
      await local.cleanup();
      await home.cleanup();
    }
  });

  it("falls through a grouped local missing its marker to a valid global (AC-2.6)", async () => {
    const local = await createTempProject();
    const home = await createTempProject();
    try {
      process.env.JASTR_HOME = home.root;
      // Local grouped entry present but missing its .jastrgroup marker.
      await writeProjectFile(
        local.root,
        ".jastr/team/templates/demo/TEMPLATE.md",
        "Local grouped\n",
      );
      await writeProjectFile(home.root, ".jastr/team/.jastrgroup", "");
      await writeProjectFile(
        home.root,
        ".jastr/team/templates/demo/TEMPLATE.md",
        "Global grouped\n",
      );

      const loaded = await loadTemplateReference({
        cwd: local.root,
        templateRef: "team/demo",
      });

      expect(loaded).toMatchObject({
        mode: "named",
        templateRef: "team/demo",
        source: "Global grouped\n",
        resolvedRootKind: "global",
      });
    } finally {
      await local.cleanup();
      await home.cleanup();
    }
  });

  it("commits to a present local hit and does not fall through to global (AC-2.7)", async () => {
    const local = await createTempProject();
    const home = await createTempProject();
    try {
      process.env.JASTR_HOME = home.root;
      // Local hit: TEMPLATE.md exists (the predicate passes), even though its
      // content is malformed frontmatter that downstream parsing rejects. The
      // loader must commit to the local body, never the global one.
      const malformedLocal = "---\nnot: [valid\n---\nLocal body\n";
      await writeProjectFile(
        local.root,
        ".jastr/demo/TEMPLATE.md",
        malformedLocal,
      );
      await writeProjectFile(home.root, ".jastr/demo/TEMPLATE.md", "Global\n");

      const loaded = await loadTemplateReference({
        cwd: local.root,
        templateRef: "demo",
      });

      // Committed to local: the resolved body is the local (malformed) source,
      // not the valid global one. The parse error itself surfaces downstream.
      expect(loaded).toMatchObject({
        mode: "named",
        source: malformedLocal,
        resolvedRootKind: "local",
      });
    } finally {
      await local.cleanup();
      await home.cleanup();
    }
  });

  it("names both roots when a ref is absent from both (AC-9.1)", async () => {
    const local = await createTempProject();
    const home = await createTempProject();
    try {
      process.env.JASTR_HOME = home.root;

      const localExpected = path.relative(
        local.root,
        path.join(local.root, ".jastr", "demo", "TEMPLATE.md"),
      );
      const globalExpected = path.join(
        home.root,
        ".jastr",
        "demo",
        "TEMPLATE.md",
      );

      await expect(
        loadTemplateReference({
          cwd: local.root,
          templateRef: "demo",
        }),
      ).rejects.toThrow(
        `Template \`demo\` was not found. Searched local \`${localExpected}\` and global \`${globalExpected}\`.`,
      );
    } finally {
      await local.cleanup();
      await home.cleanup();
    }
  });
});
