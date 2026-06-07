import { describe, expect, it } from "vitest";
import {
  buildAgentSkillContent,
  validateAgentSkillTarget,
} from "../src/targets/agent-skill";

describe("Agent Skill target metadata", () => {
  it("validates targets.agent-skill and builds a minimal jastr wrapper", () => {
    const target = validateAgentSkillTarget({
      name: "review-code",
      description: "Review code with the rendered Jastr template output.",
      frontmatter: {
        "allowed-tools": "Read, Grep",
        metadata: { owner: "platform" },
        "custom-field": ["kept"],
      },
    });

    expect(
      buildAgentSkillContent({
        templateRef: "review",
        target,
      }),
    ).toBe(`---
name: review-code
description: Review code with the rendered Jastr template output.
allowed-tools: Read, Grep
metadata:
  owner: platform
custom-field:
  - kept
---

Run this command and follow its output exactly:

\`\`\`bash
jastr run review $ARGUMENTS
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`);
  });

  it("rejects missing metadata, unknown targets.agent-skill fields, reserved frontmatter, and invalid metadata values", () => {
    expect(() => validateAgentSkillTarget(undefined)).toThrow(
      "Template must declare targets.agent-skill metadata for generate agent-skill.",
    );
    expect(() => validateAgentSkillTarget([])).toThrow(
      "targets.agent-skill must be a mapping.",
    );
    expect(() =>
      validateAgentSkillTarget({ name: "bad--name", description: "Valid" }),
    ).toThrow(
      "targets.agent-skill.name must be 1-64 lowercase letters, numbers, and hyphens with no leading, trailing, or consecutive hyphens.",
    );
    expect(() =>
      validateAgentSkillTarget({ name: "valid", description: "", extra: true }),
    ).toThrow("targets.agent-skill.description must be 1-1024 characters.");
    expect(() =>
      validateAgentSkillTarget({
        name: "valid",
        description: "Valid",
        extra: true,
      }),
    ).toThrow("Unknown targets.agent-skill field extra.");
    expect(() =>
      validateAgentSkillTarget({
        name: "valid",
        description: "Valid",
        frontmatter: { name: "override" },
      }),
    ).toThrow("targets.agent-skill.frontmatter must not declare name.");
    expect(() =>
      validateAgentSkillTarget({
        name: "valid",
        description: "Valid",
        frontmatter: { metadata: { owner: 42 } },
      }),
    ).toThrow(
      "targets.agent-skill.frontmatter.metadata field owner must be a string.",
    );
  });
});
