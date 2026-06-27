import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import { afterEach, describe, expect, it } from "vitest";
import {
  type LockEntry,
  type LockFile,
  lockPath,
  readLock,
  serializeLock,
  validateLockEntry,
  writeLock,
} from "../../src/install/lock";

const temps: string[] = [];

async function makeProjectRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "jastr-lock-"));
  temps.push(root);
  await mkdir(path.join(root, ".jastr"), { recursive: true });
  return root;
}

async function writeLockFile(root: string, raw: string): Promise<void> {
  await writeFile(lockPath(root), raw, "utf8");
}

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

function entry(overrides: Partial<LockEntry> = {}): LockEntry {
  return {
    source: "owner/repo",
    url: "https://github.com/owner/repo.git",
    ref: "main",
    name: "foo",
    path: "packages/x",
    kind: "standalone",
    commit: "0".repeat(40),
    hash: "a".repeat(64),
    ...overrides,
  };
}

async function expectInvalidLock(fn: () => Promise<unknown>): Promise<void> {
  await expect(fn()).rejects.toMatchObject({
    code: "invalid_lock",
  } satisfies Partial<JastrError>);
}

describe("lockPath", () => {
  it("points at <root>/.jastr/lock.json", () => {
    expect(lockPath("/proj")).toBe(path.join("/proj", ".jastr", "lock.json"));
  });
});

describe("serializeLock", () => {
  it("sorts entries by key", () => {
    const lock: LockFile = {
      version: 1,
      templates: {
        zed: entry({ name: "zed" }),
        alpha: entry({ name: "alpha" }),
        mid: entry({ name: "mid" }),
      },
    };
    const text = serializeLock(lock);
    const parsed = JSON.parse(text) as LockFile;
    expect(Object.keys(parsed.templates)).toEqual(["alpha", "mid", "zed"]);
  });

  it("uses 2-space indent and a trailing newline", () => {
    const text = serializeLock({ version: 1, templates: { foo: entry() } });
    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('\n  "version": 1'); // 2-space indent at root
    expect(text).toContain('\n    "foo":'); // entry id nested under templates
    expect(text).toContain('\n      "source":'); // entry field, 2-space deeper
  });

  it("emits no timestamps", () => {
    const text = serializeLock({ version: 1, templates: { foo: entry() } });
    expect(text).not.toMatch(/timestamp|installedAt|updatedAt|"date"/i);
  });

  it("is deterministic regardless of insertion order", () => {
    const a: LockFile = {
      version: 1,
      templates: { b: entry({ name: "b" }), a: entry({ name: "a" }) },
    };
    const b: LockFile = {
      version: 1,
      templates: { a: entry({ name: "a" }), b: entry({ name: "b" }) },
    };
    expect(serializeLock(a)).toBe(serializeLock(b));
  });

  it("round-trips serialize -> parse", () => {
    const lock: LockFile = { version: 1, templates: { foo: entry() } };
    const parsed = JSON.parse(serializeLock(lock)) as LockFile;
    expect(parsed).toEqual(lock);
  });
});

describe("readLock", () => {
  it("treats a missing file as an empty lock", async () => {
    const root = await makeProjectRoot();
    expect(await readLock(root)).toEqual({ version: 1, templates: {} });
  });

  it("treats an empty (whitespace-only) file as an empty lock", async () => {
    const root = await makeProjectRoot();
    await writeLockFile(root, "  \n  ");
    expect(await readLock(root)).toEqual({ version: 1, templates: {} });
  });

  it("reads a present lock back as its entries", async () => {
    const root = await makeProjectRoot();
    const lock: LockFile = { version: 1, templates: { foo: entry() } };
    await writeLockFile(root, serializeLock(lock));
    expect(await readLock(root)).toEqual(lock);
  });

  it("fails with invalid_lock on unparseable JSON", async () => {
    const root = await makeProjectRoot();
    await writeLockFile(root, "{ not json");
    await expectInvalidLock(() => readLock(root));
  });

  it("fails with invalid_lock on unresolved git conflict markers", async () => {
    const root = await makeProjectRoot();
    await writeLockFile(
      root,
      [
        "{",
        "<<<<<<< HEAD",
        '  "version": 1,',
        "=======",
        '  "version": 1,',
        ">>>>>>> branch",
        "}",
      ].join("\n"),
    );
    await expectInvalidLock(() => readLock(root));
  });

  it("fails with invalid_lock on an unknown version", async () => {
    const root = await makeProjectRoot();
    await writeLockFile(root, JSON.stringify({ version: 2, templates: {} }));
    await expectInvalidLock(() => readLock(root));
  });

  it("fails with invalid_lock when the top-level value is not an object", async () => {
    const root = await makeProjectRoot();
    await writeLockFile(root, JSON.stringify([1, 2, 3]));
    await expectInvalidLock(() => readLock(root));
  });
});

