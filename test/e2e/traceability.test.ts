import { describe, expect, it } from "vitest";
import type { CaseManifest } from "./case-manifest";
import type { Requirement } from "./requirements";
import { validateTraceability } from "./traceability";

const requirements: Requirement[] = [
  {
    id: "RUN-FR-0001",
    title: "Run renders",
    status: "active",
    description: "Run renders a skill.",
    acceptance: [
      { id: "AC-0001", statement: "Exit 0." },
      { id: "AC-0002", statement: "Stdout rendered." },
    ],
  },
];

const cases: CaseManifest[] = [
  {
    id: "basic-run",
    covers: ["RUN-FR-0001.AC-0001", "RUN-FR-0001.AC-0002"],
    title: "Basic run",
    description: "Runs a skill.",
    cwd: "project",
    command: ["run", "demo"],
    expect: { exitCode: 0, stdout: "ok\n", stderr: "" },
  },
];

describe("validateTraceability", () => {
  it("accepts cases that cover every active acceptance criterion", () => {
    expect(() => validateTraceability(requirements, cases)).not.toThrow();
  });

  it("rejects uncovered active acceptance criteria", () => {
    expect(() =>
      validateTraceability(requirements, [
        { ...cases[0], covers: ["RUN-FR-0001.AC-0001"] },
      ]),
    ).toThrow(/uncovered acceptance criterion RUN-FR-0001.AC-0002/);
  });

  it("rejects missing requirement and missing acceptance references", () => {
    expect(() =>
      validateTraceability(requirements, [
        { ...cases[0], covers: ["GEN-FR-0001.AC-0001"] },
      ]),
    ).toThrow(/covers missing requirement GEN-FR-0001/);

    expect(() =>
      validateTraceability(requirements, [
        { ...cases[0], covers: ["RUN-FR-0001.AC-9999"] },
      ]),
    ).toThrow(/covers missing acceptance criterion RUN-FR-0001.AC-9999/);
  });

  it("rejects removed requirement and removed acceptance references", () => {
    expect(() =>
      validateTraceability(
        [{ ...requirements[0], status: "removed", removedReason: "Retired." }],
        cases,
      ),
    ).toThrow(/covers removed requirement RUN-FR-0001/);

    expect(() =>
      validateTraceability(
        [
          {
            ...requirements[0],
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
