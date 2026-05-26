import { mkdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { findProjectRoot } from "../src/fs/project-root";
import {
  resolveSkillTemplatePath,
  validateSkillName,
} from "../src/skills/skill";
import { createTempProject, writeProjectFile } from "./helpers";

describe("project root discovery and skill resolution", () => {
  it("finds the nearest ancestor containing .skillrouter", async () => {
    const project = await createTempProject();
    try {
      const nested = path.join(project.root, "a", "b", "c");
      await mkdir(nested, { recursive: true });
      await mkdir(path.join(project.root, "a", ".skillrouter"), {
        recursive: true,
      });

      await expect(findProjectRoot(nested)).resolves.toBe(
        path.join(project.root, "a"),
      );
    } finally {
      await project.cleanup();
    }
  });

  it("fails when no .skillrouter ancestor exists", async () => {
    const project = await createTempProject();
    try {
      await expect(findProjectRoot(path.dirname(project.root))).rejects.toThrow(
        "No .skillrouter directory found from the current directory.",
      );
    } finally {
      await project.cleanup();
    }
  });

  it("accepts only lowercase ASCII slug skill names", () => {
    expect(validateSkillName("analyze-code")).toBe("analyze-code");
    expect(validateSkillName("a1-b2")).toBe("a1-b2");
    expect(() => validateSkillName("Analyze")).toThrow(
      "Invalid skill name Analyze.",
    );
    expect(() => validateSkillName("team/analyze")).toThrow(
      "Invalid skill name team/analyze.",
    );
    expect(() => validateSkillName("-bad")).toThrow("Invalid skill name -bad.");
  });

  it("resolves the expected template path", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".skillrouter/demo/SKILL.template.md",
        "---\nname: demo\ndescription: Demo\n---\n",
      );
      await expect(
        resolveSkillTemplatePath(project.root, "demo"),
      ).resolves.toBe(
        path.join(project.root, ".skillrouter", "demo", "SKILL.template.md"),
      );
    } finally {
      await project.cleanup();
    }
  });
});
