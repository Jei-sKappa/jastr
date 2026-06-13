import { describe, expect, it } from "vitest";
import {
  JastrError,
  type TemplateSchema,
  validateTemplateInputs,
} from "../src/index";

const schema: TemplateSchema = {
  inputs: {
    language: {
      type: "enum",
      values: ["typescript", "python"],
      required: true,
    },
    "target-file": { type: "string", required: false },
    "dry-run": { type: "boolean", required: false },
  },
  targets: {},
};

describe("domain input validation", () => {
  it("accepts domain-shaped string and boolean values", () => {
    expect(
      validateTemplateInputs(schema, {
        language: "typescript",
        "target-file": "src/index.ts",
        "dry-run": true,
      }),
    ).toEqual({
      language: "typescript",
      "target-file": "src/index.ts",
      "dry-run": true,
    });
  });

  it("rejects missing required values without CLI flag wording", () => {
    let error: unknown;
    try {
      validateTemplateInputs(schema, {});
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(JastrError);
    expect(error).toMatchObject({
      code: "missing_required_input",
      message: "Required input language is missing.",
      details: { inputName: "language" },
    });
  });

  it("rejects unknown inputs and invalid typed values", () => {
    expect(() => validateTemplateInputs(schema, { language: "go" })).toThrow(
      "Input language must be one of: typescript, python.",
    );

    expect(() =>
      validateTemplateInputs(schema, {
        language: "typescript",
        "dry-run": "true",
      }),
    ).toThrow("Input dry-run must be a boolean.");

    expect(() =>
      validateTemplateInputs(schema, {
        language: "typescript",
        extra: "value",
      }),
    ).toThrow("Input extra is not declared.");
  });
});

const defaultSchema: TemplateSchema = {
  inputs: {
    language: {
      type: "enum",
      values: ["typescript", "python"],
      required: false,
      default: "typescript",
    },
    "target-file": {
      type: "string",
      required: false,
      default: "src/index.ts",
    },
    "dry-run": { type: "boolean", required: false, default: false },
    reviewer: { type: "string", required: true },
    note: { type: "string", required: false },
  },
  targets: {},
};

it("returns effective values with template defaults applied", () => {
  expect(validateTemplateInputs(defaultSchema, { reviewer: "agent" })).toEqual({
    language: "typescript",
    "target-file": "src/index.ts",
    "dry-run": false,
    reviewer: "agent",
  });
});

it("lets supplied values override template defaults", () => {
  expect(
    validateTemplateInputs(defaultSchema, {
      language: "python",
      "target-file": "src/app.py",
      "dry-run": true,
      reviewer: "agent",
    }),
  ).toEqual({
    language: "python",
    "target-file": "src/app.py",
    "dry-run": true,
    reviewer: "agent",
  });
});

it("keeps optional inputs without defaults absent", () => {
  expect(
    validateTemplateInputs(defaultSchema, { reviewer: "agent" }),
  ).not.toHaveProperty("note");
});
