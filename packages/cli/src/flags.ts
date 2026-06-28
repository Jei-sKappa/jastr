import {
  JastrError,
  type TemplateInputValues,
  type TemplateSchema,
} from "@jastr/engine";
import type { RawFlag } from "./args";
import { quote } from "./quote";

export function coerceRunFlags(
  schema: TemplateSchema,
  flags: RawFlag[],
): TemplateInputValues {
  const values: TemplateInputValues = {};

  for (const flag of flags) {
    const definition = schema.inputs[flag.name];
    if (definition === undefined) {
      throw new JastrError(
        "unknown_input_flag",
        `Unknown input flag ${quote(`--${flag.name}`)}.`,
        { inputName: flag.name },
      );
    }

    if (definition.type === "boolean") {
      values[flag.name] = coerceBoolean(flag);
      continue;
    }

    if (flag.form !== "value") {
      throw new JastrError(
        "invalid_input_value",
        `Input ${quote(`--${flag.name}`)} requires ${quote(`--${flag.name}=value`)}.`,
        { inputName: flag.name },
      );
    }

    if (flag.value === "") {
      throw new JastrError(
        "invalid_input_value",
        `Input ${quote(`--${flag.name}`)} cannot be empty.`,
        { inputName: flag.name },
      );
    }

    values[flag.name] = flag.value;
  }

  return values;
}

function coerceBoolean(flag: RawFlag): boolean {
  if (flag.form === "bare") return true;
  if (flag.value === "true") return true;
  if (flag.value === "false") return false;

  throw new JastrError(
    "invalid_input_value",
    `Boolean input ${quote(`--${flag.name}`)} must be true, false, or a bare flag.`,
    { inputName: flag.name },
  );
}
