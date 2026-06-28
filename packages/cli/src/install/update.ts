import { lstat } from "node:fs/promises";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import { formatCliError } from "../errors";
import { resolveRemoveRoot } from "../fs/project-root";
import { quote } from "../quote";
import type { GitRunner } from "./git";
import { hashUnitDir } from "./hash";
import {
  type LockEntry,
  type LockFile,
  readLock,
  validateLockEntry,
  writeLock,
} from "./lock";
import { acquireSource } from "./source";
import {
  assertRegularUnit,
  commitUnit,
  removeUnit,
  resolveNamedUnit,
  stageUnit,
} from "./unit";
import { validateStagedUnitForInstall } from "./validate-unit";

export type ExecuteUpdateOptions = {
  /**
   * The ids to update. Empty ⇒ bare `update`: every tracked id in the root.
   * Otherwise just the named id(s); an explicit id with no entry → `not_installed`.
   */
  ids: string[];
  /** `true` for `-g/--global`: update in the global root instead of the local one. */
  global: boolean;
  /** `true` for `--force`: overwrite a locally-modified unit instead of refusing. */
  force: boolean;
  /** `true` for `--check`: report status, change nothing, exit 0 only if all up to date. */
  check: boolean;
  /** The directory the command runs from (for local-root discovery). */
  cwd: string;
  /** Injectable git seam; defaults to the real runner inside `acquireSource`. */
  git?: GitRunner;
  /**
   * Sink for a per-id success/up-to-date/nothing-to-update line (no trailing
   * newline). Defaults to a no-op so callers that only assert the result need not
   * provide one.
   */
  emitOut?: (line: string) => void;
  /**
   * Sink for a per-id failure/skip line, already rendered as a uniform `Error:`
   * line (no trailing newline). Defaults to a no-op.
   */
  emitErr?: (line: string) => void;
};

/** Whether the overall run is clean (exit 0) or not (exit 1). */
export type ExecuteUpdateResult = { ok: boolean };

/**
 * Refresh one or more tracked installs in one root, lock-driven and best-effort.
 *
 * Bare `update` targets every tracked id; with ids, just those (an explicit id
 * with no entry is reported `not_installed`). A bare `update` in a root with no
 * tracked installs is a no-op success (exit 0) with an explicit nothing-to-update
 * line.
 *
 * Per id, three content hashes are compared (P16):
 *   - `stored`   — the recorded lock `hash`;
 *   - `disk`     — the current on-disk unit's hash;
 *   - `upstream` — the freshly re-fetched unit's hash (same acquire path as
 *                  `add`, re-resolving the recorded `name` under the recorded
 *                  `path` from the recorded `url`/`ref`; the current tip of the
 *                  ref, or a local-path re-read from the recorded realpath).
 *
 * Decision matrix (§5.5):
 *   - `upstream == stored` → up to date, no change;
 *   - `upstream != stored`, `disk == stored` (clean) → validate upstream, then
 *     stage-then-swap the unit and bump the lock `hash`/`commit`;
 *   - `upstream != stored`, `disk != stored`, `disk == upstream` (interrupted
 *     prior update) → reconcile the lock to the new `hash`/`commit`, no refusal;
 *   - `upstream != stored`, `disk != stored`, `disk != upstream` (locally
 *     modified) → refuse + skip with `local_modifications`, unless `--force`,
 *     which validates + overwrites + re-records.
 *
 * `update` is best-effort across ids: it reports each outcome, continues past
 * per-id failures/skips, and the result is `ok: false` (exit 1) if anything
 * errored, was skipped-dirty, or (under `--check`) is stale. This intentionally
 * differs from `remove`'s first-failure-throw.
 *
 * `--check` reports per-id status, changes nothing, and yields `ok: true` only
 * when every target is up to date; any available/dirty-blocked/errored target
 * yields `ok: false` (CI drift detection, mirroring `generate --check`). The
 * `--check`+`--force` combination is rejected at the argv stage.
 *
 * Crash order (§5.1): a replace deletes the old unit then commits the staged new
 * one (both atomic intra-filesystem renames), then writes the lock atomically —
 * unit first, then lock. An interrupted prior update self-heals via the reconcile
 * branch. Non-interactive: no prompt. A missing unit directory (drift) is
 * reported non-destructively and never re-installed.
 */
