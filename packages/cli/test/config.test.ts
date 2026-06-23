import {
  JastrError,
  parseTemplateSource,
  renderTemplateSource,
  validateTemplateInputs,
  validateTemplateSchema,
} from "@jastr/engine";
import { describe, expect, it } from "vitest";
import {
  loadComposedConfigInputs,
  loadComposedConfigVariant,
  loadProjectConfigInputs,
  tryLoadProjectConfigVariant,
} from "../src/config";
import { coerceRunFlags } from "../src/flags";
import { assertNoLockedInputFlags, mergeVariantInputs } from "../src/variants";
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

describe("composed config input loading", () => {
  it("consults both roots regardless of which root supplied the body (AC-5.1)", async () => {
    const local = await createTempProject();
    const global = await createTempProject();
    try {
      await writeProjectFile(
        global.root,
        ".jastr/config.yml",
        `inputs:
  review:
    depth: global
`,
      );
      await writeProjectFile(
        local.root,
        ".jastr/config.yml",
        `inputs:
  review:
    tone: local
`,
      );

      // Both entries are merged even though only one root would have supplied
      // the template body.
      await expect(
        loadComposedConfigInputs({
          roots: { local: local.root, global: global.root },
          templateRef: "review",
        }),
      ).resolves.toEqual({ depth: "global", tone: "local" });
    } finally {
      await local.cleanup();
      await global.cleanup();
    }
  });

  it("applies local over global per key (AC-5.2, AC-5.3)", async () => {
    const local = await createTempProject();
    const global = await createTempProject();
    try {
      await writeProjectFile(
        global.root,
        ".jastr/config.yml",
        `inputs:
  review:
    depth: global-depth
    only-global: 1
`,
      );
      await writeProjectFile(
        local.root,
        ".jastr/config.yml",
        `inputs:
  review:
    depth: local-depth
    only-local: 2
`,
      );

      // A key in both takes the local value; a key only in one takes that
      // value.
      await expect(
        loadComposedConfigInputs({
          roots: { local: local.root, global: global.root },
          templateRef: "review",
        }),
      ).resolves.toEqual({
        depth: "local-depth",
        "only-global": 1,
        "only-local": 2,
      });
    } finally {
      await local.cleanup();
      await global.cleanup();
    }
  });

  it("returns only the global entry when there is no local root", async () => {
    const global = await createTempProject();
    try {
      await writeProjectFile(
        global.root,
        ".jastr/config.yml",
        `inputs:
  review:
    depth: global
`,
      );

      await expect(
        loadComposedConfigInputs({
          roots: { global: global.root },
          templateRef: "review",
        }),
      ).resolves.toEqual({ depth: "global" });
    } finally {
      await global.cleanup();
    }
  });

  it("flags win over composed config, then local, then global, then defaults (AC-5.2, AC-5.3)", async () => {
    const local = await createTempProject();
    const global = await createTempProject();
    try {
      await writeProjectFile(
        global.root,
        ".jastr/config.yml",
        `inputs:
  review:
    flagged: from-global
    local-key: from-global
    global-key: from-global
`,
      );
      await writeProjectFile(
        local.root,
        ".jastr/config.yml",
        `inputs:
  review:
    flagged: from-local
    local-key: from-local
`,
      );

      const schema = validateTemplateSchema(
        parseTemplateSource(
          `---
inputs:
  flagged:
    type: string
    required: true
  local-key:
    type: string
    required: true
  global-key:
    type: string
    required: true
  default-key:
    type: string
    required: false
    default: from-default
---
body
`,
        ).frontmatter,
      );

      const configInputs = await loadComposedConfigInputs({
        roots: { local: local.root, global: global.root },
        templateRef: "review",
      });
      const flagInputs = coerceRunFlags(schema, [
        { name: "flagged", form: "value", value: "from-flag" },
      ]);
      const effective = validateTemplateInputs(schema, {
        ...configInputs,
        ...flagInputs,
      });

      expect(effective).toEqual({
        flagged: "from-flag",
        "local-key": "from-local",
        "global-key": "from-global",
        "default-key": "from-default",
      });
    } finally {
      await local.cleanup();
      await global.cleanup();
    }
  });

  it("fails with unknown_input when a composed key is not declared (AC-5.4)", async () => {
    const local = await createTempProject();
    const global = await createTempProject();
    try {
      await writeProjectFile(
        global.root,
        ".jastr/config.yml",
        `inputs:
  review:
    undeclared: from-global
`,
      );

      const source = `---
inputs:
  declared:
    type: string
    required: false
    default: ok
---
body
`;

      const configInputs = await loadComposedConfigInputs({
        roots: { local: local.root, global: global.root },
        templateRef: "review",
      });

      // The flag/lock merge in commands.ts is `{ ...configInputs, ...flagInputs }`,
      // so an undeclared composed key reaches the engine and fails loudly.
      let error: unknown;
      try {
        await renderTemplateSource({
          source,
          sourceId: "review",
          inputs: { ...configInputs },
        });
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(JastrError);
      expect(error).toMatchObject({ code: "unknown_input" });
    } finally {
      await local.cleanup();
      await global.cleanup();
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
        loadComposedConfigVariant({
          roots: { local: project.root },
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
        loadComposedConfigVariant({
          roots: { local: project.root },
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
        { local: project.root },
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
        { local: project.root },
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
        loadComposedConfigVariant({
          roots: { local: project.root },
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
        { local: project.root },
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
        { local: project.root },
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
        { local: project.root },
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
        { local: project.root },
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
        { local: project.root },
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
        { local: project.root },
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
        { local: project.root },
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
        { local: project.root },
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

describe("composed config variant loading", () => {
  it("takes the variant wholesale from local when present (AC-6.1)", async () => {
    const local = await createTempProject();
    const global = await createTempProject();
    try {
      await writeProjectFile(
        global.root,
        ".jastr/config.yml",
        `variants:
  review:
    deep:
      locked-inputs:
        depth: global-deep
        only-global: 1
`,
      );
      await writeProjectFile(
        local.root,
        ".jastr/config.yml",
        `variants:
  review:
    deep:
      locked-inputs:
        depth: local-deep
`,
      );

      // The whole local entry shadows global; locked-inputs are never merged
      // across roots, so the global-only key does not survive.
      await expect(
        loadComposedConfigVariant({
          roots: { local: local.root, global: global.root },
          templateRef: "review",
          variantId: "deep",
        }),
      ).resolves.toEqual({ lockedInputs: { depth: "local-deep" } });
    } finally {
      await local.cleanup();
      await global.cleanup();
    }
  });

  it("falls through to the global variant when the local entry is absent (AC-6.1)", async () => {
    const local = await createTempProject();
    const global = await createTempProject();
    try {
      await writeProjectFile(
        local.root,
        ".jastr/config.yml",
        `variants:
  other:
    deep:
      locked-inputs:
        depth: other
`,
      );
      await writeProjectFile(
        global.root,
        ".jastr/config.yml",
        `variants:
  review:
    deep:
      locked-inputs:
        depth: global-deep
`,
      );

      await expect(
        loadComposedConfigVariant({
          roots: { local: local.root, global: global.root },
          templateRef: "review",
          variantId: "deep",
        }),
      ).resolves.toEqual({ lockedInputs: { depth: "global-deep" } });
    } finally {
      await local.cleanup();
      await global.cleanup();
    }
  });

  it("throws variant_not_found when absent from both roots (AC-6.1)", async () => {
    const local = await createTempProject();
    const global = await createTempProject();
    try {
      await expectVariantError(
        { local: local.root, global: global.root },
        "review",
        "deep",
        "variant_not_found",
        "Variant review#deep was not found in .jastr/config.yml.",
      );
    } finally {
      await local.cleanup();
      await global.cleanup();
    }
  });

  it("surfaces a malformed local entry rather than falling through to global", async () => {
    const local = await createTempProject();
    const global = await createTempProject();
    try {
      await writeProjectFile(
        local.root,
        ".jastr/config.yml",
        `variants:
  review:
    deep: true
`,
      );
      await writeProjectFile(
        global.root,
        ".jastr/config.yml",
        `variants:
  review:
    deep:
      locked-inputs:
        depth: global-deep
`,
      );

      await expectVariantError(
        { local: local.root, global: global.root },
        "review",
        "deep",
        "invalid_config",
        ".jastr/config.yml variants.review.deep must be a mapping.",
      );
    } finally {
      await local.cleanup();
      await global.cleanup();
    }
  });
});

describe("per-root variant reader", () => {
  it("returns undefined when the variant is simply absent", async () => {
    const project = await createTempProject();
    try {
      await expect(
        tryLoadProjectConfigVariant({
          projectRoot: project.root,
          templateRef: "review",
          variantId: "deep",
        }),
      ).resolves.toBeUndefined();

      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `variants:
  review:
    quick: {}
`,
      );
      await expect(
        tryLoadProjectConfigVariant({
          projectRoot: project.root,
          templateRef: "review",
          variantId: "deep",
        }),
      ).resolves.toBeUndefined();
    } finally {
      await project.cleanup();
    }
  });

  it("still throws invalid_config on a malformed entry", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".jastr/config.yml",
        `variants:
  review:
    deep: true
`,
      );

      let error: unknown;
      try {
        await tryLoadProjectConfigVariant({
          projectRoot: project.root,
          templateRef: "review",
          variantId: "deep",
        });
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(JastrError);
      expect(error).toMatchObject({
        code: "invalid_config",
        message: ".jastr/config.yml variants.review.deep must be a mapping.",
      });
    } finally {
      await project.cleanup();
    }
  });
});

describe("locked-input precedence over composed inputs (AC-6.2)", () => {
  it("applies locked inputs over composed config and flags", async () => {
    const local = await createTempProject();
    const global = await createTempProject();
    try {
      await writeProjectFile(
        global.root,
        ".jastr/config.yml",
        `inputs:
  review:
    depth: from-global
`,
      );
      await writeProjectFile(
        local.root,
        ".jastr/config.yml",
        `inputs:
  review:
    depth: from-local
variants:
  review:
    deep:
      locked-inputs:
        depth: locked
`,
      );

      const schema = validateTemplateSchema(
        parseTemplateSource(
          `---
inputs:
  depth:
    type: string
    required: true
---
body
`,
        ).frontmatter,
      );
      const variant = await loadComposedConfigVariant({
        roots: { local: local.root, global: global.root },
        templateRef: "review",
        variantId: "deep",
      });
      const configInputs = await loadComposedConfigInputs({
        roots: { local: local.root, global: global.root },
        templateRef: "review",
      });

      // The locked value wins over CLI flags, local config, and global config
      // via the same merge order commands.ts uses.
      const merged = mergeVariantInputs({
        configInputs,
        flagInputs: coerceRunFlags(schema, [
          { name: "depth", form: "value", value: "flag" },
        ]),
        lockedInputs: variant.lockedInputs,
      });
      expect(merged).toEqual({ depth: "locked" });
    } finally {
      await local.cleanup();
      await global.cleanup();
    }
  });

  it("rejects a CLI flag that names a locked input (AC-6.2)", async () => {
    const local = await createTempProject();
    try {
      await writeProjectFile(
        local.root,
        ".jastr/config.yml",
        `variants:
  review:
    deep:
      locked-inputs:
        depth: locked
`,
      );

      const variant = await loadComposedConfigVariant({
        roots: { local: local.root },
        templateRef: "review",
        variantId: "deep",
      });

      expect(() =>
        assertNoLockedInputFlags({
          flags: [{ name: "depth", form: "value", value: "flag" }],
          lockedInputs: variant.lockedInputs,
          templateRef: "review",
          variantId: "deep",
        }),
      ).toThrow(JastrError);
    } finally {
      await local.cleanup();
    }
  });
});

async function expectVariantError(
  roots: { local?: string; global?: string },
  templateRef: string,
  variantId: string,
  code: string,
  message: string,
): Promise<void> {
  let error: unknown;
  try {
    await loadComposedConfigVariant({ roots, templateRef, variantId });
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
