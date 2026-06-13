import { describe, expect, it } from "vitest";
import {
  JastrError,
  parseTemplateSource,
  validateTemplateSchema,
} from "../src/index";

describe("template parsing and schema validation", () => {
  it("treats missing and empty frontmatter as an empty mapping", () => {
    expect(parseTemplateSource("# Plain markdown\n")).toEqual({
      frontmatter: {},
      body: "# Plain markdown\n",
    });

    expect(parseTemplateSource("---\n---\nBody\n")).toEqual({
      frontmatter: {},
      body: "Body\n",
    });
  });

  it("parses inputs and preserves recognized targets metadata", () => {
    const parsed = parseTemplateSource(`---
inputs:
  language:
    type: enum
    values: [typescript, python]
    required: true
  dry-run:
    type: boolean
    required: false
targets:
  agent-skill:
    frontmatter:
      name: review-code
      description: Review code with Jastr.
      allowed-tools: Read, Grep
custom: ignored
---
Hello {{language}}
`);

    expect(validateTemplateSchema(parsed.frontmatter)).toEqual({
      inputs: {
        language: {
          type: "enum",
          values: ["typescript", "python"],
          required: true,
        },
        "dry-run": { type: "boolean", required: false },
      },
      targets: {
        "agent-skill": {
          frontmatter: {
            name: "review-code",
            description: "Review code with Jastr.",
            "allowed-tools": "Read, Grep",
          },
        },
      },
    });
  });

  it("rejects malformed recognized schema structures", () => {
    expect(() => validateTemplateSchema([])).toThrow(
      "Template frontmatter must be a mapping.",
    );
    expect(() => validateTemplateSchema({ inputs: [] })).toThrow(
      "Template inputs must be a mapping.",
    );
    expect(() =>
      validateTemplateSchema({
        inputs: { "Bad-Name": { type: "string", required: false } },
      }),
    ).toThrow("Invalid input name Bad-Name.");
    expect(() =>
      validateTemplateSchema({ inputs: { file: { type: "string" } } }),
    ).toThrow(
      "Input file must explicitly declare required: true or required: false.",
    );
    expect(() =>
      validateTemplateSchema({
        inputs: { mode: { type: "enum", values: [], required: true } },
      }),
    ).toThrow("Enum input mode must declare at least one value.");
  });

  it("rejects unsupported target metadata keys at the root targets level", () => {
    let error: unknown;
    try {
      validateTemplateSchema({ targets: { typescript: {} } });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(JastrError);
    expect(error).toMatchObject({
      code: "invalid_target_metadata",
      message: "Unsupported target metadata typescript.",
      details: { target: "typescript" },
    });
  });

  it("parses and preserves valid optional input defaults", () => {
    const parsed = parseTemplateSource(`---
inputs:
  dry-run:
    type: boolean
    required: false
    default: true
  language:
    type: enum
    values: [typescript, python]
    required: false
    default: typescript
  target-file:
    type: string
    required: false
    default: src/index.ts
---
Hello
`);

    expect(validateTemplateSchema(parsed.frontmatter)).toEqual({
      inputs: {
        "dry-run": { type: "boolean", required: false, default: true },
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
      },
      targets: {},
    });
  });

  it("rejects defaults on required inputs", () => {
    expect(() =>
      validateTemplateSchema({
        inputs: {
          language: {
            type: "string",
            required: true,
            default: "typescript",
          },
        },
      }),
    ).toThrow("Input language cannot declare default when required is true.");
  });

  it("rejects default values that do not match input domain rules", () => {
    expect(() =>
      validateTemplateSchema({
        inputs: {
          "dry-run": {
            type: "boolean",
            required: false,
            default: "true",
          },
        },
      }),
    ).toThrow("Default for input dry-run must be a boolean.");

    expect(() =>
      validateTemplateSchema({
        inputs: {
          "target-file": {
            type: "string",
            required: false,
            default: true,
          },
        },
      }),
    ).toThrow("Default for input target-file must be a string.");

    expect(() =>
      validateTemplateSchema({
        inputs: {
          "target-file": {
            type: "string",
            required: false,
            default: "",
          },
        },
      }),
    ).toThrow("Default for input target-file cannot be empty.");

    expect(() =>
      validateTemplateSchema({
        inputs: {
          language: {
            type: "enum",
            values: ["typescript", "python"],
            required: false,
            default: "ruby",
          },
        },
      }),
    ).toThrow("Default for input language must be one of: typescript, python.");
  });
});
