import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { executeAdd } from "../../src/install/add";
import type { GitRunner } from "../../src/install/git";
import { readLock } from "../../src/install/lock";
import { executeUpdate } from "../../src/install/update";

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

async function dirExists(target: string): Promise<boolean> {
  try {
    const { stat } = await import("node:fs/promises");
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/** A `GitRunner` whose `clone` throws if called — asserts the local-path path. */
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

/** A source base whose `.jastr/` holds a standalone `foo`. Returns the base. */
async function makeStandaloneSource(body = "# foo\n"): Promise<string> {
  const base = await makeTemp("jastr-update-src-");
  await writeAt(
    path.join(base, ".jastr", "foo", "TEMPLATE.md"),
    `---\n---\n${body}`,
  );
  return base;
}

/** Collect emitted out/err lines from an `executeUpdate` run. */
function makeSink(): {
  out: string[];
  err: string[];
  emitOut: (line: string) => void;
  emitErr: (line: string) => void;
} {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    emitOut: (line) => out.push(line),
    emitErr: (line) => err.push(line),
  };
}

/** Install `foo` from `src` into `dest` (local), returning nothing. */
async function addFoo(src: string, dest: string): Promise<void> {
  await executeAdd({
    source: src,
    name: "foo",
    global: false,
    cwd: dest,
    git: noCloneRunner(),
  });
}

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

describe("executeUpdate: up-to-date (upstream == stored)", () => {
  it("reports up to date and changes nothing", async () => {
    const src = await makeStandaloneSource();
    const dest = await makeTemp("jastr-update-dest-");
    await addFoo(src, dest);
    const before = await readLock(dest);

    const sink = makeSink();
    const result = await executeUpdate({
      ids: [],
      global: false,
      force: false,
      check: false,
      cwd: dest,
      git: noCloneRunner(),
      emitOut: sink.emitOut,
      emitErr: sink.emitErr,
    });

    expect(result.ok).toBe(true);
    expect(sink.out.join("\n")).toContain("foo is up to date");
    expect(sink.err).toHaveLength(0);
    // Lock unchanged.
    expect(await readLock(dest)).toEqual(before);
  });
});

describe("executeUpdate: replace + bump (upstream != stored, disk == stored)", () => {
  it("validates upstream, swaps the unit, and bumps the lock hash", async () => {
    const src = await makeStandaloneSource("# foo\n");
    const dest = await makeTemp("jastr-update-dest-");
    await addFoo(src, dest);
    const before = await readLock(dest);

    // Mutate the recorded source so upstream differs from stored.
    await writeAt(
      path.join(src, ".jastr", "foo", "TEMPLATE.md"),
      "---\n---\n# foo v2\n",
    );

    const sink = makeSink();
    const result = await executeUpdate({
      ids: ["foo"],
      global: false,
      force: false,
      check: false,
      cwd: dest,
      git: noCloneRunner(),
      emitOut: sink.emitOut,
      emitErr: sink.emitErr,
    });

    expect(result.ok).toBe(true);
    expect(sink.out.join("\n")).toContain("Updated foo");
    // The installed unit now carries the new body.
    expect(
      await readFile(path.join(dest, ".jastr", "foo", "TEMPLATE.md"), "utf8"),
    ).toBe("---\n---\n# foo v2\n");
    // The lock hash changed.
    const after = await readLock(dest);
    expect(after.templates.foo?.hash).not.toBe(before.templates.foo?.hash);
  });
});

describe("executeUpdate: locally modified (disk != stored, disk != upstream)", () => {
  it("refuses with local_modifications and changes nothing", async () => {
    const src = await makeStandaloneSource("# foo\n");
    const dest = await makeTemp("jastr-update-dest-");
    await addFoo(src, dest);

    // Modify the installed unit (disk != stored) and the source (upstream !=
    // stored, and != disk) so it is a genuine local edit, not an interrupt.
    await writeAt(
      path.join(dest, ".jastr", "foo", "TEMPLATE.md"),
      "---\n---\n# local edit\n",
    );
    await writeAt(
      path.join(src, ".jastr", "foo", "TEMPLATE.md"),
      "---\n---\n# foo v2\n",
    );

    const sink = makeSink();
    const result = await executeUpdate({
      ids: ["foo"],
      global: false,
      force: false,
      check: false,
      cwd: dest,
      git: noCloneRunner(),
      emitOut: sink.emitOut,
      emitErr: sink.emitErr,
    });

    expect(result.ok).toBe(false);
    expect(sink.err.join("\n")).toContain("local modifications");
    // The local edit survives.
    expect(
      await readFile(path.join(dest, ".jastr", "foo", "TEMPLATE.md"), "utf8"),
    ).toBe("---\n---\n# local edit\n");
  });

  it("overwrites and re-records with --force", async () => {
    const src = await makeStandaloneSource("# foo\n");
    const dest = await makeTemp("jastr-update-dest-");
    await addFoo(src, dest);

    await writeAt(
      path.join(dest, ".jastr", "foo", "TEMPLATE.md"),
      "---\n---\n# local edit\n",
    );
    await writeAt(
      path.join(src, ".jastr", "foo", "TEMPLATE.md"),
      "---\n---\n# foo v2\n",
    );

    const sink = makeSink();
    const result = await executeUpdate({
      ids: ["foo"],
      global: false,
      force: true,
      check: false,
      cwd: dest,
      git: noCloneRunner(),
      emitOut: sink.emitOut,
      emitErr: sink.emitErr,
    });

    expect(result.ok).toBe(true);
    expect(sink.out.join("\n")).toContain("Updated foo");
    expect(
      await readFile(path.join(dest, ".jastr", "foo", "TEMPLATE.md"), "utf8"),
    ).toBe("---\n---\n# foo v2\n");
  });
});

describe("executeUpdate: interrupted prior update (disk == upstream != stored)", () => {
  it("reconciles the lock without refusing", async () => {
    const src = await makeStandaloneSource("# foo\n");
    const dest = await makeTemp("jastr-update-dest-");
    await addFoo(src, dest);

    // Simulate an interrupted update: the disk unit AND the source both already
    // carry v2 (the unit was swapped before the lock was bumped), so disk ==
    // upstream != stored.
    await writeAt(
      path.join(dest, ".jastr", "foo", "TEMPLATE.md"),
      "---\n---\n# foo v2\n",
    );
    await writeAt(
      path.join(src, ".jastr", "foo", "TEMPLATE.md"),
      "---\n---\n# foo v2\n",
    );
    const before = await readLock(dest);

    const sink = makeSink();
    const result = await executeUpdate({
      ids: ["foo"],
      global: false,
      force: false,
      check: false,
      cwd: dest,
      git: noCloneRunner(),
      emitOut: sink.emitOut,
      emitErr: sink.emitErr,
    });

    expect(result.ok).toBe(true);
    expect(sink.out.join("\n")).toContain("reconciled");
    const after = await readLock(dest);
    // The lock hash now matches the on-disk (== upstream) content.
    expect(after.templates.foo?.hash).not.toBe(before.templates.foo?.hash);
  });
});

describe("executeUpdate: --check drift detection", () => {
  it("exits 0 when up to date and writes nothing", async () => {
    const src = await makeStandaloneSource();
    const dest = await makeTemp("jastr-update-dest-");
    await addFoo(src, dest);

    const sink = makeSink();
    const result = await executeUpdate({
      ids: [],
      global: false,
      force: false,
      check: true,
      cwd: dest,
      git: noCloneRunner(),
      emitOut: sink.emitOut,
      emitErr: sink.emitErr,
    });

    expect(result.ok).toBe(true);
    expect(sink.out.join("\n")).toContain("up to date");
  });

  it("exits 1 and changes nothing when an update is available", async () => {
    const src = await makeStandaloneSource("# foo\n");
    const dest = await makeTemp("jastr-update-dest-");
    await addFoo(src, dest);
    const before = await readLock(dest);
    await writeAt(
      path.join(src, ".jastr", "foo", "TEMPLATE.md"),
      "---\n---\n# foo v2\n",
    );

    const sink = makeSink();
    const result = await executeUpdate({
      ids: ["foo"],
      global: false,
      force: false,
      check: true,
      cwd: dest,
      git: noCloneRunner(),
      emitOut: sink.emitOut,
      emitErr: sink.emitErr,
    });

    expect(result.ok).toBe(false);
    expect(sink.err.join("\n")).toContain("not up to date");
    // No write: the installed unit and lock are unchanged.
    expect(
      await readFile(path.join(dest, ".jastr", "foo", "TEMPLATE.md"), "utf8"),
    ).toBe("---\n---\n# foo\n");
    expect(await readLock(dest)).toEqual(before);
  });
});

describe("executeUpdate: best-effort across ids", () => {
  it("continues past a failing id, reports both, and exits 1", async () => {
    const src = await makeStandaloneSource();
    const dest = await makeTemp("jastr-update-dest-");
    await addFoo(src, dest);

    const sink = makeSink();
    // `foo` is tracked and up to date; `ghost` has no entry → not_installed.
    const result = await executeUpdate({
      ids: ["foo", "ghost"],
      global: false,
      force: false,
      check: false,
      cwd: dest,
      git: noCloneRunner(),
      emitOut: sink.emitOut,
      emitErr: sink.emitErr,
    });

    expect(result.ok).toBe(false);
    expect(sink.out.join("\n")).toContain("foo is up to date");
    expect(sink.err.join("\n")).toContain("ghost is not installed");
  });
});

describe("executeUpdate: validation gate before replace", () => {
  it("a broken upstream fails the id and leaves the prior unit intact", async () => {
    const src = await makeStandaloneSource("# foo\n");
    const dest = await makeTemp("jastr-update-dest-");
    await addFoo(src, dest);

    // Mutate the source into a broken template (a required input with no value
    // sampled cleanly is fine; use a malformed schema to trip the gate).
    await writeAt(
      path.join(src, ".jastr", "foo", "TEMPLATE.md"),
      "---\ninputs:\n  x:\n    type: string\n---\n# {{ x }}\n",
    );

    const sink = makeSink();
    const result = await executeUpdate({
      ids: ["foo"],
      global: false,
      force: false,
      check: false,
      cwd: dest,
      git: noCloneRunner(),
      emitOut: sink.emitOut,
      emitErr: sink.emitErr,
    });

    expect(result.ok).toBe(false);
    // The prior (good) unit is untouched, and no stage dir lingers.
    expect(
      await readFile(path.join(dest, ".jastr", "foo", "TEMPLATE.md"), "utf8"),
    ).toBe("---\n---\n# foo\n");
    const jastrDir = path.join(dest, ".jastr");
    const { readdir } = await import("node:fs/promises");
    const leftovers = (await readdir(jastrDir)).filter((n) =>
      n.startsWith(".jastr-stage-"),
    );
    expect(leftovers).toHaveLength(0);
  });
});

describe("executeUpdate: nothing to update", () => {
  it("a bare update with no tracked installs exits 0 with a message", async () => {
    const dest = await makeTemp("jastr-update-dest-");
    await mkdir(path.join(dest, ".jastr"), { recursive: true });

    const sink = makeSink();
    const result = await executeUpdate({
      ids: [],
      global: false,
      force: false,
      check: false,
      cwd: dest,
      git: noCloneRunner(),
      emitOut: sink.emitOut,
      emitErr: sink.emitErr,
    });

    expect(result.ok).toBe(true);
    expect(sink.out.join("\n")).toContain("Nothing to update");
  });
});

describe("executeUpdate: missing-dir drift", () => {
  it("reports a tracked id whose unit dir is gone and never re-installs it", async () => {
    const src = await makeStandaloneSource();
    const dest = await makeTemp("jastr-update-dest-");
    await addFoo(src, dest);
    // Delete the installed unit directory (drift), keeping the lock entry.
    await rm(path.join(dest, ".jastr", "foo"), {
      recursive: true,
      force: true,
    });

    const sink = makeSink();
    const result = await executeUpdate({
      ids: ["foo"],
      global: false,
      force: false,
      check: false,
      cwd: dest,
      git: noCloneRunner(),
      emitOut: sink.emitOut,
      emitErr: sink.emitErr,
    });

    expect(result.ok).toBe(false);
    expect(sink.err.join("\n")).toContain("unit directory is missing");
    // Non-destructive report: the unit is NOT re-installed.
    expect(await dirExists(path.join(dest, ".jastr", "foo"))).toBe(false);
  });
});

describe("executeUpdate: clone path (injected GitRunner)", () => {
  it("re-fetches a remote source via the recorded url/ref and bumps the lock", async () => {
    const remoteV1 = await makeStandaloneSource("# foo\n");
    const dest = await makeTemp("jastr-update-dest-");

    // A clone runner whose source tree we can swap between add and update.
    let remote = remoteV1;
    const git: GitRunner = {
      clone: async (opts) => {
        await cp(remote, opts.dir, { recursive: true });
      },
      revParseHead: async () => "feedface".padEnd(40, "0"),
      isAvailable: async () => true,
    };

    await executeAdd({
      source: "owner/repo",
      name: "foo",
      ref: "main",
      global: false,
      cwd: dest,
      git,
    });
    const before = await readLock(dest);

    // The remote advances: a fresh v2 tree and a new HEAD.
    remote = await makeStandaloneSource("# foo v2\n");
    git.revParseHead = async () => "deadbeef".padEnd(40, "0");

    const sink = makeSink();
    const result = await executeUpdate({
      ids: ["foo"],
      global: false,
      force: false,
      check: false,
      cwd: dest,
      git,
      emitOut: sink.emitOut,
      emitErr: sink.emitErr,
    });

    expect(result.ok).toBe(true);
    expect(sink.out.join("\n")).toContain("Updated foo");
    const after = await readLock(dest);
    expect(after.templates.foo?.url).toBe("https://github.com/owner/repo.git");
    expect(after.templates.foo?.ref).toBe("main");
    expect(after.templates.foo?.commit).toBe("deadbeef".padEnd(40, "0"));
    expect(after.templates.foo?.hash).not.toBe(before.templates.foo?.hash);
  });
});

describe("executeUpdate: tampered lock entry", () => {
  it("fails the id with invalid_lock before any acquire or mutation", async () => {
    const src = await makeStandaloneSource();
    const dest = await makeTemp("jastr-update-dest-");
    await addFoo(src, dest);

    // Tamper the lock entry with an unknown field, parseable but invalid.
    const lockFile = path.join(dest, ".jastr", "lock.json");
    const raw = JSON.parse(await readFile(lockFile, "utf8"));
    raw.templates.foo.bogus = true;
    await writeFile(lockFile, JSON.stringify(raw, null, 2), "utf8");

    const sink = makeSink();
    const result = await executeUpdate({
      ids: ["foo"],
      global: false,
      force: false,
      check: false,
      cwd: dest,
      git: noCloneRunner(),
      emitOut: sink.emitOut,
      emitErr: sink.emitErr,
    });

    expect(result.ok).toBe(false);
    expect(sink.err.join("\n")).toContain("invalid");
  });
});
