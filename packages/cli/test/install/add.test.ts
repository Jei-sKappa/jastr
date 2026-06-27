import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeAdd } from "../../src/install/add";
import type { CloneOptions, GitRunner } from "../../src/install/git";
import { readLock } from "../../src/install/lock";

const temps: string[] = [];

async function makeTemp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

async function writeAt(file: string, content = ""): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await readFile(target);
    return true;
  } catch {
    return false;
  }
}

async function dirExists(target: string): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/** A `GitRunner` whose `clone` throws if called — asserts no clone for local. */
function noCloneRunner(overrides: Partial<GitRunner> = {}): GitRunner {
  return {
    clone: async () => {
      throw new Error("clone must not be called for a local-dir source");
    },
    revParseHead: async () => "0".repeat(40),
    isAvailable: async () => true,
    ...overrides,
  };
}

/**
 * A source base whose `.jastr/` holds a standalone `foo` (with an extra included
 * file) and a group `mygroup` (marker + two valid templates). Returns the base.
 */
async function makeSourceBase(): Promise<string> {
  const base = await makeTemp("jastr-add-src-");
  await writeAt(
    path.join(base, ".jastr", "foo", "TEMPLATE.md"),
    "---\n---\n# foo\n",
  );
  await writeAt(
    path.join(base, ".jastr", "foo", "partials", "snippet.md"),
    "snippet\n",
  );
  await writeAt(path.join(base, ".jastr", "mygroup", ".jastrgroup"), "");
  await writeAt(
    path.join(base, ".jastr", "mygroup", "templates", "one", "TEMPLATE.md"),
    "---\n---\n# one\n",
  );
  await writeAt(
    path.join(base, ".jastr", "mygroup", "templates", "two", "TEMPLATE.md"),
    "---\n---\n# two\n",
  );
  return base;
}

/** A destination root (its `.jastr/` may or may not exist yet). */
async function makeDest(): Promise<string> {
  return makeTemp("jastr-add-dest-");
}

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

describe("executeAdd: local-path install", () => {
  it("installs a standalone verbatim and records a lock entry (no clone)", async () => {
    const base = await makeSourceBase();
    const dest = await makeDest();
    const git = noCloneRunner();

    const output = await executeAdd({
      source: base,
      name: "foo",
      global: false,
      cwd: dest,
      git,
    });

    expect(output).toContain("Installed foo");
    expect(output).toContain("[local]");
    expect(
      await readFile(path.join(dest, ".jastr", "foo", "TEMPLATE.md"), "utf8"),
    ).toBe("---\n---\n# foo\n");
    // Included file copied verbatim too.
    expect(
      await readFile(
        path.join(dest, ".jastr", "foo", "partials", "snippet.md"),
        "utf8",
      ),
    ).toBe("snippet\n");

    const lock = await readLock(dest);
    const entry = lock.templates.foo;
    expect(entry).toBeDefined();
    expect(entry?.kind).toBe("standalone");
    expect(entry?.name).toBe("foo");
    // A local-path source records its absolute realpath, not the as-typed string.
    expect(path.isAbsolute(entry?.url ?? "")).toBe(true);
    // Base == source root ⇒ path omitted; non-git ⇒ commit omitted.
    expect(entry?.path).toBeUndefined();
    expect(entry?.commit).toBeUndefined();
    expect(typeof entry?.hash).toBe("string");
  });

  it("installs a whole group with marker and reports its template count", async () => {
    const base = await makeSourceBase();
    const dest = await makeDest();

    const output = await executeAdd({
      source: base,
      name: "mygroup",
      global: false,
      cwd: dest,
      git: noCloneRunner(),
    });

    expect(output).toContain("group mygroup");
    expect(output).toContain("2 templates");
    expect(
      await pathExists(path.join(dest, ".jastr", "mygroup", ".jastrgroup")),
    ).toBe(true);
    expect(
      await pathExists(
        path.join(dest, ".jastr", "mygroup", "templates", "one", "TEMPLATE.md"),
      ),
    ).toBe(true);
    const lock = await readLock(dest);
    expect(lock.templates.mygroup?.kind).toBe("group");
  });

  it("records a normalized relative path when --path is used", async () => {
    const base = await makeTemp("jastr-add-pathsrc-");
    await writeAt(
      path.join(base, "sub", ".jastr", "bar", "TEMPLATE.md"),
      "---\n---\n# bar\n",
    );
    const dest = await makeDest();

    await executeAdd({
      source: base,
      name: "bar",
      path: "sub",
      global: false,
      cwd: dest,
      git: noCloneRunner(),
    });

    const lock = await readLock(dest);
    expect(lock.templates.bar?.path).toBe("sub");
  });
});

describe("executeAdd: bootstrap and roots", () => {
  it("bootstraps .jastr/ in cwd when no local root exists up-tree", async () => {
    const base = await makeSourceBase();
    const dest = await makeDest(); // no .jastr/ anywhere up-tree

    await executeAdd({
      source: base,
      name: "foo",
      global: false,
      cwd: dest,
      git: noCloneRunner(),
    });

    expect(await dirExists(path.join(dest, ".jastr", "foo"))).toBe(true);
  });
});

