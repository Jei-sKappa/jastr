import { readFile } from "node:fs/promises";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import YAML from "yaml";

const SELECTED_VARIANT_FIELDS = new Set(["locked-inputs", "agent-skill"]);
const SELECTED_AGENT_SKILL_FIELDS = new Set(["frontmatter"]);

export type ProjectConfigVariant = {
  lockedInputs: Record<string, unknown>;
  agentSkillFrontmatter?: Record<string, unknown>;
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

export async function loadProjectConfigVariant(options: {
  projectRoot: string;
  templateRef: string;
  variantId: string;
}): Promise<ProjectConfigVariant> {
  const parsed = await loadProjectConfig(options.projectRoot);
  const variantRef = `${options.templateRef}#${options.variantId}`;

  const variants = parsed.variants;
  if (variants === undefined) {
    throwVariantNotFound(variantRef, options.templateRef, options.variantId);
  }
  if (!isRecord(variants)) {
    throw new JastrError(
      "invalid_config",
      ".jastr/config.yml variants must be a mapping.",
    );
  }

  const templateVariants = variants[options.templateRef];
  if (templateVariants === undefined) {
    throwVariantNotFound(variantRef, options.templateRef, options.variantId);
  }
  if (!isRecord(templateVariants)) {
    throw new JastrError(
      "invalid_config",
      `.jastr/config.yml variants.${options.templateRef} must be a mapping.`,
    );
  }

  const selected = templateVariants[options.variantId];
  if (selected === undefined) {
    throwVariantNotFound(variantRef, options.templateRef, options.variantId);
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

  return {
    lockedInputs: lockedInputs ?? {},
    ...(agentSkillFrontmatter === undefined ? {} : { agentSkillFrontmatter }),
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
