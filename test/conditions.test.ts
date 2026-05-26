import { describe, expect, it } from "vitest";
import {
  evaluateCondition,
  parseCondition,
  validateConditionInputs,
} from "../src/compiler/conditions";
import type { InputValues } from "../src/compiler/flags";
import type { TemplateSchema } from "../src/compiler/schema";

const schema: TemplateSchema = {
  name: "demo",
  description: "Demo",
  inputs: {
    language: {
      type: "enum",
      values: ["typescript", "python"],
      required: true,
    },
    "target-file": { type: "string", required: false },
    "dry-run": { type: "boolean", required: false },
    a: { type: "boolean", required: false },
    b: { type: "boolean", required: false },
    c: { type: "boolean", required: false },
  },
};

const values: InputValues = {
  language: "typescript",
  "target-file": "src/index.ts",
  "dry-run": false,
  a: true,
  b: false,
  c: true,
};

describe("conditions", () => {
  it("evaluates references literals equality booleans parentheses and precedence", () => {
    expect(
      evaluateCondition(parseCondition("${language} == 'typescript'"), values),
    ).toBe(true);
    expect(
      evaluateCondition(parseCondition("${dry-run} == false"), values),
    ).toBe(true);
    expect(
      evaluateCondition(
        parseCondition("!${dry-run} && (${a} || ${b})"),
        values,
      ),
    ).toBe(true);
    expect(
      evaluateCondition(parseCondition("${a} || ${b} && ${c}"), values),
    ).toBe(true);
    expect(
      evaluateCondition(parseCondition("(${a} || ${b}) && ${c}"), values),
    ).toBe(true);
    expect(
      evaluateCondition(parseCondition("${dry-run} == 'false'"), values),
    ).toBe(false);
    expect(evaluateCondition(parseCondition("${target-file}"), {})).toBe(false);
  });

  it("accepts supported string escapes and decimal numbers", () => {
    expect(
      evaluateCondition(parseCondition("'it\\'s' == \"it's\""), values),
    ).toBe(true);
    expect(evaluateCondition(parseCondition("'a\\\\b' != 'a'"), values)).toBe(
      true,
    );
    expect(evaluateCondition(parseCondition("-1.5 == -1.5"), values)).toBe(
      true,
    );
  });

  it("rejects unsupported syntax", () => {
    expect(() => parseCondition("language == 'typescript'")).toThrow(
      "Expected ${input-name} reference.",
    );
    expect(() => parseCondition("${language} in ['typescript']")).toThrow(
      "Unexpected token in.",
    );
    expect(() => parseCondition("Math.random() == 1")).toThrow(
      "Expected ${input-name} reference.",
    );
    expect(() => parseCondition("'bad\\n' == 'bad'")).toThrow(
      "Unsupported escape \\n.",
    );
    expect(() => parseCondition("1e3 == 1000")).toThrow("Unexpected token e3.");
  });

  it("validates declared input references", () => {
    expect(() =>
      validateConditionInputs(
        parseCondition("${language} == 'typescript'"),
        schema,
      ),
    ).not.toThrow();
    expect(() =>
      validateConditionInputs(parseCondition("${missing}"), schema),
    ).toThrow("Condition references undeclared input missing.");
  });
});
