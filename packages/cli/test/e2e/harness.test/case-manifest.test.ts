import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadCases,
  type RawCaseManifest,
  validateCaseManifest,
} from "../harness/case-manifest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const validCase: RawCaseManifest = {
  id: "basic-run",
  covers: ["RUN-FR-0001.AC-0001"],
  title: "Basic run",
  description: "Runs a minimal skill.",
  cwd: "sub",
  command: ["run", "demo"],
  expect: {
    exitCode: 0,
    stdoutFile: "expected/stdout.md",
    stderr: "",
  },
};

describe("validateCaseManifest", () => {
  it("accepts a valid e2e case manifest", () => {
    expect(
      validateCaseManifest(validCase, {
        filePath: "test/e2e/cases/basic-run/case.yml",
      }),
    ).toEqual(validCase);
  });

  it("defaults an omitted cwd to the project root", () => {
    const withoutCwd: Record<string, unknown> = { ...validCase };
    delete withoutCwd.cwd;

    const manifest = validateCaseManifest(withoutCwd, {
      filePath: "test/e2e/cases/basic-run/case.yml",
    });

    expect(manifest.cwd).toBe(".");
  });

  it("rejects uppercase or requirement-shaped case ids", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, id: "RUN-FR-0001-basic-run" },
        { filePath: "test/e2e/cases/basic-run/case.yml" },
      ),
    ).toThrow(/invalid case id RUN-FR-0001-basic-run/);
  });

  it("rejects docs-site fields and unknown fields", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, render: { show: [] } },
        { filePath: "test/e2e/cases/basic-run/case.yml" },
      ),
    ).toThrow(/unknown case field render/);

    expect(() =>
      validateCaseManifest(
        { ...validCase, hidden: true },
        { filePath: "test/e2e/cases/basic-run/case.yml" },
      ),
    ).toThrow(/unknown case field hidden/);
  });

  it("rejects unknown expect fields", () => {
    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          expect: {
            ...validCase.expect,
            matcher: "contains",
          },
        },
        { filePath: "test/e2e/cases/basic-run/case.yml" },
      ),
    ).toThrow(/unknown expect field matcher/);
  });

  it("rejects duplicate covers and bare FR refs", () => {
    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          covers: ["RUN-FR-0001.AC-0001", "RUN-FR-0001.AC-0001"],
        },
        { filePath: "test/e2e/cases/basic-run/case.yml" },
      ),
    ).toThrow(/duplicate ref RUN-FR-0001.AC-0001/);

    expect(() =>
      validateCaseManifest(
        { ...validCase, covers: ["RUN-FR-0001"] },
        { filePath: "test/e2e/cases/basic-run/case.yml" },
      ),
    ).toThrow(/must be an acceptance criterion ref/);
  });

  it("rejects unsafe paths and backslashes", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, cwd: "../escape" },
        { filePath: "test/e2e/cases/basic-run/case.yml" },
      ),
    ).toThrow(/cwd must not contain \.\. path segments/);

    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          expect: {
            exitCode: 0,
            stdoutFile: "expected\\stdout.md",
            stderr: "",
          },
        },
        { filePath: "test/e2e/cases/basic-run/case.yml" },
      ),
    ).toThrow(/expect.stdoutFile must use forward slashes/);
  });

  it("rejects invalid command and mutually exclusive stdout or stderr fields", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, command: ["run", 1] },
        { filePath: "test/e2e/cases/basic-run/case.yml" },
      ),
    ).toThrow(/command\[1\] must be a string/);

    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          expect: {
            exitCode: 0,
            stdout: "",
            stdoutFile: "expected/stdout.md",
            stderr: "",
          },
        },
        { filePath: "test/e2e/cases/basic-run/case.yml" },
      ),
    ).toThrow(/must not set both stdout and stdoutFile/);

    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          expect: {
            exitCode: 0,
            stdout: "",
            stderr: "",
            stderrFile: "expected/stderr.txt",
          },
        },
        { filePath: "test/e2e/cases/basic-run/case.yml" },
      ),
    ).toThrow(/must not set both stderr and stderrFile/);
  });

  it("requires stdout and stderr expectations", () => {
    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          expect: {
            exitCode: 0,
            stderr: "",
          },
        },
        { filePath: "test/e2e/cases/basic-run/case.yml" },
      ),
    ).toThrow(/expect requires stdout or stdoutFile/);

    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          expect: {
            exitCode: 0,
            stdout: "",
          },
        },
        { filePath: "test/e2e/cases/basic-run/case.yml" },
      ),
    ).toThrow(/expect requires stderr or stderrFile/);
  });
});

describe("loadCases", () => {
  it("rejects duplicate case ids across case directories", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "jastr-cases-"));
    const casesDir = path.join(tempRoot, "test/e2e/cases");
    const firstDir = path.join(casesDir, "first");
    const secondDir = path.join(casesDir, "second");
    const caseManifest = [
      "id: duplicate-case",
      "covers:",
      "  - RUN-FR-0001.AC-0001",
      "title: Duplicate case",
      "description: Uses the same case id in two directories.",
      "cwd: project",
      'command: ["run", "demo"]',
      "expect:",
      "  exitCode: 0",
      '  stdout: ""',
      '  stderr: ""',
      "",
    ].join("\n");

    try {
      await mkdir(firstDir, { recursive: true });
      await mkdir(secondDir, { recursive: true });
      await writeFile(path.join(firstDir, "case.yml"), caseManifest);
      await writeFile(path.join(secondDir, "case.yml"), caseManifest);

      await expect(loadCases(tempRoot)).rejects.toThrow(
        /duplicate case id duplicate-case/,
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("loads the real e2e cases", async () => {
    const cases = await loadCases(repoRoot);
    expect(cases.map((entry) => entry.manifest.id)).toContain("basic-run");
    expect(cases.map((entry) => entry.manifest.id)).toContain("version");
    expect(cases.length).toBeGreaterThanOrEqual(23);
  });
});
