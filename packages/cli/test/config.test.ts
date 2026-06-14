import { JastrError } from "@jastr/engine";
import { describe, expect, it } from "vitest";
import {
  loadProjectConfigInputs,
  loadProjectConfigVariant,
} from "../src/config";
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

describe("project config variant loading", () => {
  it("loads only the selected variant and preserves YAML value types", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `variants:
  other:
    broken: true
  review:
    quick:
      locked-inputs:
        depth: quick
    deep:
      locked-inputs:
        depth: deep
        dry-run: true
      agent-skill:
        frontmatter:
          name: deep-review
          description: Run the deep review policy.
`,
      );

      await expect(
        loadProjectConfigVariant({
          projectRoot: project.root,
          templateRef: "review",
          variantId: "deep",
        }),
      ).resolves.toEqual({
        lockedInputs: { depth: "deep", "dry-run": true },
        agentSkillFrontmatter: {
          name: "deep-review",
          description: "Run the deep review policy.",
        },
      });
    } finally {
      await project.cleanup();
    }
  });

  it("treats an empty selected variant as an alias over the base template", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `variants:
  review:
    alias: {}
`,
      );

      await expect(
        loadProjectConfigVariant({
          projectRoot: project.root,
          templateRef: "review",
          variantId: "alias",
        }),
      ).resolves.toEqual({ lockedInputs: {} });
    } finally {
      await project.cleanup();
    }
  });

  it("reports missing selected variants with variant_not_found", async () => {
    const project = await createTempProject();
    try {
      await expectVariantError(
        project.root,
        "review",
        "deep",
        "variant_not_found",
        "Variant review#deep was not found in .jastr/config.yml.",
      );

      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `variants:
  review:
    quick: {}
`,
      );
      await expectVariantError(
        project.root,
        "review",
        "deep",
        "variant_not_found",
        "Variant review#deep was not found in .jastr/config.yml.",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("validates only the selected variant config shape", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `variants:
  other: true
  review:
    selected:
      locked-inputs:
        depth: deep
    ignored:
      locked-input: typo
`,
      );

      await expect(
        loadProjectConfigVariant({
          projectRoot: project.root,
          templateRef: "review",
          variantId: "selected",
        }),
      ).resolves.toEqual({
        lockedInputs: { depth: "deep" },
      });
    } finally {
      await project.cleanup();
    }
  });

  it("rejects malformed selected variant shapes with stable messages", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        "variants: true\n",
      );
      await expectVariantError(
        project.root,
        "review",
        "deep",
        "invalid_config",
        ".jastr/config.yml variants must be a mapping.",
      );

      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `variants:
  review: true
`,
      );
      await expectVariantError(
        project.root,
        "review",
        "deep",
        "invalid_config",
        ".jastr/config.yml variants.review must be a mapping.",
      );

      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `variants:
  review:
    deep: true
`,
      );
      await expectVariantError(
        project.root,
        "review",
        "deep",
        "invalid_config",
        ".jastr/config.yml variants.review.deep must be a mapping.",
      );

      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `variants:
  review:
    deep:
      locked-inputs: true
`,
      );
      await expectVariantError(
        project.root,
        "review",
        "deep",
        "invalid_config",
        ".jastr/config.yml variants.review.deep.locked-inputs must be a mapping.",
      );

      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `variants:
  review:
    deep:
      locked-input: {}
`,
      );
      await expectVariantError(
        project.root,
        "review",
        "deep",
        "invalid_config",
        ".jastr/config.yml variants.review.deep field locked-input is not supported.",
      );

      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `variants:
  review:
    deep:
      agent-skill: true
`,
      );
      await expectVariantError(
        project.root,
        "review",
        "deep",
        "invalid_config",
        ".jastr/config.yml variants.review.deep.agent-skill must be a mapping.",
      );

      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `variants:
  review:
    deep:
      agent-skill:
        body: custom
`,
      );
      await expectVariantError(
        project.root,
        "review",
        "deep",
        "invalid_config",
        ".jastr/config.yml variants.review.deep.agent-skill field body is not supported.",
      );

      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `variants:
  review:
    deep:
      agent-skill:
        frontmatter: true
`,
      );
      await expectVariantError(
        project.root,
        "review",
        "deep",
        "invalid_config",
        ".jastr/config.yml variants.review.deep.agent-skill.frontmatter must be a mapping.",
      );
    } finally {
      await project.cleanup();
    }
  });
});

async function expectVariantError(
  projectRoot: string,
  templateRef: string,
  variantId: string,
  code: string,
  message: string,
): Promise<void> {
  let error: unknown;
  try {
    await loadProjectConfigVariant({ projectRoot, templateRef, variantId });
  } catch (caught) {
    error = caught;
  }

  expect(error).toBeInstanceOf(JastrError);
  expect(error).toMatchObject({ code, message });
}

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
