import { SkillrouterError } from "../errors";

export type InputDefinition =
  | { type: "string"; required: boolean }
  | { type: "boolean"; required: boolean }
  | { type: "enum"; values: string[]; required: boolean };

export type TemplateSchema = {
  name: string;
  description: string;
  inputs: Record<string, InputDefinition>;
};

const INPUT_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function validateInputName(name: string): string {
  if (!INPUT_NAME_PATTERN.test(name)) {
    throw new SkillrouterError("invalid_input_name", `Invalid input name ${name}.`);
  }
  return name;
}

export function validateTemplateSchema(frontmatter: unknown): TemplateSchema {
  if (!isRecord(frontmatter)) {
    throw new SkillrouterError("malformed_schema", "Template frontmatter must be a mapping.");
  }

  const name = expectString(frontmatter.name, "Template frontmatter must declare string name.");
  const description = expectString(
    frontmatter.description,
    "Template frontmatter must declare string description.",
  );

  const rawInputs = frontmatter.inputs;
  const inputs: Record<string, InputDefinition> = {};

  if (rawInputs !== undefined) {
    if (!isRecord(rawInputs)) {
      throw new SkillrouterError("malformed_schema", "Template inputs must be a mapping.");
    }

    for (const [inputName, rawDefinition] of Object.entries(rawInputs)) {
      validateInputName(inputName);
      inputs[inputName] = validateInputDefinition(inputName, rawDefinition);
    }
  }

  return { name, description, inputs };
}

function validateInputDefinition(inputName: string, rawDefinition: unknown): InputDefinition {
  if (!isRecord(rawDefinition)) {
    throw new SkillrouterError("malformed_schema", `Input ${inputName} must be a mapping.`);
  }

  if (rawDefinition.required !== true && rawDefinition.required !== false) {
    throw new SkillrouterError(
      "malformed_schema",
      `Input ${inputName} must explicitly declare required: true or required: false.`,
    );
  }

  if (rawDefinition.type === "string" || rawDefinition.type === "boolean") {
    return { type: rawDefinition.type, required: rawDefinition.required };
  }

  if (rawDefinition.type === "enum") {
    if (
      !Array.isArray(rawDefinition.values) ||
      rawDefinition.values.length === 0 ||
      !rawDefinition.values.every((value) => typeof value === "string")
    ) {
      throw new SkillrouterError(
        "malformed_schema",
        `Enum input ${inputName} must declare at least one value.`,
      );
    }

    return {
      type: "enum",
      values: rawDefinition.values,
      required: rawDefinition.required,
    };
  }

  throw new SkillrouterError(
    "malformed_schema",
    `Input ${inputName} uses unsupported type ${String(rawDefinition.type)}.`,
  );
}

function expectString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new SkillrouterError("malformed_schema", message);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
