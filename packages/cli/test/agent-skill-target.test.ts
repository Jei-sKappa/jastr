import { JastrError, type TemplateInputDefinition } from "@jastr/engine";
import { describe, expect, it } from "vitest";
import YAML from "yaml";
import {
  type AgentSkillTarget,
  buildAgentSkillContent,
  validateAgentSkillTarget,
} from "../src/targets/agent-skill";

function parseFrontmatter(content: string): Record<string, unknown> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (match === null) throw new Error("no frontmatter block found");
  return YAML.parse(match[1] as string) as Record<string, unknown>;
}

describe("Agent Skill wrapper body shapes", () => {
  const demoTarget = validateAgentSkillTarget({
    frontmatter: { name: "demo", description: "Demo skill." },
  });

  it("Shape A: no inputs renders the bare command and no Inputs section", () => {
    const content = buildAgentSkillContent({
      templateRef: "demo",
      target: demoTarget,
      inputs: [],
    });
    expect(content).toBe(`---
name: demo
description: Demo skill.
---

Run this command and follow its output exactly:

\`\`\`bash
jastr run demo
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`);
    expect(content).not.toContain("## Inputs");
    expect(content).not.toContain("$ARGUMENTS");
  });

  it("Shape B: one required enum input with a description", () => {
    const inputs: Array<{ name: string; definition: TemplateInputDefinition }> =
      [
        {
          name: "language",
          definition: {
            type: "enum",
            values: ["typescript", "python"],
            required: true,
            description: "target language",
          },
        },
      ];
    expect(
      buildAgentSkillContent({
        templateRef: "demo",
        target: demoTarget,
        inputs,
      }),
    ).toBe(`---
name: demo
description: Demo skill.
argument-hint: --language=typescript|python
---

This skill takes one input, \`--language\` (enum: typescript|python) — target language. Fill in \`--language=<value>\` from the user's request. Then run this command and follow its output exactly:

\`\`\`bash
jastr run demo --language=<value>
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`);
  });

  it("Shape B: one required string input with no description", () => {
    const inputs: Array<{ name: string; definition: TemplateInputDefinition }> =
      [{ name: "tag", definition: { type: "string", required: true } }];
    expect(
      buildAgentSkillContent({
        templateRef: "demo",
        target: demoTarget,
        inputs,
      }),
    ).toBe(`---
name: demo
description: Demo skill.
argument-hint: --tag=<value>
---

This skill takes one input, \`--tag\` (string). Fill in \`--tag=<value>\` from the user's request. Then run this command and follow its output exactly:

\`\`\`bash
jastr run demo --tag=<value>
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`);
  });

  it("Shape B: one required boolean input is inlined as --name=<value>", () => {
    const inputs: Array<{ name: string; definition: TemplateInputDefinition }> =
      [{ name: "verbose", definition: { type: "boolean", required: true } }];
    const content = buildAgentSkillContent({
      templateRef: "demo",
      target: demoTarget,
      inputs,
    });
    expect(content).toContain(
      "This skill takes one input, `--verbose` (boolean). Fill in `--verbose=<value>` from the user's request.",
    );
    expect(content).toContain("jastr run demo --verbose=<value>");
    expect(content).not.toContain("jastr run demo\n");
  });

  it("Shape C: one optional enum input with default and description keeps the command bare", () => {
    const inputs: Array<{ name: string; definition: TemplateInputDefinition }> =
      [
        {
          name: "language",
          definition: {
            type: "enum",
            values: ["typescript", "python"],
            required: false,
            default: "typescript",
            description: "target language",
          },
        },
      ];
    expect(
      buildAgentSkillContent({
        templateRef: "demo",
        target: demoTarget,
        inputs,
      }),
    ).toBe(`---
name: demo
description: Demo skill.
argument-hint: "[--language=typescript|python]"
---

This skill takes one optional input, \`--language\` (enum: typescript|python, default: typescript) — target language. Add \`--language=<value>\` if the user's request calls for it; otherwise leave it out. Then run this command and follow its output exactly:

\`\`\`bash
jastr run demo
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`);
  });

  it("Shape C: one optional boolean input with no default and no description", () => {
    const inputs: Array<{ name: string; definition: TemplateInputDefinition }> =
      [{ name: "verbose", definition: { type: "boolean", required: false } }];
    expect(
      buildAgentSkillContent({
        templateRef: "demo",
        target: demoTarget,
        inputs,
      }),
    ).toBe(`---
name: demo
description: Demo skill.
argument-hint: "[--verbose]"
---

This skill takes one optional input, \`--verbose\` (boolean). Add \`--verbose=<value>\` if the user's request calls for it; otherwise leave it out. Then run this command and follow its output exactly:

\`\`\`bash
jastr run demo
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`);
  });

  it("Shape D: mixed inputs inline only the required ones in declaration order", () => {
    const target = validateAgentSkillTarget({
      frontmatter: { name: "deploy", description: "Deploy to an environment." },
    });
    const inputs: Array<{ name: string; definition: TemplateInputDefinition }> =
      [
        {
          name: "env",
          definition: {
            type: "enum",
            values: ["dev", "prod"],
            required: true,
            description: "target environment",
          },
        },
        {
          name: "region",
          definition: {
            type: "string",
            required: false,
            default: "us-east-1",
            description: "deployment region",
          },
        },
        {
          name: "dry-run",
          definition: {
            type: "boolean",
            required: false,
            description: "preview without applying",
          },
        },
        { name: "tag", definition: { type: "string", required: true } },
        {
          name: "verbose",
          definition: { type: "boolean", required: false, default: false },
        },
      ];
    expect(
      buildAgentSkillContent({ templateRef: "deploy", target, inputs }),
    ).toBe(`---
name: deploy
description: Deploy to an environment.
argument-hint: --env=dev|prod [--region=<value>] [--dry-run] --tag=<value> [--verbose]
---

## Inputs

- \`--env\` (enum: dev|prod, required) — target environment
- \`--region\` (string, optional, default: us-east-1) — deployment region
- \`--dry-run\` (boolean, optional) — preview without applying
- \`--tag\` (string, required)
- \`--verbose\` (boolean, optional, default: false)

Map the user's request to the inputs above and append them as \`--flag=value\` arguments, including every required input. Then run this command and follow its output exactly:

\`\`\`bash
jastr run deploy --env=<value> --tag=<value>
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`);
  });

  it("Shape D: all-required inputs inline in declaration order", () => {
    const target = validateAgentSkillTarget({
      frontmatter: { name: "x-skill", description: "X." },
    });
    const inputs: Array<{ name: string; definition: TemplateInputDefinition }> =
      [
        { name: "tag", definition: { type: "string", required: true } },
        {
          name: "env",
          definition: { type: "enum", values: ["dev", "prod"], required: true },
        },
      ];
    const content = buildAgentSkillContent({
      templateRef: "x",
      target,
      inputs,
    });
    expect(content).toContain("jastr run x --tag=<value> --env=<value>");
    expect(content).not.toContain("$ARGUMENTS");
  });

  it("Shape D: all-optional inputs keep the command bare", () => {
    const target = validateAgentSkillTarget({
      frontmatter: { name: "x-skill", description: "X." },
    });
    const inputs: Array<{ name: string; definition: TemplateInputDefinition }> =
      [
        {
          name: "region",
          definition: { type: "string", required: false, default: "us-east-1" },
        },
        {
          name: "verbose",
          definition: { type: "boolean", required: false, default: false },
        },
      ];
    expect(
      buildAgentSkillContent({ templateRef: "x", target, inputs }),
    ).toBe(`---
name: x-skill
description: X.
argument-hint: "[--region=<value>] [--verbose]"
---

## Inputs

- \`--region\` (string, optional, default: us-east-1)
- \`--verbose\` (boolean, optional, default: false)

Map the user's request to the inputs above and append them as \`--flag=value\` arguments, including every required input. Then run this command and follow its output exactly:

\`\`\`bash
jastr run x
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`);
  });

  it("Shape B: variant ref renders the single-input shape with the variant command", () => {
    const target = validateAgentSkillTarget({
      frontmatter: { name: "deploy-prod", description: "Deploy to prod." },
    });
    const inputs: Array<{ name: string; definition: TemplateInputDefinition }> =
      [{ name: "tag", definition: { type: "string", required: true } }];
    const content = buildAgentSkillContent({
      templateRef: "deploy#prod",
      target,
      inputs,
    });
    expect(content).toContain("jastr run deploy#prod --tag=<value>");
    expect(content).not.toContain("## Inputs");
  });
});

