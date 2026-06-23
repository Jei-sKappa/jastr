import { mkdir, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveProjectRoots } from "../src/fs/project-root";
import { createEmptyTempProject, createTempProject } from "./support/helpers";

describe("resolveProjectRoots", () => {
  let originalJastrHome: string | undefined;

  beforeEach(() => {
    originalJastrHome = process.env.JASTR_HOME;
  });

  afterEach(() => {
    if (originalJastrHome === undefined) {
      delete process.env.JASTR_HOME;
    } else {
      process.env.JASTR_HOME = originalJastrHome;
    }
    vi.restoreAllMocks();
  });

  it("resolves a local root only when the global base has no .jastr", async () => {
    const local = await createTempProject();
    const home = await createEmptyTempProject();
    try {
      process.env.JASTR_HOME = home.root;

      const roots = await resolveProjectRoots(local.root);
      const localReal = await realpath(local.root);

      expect(roots.local).toBe(local.root);
      expect(roots.global).toBeUndefined();
      expect(roots.ordered).toEqual([
        { kind: "local", projectRoot: local.root },
      ]);
      // Sanity: the recorded local projectRoot's .jastr is the local root.
      expect(path.join(roots.local ?? "", ".jastr")).toBe(
        path.join(local.root, ".jastr"),
      );
      expect(localReal).toBeTruthy();
    } finally {
      await local.cleanup();
      await home.cleanup();
    }
  });

  it("resolves a global root only when there is no local .jastr (AC-3.1)", async () => {
    const cwd = await createEmptyTempProject();
    const home = await createTempProject();
    try {
      process.env.JASTR_HOME = home.root;

      const roots = await resolveProjectRoots(cwd.root);

      expect(roots.local).toBeUndefined();
      expect(roots.global).toBe(home.root);
      expect(roots.ordered).toEqual([
        { kind: "global", projectRoot: home.root },
      ]);
    } finally {
      await cwd.cleanup();
      await home.cleanup();
    }
  });

  it("orders local before global when both exist (AC-2.4)", async () => {
    const local = await createTempProject();
    const home = await createTempProject();
    try {
      process.env.JASTR_HOME = home.root;

      const roots = await resolveProjectRoots(local.root);

      expect(roots.local).toBe(local.root);
      expect(roots.global).toBe(home.root);
      expect(roots.ordered).toEqual([
        { kind: "local", projectRoot: local.root },
        { kind: "global", projectRoot: home.root },
      ]);
    } finally {
      await local.cleanup();
      await home.cleanup();
    }
  });

  it("collapses to a single root when local and global realpaths match (AC-4.1)", async () => {
    const shared = await createTempProject();
    try {
      // Point JASTR_HOME at the same project root the upward walk resolves to.
      process.env.JASTR_HOME = shared.root;

      const roots = await resolveProjectRoots(shared.root);

      expect(roots.local).toBe(shared.root);
      expect(roots.global).toBeUndefined();
      expect(roots.ordered).toEqual([
        { kind: "local", projectRoot: shared.root },
      ]);
    } finally {
      await shared.cleanup();
    }
  });

  it("throws missing_project_root when neither root exists (AC-3.2)", async () => {
    const cwd = await createEmptyTempProject();
    const home = await createEmptyTempProject();
    try {
      process.env.JASTR_HOME = home.root;

      let error: unknown;
      try {
        await resolveProjectRoots(cwd.root);
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(JastrError);
      expect((error as JastrError).code).toBe("missing_project_root");
      const message = (error as JastrError).message;
      expect(message).toContain("locally");
      expect(message).toContain("globally");
      expect(message).toContain(path.join(home.root, ".jastr"));
    } finally {
      await cwd.cleanup();
      await home.cleanup();
    }
  });

  it("selects the global base from an absolute JASTR_HOME (AC-1.2)", async () => {
    const cwd = await createEmptyTempProject();
    const override = await createTempProject();
    const homeSpy = vi
      .spyOn(os, "homedir")
      .mockReturnValue("/this/should/not/be/used");
    try {
      process.env.JASTR_HOME = override.root;

      const roots = await resolveProjectRoots(cwd.root);

      expect(roots.global).toBe(override.root);
      expect(homeSpy).not.toHaveBeenCalled();
    } finally {
      await cwd.cleanup();
      await override.cleanup();
    }
  });

  it("falls back to os.homedir()/.jastr when JASTR_HOME is unset (AC-1.1)", async () => {
    const cwd = await createEmptyTempProject();
    const home = await createTempProject();
    vi.spyOn(os, "homedir").mockReturnValue(home.root);
    try {
      delete process.env.JASTR_HOME;

      const roots = await resolveProjectRoots(cwd.root);

      expect(roots.global).toBe(home.root);
      expect(roots.ordered).toEqual([
        { kind: "global", projectRoot: home.root },
      ]);
    } finally {
      await cwd.cleanup();
      await home.cleanup();
    }
  });

  it("treats empty, whitespace, or relative JASTR_HOME as unset (DoF-1)", async () => {
    const cwd = await createEmptyTempProject();
    const home = await createTempProject();
    vi.spyOn(os, "homedir").mockReturnValue(home.root);
    try {
      for (const bogus of ["", "   ", "relative/path"]) {
        process.env.JASTR_HOME = bogus;
        const roots = await resolveProjectRoots(cwd.root);
        expect(roots.global).toBe(home.root);
      }
    } finally {
      await cwd.cleanup();
      await home.cleanup();
    }
  });

  it("uses cwd for the local upward walk independent of the global root", async () => {
    const local = await createTempProject();
    const home = await createEmptyTempProject();
    try {
      process.env.JASTR_HOME = home.root;
      const nested = path.join(local.root, "nested", "deep");
      await mkdir(nested, { recursive: true });

      const roots = await resolveProjectRoots(nested);

      expect(roots.local).toBe(local.root);
      expect(roots.ordered).toEqual([
        { kind: "local", projectRoot: local.root },
      ]);
    } finally {
      await local.cleanup();
      await home.cleanup();
    }
  });
});
