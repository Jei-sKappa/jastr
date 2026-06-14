import path from "node:path";
import {
  JastrError,
  parseTemplateSource,
  renderTemplateSource,
  validateTemplateSchema,
} from "@jastr/engine";
import type { RawFlag } from "./args";
import { validateGenerateOut } from "./args";
import { loadProjectConfigInputs, loadProjectConfigVariant } from "./config";
import { coerceRunFlags } from "./flags";
import {
  assertAgentSkillOutputAvailable,
  buildAgentSkillContent,
  readOptionalAgentSkillFrontmatter,
  validateAgentSkillFrontmatter,
  validateAgentSkillTarget,
  writeAgentSkill,
} from "./targets/agent-skill";
import { createFileIncludeResolver } from "./templates/includes";
import { loadTemplateReference } from "./templates/template-ref";
import {
  assertNoLockedInputFlags,
  hasUnlockedTemplateInputs,
  mergeVariantInputs,
  sampleInputsForStaticRender,
} from "./variants";

export async function executeRun(opts: {
  templateRef: string;
  flags: RawFlag[];
  cwd: string;
}): Promise<string> {
  const template = await loadTemplateReference({
    cwd: opts.cwd,
    templateRef: opts.templateRef,
  });
  const parsed = parseTemplateSource(template.source);
  const schema = validateTemplateSchema(parsed.frontmatter);

  const configInputs =
    template.mode === "named"
      ? await loadProjectConfigInputs({
          projectRoot: template.projectRoot,
          templateRef: template.templateRef,
        })
      : {};

  const selectedVariant =
    template.mode === "named" && template.variantId !== undefined
      ? await loadProjectConfigVariant({
          projectRoot: template.projectRoot,
          templateRef: template.templateRef,
          variantId: template.variantId,
        })
      : undefined;

  // The locked-flag conflict check must run before coerceRunFlags so a
  // collision is reported regardless of whether the flag value would coerce.
  if (selectedVariant !== undefined && template.variantId !== undefined) {
    assertNoLockedInputFlags({
      flags: opts.flags,
      lockedInputs: selectedVariant.lockedInputs,
      templateRef: template.templateRef,
      variantId: template.variantId,
    });
  }

  const flagInputs = coerceRunFlags(schema, opts.flags);

  // Config and locked values are not prevalidated here: CLI flags may
  // intentionally override invalid standing config values, and the engine
  // validates the final effective supplied map including selected locks.
  const inputs =
    template.mode === "named"
      ? selectedVariant === undefined
        ? { ...configInputs, ...flagInputs }
        : mergeVariantInputs({
            configInputs,
            flagInputs,
            lockedInputs: selectedVariant.lockedInputs,
          })
      : flagInputs;

  const result = await renderTemplateSource({
    source: template.source,
    sourceId: path.relative(template.cwd, template.templatePath),
    inputs,
    includeResolver: createFileIncludeResolver(template),
  });

  return result.markdown;
}

export async function executeGenerate(opts: {
  target: string;
  templateRef: string;
  out?: string;
  force: boolean;
  cwd: string;
}): Promise<string> {
  if (opts.target !== "agent-skill") {
    throw new JastrError(
      "unsupported_generate_target",
      `Unsupported generate target ${opts.target}.`,
      { target: opts.target },
    );
  }

  const out = validateGenerateOut(opts.out);
  await assertAgentSkillOutputAvailable({
    cwd: opts.cwd,
    out,
    force: opts.force,
  });

  const template = await loadTemplateReference({
    cwd: opts.cwd,
    templateRef: opts.templateRef,
  });
  const parsed = parseTemplateSource(template.source);
  const schema = validateTemplateSchema(parsed.frontmatter);

  const selectedVariant =
    template.mode === "named" && template.variantId !== undefined
      ? await loadProjectConfigVariant({
          projectRoot: template.projectRoot,
          templateRef: template.templateRef,
          variantId: template.variantId,
        })
      : undefined;

  const target =
    selectedVariant === undefined
      ? validateAgentSkillTarget(schema.targets["agent-skill"])
      : validateAgentSkillFrontmatter({
          ...readOptionalAgentSkillFrontmatter(schema.targets["agent-skill"]),
          ...(selectedVariant.agentSkillFrontmatter ?? {}),
        });

  await renderTemplateSource({
    source: template.source,
    sourceId: path.relative(template.cwd, template.templatePath),
    inputs: sampleInputsForStaticRender(schema, selectedVariant?.lockedInputs),
    includeResolver: createFileIncludeResolver(template),
  });

  const content = buildAgentSkillContent({
    templateRef: template.requestedTemplateRef,
    target,
    hasInputs:
      selectedVariant === undefined
        ? Object.keys(schema.inputs).length > 0
        : hasUnlockedTemplateInputs(schema, selectedVariant.lockedInputs),
  });
  const outputPath = await writeAgentSkill({
    cwd: opts.cwd,
    out,
    content,
  });

  return `Generated \`${path.relative(template.cwd, outputPath)}\` from template \`${path.relative(template.cwd, template.templatePath)}\``;
}
