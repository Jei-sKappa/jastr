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
  substitute: {},
  env: {},
  setup: [],
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

  it("accepts a substitute map binding tokens to built-in values", () => {
    const manifest = validateCaseManifest(
      { ...validCase, substitute: { __VERSION__: "jastrCliVersion" } },
      { filePath: "test/e2e/cases/version/case.yml" },
    );

    expect(manifest.substitute).toEqual({ __VERSION__: "jastrCliVersion" });
  });

  it("accepts globalRoot as a built-in substitute value", () => {
    const manifest = validateCaseManifest(
      { ...validCase, substitute: { __GLOBAL_ROOT__: "globalRoot" } },
      { filePath: "test/e2e/cases/global-resolve/case.yml" },
    );

    expect(manifest.substitute).toEqual({ __GLOBAL_ROOT__: "globalRoot" });
  });

  it("defaults an omitted substitute map to empty", () => {
    const withoutSubstitute: Record<string, unknown> = { ...validCase };
    delete withoutSubstitute.substitute;

    const manifest = validateCaseManifest(withoutSubstitute, {
      filePath: "test/e2e/cases/basic-run/case.yml",
    });

    expect(manifest.substitute).toEqual({});
  });

  it("rejects substitute values outside the built-in set", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, substitute: { __X__: "cwd" } },
        { filePath: "test/e2e/cases/basic-run/case.yml" },
      ),
    ).toThrow(
      /substitute\["__X__"\] must be one of projectRoot, jastrCliVersion, globalRoot/,
    );
  });

  it("rejects non-string substitute values", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, substitute: { __X__: 1 } },
        { filePath: "test/e2e/cases/basic-run/case.yml" },
      ),
    ).toThrow(
      /substitute\["__X__"\] must be one of projectRoot, jastrCliVersion, globalRoot/,
    );
  });

  it("accepts an env map of string values and defaults an omitted one to empty", () => {
    const manifest = validateCaseManifest(
      {
        ...validCase,
        env: { JASTR_GIT_BIN: "/abs/path/to/fake-git/git", FAKE_GIT_FAIL: "1" },
      },
      { filePath: "test/e2e/cases/add-clone/case.yml" },
    );
    expect(manifest.env).toEqual({
      JASTR_GIT_BIN: "/abs/path/to/fake-git/git",
      FAKE_GIT_FAIL: "1",
    });

    const withoutEnv: Record<string, unknown> = { ...validCase };
    delete withoutEnv.env;
    expect(
      validateCaseManifest(withoutEnv, {
        filePath: "test/e2e/cases/basic-run/case.yml",
      }).env,
    ).toEqual({});
  });

  it("rejects a non-string env value and a non-mapping env", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, env: { JASTR_GIT_BIN: 1 } },
        { filePath: "test/e2e/cases/add-clone/case.yml" },
      ),
    ).toThrow(/env\["JASTR_GIT_BIN"\] must be a string/);

    expect(() =>
      validateCaseManifest(
        { ...validCase, env: ["JASTR_GIT_BIN"] },
        { filePath: "test/e2e/cases/add-clone/case.yml" },
      ),
    ).toThrow(/env must be a mapping/);
  });

  it("accepts setup cli and cp steps and defaults an omitted setup to empty", () => {
    const manifest = validateCaseManifest(
      {
        ...validCase,
        setup: [
          { cli: ["add", "./src", "demo"] },
          {
            cp: { from: "mutated/TEMPLATE.md", to: ".jastr/demo/TEMPLATE.md" },
          },
        ],
      },
      { filePath: "test/e2e/cases/update-replace/case.yml" },
    );
    expect(manifest.setup).toEqual([
      { cli: ["add", "./src", "demo"] },
      { cp: { from: "mutated/TEMPLATE.md", to: ".jastr/demo/TEMPLATE.md" } },
    ]);

    const withoutSetup: Record<string, unknown> = { ...validCase };
    delete withoutSetup.setup;
    expect(
      validateCaseManifest(withoutSetup, {
        filePath: "test/e2e/cases/basic-run/case.yml",
      }).setup,
    ).toEqual([]);
  });

  it("rejects a setup step that is neither cli nor cp, or sets both", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, setup: [{ run: ["demo"] }] },
        { filePath: "test/e2e/cases/update-replace/case.yml" },
      ),
    ).toThrow(/unknown setup step field run/);

    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          setup: [{ cli: ["add"], cp: { from: "a", to: "b" } }],
        },
        { filePath: "test/e2e/cases/update-replace/case.yml" },
      ),
    ).toThrow(/setup\[0\] must set exactly one of cli or cp/);

    expect(() =>
      validateCaseManifest(
        { ...validCase, setup: [{}] },
        { filePath: "test/e2e/cases/update-replace/case.yml" },
      ),
    ).toThrow(/setup\[0\] must set exactly one of cli or cp/);
  });

  it("rejects a malformed setup cli step", () => {
    expect(() =>
      validateCaseManifest(
        { ...validCase, setup: [{ cli: [] }] },
        { filePath: "test/e2e/cases/update-replace/case.yml" },
      ),
    ).toThrow(/setup\[0\]\.cli must be a non-empty string array/);

    expect(() =>
      validateCaseManifest(
        { ...validCase, setup: [{ cli: ["add", 1] }] },
        { filePath: "test/e2e/cases/update-replace/case.yml" },
      ),
    ).toThrow(/setup\[0\]\.cli\[1\] must be a string/);
  });

  it("rejects unsafe cp paths and unknown cp fields", () => {
    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          setup: [{ cp: { from: "../escape", to: ".jastr/demo" } }],
        },
        { filePath: "test/e2e/cases/update-replace/case.yml" },
      ),
    ).toThrow(/setup\[0\]\.cp\.from must not contain \.\. path segments/);

    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          setup: [{ cp: { from: "ok", to: "/abs/dest" } }],
        },
        { filePath: "test/e2e/cases/update-replace/case.yml" },
      ),
    ).toThrow(/setup\[0\]\.cp\.to must not be absolute/);

    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          setup: [{ cp: { from: "ok", to: "dest", extra: "x" } }],
        },
        { filePath: "test/e2e/cases/update-replace/case.yml" },
      ),
    ).toThrow(/unknown cp step field extra/);
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

  it("accepts stdoutContains as a non-empty string array", () => {
    const manifest = validateCaseManifest(
      {
        ...validCase,
        expect: {
          exitCode: 0,
          stdoutContains: ["Usage: jastr run", "Template id"],
          stderr: "",
        },
      },
      { filePath: "test/e2e/cases/help-run/case.yml" },
    );

    expect(manifest.expect.stdoutContains).toEqual([
      "Usage: jastr run",
      "Template id",
    ]);
  });

  it("rejects an empty or non-string stdoutContains array", () => {
    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          expect: { exitCode: 0, stdoutContains: [], stderr: "" },
        },
        { filePath: "test/e2e/cases/help-run/case.yml" },
      ),
    ).toThrow(/stdoutContains must be a non-empty string array/);

    expect(() =>
      validateCaseManifest(
        {
          ...validCase,
          expect: { exitCode: 0, stdoutContains: [1], stderr: "" },
        },
        { filePath: "test/e2e/cases/help-run/case.yml" },
      ),
    ).toThrow(/stdoutContains must contain only strings/);
  });

  it("requires stdout, stdoutFile, or stdoutContains expectations", () => {
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
    ).toThrow(/expect requires stdout, stdoutFile, or stdoutContains/);

    expect(
      validateCaseManifest(
        {
          ...validCase,
          expect: {
            exitCode: 0,
            stdoutContains: ["ok"],
            stderr: "",
          },
        },
        { filePath: "test/e2e/cases/help-run/case.yml" },
      ).expect.stdoutContains,
    ).toEqual(["ok"]);

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
