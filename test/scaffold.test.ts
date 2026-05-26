import { describe, expect, it } from "vitest";
import { createTempProject } from "./helpers";

describe("test harness", () => {
  it("creates an isolated project root with .skillrouter", async () => {
    const project = await createTempProject();
    try {
      expect(project.root).toContain("skillrouter-");
    } finally {
      await project.cleanup();
    }
  });
});
