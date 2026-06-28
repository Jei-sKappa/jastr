import { randomBytes } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import { quote } from "../quote";

/**
 * One tracked install's provenance. `source` is the as-typed source string
 * (display); `url` is the clone URL, or a local source's absolute realpath.
 * `ref`/`path`/`commit` are omitted when not applicable (see field comments).
 * `hash` is the canonical sha256 hex over the installed unit's files.
 */
export type LockEntry = {
  source: string;
  url: string;
  ref?: string;
  name: string;
  path?: string;
  kind: "standalone" | "group";
  commit?: string;
  hash: string;
};

/** The per-root provenance lock: a `version` plus a map keyed by installed id. */
export type LockFile = {
  version: 1;
  templates: Record<string, LockEntry>;
};

/** The one supported lock format version. */
const LOCK_VERSION = 1 as const;

/** Path to a root's lock file: `<projectRoot>/.jastr/lock.json`. */
export function lockPath(projectRoot: string): string {
  return path.join(projectRoot, ".jastr", "lock.json");
}

/** An empty lock (no tracked installs). */
function emptyLock(): LockFile {
  return { version: LOCK_VERSION, templates: {} };
}

/**
 * Read a root's lock leniently. A missing or empty file is treated as no tracked
 * installs (an empty lock). A present file that is unparseable (including
 * unresolved git conflict markers) or carries an unknown `version` fails with
 * `invalid_lock` and mutates nothing — provenance is never silently discarded.
 *
 * Per-entry contents are NOT validated here; commands call `validateLockEntry`
 * before acting on a specific entry (strict, fail-closed).
 */
export async function readLock(projectRoot: string): Promise<LockFile> {
  const file = lockPath(projectRoot);

  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if (isFileNotFound(error)) {
      return emptyLock();
    }
    throw error;
  }

  if (raw.trim().length === 0) {
    return emptyLock();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new JastrError(
      "invalid_lock",
      `${quote(file)} is not valid JSON (it may contain unresolved merge conflict markers); resolve it by hand.`,
    );
  }

  if (!isPlainObject(parsed)) {
    throw new JastrError(
      "invalid_lock",
      `${quote(file)} must be a JSON object.`,
    );
  }

  if (parsed.version !== LOCK_VERSION) {
    throw new JastrError(
      "invalid_lock",
      `${quote(file)} has an unsupported version (expected ${LOCK_VERSION}).`,
    );
  }

  const templates = parsed.templates;
  if (templates !== undefined && !isPlainObject(templates)) {
    throw new JastrError(
      "invalid_lock",
      `${quote(file)} ${quote("templates")} must be an object keyed by installed id.`,
    );
  }

  return {
    version: LOCK_VERSION,
    templates: (templates as Record<string, LockEntry>) ?? {},
  };
}

/** The complete, exact set of keys a valid lock entry may carry. */
const ENTRY_KEYS = new Set<string>([
  "source",
  "url",
  "ref",
  "name",
  "path",
  "kind",
  "commit",
  "hash",
]);

/**
 * Strictly validate a single lock entry before any command acts on it. A
 * committed lock is a collaborative, partly-trusted input, so a tampered but
 * parseable entry must not silently drive a clone or source resolution. Any
 * violation throws `invalid_lock`.
 *
 * Checks: it is an object; required string fields (`source`, `url`, `name`,
 * `hash`) are present and non-empty (`url` explicitly non-empty); optional
 * string fields (`ref`, `path`, `commit`) are strings when present; `kind` is
 * `standalone` or `group`; `path` (if present) is a safe relative subpath (not
 * absolute, no `..`-escape); and there are no unknown extra fields.
 */
