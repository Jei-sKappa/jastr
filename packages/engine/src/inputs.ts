import { JastrError } from "./errors";
import type { TemplateInputValues, TemplateSchema } from "./schema";

export function validateTemplateInputs(
  schema: TemplateSchema,
  inputs: TemplateInputValues,
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

    if (definition.type === "boolean") {
      if (typeof value !== "boolean") {
        throw new JastrError(
          "invalid_input_value",
          `Input ${inputName} must be a boolean.`,
          { inputName },
        );
      }
      validated[inputName] = value;
      continue;
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

    validated[inputName] = value;
  }

  for (const [inputName, definition] of Object.entries(schema.inputs)) {
    if (definition.required && !(inputName in validated)) {
      throw new JastrError(
        "missing_required_input",
        `Required input ${inputName} is missing.`,
        { inputName },
      );
    }
  }

  return validated;
}
