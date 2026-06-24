import { readFile } from "node:fs/promises";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import YAML from "yaml";
import { validateArgumentHintPrefix } from "./targets/agent-skill";

const SELECTED_VARIANT_FIELDS = new Set(["locked-inputs", "agent-skill"]);
const SELECTED_AGENT_SKILL_FIELDS = new Set([
  "frontmatter",
  "argument-hint-prefix",
]);

export type ProjectConfigVariant = {
  lockedInputs: Record<string, unknown>;
  agentSkillFrontmatter?: Record<string, unknown>;
  agentSkillArgumentHintPrefix?: string;
};

export async function loadProjectConfigInputs(options: {
  projectRoot: string;
  templateRef: string;
}): Promise<Record<string, unknown>> {
  const parsed = await loadProjectConfig(options.projectRoot);

  const inputs = parsed.inputs;
  if (inputs === undefined) return {};
  if (!isRecord(inputs)) {
    throw new JastrError(
      "invalid_config",
      ".jastr/config.yml inputs must be a mapping.",
    );
  }

  const selected = inputs[options.templateRef];
  if (selected === undefined) return {};
  if (!isRecord(selected)) {
    throw new JastrError(
      "invalid_config",
      `.jastr/config.yml inputs.${options.templateRef} must be a mapping.`,
    );
  }

  return selected;
}

export async function loadComposedConfigInputs(options: {
  roots: { local?: string; global?: string };
  templateRef: string;
}): Promise<Record<string, unknown>> {
  // Both roots are consulted regardless of which root supplied the template
  // body. Spread global first then local so a key in both takes the local
  // value (CLI flags are layered later, preserving flags > local > global >
  // defaults).
  const global =
    options.roots.global === undefined
      ? {}
      : await loadProjectConfigInputs({
          projectRoot: options.roots.global,
          templateRef: options.templateRef,
        });
  const local =
    options.roots.local === undefined
      ? {}
      : await loadProjectConfigInputs({
          projectRoot: options.roots.local,
          templateRef: options.templateRef,
        });

  return { ...global, ...local };
}

export async function loadComposedConfigVariant(options: {
  roots: { local?: string; global?: string };
  templateRef: string;
  variantId: string;
}): Promise<ProjectConfigVariant> {
  // Local shadows global at the granularity of the whole variant entry; the
  // locked-inputs of the two roots are never merged.
  const local =
    options.roots.local === undefined
      ? undefined
      : await tryLoadProjectConfigVariant({
          projectRoot: options.roots.local,
          templateRef: options.templateRef,
          variantId: options.variantId,
        });
  if (local !== undefined) return local;

  const global =
    options.roots.global === undefined
      ? undefined
      : await tryLoadProjectConfigVariant({
          projectRoot: options.roots.global,
          templateRef: options.templateRef,
          variantId: options.variantId,
        });
  if (global !== undefined) return global;

  throwVariantNotFound(
    `${options.templateRef}#${options.variantId}`,
    options.templateRef,
    options.variantId,
  );
}

