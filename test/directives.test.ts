import { describe, expect, it } from "vitest";
import { scanDirectives, validateDirectives } from "../src/compiler/directives";
import type { TemplateSchema } from "../src/compiler/schema";

const schema: TemplateSchema = {
  name: "demo",
  description: "Demo",
  inputs: {
    language: { type: "enum", values: ["typescript", "python"], required: true },
    "dry-run": { type: "boolean", required: false },
  },
};

describe("directive scanning", () => {
  it("scans if else-if else groups and leaf includes", () => {
    const body = `Intro

::::if{condition="\${language} == 'typescript'"}
TypeScript
:::include{path="fragments/typescript.md"}
::::

::::else-if{condition="\${language} == 'python'"}
Python
::::

::::else
Other
::::
`;

    const document = scanDirectives(body);
    expect(document.nodes.some((node) => node.type === "conditionalGroup")).toBe(true);
    expect(() => validateDirectives(document, schema)).not.toThrow();
  });

  it("rejects detached else-if and unsupported attributes", () => {
    expect(() => scanDirectives(":::else\nBad\n:::\n")).toThrow(
      "else directive must immediately follow an if or else-if branch.",
    );

    expect(() =>
      scanDirectives(':::include{path="x.md" condition="${dry-run}"}\n'),
    ).toThrow("include directive accepts only path.");

    expect(() =>
      scanDirectives(':::if{when="${dry-run}"}\nBody\n:::\n'),
    ).toThrow("if directive requires condition.");
  });

  it("accepts nested conditionals when the outer fence is longer", () => {
    const document = scanDirectives(
      '::::if{condition="${language} == \'typescript\'"}\n:::if{condition="${dry-run}"}\nInner\n:::\n::::\n',
    );

    expect(() => validateDirectives(document, schema)).not.toThrow();
  });

  it("rejects non-blank directive content between conditional branches", () => {
    expect(() =>
      scanDirectives(
        ':::if{condition="${dry-run}"}\nA\n:::\n:::include{path="fragment.md"}\n:::else\nB\n:::\n',
      ),
    ).toThrow("else directive must immediately follow an if or else-if branch.");
  });

  it("rejects nested containers whose inner fence is not shorter than the outer fence", () => {
    expect(() =>
      scanDirectives(':::if{condition="${dry-run}"}\n:::if{condition="${dry-run}"}\nInner\n:::\n:::\n'),
    ).toThrow("Nested conditional containers require a longer outer fence than inner fences.");
  });
});
