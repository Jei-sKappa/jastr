import { lstat } from "node:fs/promises";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import { resolveRemoveRoot } from "../fs/project-root";
import { quote } from "../quote";
import { hashUnitDir } from "./hash";
import {
  type LockEntry,
  type LockFile,
  readLock,
  validateLockEntry,
  writeLock,
} from "./lock";
import { removeUnit } from "./unit";

export type ExecuteRemoveOptions = {
  /** The one-or-more ids to remove, processed in declaration order. */
  ids: string[];
  /** `true` for `-g/--global`: remove from the global root instead of the local one. */
  global: boolean;
  /** `true` for `--force`: delete a locally-modified unit instead of refusing. */
  force: boolean;
  /** The directory the command runs from (for local-root discovery). */
  cwd: string;
  /**
   * Sink for each successful id's outcome line, called as the mutation completes
   * (each line carries no trailing newline). Emitting per id rather than at the
   * end keeps the printed record truthful under the first-failure-throws model:
   * ids already removed before a failure have their lines on stdout. Defaults to
   * a no-op so callers that only assert the throw need not provide one.
   */
  emit?: (line: string) => void;
};

/**
 * Remove one or more tracked installs from one root. Each id is classified by
 * flavor (clean / locally-modified / drift / untracked / unknown) and acted on
 * accordingly. A group removes as a whole (its directory plus its lock entry).
 *
 * ids are processed IN ORDER with NO pre-validation pass: the first per-id
 * failure throws (surfacing the uniform `Error:` and exit 1), and any ids already
 * removed before it stay removed (partial completion is accepted). Before acting
 * on a selected lock entry, it is strictly validated (`validateLockEntry`), so a
 * tampered entry fails with `invalid_lock` before any mutation.
 *
 * Crash order (§5.1): the unit directory is deleted FIRST, then the updated lock
 * is written atomically — so an interrupted remove leaves a stale lock entry that
 * self-heals as drift on the next command, never a tracked entry pointing at a
 * deleted directory. Non-interactive: no prompt.
 *
 * Each successful id's outcome line is emitted as it completes (via `emit`), so a
 * partial run's already-removed ids are reported even though a later id throws.
 */
export async function executeRemove(opts: ExecuteRemoveOptions): Promise<void> {
  const emit = opts.emit ?? (() => {});
  const scope: "local" | "global" = opts.global ? "global" : "local";
  const root = await resolveRemoveRoot(opts.cwd, scope);
  const otherScope: "local" | "global" = scope === "local" ? "global" : "local";
  const otherRoot = await resolveRemoveRoot(opts.cwd, otherScope);

  for (const id of opts.ids) {
    // Re-read the lock per id so each mutation acts on the prior id's result;
    // there is deliberately no pre-validation pass over the whole id list.
    const lock = await readLock(root);
    const line = await removeOne({
      id,
      root,
      scope,
      lock,
      force: opts.force,
      otherRoot,
    });
    emit(line);
  }
}

/**
 * Classify and act on a single id. The first failure throws — the caller does not
 * catch it, so already-removed ids stay removed.
 */
async function removeOne(args: {
  id: string;
  root: string;
  scope: "local" | "global";
  lock: LockFile;
  force: boolean;
  otherRoot: string | undefined;
}): Promise<string> {
  const { id, root, scope, lock, force, otherRoot } = args;
  const destDir = path.join(root, ".jastr", id);
  const dirPresent = await pathExists(destDir);
  const entry = lock.templates[id];

  if (entry === undefined) {
    if (dirPresent) {
      // Untracked: present on disk, no lock entry → author-written. Never delete.
      throw new JastrError(
        "not_jastr_installed",
        `${quote(displayDestDir(id))} exists but was not jastr-installed; remove it by hand if you meant to delete author work.`,
        { name: id },
      );
    }
    // Neither a dir nor an entry: nothing to remove. Hint the other root if it is
    // tracked there.
    throw await notInstalledError({ id, scope, otherRoot });
  }

  // A selected entry is strictly validated before any mutation it drives.
  validateLockEntry(id, entry);

  if (!dirPresent) {
    // Drift: tracked, but the unit directory is already gone. Drop the stale
    // entry (no unit to delete).
    await dropEntry(root, lock, id);
    return `Cleaned stale entry ${quote(id)} [${quote(scope)}].`;
  }

  if (!force) {
    // Clean-vs-modified: hash the on-disk unit and compare to the recorded hash.
    const diskHash = await hashUnitDir(destDir);
    if (diskHash !== entry.hash) {
      throw new JastrError(
        "local_modifications",
        `${quote(id)} has local modifications at ${quote(displayDestDir(id))}; re-run with --force to remove it anyway.`,
        { name: id },
      );
    }
  }

  // Clean (or --force): delete the unit FIRST, then drop the entry and write the
  // lock atomically (crash order, §5.1).
  await removeUnit(destDir);
  await dropEntry(root, lock, id);
  return `Removed ${quote(id)} (was ${quote(sourceRef(entry))}) [${quote(scope)}].`;
}

/**
 * Build the `not_installed` error for an id that has neither a unit directory nor
 * a lock entry in the target root, hinting at the other root when the id is
 * tracked there (read-only peek of the other root's lock).
 */
async function notInstalledError(args: {
  id: string;
  scope: "local" | "global";
  otherRoot: string | undefined;
}): Promise<JastrError> {
  const { id, scope, otherRoot } = args;
  const trackedElsewhere =
    otherRoot !== undefined && (await isTrackedIn(otherRoot, id));
  if (trackedElsewhere) {
    const otherScope = scope === "local" ? "global" : "local";
    const hint =
      otherScope === "global"
        ? `it is installed in the global root — re-run with -g to remove it.`
        : `it is installed in the local root — re-run without -g to remove it.`;
    return new JastrError(
      "not_installed",
      `${quote(id)} is not installed in the ${quote(scope)} root; ${hint}`,
      { name: id },
    );
  }
  return new JastrError(
    "not_installed",
    `${quote(id)} is not installed in the ${quote(scope)} root.`,
    { name: id },
  );
}

/**
 * Peek the other root's lock (read-only) to decide whether to hint the user. A
 * present-but-invalid other-root lock is treated as "not tracked there" rather
 * than failing the remove — the other root is not the target of this mutation.
 */
async function isTrackedIn(root: string, id: string): Promise<boolean> {
  try {
    const lock = await readLock(root);
    return lock.templates[id] !== undefined;
  } catch {
    return false;
  }
}

/**
 * Drop an id from the lock and write the updated lock atomically. Called after
 * the unit directory has already been removed (or was already gone).
 */
async function dropEntry(
  root: string,
  lock: LockFile,
  id: string,
): Promise<void> {
  const templates = { ...lock.templates };
  delete templates[id];
  const next: LockFile = { version: lock.version, templates };
  await writeLock(root, next);
}

/** The recorded provenance as `source@ref`, or just `source` when no `ref`. */
function sourceRef(entry: LockEntry): string {
  return entry.ref !== undefined
    ? `${entry.source}@${entry.ref}`
    : entry.source;
}

/** The destination directory rendered for messages: `.jastr/<id>` always. */
function displayDestDir(id: string): string {
  return path.posix.join(".jastr", id);
}

/** `true` when `target` exists (any type), via `lstat` (never follows). */
async function pathExists(target: string): Promise<boolean> {
  try {
    await lstat(target);
    return true;
  } catch {
    return false;
  }
}
