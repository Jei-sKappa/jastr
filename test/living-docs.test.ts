import { describe, expect, it } from "vitest";
import {
  type Area,
  buildFileTree,
  type RenderCase,
  renderDocument,
} from "../scripts/living-docs";

function makeCase(overrides: Partial<RenderCase> = {}): RenderCase {
  return {
    id: "demo-case",
    title: "Demo case",
    description: "Demonstrates the demo behavior.",
    cwd: "project",
    command: ["run", "demo"],
    covers: ["DEMO-FR-0001.AC-0001"],
    exitCode: 0,
    stdout: "ok\n",
    stderr: "",
    inputFiles: [
      {
        path: ".skillrouter/demo/SKILL.template.md",
        content: "---\nname: demo\n---\nHello {{target}}.\n",
      },
    ],
    outputFiles: [],
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
  it("renders an active requirement with an h4 case header", () => {
    const doc = renderDocument([activeArea()], [makeCase()]);

    expect(doc).toContain("### DEMO-FR-0001 — Demo renders");
    expect(doc).toContain("| AC-0001 | It renders. | ✅ `demo-case` |");
    // Each case is an h4 "Case: <title>" heading directly under the requirement.
    expect(doc).toContain("#### Case: Demo case");
    expect(doc).toContain("Description: Demonstrates the demo behavior.");
    // Covers lists AC ids only — the requirement id is in the ancestor heading.
    expect(doc).toContain("Covers: AC-0001");
    expect(doc).not.toContain("Covers: DEMO-FR-0001.AC-0001");
    // The command and its output are split into labelled sections; the exit
    // code lives in the CLI output label, not inside the code block.
    expect(doc).toContain("**Command**");
    expect(doc).toContain("$ skillrouter run demo");
    expect(doc).toContain("**CLI output** — exit 0");
    expect(doc).not.toContain("# exit 0");
    // The whole case body is wrapped in one collapsible.
    expect(doc).toContain("<summary>Input, command & output</summary>");
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

  it("renders a table of contents linking areas and requirements", () => {
    const doc = renderDocument([activeArea()], [makeCase()]);

    expect(doc).toContain("## Contents");
    expect(doc).toContain("- [Demo](#demo)");
    expect(doc).toContain(
      "  - [DEMO-FR-0001 — Demo renders](#demo-fr-0001--demo-renders)",
    );
  });

  it("embeds the input project tree and file contents for a case", () => {
    const doc = renderDocument(
      [activeArea()],
      [
        makeCase({
          inputFiles: [
            {
              path: ".skillrouter/demo/SKILL.template.md",
              content: "---\nname: demo\n---\nAnalyze `{{target-file}}`.\n",
            },
            {
              path: ".skillrouter/demo/fragment.md",
              content: "Fragment for {{language}}\n",
            },
          ],
        }),
      ],
    );

    // The input section is a bold label naming where the command ran.
    expect(doc).toContain("**Input project** — ran from `project/`");
    // A directory tree orients the reader to the fixture shape.
    expect(doc).toContain("project/");
    expect(doc).toContain("└─ .skillrouter/");
    // Each input file is labelled and its contents embedded verbatim.
    expect(doc).toContain("`.skillrouter/demo/SKILL.template.md`");
    expect(doc).toContain("Analyze `{{target-file}}`.");
    expect(doc).toContain("`.skillrouter/demo/fragment.md`");
    expect(doc).toContain("Fragment for {{language}}");
  });

  it("states the project is empty when no fixture files exist", () => {
    const doc = renderDocument(
      [activeArea()],
      [makeCase({ cwd: ".", inputFiles: [] })],
    );

    expect(doc).toContain("**Input project**");
    expect(doc).toContain(
      "_Empty — no `.skillrouter/` directory present (command ran from the project root)._",
    );
    // No directory tree is rendered for an empty fixture.
    expect(doc).not.toContain("└─");
  });

  it("renders generated output files when a case declares them", () => {
    const doc = renderDocument(
      [activeArea()],
      [
        makeCase({
          command: ["generate", "demo", "--out", "out/SKILL.md"],
          outputFiles: [
            {
              path: "out/SKILL.md",
              content: "---\nname: demo\n---\nRouter.\n",
            },
          ],
        }),
      ],
    );

    expect(doc).toContain("**Output files**");
    expect(doc).toContain("`out/SKILL.md`");
    expect(doc).toContain("Router.");
  });

  it("widens the fence when a file's contents contain a code fence", () => {
    const doc = renderDocument(
      [activeArea()],
      [
        makeCase({
          inputFiles: [
            {
              path: ".skillrouter/demo/SKILL.template.md",
              content: "Run it:\n```bash\nskillrouter run demo\n```\n",
            },
          ],
        }),
      ],
    );

    // The inner ``` fence forces a four-backtick wrapper so it stays literal.
    expect(doc).toContain("````md");
    expect(doc).toContain("```bash");
  });
});

describe("buildFileTree", () => {
  it("renders nested paths as an ASCII tree rooted at project/", () => {
    const tree = buildFileTree([
      ".skillrouter/demo/SKILL.template.md",
      ".skillrouter/demo/fragment.md",
    ]);

    expect(tree).toBe(
      [
        "project/",
        "└─ .skillrouter/",
        "   └─ demo/",
        "      ├─ fragment.md",
        "      └─ SKILL.template.md",
      ].join("\n"),
    );
  });

  it("branches sibling directories with the correct connectors", () => {
    const tree = buildFileTree(["out/SKILL.md", ".skillrouter/demo/x.md"]);

    expect(tree).toBe(
      [
        "project/",
        "├─ .skillrouter/",
        "│  └─ demo/",
        "│     └─ x.md",
        "└─ out/",
        "   └─ SKILL.md",
      ].join("\n"),
    );
  });
});
