import { JastrError } from "./errors";
import type {
  TemplateInputDefinition,
  TemplateInputValues,
  TemplateSchema,
} from "./schema";

export function validateTemplateInputs(
  schema: TemplateSchema,
  inputs: Record<string, unknown>,
): TemplateInputValues {
  const validated: TemplateInputValues = {};

  for (const [inputName, value] of Object.entries(inputs)) {
    const definition = schema.inputs[inputName];
    if (definition === undefined) {
      throw new JastrError(
        "unknown_input",
        `Input ${inputName} is not declared.`,
        {
          inputName,
        },
      );
    }

    validated[inputName] = validateInputValue(inputName, definition, value);
  }

  for (const [inputName, definition] of Object.entries(schema.inputs)) {
    if (inputName in validated) continue;

    if (definition.default !== undefined) {
      validated[inputName] = definition.default;
      continue;
    }

    if (definition.required) {
      throw new JastrError(
        "missing_required_input",
        `Required input ${inputName} is missing.`,
        { inputName },
      );
    }
  }

  return validated;
}

function validateInputValue(
  inputName: string,
  definition: TemplateInputDefinition,
  value: unknown,
): string | boolean {
  if (definition.type === "boolean") {
    if (typeof value !== "boolean") {
      throw new JastrError(
        "invalid_input_value",
        `Input ${inputName} must be a boolean.`,
        { inputName },
      );
    }
    return value;
  }

  if (typeof value !== "string") {
    throw new JastrError(
      "invalid_input_value",
      `Input ${inputName} must be a string.`,
      { inputName },
    );
  }

  if (value === "") {
    throw new JastrError(
      "invalid_input_value",
      `Input ${inputName} cannot be empty.`,
      { inputName },
    );
  }

  if (definition.type === "enum" && !definition.values.includes(value)) {
    throw new JastrError(
      "invalid_input_value",
      `Input ${inputName} must be one of: ${definition.values.join(", ")}.`,
      { inputName, values: definition.values },
    );
  }

  return value;
}
