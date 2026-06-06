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
  skill:
    name: review-code
    description: Review code with Jastr.
    frontmatter:
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
        skill: {
          name: "review-code",
          description: "Review code with Jastr.",
          frontmatter: {
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
});
