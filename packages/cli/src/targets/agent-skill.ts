import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  JastrError,
  type JastrErrorCode,
  type TemplateInputDefinition,
} from "@jastr/engine";
import YAML from "yaml";
import { quote } from "../quote";

const AGENT_SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FRONTMATTER_FIELD_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const AGENT_SKILL_TARGET_FIELDS = new Set([
  "frontmatter",
  "argument-hint-prefix",
]);
const RESERVED_FRONTMATTER_FIELDS = new Set(["inputs", "argument-hint"]);
const AGENT_SKILL_FAILURE_LINE =
  "If the command exits non-zero, report the exact error output to the user and stop.";

export type AgentSkillTarget = {
  name: string;
  description: string;
  frontmatter: Record<string, unknown>;
  // Already-trimmed, already-resolved author intent prefix (base or
  // variant-resolved). Absent when the author declared none.
  argumentHintPrefix?: string;
};

export function readOptionalAgentSkillFrontmatter(
  value: unknown,
): Record<string, unknown> {
  if (value === undefined) return {};
  return readAgentSkillFrontmatter(value);
}

export function validateAgentSkillTarget(value: unknown): AgentSkillTarget {
  if (value === undefined) {
    throw new JastrError(
      "missing_target_metadata",
      "Template must declare targets.agent-skill metadata for generate agent-skill.",
    );
  }

  const target = validateAgentSkillFrontmatter(
    readAgentSkillFrontmatter(value),
  );
  const argumentHintPrefix = readBaseArgumentHintPrefix(value);
  return argumentHintPrefix === undefined
    ? target
    : { ...target, argumentHintPrefix };
}

// Reads and validates just the base `argument-hint-prefix` sibling of
// `frontmatter` from a raw `targets.agent-skill` value, returning the trimmed
// prefix or undefined when undeclared. Used by the variant `generate` path and
// the `validate` paths, which do not flow through `validateAgentSkillTarget`.
export function readBaseArgumentHintPrefix(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const prefix = value["argument-hint-prefix"];
  if (prefix === undefined) return undefined;
  return validateArgumentHintPrefix(
    prefix,
    "invalid_target_metadata",
    quote("targets.agent-skill.argument-hint-prefix"),
  );
}

// Shared prefix validation for the base directive
// (`invalid_target_metadata`) and the variant directive (`invalid_config`).
// `label` is interpolated raw into the message, so callers pass it already
// backtick-quoted per the message-quoting convention (the base path quotes the
// whole config-key token; the variant path quotes the key inside a longer
// `.jastr/config.yml …` label). Returns the trimmed prefix on success.
export function validateArgumentHintPrefix(
  value: unknown,
  errorCode: JastrErrorCode,
  label: string,
): string {
  if (typeof value !== "string") {
    throw new JastrError(errorCode, `${label} must be a string.`);
  }
  if (/[\n\r]/.test(value)) {
    throw new JastrError(errorCode, `${label} must be a single line.`);
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new JastrError(
      errorCode,
      `${label} must not be empty or whitespace-only.`,
    );
  }
  return trimmed;
}

function readAgentSkillFrontmatter(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new JastrError(
      "invalid_target_metadata",
      "targets.agent-skill must be a mapping.",
    );
  }

  for (const field of Object.keys(value)) {
    if (!AGENT_SKILL_TARGET_FIELDS.has(field)) {
      throw new JastrError(
        "invalid_target_metadata",
        `Unknown targets.agent-skill field ${quote(field)}.`,
        { field },
      );
    }
  }

  const frontmatter = value.frontmatter;
  if (frontmatter === undefined) {
    throw new JastrError(
      "invalid_target_metadata",
      "targets.agent-skill.frontmatter is required and must be a mapping.",
    );
  }
  if (!isRecord(frontmatter)) {
    throw new JastrError(
      "invalid_target_metadata",
      "targets.agent-skill.frontmatter must be a mapping.",
    );
  }

  return frontmatter;
}

