import { describe, expect, it } from "vitest";
import { parseTemplateSource } from "../src/compiler/frontmatter";
import { validateTemplateSchema } from "../src/compiler/schema";

const validSource = `---
name: analyze-code
description: Analyze code
inputs:
  language:
    type: enum
    values: [typescript, python]
    required: true
  target-file:
    type: string
    required: false
  dry-run:
    type: boolean
    required: false
---
Analyze {{target-file}}
`;

describe("frontmatter and schema validation", () => {
  it("parses root frontmatter and preserves the body bytes", () => {
    expect(parseTemplateSource(validSource)).toEqual({
      frontmatter: {
        name: "analyze-code",
        description: "Analyze code",
        inputs: {
          language: { type: "enum", values: ["typescript", "python"], required: true },
          "target-file": { type: "string", required: false },
          "dry-run": { type: "boolean", required: false },
        },
      },
      body: "Analyze {{target-file}}\n",
    });
  });

  it("validates supported schema fields", () => {
    const parsed = parseTemplateSource(validSource);
    expect(validateTemplateSchema(parsed.frontmatter)).toEqual({
      name: "analyze-code",
      description: "Analyze code",
      inputs: {
        language: { type: "enum", values: ["typescript", "python"], required: true },
        "target-file": { type: "string", required: false },
        "dry-run": { type: "boolean", required: false },
      },
    });
  });

  it("rejects missing requiredness, unsupported types, bad names, and empty enums", () => {
    expect(() =>
      validateTemplateSchema({ name: "x", description: "x", inputs: { file: { type: "string" } } }),
    ).toThrow("Input file must explicitly declare required: true or required: false.");

    expect(() =>
      validateTemplateSchema({ name: "x", description: "x", inputs: { count: { type: "number", required: false } } }),
    ).toThrow("Input count uses unsupported type number.");

    expect(() =>
      validateTemplateSchema({ name: "x", description: "x", inputs: { "Bad-Name": { type: "string", required: false } } }),
    ).toThrow("Invalid input name Bad-Name.");

    expect(() =>
      validateTemplateSchema({ name: "x", description: "x", inputs: { language: { type: "enum", values: [], required: true } } }),
    ).toThrow("Enum input language must declare at least one value.");
  });
});
