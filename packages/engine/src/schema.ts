import { JastrError } from "./errors";

export type TemplateInputDefinition =
  | { type: "string"; required: boolean; default?: string }
  | { type: "boolean"; required: boolean; default?: boolean }
  | { type: "enum"; values: string[]; required: boolean; default?: string };

export type TemplateInputValues = Record<string, string | boolean>;

export type TemplateTargets = {
  "agent-skill"?: unknown;
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

  const hasDefault = hasOwn(rawDefinition, "default");
  if (hasDefault && rawDefinition.required === true) {
    throw new JastrError(
      "malformed_schema",
      `Input ${inputName} cannot declare default when required is true.`,
      { inputName },
    );
  }

  if (rawDefinition.type === "string") {
    const definition: Extract<TemplateInputDefinition, { type: "string" }> = {
      type: "string",
      required: rawDefinition.required,
    };
    if (hasDefault) {
      definition.default = validateStringDefault(
        inputName,
        rawDefinition.default,
      );
    }
    return definition;
  }

  if (rawDefinition.type === "boolean") {
    const definition: Extract<TemplateInputDefinition, { type: "boolean" }> = {
      type: "boolean",
      required: rawDefinition.required,
    };
    if (hasDefault) {
      definition.default = validateBooleanDefault(
        inputName,
        rawDefinition.default,
      );
    }
    return definition;
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
    const definition: Extract<TemplateInputDefinition, { type: "enum" }> = {
      type: "enum",
      values: rawDefinition.values,
      required: rawDefinition.required,
    };
    if (hasDefault) {
      definition.default = validateEnumDefault(
        inputName,
        rawDefinition.default,
        rawDefinition.values,
      );
    }
    return definition;
  }

  throw new JastrError(
    "malformed_schema",
    `Input ${inputName} uses unsupported type ${String(rawDefinition.type)}.`,
    { inputName },
  );
}

function validateBooleanDefault(inputName: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new JastrError(
      "malformed_schema",
      `Default for input ${inputName} must be a boolean.`,
      { inputName },
    );
  }
  return value;
}

function validateStringDefault(inputName: string, value: unknown): string {
  if (typeof value !== "string") {
    throw new JastrError(
      "malformed_schema",
      `Default for input ${inputName} must be a string.`,
      { inputName },
    );
  }
  if (value === "") {
    throw new JastrError(
      "malformed_schema",
      `Default for input ${inputName} cannot be empty.`,
      { inputName },
    );
  }
  return value;
}

function validateEnumDefault(
  inputName: string,
  value: unknown,
  values: string[],
): string {
  const defaultValue = validateStringDefault(inputName, value);
  if (!values.includes(defaultValue)) {
    throw new JastrError(
      "malformed_schema",
      `Default for input ${inputName} must be one of: ${values.join(", ")}.`,
      { inputName, values },
    );
  }
  return defaultValue;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(value, key);
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
    if (target !== "agent-skill") {
      throw new JastrError(
        "invalid_target_metadata",
        `Unsupported target metadata ${target}.`,
        { target },
      );
    }
    targets["agent-skill"] = metadata;
  }
  return targets;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
