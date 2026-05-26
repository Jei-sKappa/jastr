import { describe, expect, it } from "vitest";
import { parseCliArgs } from "../src/cli/args";
import { SkillrouterError } from "../src/errors";

describe("parseCliArgs", () => {
  it("parses run with raw skill flags after the skill name", () => {
    expect(
      parseCliArgs([
        "run",
        "analyze-code",
        "--language=typescript",
        "--dry-run",
      ]),
    ).toEqual({
      command: "run",
      skill: "analyze-code",
      flags: [
        { name: "language", form: "value", value: "typescript" },
        { name: "dry-run", form: "bare", value: true },
      ],
    });
  });

  it("parses generate with mandatory out value and force flag", () => {
    expect(
      parseCliArgs([
        "generate",
        "analyze-code",
        "--out",
        ".claude/skills/analyze/SKILL.md",
        "--force",
      ]),
    ).toEqual({
      command: "generate",
      skill: "analyze-code",
      out: ".claude/skills/analyze/SKILL.md",
      force: true,
    });
  });

  it("rejects malformed raw flags before schema validation", () => {
    expect(() => parseCliArgs(["run", "demo", "-x"])).toThrow(SkillrouterError);
    expect(() => parseCliArgs(["run", "demo", "--"])).toThrow(SkillrouterError);
    expect(() => parseCliArgs(["run", "demo", "--name", "value"])).toThrow(
      SkillrouterError,
    );
    expect(() => parseCliArgs(["run", "demo", "--no-dry-run"])).toThrow(
      SkillrouterError,
    );
  });

  it("rejects duplicate raw flags for run", () => {
    expect(() =>
      parseCliArgs([
        "run",
        "demo",
        "--language=typescript",
        "--language=python",
      ]),
    ).toThrow("Duplicate flag --language.");
  });

  it("rejects unknown generate options", () => {
    expect(() =>
      parseCliArgs(["generate", "demo", "--out=a", "--dry-run"]),
    ).toThrow("Unknown generate option --dry-run.");
  });
});
