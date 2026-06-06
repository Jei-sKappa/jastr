import { JastrError } from "./errors";

export type TemplateInputDefinition =
  | { type: "string"; required: boolean }
  | { type: "boolean"; required: boolean }
  | { type: "enum"; values: string[]; required: boolean };

export type TemplateInputValues = Record<string, string | boolean>;

export type TemplateTargets = {
  skill?: unknown;
};

export type TemplateSchema = {
  inputs: Record<string, TemplateInputDefinition>;
  targets: TemplateTargets;
};

export type Template = {
  source: string;
  schema: TemplateSchema;
  body: string;
};

export const INPUT_NAME_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function validateInputName(name: string): string {
  if (!INPUT_NAME_PATTERN.test(name)) {
    throw new JastrError("invalid_input_name", `Invalid input name ${name}.`, {
      inputName: name,
    });
  }
  return name;
}

export function validateTemplateSchema(frontmatter: unknown): TemplateSchema {
  if (!isRecord(frontmatter)) {
    throw new JastrError(
      "malformed_schema",
      "Template frontmatter must be a mapping.",
    );
  }

  const inputs = validateInputs(frontmatter.inputs);
  const targets = validateTargets(frontmatter.targets);
  return { inputs, targets };
}

function validateInputs(
  value: unknown,
): Record<string, TemplateInputDefinition> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new JastrError(
      "malformed_schema",
      "Template inputs must be a mapping.",
    );
  }

  const inputs: Record<string, TemplateInputDefinition> = {};
  for (const [inputName, rawDefinition] of Object.entries(value)) {
    validateInputName(inputName);
    inputs[inputName] = validateInputDefinition(inputName, rawDefinition);
  }
  return inputs;
}

function validateInputDefinition(
  inputName: string,
  rawDefinition: unknown,
): TemplateInputDefinition {
  if (!isRecord(rawDefinition)) {
    throw new JastrError(
      "malformed_schema",
      `Input ${inputName} must be a mapping.`,
      { inputName },
    );
  }

  if (rawDefinition.required !== true && rawDefinition.required !== false) {
    throw new JastrError(
      "malformed_schema",
      `Input ${inputName} must explicitly declare required: true or required: false.`,
      { inputName },
    );
  }

  if (rawDefinition.type === "string" || rawDefinition.type === "boolean") {
    return { type: rawDefinition.type, required: rawDefinition.required };
  }

  if (rawDefinition.type === "enum") {
    if (
      !Array.isArray(rawDefinition.values) ||
      rawDefinition.values.length === 0 ||
      !rawDefinition.values.every((item) => typeof item === "string")
    ) {
      throw new JastrError(
        "malformed_schema",
        `Enum input ${inputName} must declare at least one value.`,
        { inputName },
      );
    }
    return {
      type: "enum",
      values: rawDefinition.values,
      required: rawDefinition.required,
    };
  }

  throw new JastrError(
    "malformed_schema",
    `Input ${inputName} uses unsupported type ${String(rawDefinition.type)}.`,
    { inputName },
  );
}

function validateTargets(value: unknown): TemplateTargets {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new JastrError(
      "invalid_target_metadata",
      "Target metadata must be a mapping.",
    );
  }

  const targets: TemplateTargets = {};
  for (const [target, metadata] of Object.entries(value)) {
    if (target !== "skill") {
      throw new JastrError(
        "invalid_target_metadata",
        `Unsupported target metadata ${target}.`,
        { target },
      );
    }
    targets.skill = metadata;
  }
  return targets;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
