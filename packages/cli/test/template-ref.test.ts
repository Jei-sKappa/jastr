import { mkdir, realpath, symlink } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadTemplateReference } from "../src/templates/template-ref";
import {
  createEmptyTempProject,
  createTempProject,
  writeProjectFile,
} from "./support/helpers";

describe("template references", () => {
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

  it("loads a grouped named template from group/templates/<id>/TEMPLATE.md", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(project.root, "team/.jastrgroup", "ignored\n");
      await writeProjectFile(
        project.root,
        "team/templates/demo/TEMPLATE.md",
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
          boundary: path.join(root, "team"),
          groupRoot: path.join(root, "team"),
          templateRoot: path.join(root, "team", "templates", "demo"),
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
        "Template reference BadName must be a template id, a group/template id, or a .md file path.",
      );

      await expect(
        loadTemplateReference({
          cwd: project.root,
          templateRef: "team/demo/extra",
        }),
      ).rejects.toThrow(
        "Template reference team/demo/extra must be a template id, a group/template id, or a .md file path.",
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
        "team/templates/demo/TEMPLATE.md",
        "Grouped\n",
      );

      await expect(
        loadTemplateReference({
          cwd: project.root,
          templateRef: "team/demo",
        }),
      ).rejects.toThrow(
        "Template team/demo was not found at team/templates/demo/TEMPLATE.md.",
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
});
