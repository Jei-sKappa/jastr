import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadRequirements,
  type RawRequirement,
  validateRequirements,
} from "./requirements";

const validRequirement: RawRequirement = {
  id: "RUN-FR-0001",
  title: "Run renders a skill template",
  status: "active",
  description: "Renders a project-local skill template.",
  acceptance: [
    { id: "AC-0001", statement: "Exits with code 0." },
    { id: "AC-0002", statement: "Prints rendered Markdown to stdout." },
  ],
};

describe("validateRequirements", () => {
  it("accepts a valid active requirement with acceptance criteria", () => {
    expect(
      validateRequirements([validRequirement], {
        filePath: "requirements/functional-requirements.yml",
      }),
    ).toEqual([validRequirement]);
  });

  it("rejects unknown requirement and acceptance fields", () => {
    expect(() =>
      validateRequirements([{ ...validRequirement, owner: "docs" }], {
        filePath: "requirements/functional-requirements.yml",
      }),
    ).toThrow(/unknown requirement field owner/);

    expect(() =>
      validateRequirements(
        [
          {
            ...validRequirement,
            acceptance: [
              {
                id: "AC-0001",
                statement: "Exits with code 0.",
                testCase: "basic-run",
              },
            ],
          },
        ],
        { filePath: "requirements/functional-requirements.yml" },
      ),
    ).toThrow(/unknown acceptance field testCase/);
  });

  it("rejects invalid requirement ids", () => {
    expect(() =>
      validateRequirements([{ ...validRequirement, id: "FR-CLI-RUN-001" }], {
        filePath: "requirements/functional-requirements.yml",
      }),
    ).toThrow(/invalid requirement id FR-CLI-RUN-001/);
  });

  it("rejects duplicate requirement ids", () => {
    expect(() =>
      validateRequirements([validRequirement, validRequirement], {
        filePath: "requirements/functional-requirements.yml",
      }),
    ).toThrow(/duplicate requirement id RUN-FR-0001/);
  });

  it("rejects invalid requirement statuses", () => {
    expect(() =>
      validateRequirements(
        [{ ...validRequirement, status: "done" as "active" }],
        { filePath: "requirements/functional-requirements.yml" },
      ),
    ).toThrow(/invalid requirement status RUN-FR-0001: done/);
  });

  it("requires removed requirements to explain removal", () => {
    expect(() =>
      validateRequirements([{ ...validRequirement, status: "removed" }], {
        filePath: "requirements/functional-requirements.yml",
      }),
    ).toThrow(/removed requirement requires removedReason/);
  });

  it("requires deferred requirements to explain coverage", () => {
    expect(() =>
      validateRequirements([{ ...validRequirement, status: "deferred" }], {
        filePath: "requirements/functional-requirements.yml",
      }),
    ).toThrow(/deferred requirement requires coverage/);
  });

  it("rejects invalid and duplicate acceptance criterion ids", () => {
    expect(() =>
      validateRequirements(
        [
          {
            ...validRequirement,
            acceptance: [{ id: "AC-1", statement: "Bad id." }],
          },
        ],
        { filePath: "requirements/functional-requirements.yml" },
      ),
    ).toThrow(/invalid acceptance criterion id RUN-FR-0001.AC-1/);

    expect(() =>
      validateRequirements(
        [
          {
            ...validRequirement,
            acceptance: [
              { id: "AC-0001", statement: "One." },
              { id: "AC-0001", statement: "Two." },
            ],
          },
        ],
        { filePath: "requirements/functional-requirements.yml" },
      ),
    ).toThrow(/duplicate acceptance criterion id RUN-FR-0001.AC-0001/);
  });

  it("requires removed acceptance criteria to explain removal", () => {
    expect(() =>
      validateRequirements(
        [
          {
            ...validRequirement,
            acceptance: [
              {
                id: "AC-0001",
                statement: "Old behavior.",
                status: "removed",
              },
            ],
          },
        ],
        { filePath: "requirements/functional-requirements.yml" },
      ),
    ).toThrow(/removed acceptance criterion requires removedReason/);
  });
});

const repoRoot = path.resolve(import.meta.dirname, "../..");

describe("loadRequirements", () => {
  it("loads the real requirements registry", async () => {
    const requirements = await loadRequirements(repoRoot);
    expect(requirements.map((entry) => entry.id)).toContain("RUN-FR-0001");
    expect(requirements.map((entry) => entry.id)).toContain("VERSION-FR-0001");
  });
});
