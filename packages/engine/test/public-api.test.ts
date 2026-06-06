import { describe, expect, it } from "vitest";
import * as engine from "../src/index";

describe("engine public API", () => {
  it("exports the pinned callable API names", () => {
    expect(
      Object.keys(engine)
        .filter(
          // biome-ignore lint/performance/noDynamicNamespaceImportAccess: introspecting the public export surface is the point of this test
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