export function validateLockEntry(
  id: string,
  entry: unknown,
): asserts entry is LockEntry {
  if (!isPlainObject(entry)) {
    throw invalidEntry(id, "must be an object");
  }

  for (const key of Object.keys(entry)) {
    if (!ENTRY_KEYS.has(key)) {
      throw invalidEntry(id, `has an unknown field ${quote(key)}`);
    }
  }

  assertNonEmptyString(id, entry, "source");
  assertNonEmptyString(id, entry, "url");
  assertNonEmptyString(id, entry, "name");
  assertNonEmptyString(id, entry, "hash");

  assertOptionalString(id, entry, "ref");
  assertOptionalString(id, entry, "path");
  assertOptionalString(id, entry, "commit");

  if (entry.kind !== "standalone" && entry.kind !== "group") {
    throw invalidEntry(
      id,
      `${quote("kind")} must be ${quote("standalone")} or ${quote("group")}`,
    );
  }

  if (typeof entry.path === "string" && !isSafeRelativeSubpath(entry.path)) {
    throw invalidEntry(
      id,
      `${quote("path")} must be a relative subpath (not absolute, no ${quote("..")})`,
    );
  }
}

/**
 * Serialize a lock deterministically: entries sorted by key, 2-space indent, and
 * a trailing newline, with no timestamps. Determinism keeps committed locks
 * diffing cleanly so git auto-merges non-overlapping keys.
 */
export function serializeLock(lock: LockFile): string {
  const sorted: Record<string, LockEntry> = {};
  for (const id of Object.keys(lock.templates).sort()) {
    const entry = lock.templates[id];
    if (entry !== undefined) {
      sorted[id] = entry;
    }
  }
  const ordered: LockFile = { version: lock.version, templates: sorted };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

/**
 * Write a root's lock atomically. The serialized bytes go to a same-filesystem
 * temp file under `<root>/.jastr/`, then a `rename` swaps it into place, so a
 * crash or disk-full never leaves a truncated lock.
 */
export async function writeLock(
  projectRoot: string,
  lock: LockFile,
): Promise<void> {
  const file = lockPath(projectRoot);
  const dir = path.dirname(file);
  const contents = serializeLock(lock);

  // TODO: locking against concurrent `jastr add`/`remove`/`update` invocations
  // is a deliberately deferred future consideration. The atomic temp+rename
  // below makes a single writer crash-safe (no torn lock), but two concurrent
  // writers can still lost-update each other's entries; an advisory file lock is
  // out of scope here.
  //
  // The temp file lives beside the target (same filesystem) so the swap is an
  // atomic intra-filesystem `rename`; on any failure the temp file is removed so
  // a crash mid-write never leaves a stray partial.
  const tempFile = path.join(
    dir,
    `.lock.json.${randomBytes(6).toString("hex")}.tmp`,
  );
  try {
    await writeFile(tempFile, contents, "utf8");
    await rename(tempFile, file);
  } catch (error) {
    await rm(tempFile, { force: true });
    throw error;
  }
}

/** A `JastrError("invalid_lock", …)` naming the offending entry id. */
function invalidEntry(id: string, reason: string): JastrError {
  return new JastrError(
    "invalid_lock",
    `lock entry ${quote(id)} is invalid: it ${reason}.`,
  );
}

/** Require a present, non-empty string field. */
function assertNonEmptyString(
  id: string,
  entry: Record<string, unknown>,
  key: string,
): void {
  const value = entry[key];
  if (typeof value !== "string" || value.length === 0) {
    throw invalidEntry(id, `is missing a non-empty ${quote(key)} string`);
  }
}

/** Require an absent field, or a string when present. */
function assertOptionalString(
  id: string,
  entry: Record<string, unknown>,
  key: string,
): void {
  const value = entry[key];
  if (value !== undefined && typeof value !== "string") {
    throw invalidEntry(id, `has a non-string ${quote(key)}`);
  }
}

/**
 * Lexical safe-relative-subpath check for a stored `path` value: not absolute and
 * not a `..`-escape. This validates already-recorded provenance data (there is no
 * live source root at lock-read time), so it is a lexical check only — it does
 * not realpath against a filesystem. Mirrors `source.ts`'s lexical rejection.
 */
function isSafeRelativeSubpath(candidate: string): boolean {
  if (candidate.length === 0) return false;
  if (path.isAbsolute(candidate)) return false;
  const normalized = path.normalize(candidate);
  return (
    normalized !== ".." &&
    !normalized.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(normalized)
  );
}

/** `true` for a non-null, non-array object. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `true` when an fs error is a "file not found" (`ENOENT`). */
function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}
