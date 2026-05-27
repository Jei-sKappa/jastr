import { describe, expect, it } from "vitest";
import { parseRunFlags } from "../src/cli/args";
import { SkillrouterError } from "../src/errors";

describe("parseRunFlags", () => {
  it("parses raw run flags into bare and value forms", () => {
    expect(parseRunFlags(["--language=typescript", "--dry-run"])).toEqual([
      { name: "language", form: "value", value: "typescript" },
      { name: "dry-run", form: "bare", value: true },
    ]);
  });

  it("returns no flags for empty input", () => {
    expect(parseRunFlags([])).toEqual([]);
  });

  it("rejects malformed raw flags before schema validation", () => {
    expect(() => parseRunFlags(["-x"])).toThrow(SkillrouterError);
    expect(() => parseRunFlags(["--"])).toThrow(SkillrouterError);
    expect(() => parseRunFlags(["--name", "value"])).toThrow(SkillrouterError);
    expect(() => parseRunFlags(["--no-dry-run"])).toThrow(SkillrouterError);
  });

  it("rejects duplicate raw flags", () => {
    expect(() =>
      parseRunFlags(["--language=typescript", "--language=python"]),
    ).toThrow("Duplicate flag --language.");
  });
});