export async function executeUpdate(
  opts: ExecuteUpdateOptions,
): Promise<ExecuteUpdateResult> {
  const emitOut = opts.emitOut ?? (() => {});
  const emitErr = opts.emitErr ?? (() => {});
  const scope: "local" | "global" = opts.global ? "global" : "local";
  const root = await resolveRemoveRoot(opts.cwd, scope);

  const lock = await readLock(root);
  const trackedIds = Object.keys(lock.templates).sort();

  // Bare update with nothing tracked: explicit nothing-to-update success.
  if (opts.ids.length === 0 && trackedIds.length === 0) {
    emitOut(`Nothing to update in the ${quote(scope)} root.`);
    return { ok: true };
  }

  const targets = opts.ids.length === 0 ? trackedIds : opts.ids;

  let ok = true;
  for (const id of targets) {
    try {
      const outcome = await updateOne({
        id,
        root,
        scope,
        check: opts.check,
        force: opts.force,
        ...(opts.git !== undefined ? { git: opts.git } : {}),
      });
      emitOut(outcome.line);
      if (!outcome.clean) {
        ok = false;
      }
    } catch (error) {
      // A per-id failure (clone_failed, invalid_lock, a broken upstream's engine
      // code, …) is reported and counted; the run continues to the next id.
      emitErr(formatCliError(error));
      ok = false;
    }
  }

  return { ok };
}

/** A non-throwing per-id outcome: a stdout line plus whether it was "clean"
 * (counts toward exit 0). A thrown JastrError is the errored path. */
type UpdateOutcome = { line: string; clean: boolean };

/**
 * Classify and act on a single id. A recoverable condition that should not abort
 * the run but must still report on stderr and force exit 1 (a dirty skip, a
 * missing-dir drift, or any `--check` non-up-to-date status) is raised as a
 * `JastrError` so the caller renders it uniformly; an up-to-date, updated, or
 * reconciled id returns a `clean` (or status) line.
 */
async function updateOne(args: {
  id: string;
  root: string;
  scope: "local" | "global";
  check: boolean;
  force: boolean;
  git?: GitRunner;
}): Promise<UpdateOutcome> {
  const { id, root, scope, check, force, git } = args;

  // Re-read the lock per id so each acts on the prior id's result (a replace may
  // have rewritten it). There is no whole-list pre-validation pass.
  const lock = await readLock(root);
  const entry = lock.templates[id];

  if (entry === undefined) {
    throw new JastrError(
      "not_installed",
      `${quote(id)} is not installed in the ${quote(scope)} root.`,
      { name: id },
    );
  }

  // A selected entry is strictly validated before it drives any acquire or
  // mutation (P28, AC-LOCK.8).
  validateLockEntry(id, entry);

  const destDir = path.join(root, ".jastr", id);

  // Missing-dir drift (pinned DoF): the tracked unit directory is gone. Report
  // it non-destructively (consistent with `list`'s `missing`) — never re-install
  // — and treat it as a not-up-to-date outcome (exit 1 under bare/--check).
  if (!(await pathExists(destDir))) {
    throw new JastrError(
      "update_available",
      `${quote(id)} is tracked but its unit directory is missing at ${quote(displayDestDir(id))}; re-add it with ${quote("jastr add")}.`,
      { name: id },
    );
  }

  const storedHash = entry.hash;
  const diskHash = await hashUnitDir(destDir);

  // Re-fetch the upstream unit via the same acquire path as `add`, re-resolving
  // the recorded name under the recorded path from the recorded url/ref. A
  // local-path entry's `url` is an absolute realpath, so this re-reads the same
  // directory regardless of cwd (AC-UPDATE.5/.12).
  const acquired = await acquireSource({
    source: entry.url,
    ...(entry.ref !== undefined ? { ref: entry.ref } : {}),
    ...(entry.path !== undefined ? { path: entry.path } : {}),
    ...(git !== undefined ? { git } : {}),
  });

  try {
    const upstreamUnit = await resolveNamedUnit({
      base: acquired.baseDir,
      name: entry.name,
      source: entry.source,
    });
    // Reject a hostile upstream (symlink/special file) before hashing or copying.
    await assertRegularUnit(upstreamUnit.dir);
    const upstreamHash = await hashUnitDir(upstreamUnit.dir);

    // upstream == stored → up to date, no change.
    if (upstreamHash === storedHash) {
      return {
        line: `${quote(id)} is up to date [${quote(scope)}].`,
        clean: true,
      };
    }

    // upstream != stored, disk != stored, disk == upstream → interrupted prior
    // update (the unit was already swapped before the lock was written). Not a
    // local edit: reconcile the lock to the new hash/commit, no refusal.
    if (diskHash !== storedHash && diskHash === upstreamHash) {
      if (check) {
        throw stale(id, scope);
      }
      await writeReconciledLock({
        root,
        lock,
        id,
        entry,
        hash: upstreamHash,
        commit: acquired.provenance.commit,
      });
      return {
        line: `${quote(id)} reconciled to ${commitTransition(entry.commit, acquired.provenance.commit)} [${quote(scope)}].`,
        clean: true,
      };
    }

    // upstream != stored, disk != stored, disk != upstream → locally modified.
    const locallyModified = diskHash !== storedHash;
    if (locallyModified && !force) {
      throw new JastrError(
        "local_modifications",
        `${quote(id)} has local modifications at ${quote(displayDestDir(id))}; re-run with --force to overwrite it.`,
        { name: id },
      );
    }

    // A replace is available (clean, or --force over a local modification).
    if (check) {
      throw stale(id, scope);
    }

    // Validate the fetched upstream BEFORE replacing the installed unit; a broken
    // upstream fails this id and leaves the existing install untouched.
    const stageDir = await stageUnit({
      unitDir: upstreamUnit.dir,
      destRoot: root,
    });
    try {
      await validateStagedUnitForInstall({
        stageDir,
        kind: upstreamUnit.kind,
        operation: "update",
        id,
      });
      // Swap on the destination filesystem: remove the old unit, then commit the
      // staged new one by atomic rename. Then re-hash the committed unit and bump
      // the lock — unit first, then lock (§5.1 crash order).
      await removeUnit(destDir);
      await commitUnit({ stageDir, destDir });
    } catch (error) {
      // A defect (validation or a failed commit) leaves the prior unit intact:
      // drop the stage dir so no partial lingers beside `.jastr/`.
      await removeUnit(stageDir);
      throw error;
    }

    const newHash = await hashUnitDir(destDir);
    await writeReconciledLock({
      root,
      lock,
      id,
      entry,
      hash: newHash,
      commit: acquired.provenance.commit,
    });
    return {
      line: `Updated ${quote(id)} ${commitTransition(entry.commit, acquired.provenance.commit)} [${quote(scope)}].`,
      clean: true,
    };
  } finally {
    // Always clean the clone temp (a no-op for a local-path source).
    await acquired.cleanup();
  }
}

