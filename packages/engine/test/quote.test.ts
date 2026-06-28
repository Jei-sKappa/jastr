import { describe, expect, it } from "vitest";
import { quote } from "../src/quote";

describe("quote", () => {
  it("wraps a value in backticks", () => {
    expect(quote("language")).toBe("`language`");
  });

  it("wraps an empty string in two backticks", () => {
    expect(quote("")).toBe("``");
  });
});
