import path from "node:path";
import {
  JastrError,
  parseTemplateSource,
  renderTemplateSource,
  type TemplateSchema,
  validateTemplateSchema,
} from "@jastr/engine";
import type { RawFlag } from "./args";
import { validateGenerateOut } from "./args";
import {
  loadComposedConfigInputs,
  loadComposedConfigVariant,
  type ProjectConfigVariant,
} from "./config";
import { coerceRunFlags } from "./flags";
import {
  type AgentSkillTarget,
  assertAgentSkillOutputAvailable,
  buildAgentSkillContent,
  checkAgentSkillOutput,
  readBaseArgumentHintPrefix,
  readOptionalAgentSkillFrontmatter,
  validateAgentSkillFrontmatter,
  validateAgentSkillTarget,
  writeAgentSkill,
} from "./targets/agent-skill";
import { displayPath } from "./templates/display";
import { createFileIncludeResolver } from "./templates/includes";
import { loadTemplateReference } from "./templates/template-ref";
import {
  assertNoLockedInputFlags,
  listUnlockedTemplateInputs,
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
      ? await loadComposedConfigInputs({
          roots: template.roots,
          templateRef: template.templateRef,
        })
      : {};

  const selectedVariant =
    template.mode === "named" && template.variantId !== undefined
      ? await loadComposedConfigVariant({
          roots: template.roots,
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
    sourceId: displayPath(template, template.templatePath),
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
  check: boolean;
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
  // In --check mode a pre-existing file at --out is the expected input to the
  // check, not the output_exists error case, so skip the availability guard.
  if (!opts.check) {
    await assertAgentSkillOutputAvailable({
      cwd: opts.cwd,
      out,
      force: opts.force,
    });
  }

  const template = await loadTemplateReference({
    cwd: opts.cwd,
    templateRef: opts.templateRef,
  });
  const parsed = parseTemplateSource(template.source);
  const schema = validateTemplateSchema(parsed.frontmatter);

  const selectedVariant =
    template.mode === "named" && template.variantId !== undefined
      ? await loadComposedConfigVariant({
          roots: template.roots,
          templateRef: template.templateRef,
          variantId: template.variantId,
        })
      : undefined;

  let target: AgentSkillTarget;
  if (selectedVariant === undefined) {
    // The base target already carries argumentHintPrefix from validation.
    target = validateAgentSkillTarget(schema.targets["agent-skill"]);
  } else {
    target = validateAgentSkillFrontmatter({
      ...readOptionalAgentSkillFrontmatter(schema.targets["agent-skill"]),
      ...(selectedVariant.agentSkillFrontmatter ?? {}),
    });
    // The base prefix is read+validated even on the variant path, so an
    // invalid base prefix still surfaces invalid_target_metadata; a present
    // variant prefix replaces it wholesale (no concatenation).
    const basePrefix = readBaseArgumentHintPrefix(
      schema.targets["agent-skill"],
    );
    const resolvedPrefix =
      selectedVariant.agentSkillArgumentHintPrefix ?? basePrefix;
    if (resolvedPrefix !== undefined) {
      target = { ...target, argumentHintPrefix: resolvedPrefix };
    }
  }

  await renderTemplateSource({
    source: template.source,
    sourceId: displayPath(template, template.templatePath),
    inputs: sampleInputsForStaticRender(schema, selectedVariant?.lockedInputs),
    includeResolver: createFileIncludeResolver(template),
  });

  const content = buildAgentSkillContent({
    templateRef: template.requestedTemplateRef,
    target,
    inputs: listUnlockedTemplateInputs(
      schema,
      selectedVariant?.lockedInputs ?? {},
    ),
  });

  // --check rebuilds in memory and byte-compares against the committed file,
  // writing nothing. Reaching here means the template built successfully, so a
  // mismatch is reported as stale/missing rather than a template defect.
  if (opts.check) {
    return checkAgentSkillOutput({
      cwd: opts.cwd,
      out,
      templateRef: template.requestedTemplateRef,
      content,
    });
  }

  const outputPath = await writeAgentSkill({
    cwd: opts.cwd,
    out,
    content,
  });

  return `Generated \`${path.relative(template.cwd, outputPath)}\` from template \`${displayPath(template, template.templatePath)}\``;
}

export async function executeValidate(opts: {
  templateRef: string;
  cwd: string;
}): Promise<string> {
  const template = await loadTemplateReference({
    cwd: opts.cwd,
    templateRef: opts.templateRef,
  });
  const parsed = parseTemplateSource(template.source);
  const schema = validateTemplateSchema(parsed.frontmatter);

  const selectedVariant =
    template.mode === "named" && template.variantId !== undefined
      ? await loadComposedConfigVariant({
          roots: template.roots,
          templateRef: template.templateRef,
          variantId: template.variantId,
        })
      : undefined;

  // Static render exercises directives, conditions, interpolation references,
  // include resolution/containment, missing-include and cycle detection, and
  // engine input validation over sampled values (plus selected locked values).
  await renderTemplateSource({
    source: template.source,
    sourceId: displayPath(template, template.templatePath),
    inputs: sampleInputsForStaticRender(schema, selectedVariant?.lockedInputs),
    includeResolver: createFileIncludeResolver(template),
  });

  // Agent-skill target metadata is validated only when the resolved ref
  // declares it. validate never *requires* a target, so a ref with no
  // agent-skill metadata anywhere is still valid.
  validateDeclaredAgentSkillTarget(schema, selectedVariant);

  return `Template ${opts.templateRef} is valid.`;
}

function validateDeclaredAgentSkillTarget(
  schema: TemplateSchema,
  selectedVariant: ProjectConfigVariant | undefined,
): void {
  const declaredTarget = schema.targets["agent-skill"];

  if (selectedVariant === undefined) {
    if (declaredTarget === undefined) return;
    validateAgentSkillTarget(declaredTarget);
    return;
  }

  if (
    declaredTarget === undefined &&
    selectedVariant.agentSkillFrontmatter === undefined
  ) {
    return;
  }

  validateAgentSkillFrontmatter({
    ...readOptionalAgentSkillFrontmatter(declaredTarget),
    ...(selectedVariant.agentSkillFrontmatter ?? {}),
  });
  // The variant prefix is validated at config-load time; the base prefix must
  // be read+validated here so an invalid base prefix fails validate with
  // invalid_target_metadata even when a variant could override it.
  readBaseArgumentHintPrefix(declaredTarget);
}