export function validateAgentSkillFrontmatter(
  frontmatter: Record<string, unknown>,
): AgentSkillTarget {
  const name = expectString(
    frontmatter.name,
    "targets.agent-skill.frontmatter.name is required and must be a string.",
  );
  if (
    name.length < 1 ||
    name.length > 64 ||
    !AGENT_SKILL_NAME_PATTERN.test(name)
  ) {
    throw new JastrError(
      "invalid_target_metadata",
      "targets.agent-skill.frontmatter.name must be 1-64 lowercase letters, numbers, and hyphens with no leading, trailing, or consecutive hyphens.",
    );
  }

  const description = expectString(
    frontmatter.description,
    "targets.agent-skill.frontmatter.description is required and must be a string.",
  );
  if (description.trim() === "" || description.length > 1024) {
    throw new JastrError(
      "invalid_target_metadata",
      "targets.agent-skill.frontmatter.description must be 1-1024 characters.",
    );
  }

  return {
    name,
    description,
    frontmatter: collectPassthroughFrontmatter(frontmatter),
  };
}

function collectPassthroughFrontmatter(
  value: Record<string, unknown>,
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [field, fieldValue] of Object.entries(value)) {
    if (field === "name" || field === "description") continue;
    if (RESERVED_FRONTMATTER_FIELDS.has(field)) {
      throw new JastrError(
        "invalid_target_metadata",
        `targets.agent-skill.frontmatter must not declare ${quote(field)}.`,
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
      `targets.agent-skill.frontmatter field ${quote(field)} must be kebab-case.`,
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
        `targets.agent-skill.frontmatter.metadata field ${quote(field)} must be a string.`,
        { field },
      );
    }
  }
}

export function buildAgentSkillContent(options: {
  templateRef: string;
  target: AgentSkillTarget;
  inputs: ReadonlyArray<{ name: string; definition: TemplateInputDefinition }>;
}): string {
  const form = deriveArgumentHintForm(options.inputs);
  const hint = assembleArgumentHint(options.target.argumentHintPrefix, form);
  const frontmatter = {
    name: options.target.name,
    description: options.target.description,
    ...(hint !== undefined ? { "argument-hint": hint } : {}),
    ...options.target.frontmatter,
  };
  const header = `---\n${YAML.stringify(frontmatter).trimEnd()}\n---`;
  const command = buildCommand(options.templateRef, options.inputs);

  // Shape A — no rendered inputs.
  if (options.inputs.length === 0) {
    return `${header}

Run this command and follow its output exactly:

\`\`\`bash
${command}
\`\`\`

${AGENT_SKILL_FAILURE_LINE}
`;
  }

  // Shapes B/C — exactly one rendered input. Destructuring + the truthiness
  // guard narrows `single` to a defined value under noUncheckedIndexedAccess.
  const [single, ...rest] = options.inputs;
  if (single !== undefined && rest.length === 0) {
    return `${header}

${renderSingleInputSentence(single)}

\`\`\`bash
${command}
\`\`\`

${AGENT_SKILL_FAILURE_LINE}
`;
  }

  // Shape D — two or more rendered inputs.
  const bullets = options.inputs
    .map(({ name, definition }) => renderInputBullet(name, definition))
    .join("\n");

  return `${header}

## Inputs

${bullets}

Map the user's request to the inputs above and append them as \`--flag=value\` arguments, including every required input. Then run this command and follow its output exactly:

\`\`\`bash
${command}
\`\`\`

${AGENT_SKILL_FAILURE_LINE}
`;
}

function inputDescriptor(definition: TemplateInputDefinition): {
  typeToken: string;
  defaultSeg: string;
  descSeg: string;
} {
  const typeToken =
    definition.type === "enum"
      ? `enum: ${definition.values.join("|")}`
      : definition.type;
  const defaultSeg =
    !definition.required && definition.default !== undefined
      ? `, default: ${String(definition.default)}`
      : "";
  const descSeg =
    definition.description !== undefined ? ` — ${definition.description}` : "";
  return { typeToken, defaultSeg, descSeg };
}

