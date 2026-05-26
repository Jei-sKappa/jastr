import { describe, expect, it } from "vitest";
import { formatCliError, SkillrouterError } from "../src/errors";

describe("SkillrouterError", () => {
  it("formats concise CLI errors", () => {
    const error = new SkillrouterError(
      "missing_project_root",
      "No .skillrouter directory found from the current directory.",
    );

    expect(formatCliError(error)).toBe(
      "Error: No .skillrouter directory found from the current directory.",
    );
  });

  it("formats unknown errors without leaking stack traces", () => {
    expect(formatCliError(new Error("boom"))).toBe("Error: boom");
    expect(formatCliError("boom")).toBe("Error: Unexpected failure.");
  });
});
