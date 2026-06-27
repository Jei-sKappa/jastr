import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertRegularUnit,
  commitUnit,
  removeUnit,
  resolveNamedUnit,
  stageUnit,
} from "../../src/install/unit";

const temps: string[] = [];

async function makeTemp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

/** Write a file, creating parent dirs as needed. */
async function writeAt(file: string, content = ""): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

/**
 * Build a source base whose `.jastr/` holds a standalone template `foo` and a
 * group `bar` (marker + two templates). Returns the base dir.
 */
async function makeSourceBase(): Promise<string> {
  const base = await makeTemp("jastr-unit-src-");
  await writeAt(
    path.join(base, ".jastr", "foo", "TEMPLATE.md"),
    "# foo template\n",
  );
  await writeAt(
    path.join(base, ".jastr", "foo", "partials", "snippet.md"),
    "snippet\n",
  );
  await writeAt(path.join(base, ".jastr", "bar", ".jastrgroup"), "");
  await writeAt(
    path.join(base, ".jastr", "bar", "templates", "one", "TEMPLATE.md"),
    "# one\n",
  );
  await writeAt(
    path.join(base, ".jastr", "bar", "templates", "two", "TEMPLATE.md"),
    "# two\n",
  );
  return base;
}

describe("resolveNamedUnit", () => {
  it("classifies a standalone template", async () => {
    const base = await makeSourceBase();
    const unit = await resolveNamedUnit({ base, name: "foo", source: "./src" });
    expect(unit).toEqual({
      kind: "standalone",
      id: "foo",
      dir: path.join(base, ".jastr", "foo"),
    });
  });

  it("classifies a group and records its template count", async () => {
    const base = await makeSourceBase();
    const unit = await resolveNamedUnit({ base, name: "bar", source: "./src" });
    expect(unit).toEqual({
      kind: "group",
      id: "bar",
      dir: path.join(base, ".jastr", "bar"),
      templateCount: 2,
    });
  });

  it("rejects a two-segment group/template ref with grouped_template_not_addable", async () => {
    const base = await makeSourceBase();
    await expect(
      resolveNamedUnit({ base, name: "bar/one", source: "./src" }),
    ).rejects.toMatchObject({
      code: "grouped_template_not_addable",
    } satisfies Partial<JastrError>);
  });

  it("rejects an absent name with template_not_found naming the source", async () => {
    const base = await makeSourceBase();
    let thrown: unknown;
    try {
      await resolveNamedUnit({ base, name: "missing", source: "owner/repo" });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(JastrError);
    expect((thrown as JastrError).code).toBe("template_not_found");
    expect((thrown as JastrError).message).toContain("owner/repo");
  });

  it("rejects a name whose dir has neither TEMPLATE.md nor .jastrgroup", async () => {
    const base = await makeTemp("jastr-unit-empty-");
    await mkdir(path.join(base, ".jastr", "empty"), { recursive: true });
    await expect(
      resolveNamedUnit({ base, name: "empty", source: "./src" }),
    ).rejects.toMatchObject({
      code: "template_not_found",
    } satisfies Partial<JastrError>);
  });
});

describe("assertRegularUnit", () => {
  it("accepts a tree of regular files and directories", async () => {
    const base = await makeSourceBase();
    await expect(
      assertRegularUnit(path.join(base, ".jastr", "foo")),
    ).resolves.toBeUndefined();
  });

  it("rejects a symlink anywhere in the unit with unsupported_source_entry", async () => {
    const base = await makeTemp("jastr-unit-symlink-");
    const unitDir = path.join(base, ".jastr", "foo");
    await writeAt(path.join(unitDir, "TEMPLATE.md"), "# foo\n");
    await writeAt(path.join(unitDir, "real.md"), "real\n");
    await symlink(path.join(unitDir, "real.md"), path.join(unitDir, "link.md"));

    await expect(assertRegularUnit(unitDir)).rejects.toMatchObject({
      code: "unsupported_source_entry",
    } satisfies Partial<JastrError>);
  });

  it("rejects a symlink nested in a subdirectory", async () => {
    const base = await makeTemp("jastr-unit-nested-symlink-");
    const unitDir = path.join(base, ".jastr", "foo");
    await writeAt(path.join(unitDir, "TEMPLATE.md"), "# foo\n");
    await writeAt(path.join(unitDir, "sub", "real.md"), "real\n");
    await symlink(
      path.join(unitDir, "sub", "real.md"),
      path.join(unitDir, "sub", "link.md"),
    );

    await expect(assertRegularUnit(unitDir)).rejects.toMatchObject({
      code: "unsupported_source_entry",
    } satisfies Partial<JastrError>);
  });

  it("rejects a FIFO in the unit before any copy", async () => {
    const fifoDir = await makeTemp("jastr-unit-fifo-");
    const unitDir = path.join(fifoDir, ".jastr", "foo");
    await writeAt(path.join(unitDir, "TEMPLATE.md"), "# foo\n");
    const fifoPath = path.join(unitDir, "pipe");
    if (!(await tryMakeFifo(fifoPath))) {
      // mkfifo unavailable on this platform/CI; the symlink cases already cover
      // the special-file rejection path. Skip silently.
      return;
    }

    await expect(assertRegularUnit(unitDir)).rejects.toMatchObject({
      code: "unsupported_source_entry",
    } satisfies Partial<JastrError>);
  });
});

describe("stageUnit + commitUnit", () => {
  it("stages a copy on the destination filesystem and commits by rename", async () => {
    const base = await makeSourceBase();
    const unitDir = path.join(base, ".jastr", "foo");
    const destRoot = await makeTemp("jastr-unit-dest-");

    const stageDir = await stageUnit({ unitDir, destRoot });

    // Staged under the destination's .jastr/ (same filesystem ⇒ atomic rename).
    expect(path.dirname(stageDir)).toBe(path.join(destRoot, ".jastr"));
    expect(path.basename(stageDir)).toMatch(/^\.jastr-stage-/);

    const destDir = path.join(destRoot, ".jastr", "foo");
    await commitUnit({ stageDir, destDir });

    // The committed tree reproduces the source unit byte-for-byte.
    expect(await readFile(path.join(destDir, "TEMPLATE.md"), "utf8")).toBe(
      "# foo template\n",
    );
    expect(
      await readFile(path.join(destDir, "partials", "snippet.md"), "utf8"),
    ).toBe("snippet\n");

    // The stage dir is gone (it was renamed, not copied).
    const remaining = await readdir(path.join(destRoot, ".jastr"));
    expect(remaining).toEqual(["foo"]);
  });

  it("copies a group's marker and every template", async () => {
    const base = await makeSourceBase();
    const unitDir = path.join(base, ".jastr", "bar");
    const destRoot = await makeTemp("jastr-unit-dest-group-");

    const stageDir = await stageUnit({ unitDir, destRoot });
    const destDir = path.join(destRoot, ".jastr", "bar");
    await commitUnit({ stageDir, destDir });

    // Marker present.
    expect(await readFile(path.join(destDir, ".jastrgroup"), "utf8")).toBe("");
    // Every template copied.
    expect(
      await readFile(
        path.join(destDir, "templates", "one", "TEMPLATE.md"),
        "utf8",
      ),
    ).toBe("# one\n");
    expect(
      await readFile(
        path.join(destDir, "templates", "two", "TEMPLATE.md"),
        "utf8",
      ),
    ).toBe("# two\n");
  });

  it("leaves no partial stage dir when a copy fails", async () => {
    const destRoot = await makeTemp("jastr-unit-failstage-");
    // Point at a non-existent unit so the initial readdir throws.
    const unitDir = path.join(destRoot, "does-not-exist");

    await expect(stageUnit({ unitDir, destRoot })).rejects.toThrow();

    // No .jastr-stage-* dir lingers beside the destination.
    const jastrDir = path.join(destRoot, ".jastr");
    const remaining = await readdir(jastrDir).catch(() => []);
    expect(remaining.filter((n) => n.startsWith(".jastr-stage-"))).toEqual([]);
  });
});

describe("removeUnit", () => {
  it("removes a unit directory and is idempotent on a missing dir", async () => {
    const root = await makeTemp("jastr-unit-remove-");
    const destDir = path.join(root, ".jastr", "foo");
    await writeAt(path.join(destDir, "TEMPLATE.md"), "# foo\n");

    await removeUnit(destDir);
    expect(await readdir(path.join(root, ".jastr"))).toEqual([]);

    // A second remove of the now-missing dir does not throw.
    await expect(removeUnit(destDir)).resolves.toBeUndefined();
  });
});

/**
 * Best-effort `mkfifo` so the FIFO test runs where the binary exists and skips
 * elsewhere (e.g. a platform without `mkfifo`). Returns whether a FIFO was made.
 */
async function tryMakeFifo(fifoPath: string): Promise<boolean> {
  const { spawnSync } = await import("node:child_process");
  const result = spawnSync("mkfifo", [fifoPath]);
  if (result.status === 0) {
    return true;
  }
  // Some platforms lack `mkfifo`; ensure no stray non-FIFO was created.
  await rm(fifoPath, { force: true });
  return false;
}