describe("Agent Skill target metadata", () => {
  it("rejects missing metadata, unknown targets.agent-skill fields, reserved frontmatter, and invalid metadata values", () => {
    expect(() => validateAgentSkillTarget(undefined)).toThrow(
      "Template must declare targets.agent-skill metadata for generate agent-skill.",
    );
    expect(() => validateAgentSkillTarget([])).toThrow(
      "targets.agent-skill must be a mapping.",
    );
    expect(() =>
      validateAgentSkillTarget({ name: "valid", description: "Valid" }),
    ).toThrow("Unknown targets.agent-skill field `name`.");
    expect(() =>
      validateAgentSkillTarget({
        frontmatter: { name: "valid", description: "Valid" },
        extra: true,
      }),
    ).toThrow("Unknown targets.agent-skill field `extra`.");
    expect(() => validateAgentSkillTarget({})).toThrow(
      "targets.agent-skill.frontmatter is required and must be a mapping.",
    );
    expect(() =>
      validateAgentSkillTarget({
        frontmatter: { name: "bad--name", description: "Valid" },
      }),
    ).toThrow(
      "targets.agent-skill.frontmatter.name must be 1-64 lowercase letters, numbers, and hyphens with no leading, trailing, or consecutive hyphens.",
    );
    expect(() =>
      validateAgentSkillTarget({
        frontmatter: { name: "valid", description: "" },
      }),
    ).toThrow(
      "targets.agent-skill.frontmatter.description must be 1-1024 characters.",
    );
    expect(() =>
      validateAgentSkillTarget({
        frontmatter: { name: "valid", description: "Valid", inputs: {} },
      }),
    ).toThrow("targets.agent-skill.frontmatter must not declare `inputs`.");
    expect(() =>
      validateAgentSkillTarget({
        frontmatter: {
          name: "valid",
          description: "Valid",
          metadata: { owner: 42 },
        },
      }),
    ).toThrow(
      "targets.agent-skill.frontmatter.metadata field `owner` must be a string.",
    );
  });

  it("rejects a literal argument-hint in passthrough frontmatter (AC-4.1)", () => {
    expect(() =>
      validateAgentSkillTarget({
        frontmatter: {
          name: "valid",
          description: "Valid",
          "argument-hint": "--tag=<value>",
        },
      }),
    ).toThrow(
      "targets.agent-skill.frontmatter must not declare `argument-hint`.",
    );
  });
});

