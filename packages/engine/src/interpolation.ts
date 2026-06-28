import { JastrError } from "./errors";
import { quote } from "./quote";
import type { TemplateInputValues, TemplateSchema } from "./schema";
import { INPUT_NAME_PATTERN } from "./schema";

const INTERPOLATION_PATTERN = /\{\{([^}]+)\}\}/g;

export function validateInterpolationReferences(
  text: string,
  schema: TemplateSchema,
): void {
  for (const reference of extractReferences(text)) {
    if (!(reference in schema.inputs)) {
      throw new JastrError(
        "invalid_interpolation",
        `Interpolation references undeclared input ${quote(reference)}.`,
      );
    }
  }
}

export function interpolateText(
  text: string,
  schema: TemplateSchema,
  values: TemplateInputValues,
): string {
  validateInterpolationReferences(text, schema);

  return text.replace(INTERPOLATION_PATTERN, (_, rawReference: string) => {
    const reference = rawReference.trim();
    if (!(reference in values)) {
      throw new JastrError(
        "absent_optional_interpolation",
        `Input ${quote(reference)} is optional and was not provided for interpolation.`,
      );
    }
    return String(values[reference]);
  });
}

export function extractReferences(text: string): string[] {
  return [...text.matchAll(INTERPOLATION_PATTERN)].map((match) => {
    const rawReference = match[1];
    if (rawReference === undefined) {
      throw new JastrError(
        "invalid_interpolation",
        "Invalid interpolation syntax.",
      );
    }

    const reference = rawReference.trim();
    if (!INPUT_NAME_PATTERN.test(reference)) {
      throw new JastrError(
        "invalid_interpolation",
        `Invalid interpolation reference ${quote(reference)}.`,
      );
    }
    return reference;
  });
}