describe("executeAdd: clone path (injected GitRunner)", () => {
  it("clones a remote source and captures the commit in the lock", async () => {
    // A fake remote whose tree the clone copies into the temp clone dir.
    const remote = await makeSourceBase();
    const dest = await makeDest();
    const cloneCalls: CloneOptions[] = [];
    const git: GitRunner = {
      clone: async (opts) => {
        cloneCalls.push(opts);
        await cp(remote, opts.dir, { recursive: true });
      },
      revParseHead: async () => "abc123".padEnd(40, "0"),
      isAvailable: async () => true,
    };

    const output = await executeAdd({
      source: "owner/repo",
      name: "foo",
      ref: "main",
      global: false,
      cwd: dest,
      git,
    });

    expect(cloneCalls).toHaveLength(1);
    expect(cloneCalls[0]?.url).toBe("https://github.com/owner/repo.git");
    expect(cloneCalls[0]?.ref).toBe("main");
    expect(output).toContain("ref main");

    const lock = await readLock(dest);
    const entry = lock.templates.foo;
    expect(entry?.url).toBe("https://github.com/owner/repo.git");
    expect(entry?.source).toBe("owner/repo");
    expect(entry?.ref).toBe("main");
    expect(entry?.commit).toBe("abc123".padEnd(40, "0"));
  });
});

describe("executeAdd: conflict (create-only)", () => {
  it("routes a tracked id to `jastr update` and writes nothing", async () => {
    const base = await makeSourceBase();
    const dest = await makeDest();
    await executeAdd({
      source: base,
      name: "foo",
      global: false,
      cwd: dest,
      git: noCloneRunner(),
    });

    await expect(
      executeAdd({
        source: base,
        name: "foo",
        global: false,
        cwd: dest,
        git: noCloneRunner(),
      }),
    ).rejects.toMatchObject({
      code: "destination_exists",
      message: expect.stringContaining("jastr update foo"),
    });
  });

  it("tells an untracked id to be deleted by hand", async () => {
    const base = await makeSourceBase();
    const dest = await makeDest();
    // An author-written unit with the same id, no lock entry.
    await writeAt(
      path.join(dest, ".jastr", "foo", "TEMPLATE.md"),
      "---\n---\n# author\n",
    );

    await expect(
      executeAdd({
        source: base,
        name: "foo",
        global: false,
        cwd: dest,
        git: noCloneRunner(),
      }),
    ).rejects.toMatchObject({
      code: "destination_exists",
      message: expect.stringContaining("not jastr-installed"),
    });
    // The author file is untouched.
    expect(
      await readFile(path.join(dest, ".jastr", "foo", "TEMPLATE.md"), "utf8"),
    ).toBe("---\n---\n# author\n");
  });
});

describe("executeAdd: rejection and unchanged destination", () => {
  it("rejects a unit with a special file before any install", async () => {
    const base = await makeTemp("jastr-add-evil-");
    await writeAt(
      path.join(base, ".jastr", "evil", "TEMPLATE.md"),
      "---\n---\n# evil\n",
    );
    await symlink("/etc/hosts", path.join(base, ".jastr", "evil", "link"));
    const dest = await makeDest();

    await expect(
      executeAdd({
        source: base,
        name: "evil",
        global: false,
        cwd: dest,
        git: noCloneRunner(),
      }),
    ).rejects.toMatchObject({ code: "unsupported_source_entry" });
    expect(await dirExists(path.join(dest, ".jastr", "evil"))).toBe(false);
  });

  it("rejects a broken template with its engine code and leaves dest unchanged", async () => {
    const base = await makeTemp("jastr-add-broken-");
    await writeAt(
      path.join(base, ".jastr", "broken", "TEMPLATE.md"),
      "---\ninputs:\n  x:\n    type: string\n---\n# {{ x }}\n",
    );
    const dest = await makeDest();

    await expect(
      executeAdd({
        source: base,
        name: "broken",
        global: false,
        cwd: dest,
        git: noCloneRunner(),
      }),
    ).rejects.toMatchObject({ code: "malformed_schema" });
    // Nothing installed and no stage leftover beside .jastr/.
    expect(await dirExists(path.join(dest, ".jastr", "broken"))).toBe(false);
    const lock = await readLock(dest);
    expect(lock.templates.broken).toBeUndefined();
  });

  it("runs cleanup on a failed acquire (clone) so no temp lingers", async () => {
    const dest = await makeDest();
    const git: GitRunner = {
      clone: async () => {
        const { JastrError } = await import("@jastr/engine");
        throw new JastrError("clone_failed", "boom");
      },
      revParseHead: async () => "0".repeat(40),
      isAvailable: async () => true,
    };

    await expect(
      executeAdd({
        source: "owner/repo",
        name: "foo",
        global: false,
        cwd: dest,
        git,
      }),
    ).rejects.toMatchObject({ code: "clone_failed" });
    // No unit and no lock at the destination.
    expect(await dirExists(path.join(dest, ".jastr"))).toBe(false);
  });
});

describe("executeAdd: config.yml untouched", () => {
  it("never reads or writes config.yml", async () => {
    const base = await makeSourceBase();
    const dest = await makeDest();
    await executeAdd({
      source: base,
      name: "foo",
      global: false,
      cwd: dest,
      git: noCloneRunner(),
    });
    expect(await pathExists(path.join(dest, ".jastr", "config.yml"))).toBe(
      false,
    );
  });
});
