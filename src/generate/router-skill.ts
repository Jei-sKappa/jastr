import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { SkillrouterError } from "../errors";

const AGENT_SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const EXTRA_FRONTMATTER_FIELD_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const OFFICIAL_AGENT_SKILL_FIELDS = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
]);
const SKILLROUTER_OWNED_FIELDS = new Set(["inputs"]);

export type RouterSkillMetadata = {
  skill: string;
  name: string;
  description: string;
  frontmatter?: Record<string, unknown>;
};

export function buildRouterSkillContent(metadata: RouterSkillMetadata): string {
  const frontmatter = buildRouterSkillFrontmatter(metadata);
  const frontmatterSource = YAML.stringify(frontmatter).trimEnd();

  return `---
${frontmatterSource}
---

Run this command and follow its output exactly:

\`\`\`bash
skillrouter run ${metadata.skill} $ARGUMENTS
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`;
}

function buildRouterSkillFrontmatter(
  metadata: RouterSkillMetadata,
): Record<string, unknown> {
  const source = metadata.frontmatter ?? {
    name: metadata.name,
    description: metadata.description,
  };
  const name = expectString(
    source.name,
    "Generated skill name must be a string.",
  );
  const description = expectString(
    source.description,
    "Generated skill description must be a string.",
  );

  validateName(name, metadata.skill);
  validateDescription(description);

  const output: Record<string, unknown> = { name, description };
  for (const [field, value] of Object.entries(source)) {
    if (field === "name" || field === "description") {
      continue;
    }
    if (SKILLROUTER_OWNED_FIELDS.has(field)) {
      continue;
    }
    validatePassthroughField(field, value);
    output[field] = value;
  }

  return output;
}

function validateName(name: string, skill: string): void {
  if (
    name.length === 0 ||
    name.length > 64 ||
    !AGENT_SKILL_NAME_PATTERN.test(name)
  ) {
    throw new SkillrouterError(
      "generate_validation_failed",
      "Generated skill name must be 1-64 lowercase letters, numbers, and hyphens with no leading, trailing, or consecutive hyphens.",
    );
  }
  if (name !== skill) {
    throw new SkillrouterError(
      "generate_validation_failed",
      `Generated skill name ${name} must match skill ${skill}.`,
    );
  }
}

function validateDescription(description: string): void {
  if (description.trim() === "" || description.length > 1024) {
    throw new SkillrouterError(
      "generate_validation_failed",
      "Generated skill description must be 1-1024 characters.",
    );
  }
}

function validatePassthroughField(field: string, value: unknown): void {
  if (
    !OFFICIAL_AGENT_SKILL_FIELDS.has(field) &&
    !EXTRA_FRONTMATTER_FIELD_PATTERN.test(field)
  ) {
    throw new SkillrouterError(
      "generate_validation_failed",
      `Generated skill frontmatter field ${field} must be kebab-case.`,
    );
  }

  if (field === "license") {
    expectString(value, "Generated skill license must be a string.");
  }
  if (field === "compatibility") {
    const compatibility = expectString(
      value,
      "Generated skill compatibility must be a string.",
    );
    if (compatibility.trim() === "" || compatibility.length > 500) {
      throw new SkillrouterError(
        "generate_validation_failed",
        "Generated skill compatibility must be 1-500 characters.",
      );
    }
  }
  if (field === "metadata") {
    validateMetadata(value);
  }
  if (field === "allowed-tools") {
    expectString(value, "Generated skill allowed-tools must be a string.");
  }
}

function validateMetadata(value: unknown): void {
  if (!isRecord(value)) {
    throw new SkillrouterError(
      "generate_validation_failed",
      "Generated skill metadata must be a mapping.",
    );
  }
  for (const [key, metadataValue] of Object.entries(value)) {
    if (typeof metadataValue !== "string") {
      throw new SkillrouterError(
        "generate_validation_failed",
        `Generated skill metadata field ${key} must be a string.`,
      );
    }
  }
}

function expectString(value: unknown, message: string): string {
  if (typeof value !== "string") {
    throw new SkillrouterError("generate_validation_failed", message);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function writeRouterSkill(options: {
  cwd: string;
  out: string;
  force: boolean;
  content: string;
}): Promise<string> {
  const outputPath = path.isAbsolute(options.out)
    ? options.out
    : path.resolve(options.cwd, options.out);

  if (!options.force && (await exists(outputPath))) {
    throw new SkillrouterError(
      "output_exists",
      `Output file ${options.out} already exists. Use --force to overwrite it.`,
    );
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, options.content, "utf8");
  return outputPath;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
