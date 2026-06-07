import path from "node:path";
import {
  JastrError,
  parseTemplateSource,
  renderTemplateSource,
  type TemplateInputValues,
  type TemplateSchema,
  validateTemplateSchema,
} from "@jastr/engine";
import type { RawFlag } from "./args";
import { validateGenerateOut } from "./args";
import { coerceRunFlags } from "./flags";
import {
  assertAgentSkillOutputAvailable,
  buildAgentSkillContent,
  validateAgentSkillTarget,
  writeAgentSkill,
} from "./targets/agent-skill";
import { createFileIncludeResolver } from "./templates/includes";
import { loadTemplateReference } from "./templates/template-ref";

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
  const inputs = coerceRunFlags(schema, opts.flags);

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
  const target = validateAgentSkillTarget(schema.targets["agent-skill"]);

  await renderTemplateSource({
    source: template.source,
    sourceId: path.relative(template.cwd, template.templatePath),
    inputs: sampleInputsForStaticRender(schema),
    includeResolver: createFileIncludeResolver(template),
  });

  const content = buildAgentSkillContent({
    templateRef: opts.templateRef,
    target,
    hasInputs: Object.keys(schema.inputs).length > 0,
  });
  const outputPath = await writeAgentSkill({
    cwd: opts.cwd,
    out,
    content,
  });

  return `Generated \`${path.relative(template.cwd, outputPath)}\` from template \`${path.relative(template.cwd, template.templatePath)}\``;
}

function sampleInputsForStaticRender(
  schema: TemplateSchema,
): TemplateInputValues {
  const values: TemplateInputValues = {};
  for (const [inputName, definition] of Object.entries(schema.inputs)) {
    if (definition.type === "boolean") {
      values[inputName] = false;
    } else if (definition.type === "enum") {
      values[inputName] = definition.values[0] ?? "";
    } else {
      values[inputName] = "sample";
    }
  }
  return values;
}
