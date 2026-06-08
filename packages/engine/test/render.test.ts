import { describe, expect, it } from "vitest";
import {
  type IncludeRequest,
  type IncludeResolver,
  JastrError,
  renderTemplateSource,
} from "../src/index";

describe("renderTemplateSource", () => {
  it("renders direct source with domain inputs, conditions, includes, raw includes, and interpolation", async () => {
    const files = new Map([
      [
        "main.md::fragment.md",
        { id: "fragment.md", source: "Nested {{language}}\n" },
      ],
      [
        "main.md::raw.md",
        {
          id: "raw.md",
          source: 'Raw {{language}}\n::include{path="ignored.md"}\n',
        },
      ],
    ]);
    const includeResolver: IncludeResolver = async (request) => {
      const hit = files.get(`${request.from}::${request.path}`);
      if (hit === undefined) {
        throw new JastrError(
          "include_not_found",
          `Include file ${request.path} was not found.`,
          {
            includePath: request.path,
          },
        );
      }
      return hit;
    };

    await expect(
      renderTemplateSource({
        sourceId: "main.md",
        source: `---
inputs:
  language:
    type: enum
    values: [typescript, python]
    required: true
  target-file:
    type: string
    required: false
---
# Demo

::::if{condition="\${language} == 'typescript'"}
TypeScript for {{target-file}}
::include{path="fragment.md"}
::::

::::else-if{condition="\${language} == 'python'"}
Python
::::

::include-raw{path="raw.md"}
`,
        inputs: {
          language: "typescript",
          "target-file": "src/index.ts",
        },
        includeResolver,
      }),
    ).resolves.toEqual({
      schema: {
        inputs: {
          language: {
            type: "enum",
            values: ["typescript", "python"],
            required: true,
          },
          "target-file": { type: "string", required: false },
        },
        targets: {},
      },
      markdown: `# Demo

TypeScript for src/index.ts
Nested typescript


Raw {{language}}
::include{path="ignored.md"}
`,
    });
  });

  it("uses structured include errors from the injected resolver", async () => {
    const includeResolver: IncludeResolver = async (request) => {
      throw new JastrError(
        "include_not_found",
        `Include file ${request.path} was not found.`,
        {
          includePath: request.path,
        },
      );
    };

    await expect(
      renderTemplateSource({
        sourceId: "main.md",
        source: '::include{path="missing.md"}\n',
        inputs: {},
        includeResolver,
      }),
    ).rejects.toMatchObject({
      code: "include_not_found",
      details: { includePath: "missing.md" },
    });
  });

  it("detects include cycles using include resolution ids", async () => {
    const includeResolver: IncludeResolver = async (request) => ({
      id: request.path === "a.md" ? "a.md" : "main.md",
      source:
        request.path === "a.md"
          ? '::include{path="main.md"}\n'
          : '::include{path="a.md"}\n',
    });

    await expect(
      renderTemplateSource({
        sourceId: "main.md",
        source: '::include{path="a.md"}\n',
        inputs: {},
        includeResolver,
      }),
    ).rejects.toThrow("Include cycle detected: main.md -> a.md -> main.md.");
  });
});

it("passes include root attributes through to the injected resolver", async () => {
  const requests: Array<
    Pick<IncludeRequest, "path" | "root" | "raw" | "from">
  > = [];
  const includeResolver: IncludeResolver = async (request) => {
    requests.push({
      path: request.path,
      root: request.root,
      raw: request.raw,
      from: request.from,
    });
    return {
      id: request.path,
      source: request.raw ? "Raw text\n" : "Fragment text\n",
    };
  };

  const result = await renderTemplateSource({
    sourceId: "main.md",
    source: [
      '::include{root="file", path="fragment.md"}',
      '::include-raw{root="group", path="raw.txt"}',
      "",
    ].join("\n"),
    inputs: {},
    includeResolver,
  });

  expect(result.markdown).toBe("Fragment text\nRaw text\n");
  expect(requests).toEqual([
    { path: "fragment.md", root: "file", raw: false, from: "main.md" },
    { path: "raw.txt", root: "group", raw: true, from: "main.md" },
    { path: "fragment.md", root: "file", raw: false, from: "main.md" },
    { path: "raw.txt", root: "group", raw: true, from: "main.md" },
  ]);
});

it("leaves omitted and unknown include roots for the resolver to interpret", async () => {
  const requests: Array<string | undefined> = [];
  const includeResolver: IncludeResolver = async (request) => {
    requests.push(request.root);
    return { id: `${request.path}-${requests.length}`, source: "" };
  };

  await renderTemplateSource({
    sourceId: "main.md",
    source: [
      '::include{path="default.md"}',
      '::include{root="workspace", path="unknown.md"}',
      "",
    ].join("\n"),
    inputs: {},
    includeResolver,
  });

  expect(requests).toEqual([undefined, "workspace", undefined, "workspace"]);
});

it("rejects include directives that omit path or declare unsupported attributes", async () => {
  await expect(
    renderTemplateSource({
      sourceId: "main.md",
      source: '::include{root="file"}\n',
      inputs: {},
    }),
  ).rejects.toThrow("include directive accepts path and optional root.");

  await expect(
    renderTemplateSource({
      sourceId: "main.md",
      source: '::include-raw{path="raw.md" mode="text"}\n',
      inputs: {},
    }),
  ).rejects.toThrow("include-raw directive accepts path and optional root.");
});
