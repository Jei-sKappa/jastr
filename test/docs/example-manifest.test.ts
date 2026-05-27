import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findExampleReferences,
  loadExamples,
  validateExampleManifest,
} from "./example-manifest";

const validManifest = {
  id: "run-basic",
  title: "Run a basic skill",
  description: "Renders a minimal template.",
  cwd: "project",
  command: ["run", "demo"],
  expect: {
    exitCode: 0,
    stdoutFile: "expected/stdout.md",
    stderr: "",
  },
  render: {
    show: [{ kind: "command" }, { kind: "stdout" }],
  },
};

describe("validateExampleManifest", () => {
  it("accepts a valid manifest", () => {
    expect(
      validateExampleManifest(validManifest, {
        filePath: "docs/examples/run-basic/example.yml",
      }),
    ).toEqual(validManifest);
  });

  it("rejects invalid example ids", () => {
    expect(() =>
      validateExampleManifest(
        { ...validManifest, id: "Run-Basic" },
        { filePath: "docs/examples/run-basic/example.yml" },
      ),
    ).toThrow(/invalid example id Run-Basic/);
  });

  it("rejects shell command strings", () => {
    expect(() =>
      validateExampleManifest(
        { ...validManifest, command: "run demo" },
        { filePath: "docs/examples/run-basic/example.yml" },
      ),
    ).toThrow(/command must be a non-empty string array/);
  });

  it("rejects unknown top-level fields", () => {
    expect(() =>
      validateExampleManifest(
        { ...validManifest, surprise: true },
        { filePath: "docs/examples/run-basic/example.yml" },
      ),
    ).toThrow(/unknown top-level field surprise/);
  });

  it("rejects unsafe paths", () => {
    expect(() =>
      validateExampleManifest(
        { ...validManifest, cwd: "../outside" },
        { filePath: "docs/examples/run-basic/example.yml" },
      ),
    ).toThrow(/cwd must not contain \.\. path segments/);

    expect(() =>
      validateExampleManifest(
        {
          ...validManifest,
          expect: {
            exitCode: 0,
            stdoutFile: "expected\\stdout.md",
            stderr: "",
          },
        },
        { filePath: "docs/examples/run-basic/example.yml" },
      ),
    ).toThrow(/expect.stdoutFile must use forward slashes/);
  });

  it("rejects render items with unsafe file paths", () => {
    expect(() =>
      validateExampleManifest(
        {
          ...validManifest,
          render: {
            show: [{ kind: "file", path: "../secret.md", label: "Secret" }],
          },
        },
        { filePath: "docs/examples/run-basic/example.yml" },
      ),
    ).toThrow(/render.show\[0\].path must not contain \.\. path segments/);
  });
});

describe("loadExamples", () => {
  it("loads example manifests and rejects duplicate ids", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-docs-"));
    try {
      await mkdir(path.join(root, "docs/examples/a"), { recursive: true });
      await mkdir(path.join(root, "docs/examples/b"), { recursive: true });
      const yaml = [
        "id: run-basic",
        "title: Run a basic skill",
        "description: Renders a minimal template.",
        "cwd: project",
        'command: ["run", "demo"]',
        "expect:",
        "  exitCode: 0",
        "  stdoutFile: expected/stdout.md",
        '  stderr: ""',
        "render:",
        "  show:",
        "    - kind: command",
        "    - kind: stdout",
      ].join("\n");
      await writeFile(path.join(root, "docs/examples/a/example.yml"), yaml);
      await writeFile(path.join(root, "docs/examples/b/example.yml"), yaml);

      await expect(loadExamples(root)).rejects.toThrow(
        /duplicate example id run-basic/,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("findExampleReferences", () => {
  it("finds Example component references in docs pages", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-docs-"));
    try {
      await mkdir(path.join(root, "docs/site/guide"), { recursive: true });
      await writeFile(
        path.join(root, "docs/site/guide/getting-started.md"),
        ["# Getting Started", "", '<Example id="run-basic" />'].join("\n"),
      );

      await expect(findExampleReferences(root)).resolves.toEqual([
        {
          id: "run-basic",
          filePath: "docs/site/guide/getting-started.md",
        },
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
