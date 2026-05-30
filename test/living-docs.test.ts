import { describe, expect, it } from "vitest";
import {
  type Area,
  type RenderCase,
  renderDocument,
} from "../scripts/living-docs";

function makeCase(overrides: Partial<RenderCase> = {}): RenderCase {
  return {
    id: "demo-case",
    title: "Demo case",
    description: "Demonstrates the demo behavior.",
    command: ["run", "demo"],
    covers: ["DEMO-FR-0001.AC-0001"],
    exitCode: 0,
    stdout: "ok\n",
    stderr: "",
    ...overrides,
  };
}

function activeArea(): Area {
  return {
    title: "Demo",
    requirements: [
      {
        id: "DEMO-FR-0001",
        title: "Demo renders",
        status: "active",
        description: "The demo renders output.",
        acceptance: [{ id: "AC-0001", statement: "It renders." }],
      },
    ],
  };
}

describe("renderDocument", () => {
  it("renders an active requirement with coverage and a console transcript", () => {
    const doc = renderDocument([activeArea()], [makeCase()]);

    expect(doc).toContain("### DEMO-FR-0001 — Demo renders");
    expect(doc).toContain("| AC-0001 | It renders. | ✅ `demo-case` |");
    expect(doc).toContain("**Demo case** — demonstrates DEMO-FR-0001.AC-0001");
    expect(doc).toContain("$ skillrouter run demo");
    expect(doc).toContain("# exit 0");
    // Active requirements carry no status badge.
    expect(doc).not.toContain("_(active)_");
  });

  it("marks an active criterion with no covering case as uncovered", () => {
    const doc = renderDocument([activeArea()], []);

    expect(doc).toContain("| AC-0001 | It renders. | ❌ uncovered |");
  });

  it("badges deferred requirements and notes their coverage rationale", () => {
    const area: Area = {
      title: "Demo",
      requirements: [
        {
          id: "DEMO-FR-0002",
          title: "Deferred behavior",
          status: "deferred",
          description: "Planned but not yet built.",
          acceptance: [{ id: "AC-0001", statement: "It will render." }],
          coverage: "Tracked for a later milestone.",
        },
      ],
    };

    const doc = renderDocument([area], []);

    expect(doc).toContain("### DEMO-FR-0002 — Deferred behavior _(deferred)_");
    expect(doc).toContain("> Deferred: Tracked for a later milestone.");
  });

  it("omits removed requirements and removed criteria entirely", () => {
    const area: Area = {
      title: "Demo",
      requirements: [
        {
          id: "DEMO-FR-0003",
          title: "Removed behavior",
          status: "removed",
          description: "Gone.",
          acceptance: [{ id: "AC-0001", statement: "Obsolete." }],
          removedReason: "Superseded.",
        },
        {
          id: "DEMO-FR-0004",
          title: "Partly trimmed",
          status: "active",
          description: "Has a removed criterion.",
          acceptance: [
            { id: "AC-0001", statement: "Still asserted." },
            {
              id: "AC-0002",
              statement: "No longer asserted.",
              status: "removed",
              removedReason: "Dropped.",
            },
          ],
        },
      ],
    };

    const doc = renderDocument(
      [area],
      [makeCase({ covers: ["DEMO-FR-0004.AC-0001"] })],
    );

    expect(doc).not.toContain("DEMO-FR-0003");
    expect(doc).not.toContain("Removed behavior");
    expect(doc).toContain("| AC-0001 | Still asserted. |");
    expect(doc).not.toContain("No longer asserted.");
  });

  it("drops areas whose requirements are all removed", () => {
    const area: Area = {
      title: "Empty",
      requirements: [
        {
          id: "DEMO-FR-0005",
          title: "Gone",
          status: "removed",
          description: "Gone.",
          acceptance: [{ id: "AC-0001", statement: "Obsolete." }],
          removedReason: "Superseded.",
        },
      ],
    };

    const doc = renderDocument([area], []);

    expect(doc).not.toContain("## Empty");
  });
});