/** The `update_available` error for a `--check` target that is not up to date. */
function stale(id: string, scope: "local" | "global"): JastrError {
  return new JastrError(
    "update_available",
    `${quote(id)} is not up to date in the ${quote(scope)} root.`,
    { name: id },
  );
}

/**
 * Write the lock with `id`'s entry's `hash` (and `commit`) bumped to the freshly
 * fetched values, preserving every other field. A re-record (the `--force` and
 * reconcile paths both route here) re-validates the entry before writing.
 */
function writeReconciledLock(args: {
  root: string;
  lock: LockFile;
  id: string;
  entry: LockEntry;
  hash: string;
  commit: string | undefined;
}): Promise<void> {
  const { root, lock, id, entry, hash, commit } = args;
  const next: LockEntry = {
    source: entry.source,
    url: entry.url,
    ...(entry.ref !== undefined ? { ref: entry.ref } : {}),
    name: entry.name,
    ...(entry.path !== undefined ? { path: entry.path } : {}),
    kind: entry.kind,
    ...(commit !== undefined ? { commit } : {}),
    hash,
  };
  validateLockEntry(id, next);
  const nextLock: LockFile = {
    version: lock.version,
    templates: { ...lock.templates, [id]: next },
  };
  return writeLock(root, nextLock);
}

/** Token shown for a version with no recorded commit — a non-git or dirty local
 * source records none (decisions P18/P23). */
const UNVERSIONED = "unversioned";

/**
 * A `from → to` short-commit transition for the outcome line. A side with no
 * recorded commit renders `unversioned` instead of a SHA, so a clean→dirty (or
 * dirty→clean) local source still reads meaningfully, e.g.
 * `(a1b2c3d4e5f6 -> unversioned)`. When neither side records a commit (the
 * common non-git local-source case) it collapses to a single `(unversioned)`
 * rather than the noise of `(? -> ?)`.
 */
export function commitTransition(
  from: string | undefined,
  to: string | undefined,
): string {
  const before = shortCommit(from);
  const after = shortCommit(to);
  if (before === undefined && after === undefined) {
    return `(${UNVERSIONED})`;
  }
  const beforeDisplay = before !== undefined ? quote(before) : UNVERSIONED;
  const afterDisplay = after !== undefined ? quote(after) : UNVERSIONED;
  return `(${beforeDisplay} -> ${afterDisplay})`;
}

/** Length of the short commit rendered in an outcome line (full SHAs are 40). */
const SHORT_COMMIT_LENGTH = 12;

function shortCommit(commit: string | undefined): string | undefined {
  if (commit === undefined) return undefined;
  return commit.slice(0, SHORT_COMMIT_LENGTH);
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
