import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import {
  parseTemplateSource,
  renderTemplateSource,
  validateTemplateSchema,
} from "@jastr/engine";
import { displayPath } from "../templates/display";
import { createFileIncludeResolver } from "../templates/includes";
import {
  GROUP_TEMPLATES_DIR,
  loadTemplateReference,
  TEMPLATE_FILE,
} from "../templates/template-ref";
import { sampleInputsForStaticRender } from "../variants";

export type ValidateStagedUnitOptions = {
  /** The staged unit directory produced by `stageUnit` (the unit root). */
  stageDir: string;
  /** Whether the staged unit is a standalone template or a whole group. */
  kind: "standalone" | "group";
};

/**
 * Run the engine's static-validation pipeline against a *staged* unit so a
 * broken template is never moved into place. For a group this is atomic: every
 * `templates/<id>/TEMPLATE.md` is validated and the first defect aborts the whole
 * unit.
 *
 * Each `TEMPLATE.md` is loaded through the existing direct-`.md` path
 * (`loadTemplateReference`), which classifies the staged copy as standalone or
 * grouped via the `.jastrgroup` marker and roots the include boundary
 * accordingly. The same `parseTemplateSource` → `validateTemplateSchema` →
 * `renderTemplateSource` sequence `executeValidate` uses is reused verbatim, so a
 * defect surfaces with its existing engine code (`invalid_frontmatter`,
 * `malformed_schema`, `invalid_directive`, `include_not_found`, `include_cycle`,
 * …) and no new error code is introduced.
 */
export async function validateStagedUnit(
  options: ValidateStagedUnitOptions,
): Promise<void> {
  const templatePaths = await collectTemplatePaths(options);
  for (const templatePath of templatePaths) {
    await validateStagedTemplate(templatePath);
  }
}

/**
 * Enumerate the `TEMPLATE.md` file(s) in the staged unit: the single
 * `<stageDir>/TEMPLATE.md` for a standalone, or every
 * `<stageDir>/templates/<id>/TEMPLATE.md` for a group.
 */
async function collectTemplatePaths(
  options: ValidateStagedUnitOptions,
): Promise<string[]> {
  if (options.kind === "standalone") {
    return [path.join(options.stageDir, TEMPLATE_FILE)];
  }

  const templatesDir = path.join(options.stageDir, GROUP_TEMPLATES_DIR);
  let entries: Dirent[];
  try {
    entries = await readdir(templatesDir, { withFileTypes: true });
  } catch {
    return [];
  }

  // Stable order so the first defect surfaced is deterministic.
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((id) => path.join(templatesDir, id, TEMPLATE_FILE));
}

/**
 * Validate one staged `TEMPLATE.md` via the direct-`.md` reference path so the
 * staged copy's own included files (and its standalone-vs-grouped include
 * boundary) are exercised. `cwd` is the staged template file's parent and
 * `templateRef` is just its basename, so the resolved realpath is the staged copy
 * and `classifyDirectTemplate` walks the staged tree for a `.jastrgroup` marker.
 */
async function validateStagedTemplate(templatePath: string): Promise<void> {
  const template = await loadTemplateReference({
    cwd: path.dirname(templatePath),
    templateRef: path.basename(templatePath),
  });
  const parsed = parseTemplateSource(template.source);
  const schema = validateTemplateSchema(parsed.frontmatter);

  await renderTemplateSource({
    source: template.source,
    sourceId: displayPath(template, template.templatePath),
    inputs: sampleInputsForStaticRender(schema),
    includeResolver: createFileIncludeResolver(template),
  });
}
