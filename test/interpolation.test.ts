import { describe, expect, it } from "vitest";
import { interpolateText, validateInterpolationReferences } from "../src/compiler/interpolation";
import type { InputValues } from "../src/compiler/flags";
import type { TemplateSchema } from "../src/compiler/schema";

const schema: TemplateSchema = {
  name: "demo",
  description: "Demo",
  inputs: {
    language: { type: "enum", values: ["typescript", "python"], required: true },
    "target-file": { type: "string", required: false },
    "dry-run": { type: "boolean", required: false },
  },
};

const values: InputValues = {
  language: "typescript",
  "target-file": "src/index.ts",
  "dry-run": true,
};

describe("interpolation", () => {
  it("interpolates declared direct input placeholders", () => {
    expect(interpolateText("Analyze {{target-file}} as {{language}}.", schema, values)).toBe(
      "Analyze src/index.ts as typescript.",
    );
  });

  it("validates interpolation references statically", () => {
    expect(() => validateInterpolationReferences("{{language}}", schema)).not.toThrow();
    expect(() => validateInterpolationReferences("{{missing}}", schema)).toThrow(
      "Interpolation references undeclared input missing.",
    );
    expect(() => validateInterpolationReferences("{{language | upper}}", schema)).toThrow(
      "Invalid interpolation reference language | upper.",
    );
  });

  it("fails when an optional input is interpolated but absent", () => {
    expect(() => interpolateText("Analyze {{target-file}}.", schema, { language: "typescript" })).toThrow(
      "Input target-file is optional and was not provided for interpolation.",
    );
  });
});
