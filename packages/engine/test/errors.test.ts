import { describe, expect, it } from "vitest";
import { JastrError } from "../src/index";

describe("JastrError", () => {
  it("carries a stable code, neutral message, and optional structured details", () => {
    const error = new JastrError(
      "missing_required_input",
      "Required input language is missing.",
      {
        inputName: "language",
      },
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("JastrError");
    expect(error.code).toBe("missing_required_input");
    expect(error.message).toBe("Required input language is missing.");
    expect(error.details).toEqual({ inputName: "language" });
  });

  it("accepts the freshness-check codes output_stale and output_missing", () => {
    const stale = new JastrError(
      "output_stale",
      "Generated agent-skill is stale.",
      {
        out: "out/SKILL.md",
      },
    );
    const missing = new JastrError("output_missing", "No agent-skill found.", {
      out: "out/SKILL.md",
    });

    expect(stale.code).toBe("output_stale");
    expect(missing.code).toBe("output_missing");
    expect(stale.details).toEqual({ out: "out/SKILL.md" });
  });
});