describe("validateLockEntry", () => {
  it("accepts a well-formed entry", () => {
    expect(() => validateLockEntry("foo", entry())).not.toThrow();
  });

  it("accepts an entry with all optional fields omitted", () => {
    const minimal: LockEntry = {
      source: "../local",
      url: "/abs/realpath",
      name: "foo",
      kind: "group",
      hash: "b".repeat(64),
    };
    expect(() => validateLockEntry("foo", minimal)).not.toThrow();
  });

  it("rejects a non-object entry", () => {
    expect(() => validateLockEntry("foo", "nope")).toThrowError(JastrError);
    expect(() => validateLockEntry("foo", "nope")).toThrowError(/invalid/i);
  });

  it.each([
    "source",
    "url",
    "name",
    "hash",
  ])("rejects a missing required field: %s", (field) => {
    const e = entry() as Record<string, unknown>;
    delete e[field];
    expect(() => validateLockEntry("foo", e)).toThrowError(JastrError);
  });

  it("rejects an empty url", () => {
    expect(() => validateLockEntry("foo", entry({ url: "" }))).toThrowError(
      JastrError,
    );
  });

  it("rejects a wrong-typed required field", () => {
    const e = { ...entry(), hash: 123 } as unknown;
    expect(() => validateLockEntry("foo", e)).toThrowError(JastrError);
  });

  it("rejects a wrong-typed optional field", () => {
    const e = { ...entry(), ref: 7 } as unknown;
    expect(() => validateLockEntry("foo", e)).toThrowError(JastrError);
  });

  it("rejects a bad kind", () => {
    const e = { ...entry(), kind: "bundle" } as unknown;
    expect(() => validateLockEntry("foo", e)).toThrowError(JastrError);
  });

  it("rejects an absolute path", () => {
    expect(() =>
      validateLockEntry("foo", entry({ path: "/etc/passwd" })),
    ).toThrowError(JastrError);
  });

  it("rejects a `..`-escaping path", () => {
    expect(() =>
      validateLockEntry("foo", entry({ path: "../outside" })),
    ).toThrowError(JastrError);
  });

  it("rejects a path that is exactly `..`", () => {
    expect(() => validateLockEntry("foo", entry({ path: ".." }))).toThrowError(
      JastrError,
    );
  });

  it("rejects an unknown extra field", () => {
    const e = { ...entry(), evil: "x" } as unknown;
    expect(() => validateLockEntry("foo", e)).toThrowError(JastrError);
  });

  it("surfaces invalid_lock as the error code", () => {
    try {
      validateLockEntry("foo", entry({ url: "" }));
      throw new Error("expected validateLockEntry to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(JastrError);
      expect((error as JastrError).code).toBe("invalid_lock");
    }
  });
});

describe("writeLock", () => {
  it("writes a deterministic, valid lock and leaves no temp behind", async () => {
    const root = await makeProjectRoot();
    const lock: LockFile = {
      version: 1,
      templates: { b: entry({ name: "b" }), a: entry({ name: "a" }) },
    };

    await writeLock(root, lock);

    const written = await readFile(lockPath(root), "utf8");
    expect(written).toBe(serializeLock(lock));

    // Round-trips through readLock back to the original.
    expect(await readLock(root)).toEqual({
      version: 1,
      templates: { a: entry({ name: "a" }), b: entry({ name: "b" }) },
    });

    // No leftover temp staging dir/file under .jastr/.
    const remaining = await readdir(path.join(root, ".jastr"));
    expect(remaining).toEqual(["lock.json"]);
  });

  it("overwrites an existing lock atomically", async () => {
    const root = await makeProjectRoot();
    await writeLock(root, { version: 1, templates: { foo: entry() } });
    await writeLock(root, {
      version: 1,
      templates: { bar: entry({ name: "bar" }) },
    });

    const after = await readLock(root);
    expect(Object.keys(after.templates)).toEqual(["bar"]);

    const remaining = await readdir(path.join(root, ".jastr"));
    expect(remaining).toEqual(["lock.json"]);
  });
});
