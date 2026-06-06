import { describe, expect, it } from "vitest";
import * as engine from "../src/index";

describe("engine public API", () => {
  it("exports the pinned callable API names", () => {
    expect(
      Object.keys(engine)
        .filter(
          (key) => typeof engine[key as keyof typeof engine] === "function",
        )
        .sort(),
    ).toEqual([
      "JastrError",
      "parseTemplateSource",
      "renderTemplateSource",
      "validateTemplateInputs",
      "validateTemplateSchema",
    ]);
  });
});
