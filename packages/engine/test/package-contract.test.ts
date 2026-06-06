import { describe, expect, it } from "vitest";
import rootPackage from "../../../package.json" with { type: "json" };
import cliPackage from "../../cli/package.json" with { type: "json" };
import enginePackage from "../package.json" with { type: "json" };

describe("workspace package contract", () => {
  it("keeps the root package as a private orchestrator with no binary", () => {
    expect(rootPackage.private).toBe(true);
    expect(rootPackage.name).toBe("jastr-workspace");
    expect(rootPackage).not.toHaveProperty("bin");
    expect(rootPackage.workspaces).toEqual(["packages/*"]);
  });

  it("declares the engine and cli packages with their public names", () => {
    expect(enginePackage.name).toBe("@jastr/engine");
    expect(enginePackage.exports).toEqual({
      ".": {
        types: "./dist/index.d.ts",
        import: "./dist/index.js",
      },
    });

    expect(cliPackage.name).toBe("@jastr/cli");
    expect(cliPackage.bin).toEqual({ jastr: "./dist/index.js" });
    expect(cliPackage.dependencies["@jastr/engine"]).toBe("workspace:*");
  });
});
