import {
  parseTemplateSource,
  renderTemplateSource,
  validateTemplateSchema,
} from "@jastr/engine";
import type { RawFlag } from "./args";
import { validateGenerateOut } from "./args";
import { coerceRunFlags } from "./flags";
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
    sourceId: template.templatePath,
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
  validateGenerateOut(opts.out);
  throw new Error(`generate target ${opts.target} is not wired yet`);
}
