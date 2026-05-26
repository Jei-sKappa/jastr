import { SkillrouterError } from "../errors";
import type { InputValues } from "./flags";
import type { TemplateSchema } from "./schema";
import { INPUT_NAME_PATTERN } from "./schema";

const INTERPOLATION_PATTERN = /\{\{([^}]+)\}\}/g;

export function validateInterpolationReferences(
  text: string,
  schema: TemplateSchema,
): void {
  for (const reference of extractReferences(text)) {
    if (!(reference in schema.inputs)) {
      throw new SkillrouterError(
        "invalid_interpolation",
        `Interpolation references undeclared input ${reference}.`,
      );
    }
  }
}

export function interpolateText(
  text: string,
  schema: TemplateSchema,
  values: InputValues,
): string {
  validateInterpolationReferences(text, schema);

  return text.replace(INTERPOLATION_PATTERN, (_, rawReference: string) => {
    const reference = rawReference.trim();
    if (!(reference in values)) {
      throw new SkillrouterError(
        "absent_optional_interpolation",
        `Input ${reference} is optional and was not provided for interpolation.`,
      );
    }
    return String(values[reference]);
  });
}

export function extractReferences(text: string): string[] {
  return [...text.matchAll(INTERPOLATION_PATTERN)].map((match) => {
    const reference = match[1]!.trim();
    if (!INPUT_NAME_PATTERN.test(reference)) {
      throw new SkillrouterError(
        "invalid_interpolation",
        `Invalid interpolation reference ${reference}.`,
      );
    }
    return reference;
  });
}
