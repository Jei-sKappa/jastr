import {
  JastrError,
  type TemplateInputValues,
  type TemplateSchema,
} from "@jastr/engine";
import type { RawFlag } from "./args";

export function assertNoLockedInputFlags(options: {
  flags: RawFlag[];
  lockedInputs: Record<string, unknown>;
  templateRef: string;
  variantId: string;
}): void {
  const locked = new Set(Object.keys(options.lockedInputs));
  for (const flag of options.flags) {
    if (!locked.has(flag.name)) continue;
    throw new JastrError(
      "locked_input_flag",
      `Input --${flag.name} is locked by variant ${options.templateRef}#${options.variantId}.`,
      {
        inputName: flag.name,
        templateRef: options.templateRef,
        variantId: options.variantId,
      },
    );
  }
}

export function mergeVariantInputs(options: {
  configInputs: Record<string, unknown>;
  flagInputs: TemplateInputValues;
  lockedInputs: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    ...options.configInputs,
    ...options.flagInputs,
    ...options.lockedInputs,
  };
}

export function sampleInputsForStaticRender(
  schema: TemplateSchema,
  lockedInputs: Record<string, unknown> = {},
): Record<string, unknown> {
  const values: Record<string, unknown> = { ...lockedInputs };
  for (const [inputName, definition] of Object.entries(schema.inputs)) {
    if (Object.hasOwn(values, inputName)) continue;

    if (definition.type === "boolean") {
      values[inputName] = false;
    } else if (definition.type === "enum") {
      values[inputName] = definition.values[0] ?? "";
    } else {
      values[inputName] = "sample";
    }
  }
  return values;
}

export function hasUnlockedTemplateInputs(
  schema: TemplateSchema,
  lockedInputs: Record<string, unknown>,
): boolean {
  return Object.keys(schema.inputs).some(
    (inputName) => !Object.hasOwn(lockedInputs, inputName),
  );
}
