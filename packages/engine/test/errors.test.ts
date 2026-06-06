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
});
