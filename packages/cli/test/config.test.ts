import { JastrError } from "@jastr/engine";
import { describe, expect, it } from "vitest";
import { loadProjectConfigInputs } from "../src/config";
import { createTempProject, writeProjectFile } from "./support/helpers";

describe("project config input loading", () => {
  it("treats absent, empty, and whitespace-only config files as no config", async () => {
    const project = await createTempProject();
    try {
      await expect(
        loadProjectConfigInputs({
          projectRoot: project.root,
          templateRef: "review",
        }),
      ).resolves.toEqual({});

      await writeProjectFile(project.root, ".jastr/config.yml", "");
      await expect(
        loadProjectConfigInputs({
          projectRoot: project.root,
          templateRef: "review",
        }),
      ).resolves.toEqual({});

      await writeProjectFile(project.root, ".jastr/config.yml", "  \n\t\n");
      await expect(
        loadProjectConfigInputs({
          projectRoot: project.root,
          templateRef: "review",
        }),
      ).resolves.toEqual({});
    } finally {
      await project.cleanup();
    }
  });

  it("returns only the selected template entry and preserves YAML value types", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `ignored: true
inputs:
  other-template: true
  review:
    depth: deep
    dry-run: true
  team/review:
    depth: standard
`,
      );

      await expect(
        loadProjectConfigInputs({
          projectRoot: project.root,
          templateRef: "review",
        }),
      ).resolves.toEqual({ depth: "deep", "dry-run": true });

      await expect(
        loadProjectConfigInputs({
          projectRoot: project.root,
          templateRef: "team/review",
        }),
      ).resolves.toEqual({ depth: "standard" });
    } finally {
      await project.cleanup();
    }
  });

  it("returns no inputs when the config omits inputs or the selected template entry", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        "settings: true\n",
      );
      await expect(
        loadProjectConfigInputs({
          projectRoot: project.root,
          templateRef: "review",
        }),
      ).resolves.toEqual({});

      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `inputs:
  other:
    depth: deep
`,
      );
      await expect(
        loadProjectConfigInputs({
          projectRoot: project.root,
          templateRef: "review",
        }),
      ).resolves.toEqual({});
    } finally {
      await project.cleanup();
    }
  });

  it("rejects invalid YAML and invalid selected config shapes", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(project.root, ".jastr/config.yml", "inputs: [");
      await expectConfigError(
        project.root,
        "review",
        ".jastr/config.yml could not be parsed.",
      );

      await writeProjectFile(project.root, ".jastr/config.yml", "- inputs\n");
      await expectConfigError(
        project.root,
        "review",
        ".jastr/config.yml must be a mapping.",
      );

      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        "inputs: true\n",
      );
      await expectConfigError(
        project.root,
        "review",
        ".jastr/config.yml inputs must be a mapping.",
      );

      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `inputs:
  review: true
  other: true
`,
      );
      await expectConfigError(
        project.root,
        "review",
        ".jastr/config.yml inputs.review must be a mapping.",
      );

      await expect(
        loadProjectConfigInputs({
          projectRoot: project.root,
          templateRef: "other-missing",
        }),
      ).resolves.toEqual({});
    } finally {
      await project.cleanup();
    }
  });
});

async function expectConfigError(
  projectRoot: string,
  templateRef: string,
  message: string,
): Promise<void> {
  let error: unknown;
  try {
    await loadProjectConfigInputs({ projectRoot, templateRef });
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(JastrError);
  expect(error).toMatchObject({
    code: "invalid_config",
    message,
  });
}
