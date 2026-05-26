import type { RawFlag } from "../cli/args";
import { SkillrouterError } from "../errors";
import type { TemplateSchema } from "./schema";

export type InputValue = string | boolean;
export type InputValues = Record<string, InputValue>;

export function coerceInputFlags(schema: TemplateSchema, flags: RawFlag[]): InputValues {
  const values: InputValues = {};

  for (const flag of flags) {
    const definition = schema.inputs[flag.name];
    if (!definition) {
      throw new SkillrouterError("unknown_input_flag", `Unknown input flag --${flag.name}.`);
    }

    if (definition.type === "boolean") {
      values[flag.name] = coerceBoolean(flag);
      continue;
    }

    if (flag.form !== "value") {
      throw new SkillrouterError(
        "invalid_input_value",
        `Input --${flag.name} requires --${flag.name}=value.`,
      );
    }

    if (flag.value === "") {
      throw new SkillrouterError(
        "invalid_input_value",
        `Input --${flag.name} cannot be empty.`,
      );
    }

    if (definition.type === "enum" && !definition.values.includes(flag.value)) {
      throw new SkillrouterError(
        "invalid_input_value",
        `Invalid value ${flag.value} for --${flag.name}. Expected one of: ${definition.values.join(", ")}.`,
      );
    }

    values[flag.name] = flag.value;
  }

  for (const [inputName, definition] of Object.entries(schema.inputs)) {
    if (definition.required && !(inputName in values)) {
      throw new SkillrouterError(
        "missing_required_input",
        `Missing required input --${inputName}.`,
      );
    }
  }

  return values;
}

function coerceBoolean(flag: RawFlag): boolean {
  if (flag.form === "bare") {
    return true;
  }

  if (flag.value === "true") {
    return true;
  }

  if (flag.value === "false") {
    return false;
  }

  throw new SkillrouterError(
    "invalid_input_value",
    `Boolean input --${flag.name} must be true, false, or a bare flag.`,
  );
}
