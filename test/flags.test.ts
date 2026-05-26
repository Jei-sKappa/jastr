import { describe, expect, it } from "vitest";
import { coerceInputFlags } from "../src/compiler/flags";
import type { TemplateSchema } from "../src/compiler/schema";

const schema: TemplateSchema = {
  name: "analyze-code",
  description: "Analyze code",
  inputs: {
    language: {
      type: "enum",
      values: ["typescript", "python"],
      required: true,
    },
    "target-file": { type: "string", required: false },
    "dry-run": { type: "boolean", required: false },
  },
};

describe("coerceInputFlags", () => {
  it("coerces string enum and boolean input values", () => {
    expect(
      coerceInputFlags(schema, [
        { name: "language", form: "value", value: "typescript" },
        { name: "target-file", form: "value", value: "src/index.ts" },
        { name: "dry-run", form: "bare", value: true },
      ]),
    ).toEqual({
      language: "typescript",
      "target-file": "src/index.ts",
      "dry-run": true,
    });
  });

  it("accepts explicit boolean values", () => {
    expect(
      coerceInputFlags(schema, [
        { name: "language", form: "value", value: "python" },
        { name: "dry-run", form: "value", value: "false" },
      ]),
    ).toEqual({ language: "python", "dry-run": false });
  });

  it("rejects unknown missing invalid and empty values", () => {
    expect(() => coerceInputFlags(schema, [])).toThrow(
      "Missing required input --language.",
    );
    expect(() =>
      coerceInputFlags(schema, [
        { name: "language", form: "value", value: "ruby" },
      ]),
    ).toThrow(
      "Invalid value ruby for --language. Expected one of: typescript, python.",
    );
    expect(() =>
      coerceInputFlags(schema, [
        { name: "language", form: "value", value: "typescript" },
        { name: "unknown", form: "value", value: "x" },
      ]),
    ).toThrow("Unknown input flag --unknown.");
    expect(() =>
      coerceInputFlags(schema, [
        { name: "language", form: "value", value: "" },
      ]),
    ).toThrow("Input --language cannot be empty.");
    expect(() =>
      coerceInputFlags(schema, [
        { name: "language", form: "value", value: "typescript" },
        { name: "dry-run", form: "value", value: "yes" },
      ]),
    ).toThrow("Boolean input --dry-run must be true, false, or a bare flag.");
  });

  it("rejects bare string and enum flags", () => {
    expect(() =>
      coerceInputFlags(schema, [
        { name: "language", form: "bare", value: true },
      ]),
    ).toThrow("Input --language requires --language=value.");
    expect(() =>
      coerceInputFlags(schema, [
        { name: "target-file", form: "bare", value: true },
      ]),
    ).toThrow("Input --target-file requires --target-file=value.");
  });
});
