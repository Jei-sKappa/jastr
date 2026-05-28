import { mkdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectIncludeCycle,
  readIncludeFile,
  resolveIncludePath,
} from "../src/compiler/includes";
import { createTempProject, writeProjectFile } from "./support/helpers";

describe("include resolution", () => {
  it("resolves file-relative paths and allows normalized ../ inside the project", async () => {
    const project = await createTempProject();
    try {
      await writeProjectFile(
        project.root,
        ".skillrouter/demo/fragments/a.md",
        "A",
      );
      const from = path.join(
        project.root,
        ".skillrouter",
        "demo",
        "nested",
        "template.md",
      );

      expect(resolveIncludePath(project.root, from, "../fragments/a.md")).toBe(
        path.join(project.root, ".skillrouter", "demo", "fragments", "a.md"),
      );
    } finally {
      await project.cleanup();
    }
  });

  it("rejects absolute home-relative outside-project and env paths", async () => {
    const project = await createTempProject();
    try {
      const from = path.join(
        project.root,
        ".skillrouter",
        "demo",
        "SKILL.template.md",
      );
      expect(() =>
        resolveIncludePath(project.root, from, "/etc/passwd"),
      ).toThrow("Include path /etc/passwd must be relative.");
      expect(() =>
        resolveIncludePath(project.root, from, "~/secret.md"),
      ).toThrow("Include path ~/secret.md must be relative.");
      expect(() =>
        resolveIncludePath(project.root, from, "../../../../outside.md"),
      ).toThrow(
        "Include path ../../../../outside.md escapes the project root.",
      );
      expect(() => resolveIncludePath(project.root, from, ".env")).toThrow(
        "Include path .env is rejected.",
      );
      expect(() =>
        resolveIncludePath(project.root, from, ".env.local"),
      ).toThrow("Include path .env.local is rejected.");
    } finally {
      await project.cleanup();
    }
  });

  it("reads existing includes and reports missing files", async () => {
    const project = await createTempProject();
    try {
      const from = path.join(
        project.root,
        ".skillrouter",
        "demo",
        "SKILL.template.md",
      );
      await writeProjectFile(
        project.root,
        ".skillrouter/demo/fragment.md",
        "Fragment",
      );
      await expect(
        readIncludeFile(project.root, from, "fragment.md"),
      ).resolves.toEqual({
        path: path.join(project.root, ".skillrouter", "demo", "fragment.md"),
        contents: "Fragment",
      });
      await expect(
        readIncludeFile(project.root, from, "missing.md"),
      ).rejects.toThrow("Include file missing.md was not found.");
      await expect(
        readIncludeFile(project.root, from, "missing.md"),
      ).rejects.toMatchObject({ code: "include_not_found" });
    } finally {
      await project.cleanup();
    }
  });

  it("reports non-missing read failures as include errors", async () => {
    const project = await createTempProject();
    try {
      const from = path.join(
        project.root,
        ".skillrouter",
        "demo",
        "SKILL.template.md",
      );
      await mkdir(path.join(project.root, ".skillrouter/demo/directory.md"), {
        recursive: true,
      });

      await expect(
        readIncludeFile(project.root, from, "directory.md"),
      ).rejects.toThrow("Include file directory.md could not be read: EISDIR.");
      await expect(
        readIncludeFile(project.root, from, "directory.md"),
      ).rejects.toMatchObject({ code: "include_error" });
    } finally {
      await project.cleanup();
    }
  });

  it("reports include cycles with the chain", () => {
    expect(() =>
      detectIncludeCycle(["/project/a.md", "/project/b.md"], "/project/a.md"),
    ).toThrow("Include cycle detected: a.md -> b.md -> a.md.");
  });
});
