import path from "node:path";
import { describe, expect, it } from "vitest";
import { type CaseManifest, loadCases } from "../harness/case-manifest";
import { loadRequirements, type Requirement } from "../harness/requirements";
import { validateTraceability } from "../harness/traceability";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

const baseRequirement: Requirement = {
  id: "RUN-FR-0001",
  title: "Run renders",
  status: "active",
  description: "Run renders a skill.",
  acceptance: [
    { id: "AC-0001", statement: "Exit 0." },
    { id: "AC-0002", statement: "Stdout rendered." },
  ],
};

const requirements: Requirement[] = [baseRequirement];

const baseCase: CaseManifest = {
  id: "basic-run",
  covers: ["RUN-FR-0001.AC-0001", "RUN-FR-0001.AC-0002"],
  title: "Basic run",
  description: "Runs a skill.",
  cwd: ".",
  command: ["run", "demo"],
  substitute: {},
  env: {},
  setup: [],
  expect: { exitCode: 0, stdout: "ok\n", stderr: "" },
};

const cases: CaseManifest[] = [baseCase];

describe("validateTraceability", () => {
  it("accepts cases that cover every active acceptance criterion", () => {
    expect(() => validateTraceability(requirements, cases)).not.toThrow();
  });

  it("rejects uncovered active acceptance criteria", () => {
    expect(() =>
      validateTraceability(requirements, [
        { ...baseCase, covers: ["RUN-FR-0001.AC-0001"] },
      ]),
    ).toThrow(/uncovered acceptance criterion RUN-FR-0001.AC-0002/);
  });

  it("rejects missing requirement and missing acceptance references", () => {
    expect(() =>
      validateTraceability(requirements, [
        { ...baseCase, covers: ["GEN-FR-0001.AC-0001"] },
      ]),
    ).toThrow(/covers missing requirement GEN-FR-0001/);

    expect(() =>
      validateTraceability(requirements, [
        { ...baseCase, covers: ["RUN-FR-0001.AC-9999"] },
      ]),
    ).toThrow(/covers missing acceptance criterion RUN-FR-0001.AC-9999/);
  });

  it("rejects removed requirement and removed acceptance references", () => {
    expect(() =>
      validateTraceability(
        [{ ...baseRequirement, status: "removed", removedReason: "Retired." }],
        cases,
      ),
    ).toThrow(/covers removed requirement RUN-FR-0001/);

    expect(() =>
      validateTraceability(
        [
          {
            ...baseRequirement,
            acceptance: [
              {
                id: "AC-0001",
                statement: "Old.",
                status: "removed",
                removedReason: "Retired.",
              },
              { id: "AC-0002", statement: "Stdout rendered." },
            ],
          },
        ],
        cases,
      ),
    ).toThrow(/covers removed acceptance criterion RUN-FR-0001.AC-0001/);
  });
});

describe("real tree traceability", () => {
  it("covers every active acceptance criterion", async () => {
    const requirements = await loadRequirements(repoRoot);
    const cases = (await loadCases(repoRoot)).map((entry) => entry.manifest);
    expect(() => validateTraceability(requirements, cases)).not.toThrow();
  });
});