function deriveArgumentHintForm(
  inputs: ReadonlyArray<{ name: string; definition: TemplateInputDefinition }>,
): string {
  return inputs
    .map(({ name, definition }) => deriveArgumentHintToken(name, definition))
    .join(" ");
}

function deriveArgumentHintToken(
  name: string,
  definition: TemplateInputDefinition,
): string {
  let token = `--${name}`;
  if (definition.type === "string") {
    token += "=<value>";
  } else if (definition.type === "enum") {
    // Enum values are joined verbatim with no escaping (spec §8).
    token += `=${definition.values.join("|")}`;
  }
  // Boolean tokens are the flag name only, with no placeholder.
  return definition.required ? token : `[${token}]`;
}

function assembleArgumentHint(
  prefix: string | undefined,
  form: string,
): string | undefined {
  const hasPrefix = prefix !== undefined && prefix !== "";
  const hasForm = form !== "";
  if (hasPrefix && hasForm) return `${prefix} ${form}`;
  if (hasPrefix) return prefix;
  if (hasForm) return form;
  return undefined;
}

function buildCommand(
  templateRef: string,
  inputs: ReadonlyArray<{ name: string; definition: TemplateInputDefinition }>,
): string {
  let command = `jastr run ${templateRef}`;
  for (const { name, definition } of inputs) {
    if (definition.required) command += ` --${name}=<value>`;
  }
  return command;
}

function renderSingleInputSentence(input: {
  name: string;
  definition: TemplateInputDefinition;
}): string {
  const { name, definition } = input;
  const { typeToken, defaultSeg, descSeg } = inputDescriptor(definition);
  if (definition.required) {
    return `This skill takes one input, \`--${name}\` (${typeToken})${descSeg}. Fill in \`--${name}=<value>\` from the user's request. Then run this command and follow its output exactly:`;
  }
  return `This skill takes one optional input, \`--${name}\` (${typeToken}${defaultSeg})${descSeg}. Add \`--${name}=<value>\` if the user's request calls for it; otherwise leave it out. Then run this command and follow its output exactly:`;
}

function renderInputBullet(
  name: string,
  definition: TemplateInputDefinition,
): string {
  const { typeToken, defaultSeg, descSeg } = inputDescriptor(definition);
  const reqToken = definition.required ? "required" : "optional";
  return `- \`--${name}\` (${typeToken}, ${reqToken}${defaultSeg})${descSeg}`;
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
      `Output file ${quote(options.out)} already exists. Use --force to overwrite it.`,
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

export async function checkAgentSkillOutput(options: {
  cwd: string;
  out: string;
  templateRef: string;
  content: string;
}): Promise<string> {
  const outputPath = resolveOutputPath(options.cwd, options.out);

  let existing: Buffer;
  try {
    // No encoding => Buffer, so the comparison is exact bytes with no EOL/BOM
    // normalization. Generation is deterministic, so this never flaps.
    existing = await readFile(outputPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new JastrError(
        "output_missing",
        `No agent-skill found at ${quote(options.out)} to check; generate it with ${quote(`jastr generate agent-skill ${options.templateRef} --out ${options.out}`)}.`,
        { out: options.out },
      );
    }
    throw error;
  }

  if (!existing.equals(Buffer.from(options.content, "utf8"))) {
    throw new JastrError(
      "output_stale",
      `Generated agent-skill at ${quote(options.out)} is stale; regenerate it with ${quote(`jastr generate agent-skill ${options.templateRef} --out ${options.out} --force`)}.`,
      { out: options.out },
    );
  }

  return `agent-skill at ${quote(options.out)} is up to date.`;
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