describe("base argument-hint-prefix directive", () => {
  it("accepts a sibling argument-hint-prefix and carries it trimmed on the target (AC-2.1, AC-2.2)", () => {
    const target = validateAgentSkillTarget({
      frontmatter: { name: "demo", description: "Demo skill." },
      "argument-hint-prefix": "  Apply the change  ",
    });
    expect(target.argumentHintPrefix).toBe("Apply the change");
  });

  it("leaves argumentHintPrefix absent when the prefix is undeclared", () => {
    const target = validateAgentSkillTarget({
      frontmatter: { name: "demo", description: "Demo skill." },
    });
    expect(target.argumentHintPrefix).toBeUndefined();
  });

  it("rejects a non-string base prefix with invalid_target_metadata (AC-2.3)", () => {
    let error: unknown;
    try {
      validateAgentSkillTarget({
        frontmatter: { name: "demo", description: "Demo skill." },
        "argument-hint-prefix": 42,
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(JastrError);
    expect(error).toMatchObject({ code: "invalid_target_metadata" });
    expect((error as JastrError).message).toContain("must be a string");
  });

  it("rejects an empty / whitespace-only base prefix with invalid_target_metadata (AC-2.4)", () => {
    let error: unknown;
    try {
      validateAgentSkillTarget({
        frontmatter: { name: "demo", description: "Demo skill." },
        "argument-hint-prefix": "   ",
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(JastrError);
    expect(error).toMatchObject({ code: "invalid_target_metadata" });
  });

  it("rejects a multi-line base prefix with invalid_target_metadata (AC-2.5)", () => {
    let error: unknown;
    try {
      validateAgentSkillTarget({
        frontmatter: { name: "demo", description: "Demo skill." },
        "argument-hint-prefix": "first\nsecond",
      });
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(JastrError);
    expect(error).toMatchObject({ code: "invalid_target_metadata" });
    expect((error as JastrError).message).toContain("single line");
  });
});

describe("argument-hint derivation, assembly, and emission", () => {
  const target = validateAgentSkillTarget({
    frontmatter: { name: "demo", description: "Demo skill." },
  });

  function hintFor(
    inputs: ReadonlyArray<{
      name: string;
      definition: TemplateInputDefinition;
    }>,
    overrides: Partial<AgentSkillTarget> = {},
  ): unknown {
    const content = buildAgentSkillContent({
      templateRef: "demo",
      target: { ...target, ...overrides },
      inputs,
    });
    return parseFrontmatter(content)["argument-hint"];
  }

  it("renders a required string input as --name=<value> (AC-1.1)", () => {
    expect(
      hintFor([
        { name: "tag", definition: { type: "string", required: true } },
      ]),
    ).toBe("--tag=<value>");
  });

  it("renders an optional string input as [--name=<value>] (AC-1.2)", () => {
    expect(
      hintFor([
        { name: "tag", definition: { type: "string", required: false } },
      ]),
    ).toBe("[--tag=<value>]");
  });

  it("renders a required enum input as --name=values joined by | in declared order (AC-1.3)", () => {
    expect(
      hintFor([
        {
          name: "mode",
          definition: {
            type: "enum",
            values: ["new", "merge"],
            required: true,
          },
        },
      ]),
    ).toBe("--mode=new|merge");
  });

  it("renders an optional enum input wrapped in [ ] (AC-1.4)", () => {
    expect(
      hintFor([
        {
          name: "mode",
          definition: {
            type: "enum",
            values: ["new", "merge"],
            required: false,
          },
        },
      ]),
    ).toBe("[--mode=new|merge]");
  });

  it("renders a required boolean input as --name with no placeholder (AC-1.5)", () => {
    expect(
      hintFor([
        { name: "verbose", definition: { type: "boolean", required: true } },
      ]),
    ).toBe("--verbose");
  });

  it("renders an optional boolean input as [--name] (AC-1.6)", () => {
    expect(
      hintFor([
        { name: "verbose", definition: { type: "boolean", required: false } },
      ]),
    ).toBe("[--verbose]");
  });

  it("joins multiple inputs by single spaces in declaration order (AC-1.7)", () => {
    expect(
      hintFor([
        { name: "manifest", definition: { type: "string", required: true } },
        {
          name: "mode",
          definition: {
            type: "enum",
            values: ["new", "merge"],
            required: false,
          },
        },
        { name: "force", definition: { type: "boolean", required: true } },
      ]),
    ).toBe("--manifest=<value> [--mode=new|merge] --force");
  });

  it("assembles prefix + form with exactly one joining space (AC-3.1)", () => {
    expect(
      hintFor(
        [{ name: "tag", definition: { type: "string", required: true } }],
        {
          argumentHintPrefix: "Apply the change",
        },
      ),
    ).toBe("Apply the change --tag=<value>");
  });

  it("assembles prefix only when there are no inputs (AC-3.2)", () => {
    expect(hintFor([], { argumentHintPrefix: "Run the cleanup" })).toBe(
      "Run the cleanup",
    );
  });

  it("assembles form only when there is no prefix (AC-3.3)", () => {
    expect(
      hintFor([
        { name: "tag", definition: { type: "string", required: true } },
      ]),
    ).toBe("--tag=<value>");
  });

  it("omits the argument-hint field when neither prefix nor inputs exist (AC-3.4)", () => {
    const content = buildAgentSkillContent({
      templateRef: "demo",
      target,
      inputs: [],
    });
    expect(parseFrontmatter(content)).not.toHaveProperty("argument-hint");
    expect(content).not.toContain("argument-hint");
  });

  it("emits argument-hint immediately after description and before passthrough fields (AC-3.5)", () => {
    const withPassthrough = validateAgentSkillTarget({
      frontmatter: {
        name: "demo",
        description: "Demo skill.",
        license: "MIT",
      },
    });
    const content = buildAgentSkillContent({
      templateRef: "demo",
      target: { ...withPassthrough, argumentHintPrefix: "Do the thing" },
      inputs: [{ name: "tag", definition: { type: "string", required: true } }],
    });
    expect(Object.keys(parseFrontmatter(content))).toEqual([
      "name",
      "description",
      "argument-hint",
      "license",
    ]);
  });

  it("leaves body shapes byte-identical except for the added frontmatter line (AC-3.6)", () => {
    const inputs: Array<{ name: string; definition: TemplateInputDefinition }> =
      [{ name: "tag", definition: { type: "string", required: true } }];
    const content = buildAgentSkillContent({
      templateRef: "demo",
      target,
      inputs,
    });
    // Strip the frontmatter block; the body must match Shape B verbatim.
    const body = content.replace(/^---\n[\s\S]*?\n---\n/, "");
    expect(body).toBe(`
This skill takes one input, \`--tag\` (string). Fill in \`--tag=<value>\` from the user's request. Then run this command and follow its output exactly:

\`\`\`bash
jastr run demo --tag=<value>
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`);
  });

  it("serializes a hint with [, <, |, =, and a leading - via YAML.stringify and round-trips (AC-6.1)", () => {
    const content = buildAgentSkillContent({
      templateRef: "demo",
      target: { ...target, argumentHintPrefix: "-leading dash and [brackets]" },
      inputs: [
        {
          name: "mode",
          definition: {
            type: "enum",
            values: ["new", "merge"],
            required: false,
          },
        },
        { name: "manifest", definition: { type: "string", required: true } },
      ],
    });
    expect(parseFrontmatter(content)["argument-hint"]).toBe(
      "-leading dash and [brackets] [--mode=new|merge] --manifest=<value>",
    );
  });
});
