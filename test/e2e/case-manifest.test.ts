import { describe, expect, it } from "vitest";
import { type RawCaseManifest, validateCaseManifest } from "./case-manifest";

const validCase: RawCaseManifest = {
  id: "basic-run",
  covers: ["RUN-FR-0001.AC-0001"],
  title: "Basic run",
  description: "Runs a minimal skill.",
  cwd: "project",
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
        { ...validCase, cwd: "../project" },
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
  });
});
