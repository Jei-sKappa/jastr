import type { TemplateInputDefinition } from "@jastr/engine";
import { describe, expect, it } from "vitest";
import {
  buildAgentSkillContent,
  validateAgentSkillTarget,
} from "../src/targets/agent-skill";

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
    ).toThrow("Unknown targets.agent-skill field name.");
    expect(() =>
      validateAgentSkillTarget({
        frontmatter: { name: "valid", description: "Valid" },
        extra: true,
      }),
    ).toThrow("Unknown targets.agent-skill field extra.");
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
    ).toThrow("targets.agent-skill.frontmatter must not declare inputs.");
    expect(() =>
      validateAgentSkillTarget({
        frontmatter: {
          name: "valid",
          description: "Valid",
          metadata: { owner: 42 },
        },
      }),
    ).toThrow(
      "targets.agent-skill.frontmatter.metadata field owner must be a string.",
    );
  });
});