export async function tryLoadProjectConfigVariant(options: {
  projectRoot: string;
  templateRef: string;
  variantId: string;
}): Promise<ProjectConfigVariant | undefined> {
  const parsed = await loadProjectConfig(options.projectRoot);

  const variants = parsed.variants;
  if (variants === undefined) {
    return undefined;
  }
  if (!isRecord(variants)) {
    throw new JastrError(
      "invalid_config",
      ".jastr/config.yml variants must be a mapping.",
    );
  }

  const templateVariants = variants[options.templateRef];
  if (templateVariants === undefined) {
    return undefined;
  }
  if (!isRecord(templateVariants)) {
    throw new JastrError(
      "invalid_config",
      `.jastr/config.yml variants.${options.templateRef} must be a mapping.`,
    );
  }

  const selected = templateVariants[options.variantId];
  if (selected === undefined) {
    return undefined;
  }
  if (!isRecord(selected)) {
    throw new JastrError(
      "invalid_config",
      `.jastr/config.yml variants.${options.templateRef}.${options.variantId} must be a mapping.`,
    );
  }

  for (const field of Object.keys(selected)) {
    if (!SELECTED_VARIANT_FIELDS.has(field)) {
      throw new JastrError(
        "invalid_config",
        `.jastr/config.yml variants.${options.templateRef}.${options.variantId} field ${field} is not supported.`,
        { field },
      );
    }
  }

  const lockedInputs = selected["locked-inputs"];
  if (lockedInputs !== undefined && !isRecord(lockedInputs)) {
    throw new JastrError(
      "invalid_config",
      `.jastr/config.yml variants.${options.templateRef}.${options.variantId}.locked-inputs must be a mapping.`,
    );
  }

  const agentSkillFrontmatter = readVariantAgentSkillFrontmatter(
    selected["agent-skill"],
    options.templateRef,
    options.variantId,
  );
  const agentSkillArgumentHintPrefix = readVariantArgumentHintPrefix(
    selected["agent-skill"],
    options.templateRef,
    options.variantId,
  );

  return {
    lockedInputs: lockedInputs ?? {},
    ...(agentSkillFrontmatter === undefined ? {} : { agentSkillFrontmatter }),
    ...(agentSkillArgumentHintPrefix === undefined
      ? {}
      : { agentSkillArgumentHintPrefix }),
  };
}

async function loadProjectConfig(
  projectRoot: string,
): Promise<Record<string, unknown>> {
  const configPath = path.join(projectRoot, ".jastr", "config.yml");
  let source: string;

  try {
    source = await readFile(configPath, "utf8");
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return {};
    throw error;
  }

  if (source.trim() === "") return {};

  let parsed: unknown;
  try {
    parsed = YAML.parse(source);
  } catch {
    throw new JastrError(
      "invalid_config",
      ".jastr/config.yml could not be parsed.",
    );
  }

  if (parsed === null || parsed === undefined) return {};
  if (!isRecord(parsed)) {
    throw new JastrError(
      "invalid_config",
      ".jastr/config.yml must be a mapping.",
    );
  }

  return parsed;
}

function readVariantAgentSkillFrontmatter(
  value: unknown,
  templateRef: string,
  variantId: string,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new JastrError(
      "invalid_config",
      `.jastr/config.yml variants.${templateRef}.${variantId}.agent-skill must be a mapping.`,
    );
  }

  for (const field of Object.keys(value)) {
    if (!SELECTED_AGENT_SKILL_FIELDS.has(field)) {
      throw new JastrError(
        "invalid_config",
        `.jastr/config.yml variants.${templateRef}.${variantId}.agent-skill field ${field} is not supported.`,
        { field },
      );
    }
  }

  const frontmatter = value.frontmatter;
  if (frontmatter === undefined) return undefined;
  if (!isRecord(frontmatter)) {
    throw new JastrError(
      "invalid_config",
      `.jastr/config.yml variants.${templateRef}.${variantId}.agent-skill.frontmatter must be a mapping.`,
    );
  }
  return frontmatter;
}

function readVariantArgumentHintPrefix(
  value: unknown,
  templateRef: string,
  variantId: string,
): string | undefined {
  // The `agent-skill` mapping shape and unknown-field gating are already
  // enforced by readVariantAgentSkillFrontmatter, called from the same site.
  if (!isRecord(value)) return undefined;
  const prefix = value["argument-hint-prefix"];
  if (prefix === undefined) return undefined;
  return validateArgumentHintPrefix(
    prefix,
    "invalid_config",
    `.jastr/config.yml variants.${templateRef}.${variantId}.agent-skill.argument-hint-prefix`,
  );
}

function throwVariantNotFound(
  variantRef: string,
  templateRef: string,
  variantId: string,
): never {
  throw new JastrError(
    "variant_not_found",
    `Variant ${variantRef} was not found in .jastr/config.yml.`,
    { templateRef, variantId },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
