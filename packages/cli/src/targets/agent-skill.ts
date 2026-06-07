import { constants } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import YAML from "yaml";

const AGENT_SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRONTMATTER_FIELD_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const AGENT_SKILL_TARGET_FIELDS = new Set([
  "name",
  "description",
  "frontmatter",
]);
const RESERVED_FRONTMATTER_FIELDS = new Set(["name", "description", "inputs"]);

export type AgentSkillTarget = {
  name: string;
  description: string;
  frontmatter: Record<string, unknown>;
};

export function validateAgentSkillTarget(value: unknown): AgentSkillTarget {
  if (value === undefined) {
    throw new JastrError(
      "missing_target_metadata",
      "Template must declare targets.agent-skill metadata for generate agent-skill.",
    );
  }

  if (!isRecord(value)) {
    throw new JastrError(
      "invalid_target_metadata",
      "targets.agent-skill must be a mapping.",
    );
  }

  const name = expectString(
    value.name,
    "targets.agent-skill.name is required and must be a string.",
  );
  if (
    name.length < 1 ||
    name.length > 64 ||
    !AGENT_SKILL_NAME_PATTERN.test(name)
  ) {
    throw new JastrError(
      "invalid_target_metadata",
      "targets.agent-skill.name must be 1-64 lowercase letters, numbers, and hyphens with no leading, trailing, or consecutive hyphens.",
    );
  }

  const description = expectString(
    value.description,
    "targets.agent-skill.description is required and must be a string.",
  );
  if (description.trim() === "" || description.length > 1024) {
    throw new JastrError(
      "invalid_target_metadata",
      "targets.agent-skill.description must be 1-1024 characters.",
    );
  }

  for (const field of Object.keys(value)) {
    if (!AGENT_SKILL_TARGET_FIELDS.has(field)) {
      throw new JastrError(
        "invalid_target_metadata",
        `Unknown targets.agent-skill field ${field}.`,
        { field },
      );
    }
  }

  return {
    name,
    description,
    frontmatter: validateExtraFrontmatter(value.frontmatter),
  };
}

function validateExtraFrontmatter(value: unknown): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new JastrError(
      "invalid_target_metadata",
      "targets.agent-skill.frontmatter must be a mapping.",
    );
  }

  const output: Record<string, unknown> = {};
  for (const [field, fieldValue] of Object.entries(value)) {
    if (RESERVED_FRONTMATTER_FIELDS.has(field)) {
      throw new JastrError(
        "invalid_target_metadata",
        `targets.agent-skill.frontmatter must not declare ${field}.`,
        { field },
      );
    }
    validateFrontmatterField(field, fieldValue);
    output[field] = fieldValue;
  }
  return output;
}

function validateFrontmatterField(field: string, value: unknown): void {
  if (!FRONTMATTER_FIELD_PATTERN.test(field)) {
    throw new JastrError(
      "invalid_target_metadata",
      `targets.agent-skill.frontmatter field ${field} must be kebab-case.`,
      { field },
    );
  }

  if (field === "license") {
    expectString(
      value,
      "targets.agent-skill.frontmatter.license must be a string.",
    );
  }
  if (field === "allowed-tools") {
    expectString(
      value,
      "targets.agent-skill.frontmatter.allowed-tools must be a string.",
    );
  }
  if (field === "compatibility") {
    const compatibility = expectString(
      value,
      "targets.agent-skill.frontmatter.compatibility must be 1-500 characters.",
    );
    if (compatibility.trim() === "" || compatibility.length > 500) {
      throw new JastrError(
        "invalid_target_metadata",
        "targets.agent-skill.frontmatter.compatibility must be 1-500 characters.",
      );
    }
  }
  if (field === "metadata") {
    validateMetadata(value);
  }
}

function validateMetadata(value: unknown): void {
  if (!isRecord(value)) {
    throw new JastrError(
      "invalid_target_metadata",
      "targets.agent-skill.frontmatter.metadata must be a mapping.",
    );
  }
  for (const [field, metadataValue] of Object.entries(value)) {
    if (typeof metadataValue !== "string") {
      throw new JastrError(
        "invalid_target_metadata",
        `targets.agent-skill.frontmatter.metadata field ${field} must be a string.`,
        { field },
      );
    }
  }
}

export function buildAgentSkillContent(options: {
  templateRef: string;
  target: AgentSkillTarget;
}): string {
  const frontmatter = {
    name: options.target.name,
    description: options.target.description,
    ...options.target.frontmatter,
  };
  const frontmatterSource = YAML.stringify(frontmatter).trimEnd();

  return `---
${frontmatterSource}
---

Run this command and follow its output exactly:

\`\`\`bash
jastr run ${options.templateRef} $ARGUMENTS
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`;
}

function resolveOutputPath(cwd: string, out: string): string {
  return path.isAbsolute(out) ? out : path.resolve(cwd, out);
}

export async function assertAgentSkillOutputAvailable(options: {
  cwd: string;
  out: string;
  force: boolean;
}): Promise<void> {
  if (options.force) return;
  if (await exists(resolveOutputPath(options.cwd, options.out))) {
    throw new JastrError(
      "output_exists",
      `Output file ${options.out} already exists. Use --force to overwrite it.`,
      { out: options.out },
    );
  }
}

export async function writeAgentSkill(options: {
  cwd: string;
  out: string;
  content: string;
}): Promise<string> {
  const outputPath = resolveOutputPath(options.cwd, options.out);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, options.content, "utf8");
  return outputPath;
}

function expectString(value: unknown, message: string): string {
  if (typeof value !== "string") {
    throw new JastrError("invalid_target_metadata", message);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
