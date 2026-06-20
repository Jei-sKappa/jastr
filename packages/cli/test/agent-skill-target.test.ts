import type { TemplateInputDefinition } from "@jastr/engine";
import { describe, expect, it } from "vitest";
import {
  buildAgentSkillContent,
  validateAgentSkillTarget,
} from "../src/targets/agent-skill";

describe("Agent Skill target metadata", () => {
  it("renders Shape 2 with passthrough frontmatter and a per-input bullet", () => {
    const target = validateAgentSkillTarget({
      frontmatter: {
        name: "review-code",
        description: "Review code with the rendered Jastr template output.",
        "allowed-tools": "Read, Grep",
        metadata: { owner: "platform" },
        "custom-field": ["kept"],
      },
    });

    const inputs: Array<{ name: string; definition: TemplateInputDefinition }> =
      [
        {
          name: "language",
          definition: {
            type: "enum",
            values: ["typescript", "python"],
            required: true,
            description: "implementation language",
          },
        },
      ];

    expect(
      buildAgentSkillContent({ templateRef: "review", target, inputs }),
    ).toBe(`---
name: review-code
description: Review code with the rendered Jastr template output.
allowed-tools: Read, Grep
metadata:
  owner: platform
custom-field:
  - kept
---

## Inputs

- \`--language\` (enum: typescript|python, required) — implementation language

Map the user's request to the inputs above and append them as \`--flag=value\` arguments, including every required input. Then run this command and follow its output exactly:

\`\`\`bash
jastr run review
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`);
  });

  it("renders the full bullet matrix in declaration order", () => {
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
jastr run deploy
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`);
  });

  it("renders Shape 1 with no inputs and never emits $ARGUMENTS", () => {
    const target = validateAgentSkillTarget({
      frontmatter: {
        name: "review-code",
        description: "Review code with the rendered Jastr template output.",
      },
    });

    const content = buildAgentSkillContent({
      templateRef: "review",
      target,
      inputs: [],
    });

    expect(content).toBe(`---
name: review-code
description: Review code with the rendered Jastr template output.
---

Run this command and follow its output exactly:

\`\`\`bash
jastr run review
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`);
    expect(content).not.toContain("$ARGUMENTS");
    expect(content).not.toContain("## Inputs");
  });

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
