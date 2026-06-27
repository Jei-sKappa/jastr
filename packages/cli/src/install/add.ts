import { lstat, mkdir } from "node:fs/promises";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import { resolveAddDestination } from "../fs/project-root";
import type { GitRunner } from "./git";
import { hashUnitDir } from "./hash";
import {
  type LockEntry,
  type LockFile,
  lockPath,
  readLock,
  validateLockEntry,
  writeLock,
} from "./lock";
import { acquireSource, type SourceProvenance } from "./source";
import {
  assertRegularUnit,
  commitUnit,
  type ResolvedUnit,
  removeUnit,
  resolveNamedUnit,
  stageUnit,
} from "./unit";
import { validateStagedUnitForInstall } from "./validate-unit";

export type ExecuteAddOptions = {
  /** The as-typed `<repo-source>` (a local path, `owner/repo`, or a git URL). */
  source: string;
  /** The as-typed `<name>` to resolve under the source's `<base>/.jastr/`. */
  name: string;
  /** Optional `--ref <branch|tag>` to clone (never a commit SHA). */
  ref?: string;
  /** Optional `--path <subdir>` to cd into before resolving the source's `.jastr/`. */
  path?: string;
  /** `true` for `-g/--global`: install into the global root instead of the local one. */
  global: boolean;
  /** The directory the command runs from (for local-root discovery/bootstrap). */
  cwd: string;
  /** Injectable git seam; defaults to the real runner inside `acquireSource`. */
  git?: GitRunner;
};

/**
 * Install a template (or whole group) from a remote git source or a local path
 * into the local or global `.jastr/` root: acquire, resolve `<name>`,
 * conflict-guard (create-only), reject special files, stage on the destination
 * filesystem, run the validation gate, atomically install, then record the
 * provenance lock entry atomically AFTER the unit is in place. Returns one
 * deterministic success line. The project config is never read or written —
 * provenance lives only in the lock.
 */
export async function executeAdd(opts: ExecuteAddOptions): Promise<string> {
  const scope: "local" | "global" = opts.global ? "global" : "local";
  const destRoot = await resolveAddDestination(opts.cwd, scope);

  const acquired = await acquireSource({
    source: opts.source,
    ...(opts.ref !== undefined ? { ref: opts.ref } : {}),
    ...(opts.path !== undefined ? { path: opts.path } : {}),
    ...(opts.git !== undefined ? { git: opts.git } : {}),
  });

  try {
    const unit = await resolveNamedUnit({
      base: acquired.baseDir,
      name: opts.name,
      source: opts.source,
    });

    // Create-only: a destination that already exists is never overwritten. Read
    // the dest lock to flavor the message (tracked → update; untracked → manual).
    await assertDestinationAvailable({ destRoot, id: unit.id });

    // Reject any symlink/special file BEFORE any copy, validate, or hash. The
    // rejected entry is reported relative to the as-typed source so the message
    // is deterministic and follows the project's path-display convention rather
    // than leaking the source's absolute realpath.
    await assertRegularSourceUnit({
      unitDir: unit.dir,
      sourceRoot: acquired.sourceRoot,
      source: opts.source,
    });

    // Stage on the destination filesystem so the commit is an atomic rename.
    const stageDir = await stageUnit({ unitDir: unit.dir, destRoot });
    try {
      await validateStagedUnitForInstall({
        stageDir,
        kind: unit.kind,
        operation: "add",
        id: unit.id,
      });
      const destDir = path.join(destRoot, ".jastr", unit.id);
      await commitUnit({ stageDir, destDir });

      // Unit first, then the lock (crash order, §5.1): a unit moved into place
      // before the lock is written is left as an untracked unit (recoverable),
      // never auto-adopted.
      await recordProvenance({
        destRoot,
        unit,
        sourceRoot: acquired.sourceRoot,
        baseDir: acquired.baseDir,
        provenance: acquired.provenance,
      });

      return formatInstalledLine({
        unit,
        provenance: acquired.provenance,
        scope,
      });
    } catch (error) {
      // A defect (validation or a failed commit) leaves the destination
      // unchanged: drop the stage dir so no partial lingers beside `.jastr/`.
      await removeUnit(stageDir);
      throw error;
    }
  } finally {
    // Always clean the clone temp (a no-op for a local-path source), on both
    // success and failure, so a failed acquire/install leaves nothing behind.
    await acquired.cleanup();
  }
}

/**
 * Reject a symlink or special file anywhere in the source unit (delegating the
 * actual `lstat` walk and security property to `assertRegularUnit`), but report
 * the offending entry relative to the as-typed source rather than as the source's
 * absolute realpath. This keeps the user-facing message deterministic and aligned
 * with the project's path-display convention; the underlying rejection (never
 * copying or following a special file) is unchanged.
 */
async function assertRegularSourceUnit(args: {
  unitDir: string;
  sourceRoot: string;
  source: string;
}): Promise<void> {
  try {
    await assertRegularUnit(args.unitDir);
  } catch (error) {
    if (
      error instanceof JastrError &&
      error.code === "unsupported_source_entry" &&
      typeof error.details?.path === "string"
    ) {
      const relative = path
        .relative(args.sourceRoot, error.details.path)
        .split(path.sep)
        .join("/");
      const display = path.posix.join(args.source, relative);
      throw new JastrError(
        "unsupported_source_entry",
        `${display} is not a regular file or directory (symlinks and special files are not allowed in a source unit).`,
        { path: display },
      );
    }
    throw error;
  }
}

/**
 * Guard create-only semantics: if `<destRoot>/.jastr/<id>/` already exists, write
 * nothing and raise `destination_exists`. The message differs by flavor — a
 * tracked id (carries a lock entry) routes the user to `jastr update <id>`; an
 * untracked id states it was not jastr-installed and must be deleted by hand.
 */
async function assertDestinationAvailable(args: {
  destRoot: string;
  id: string;
}): Promise<void> {
  const { destRoot, id } = args;
  const destDir = path.join(destRoot, ".jastr", id);
  if (!(await pathExists(destDir))) {
    return;
  }

  const lock = await readLock(destRoot);
  const tracked = lock.templates[id] !== undefined;
  const where = displayDestDir(id);
  if (tracked) {
    throw new JastrError(
      "destination_exists",
      `${id} is already installed at ${where}; run \`jastr update ${id}\` to refresh it.`,
      { name: id },
    );
  }
  throw new JastrError(
    "destination_exists",
    `${where} already exists and was not jastr-installed; delete it by hand before adding ${id}.`,
    { name: id },
  );
}

/**
 * Compute the unit hash over the installed (now committed) unit and write the
 * provenance lock entry atomically. The lock is read leniently first (a missing
 * lock is an empty lock; a present but tampered lock fails with `invalid_lock`
 * before any write). `.jastr/` is ensured to exist (the unit commit already
 * created it, but the bootstrap path may have committed straight in). The
 * project config is never touched — only the lock.
 */
async function recordProvenance(args: {
  destRoot: string;
  unit: ResolvedUnit;
  sourceRoot: string;
  baseDir: string;
  provenance: SourceProvenance;
}): Promise<void> {
  const { destRoot, unit, sourceRoot, baseDir, provenance } = args;
  const destDir = path.join(destRoot, ".jastr", unit.id);
  const hash = await hashUnitDir(destDir);

  const lock = await readLock(destRoot);
  const entry = buildLockEntry({ unit, sourceRoot, baseDir, provenance, hash });

  const next: LockFile = {
    version: lock.version,
    templates: { ...lock.templates, [unit.id]: entry },
  };

  await mkdir(path.dirname(lockPath(destRoot)), { recursive: true });
  await writeLock(destRoot, next);
}

/**
 * Build the lock entry for a freshly installed unit. The normalized `path` is the
 * POSIX-relative path from the source root to the resolved base, omitted when the
 * base is the source root. `ref`/`commit` are carried from the provenance and
 * omitted when absent. The entry is strictly validated before it is returned, so
 * a malformed entry never reaches the lock.
 */
function buildLockEntry(args: {
  unit: ResolvedUnit;
  sourceRoot: string;
  baseDir: string;
  provenance: SourceProvenance;
  hash: string;
}): LockEntry {
  const { unit, sourceRoot, baseDir, provenance, hash } = args;
  const normalizedPath = normalizeBasePath(sourceRoot, baseDir);

  const entry: LockEntry = {
    source: provenance.source,
    url: provenance.url,
    ...(provenance.ref !== undefined ? { ref: provenance.ref } : {}),
    name: unit.id,
    ...(normalizedPath !== undefined ? { path: normalizedPath } : {}),
    kind: unit.kind,
    ...(provenance.commit !== undefined ? { commit: provenance.commit } : {}),
    hash,
  };

  // Fail closed if the entry we are about to record is somehow malformed.
  validateLockEntry(unit.id, entry);
  return entry;
}

/**
 * The lock's `path`: the POSIX-normalized relative path from the source root to
 * the resolved base, or `undefined` when the base IS the source root (so `path`
 * is omitted from the entry).
 */
function normalizeBasePath(
  sourceRoot: string,
  baseDir: string,
): string | undefined {
  const relative = path.relative(sourceRoot, baseDir);
  if (relative === "") {
    return undefined;
  }
  return relative.split(path.sep).join("/");
}

/**
 * One deterministic success line naming the unit, source (+ref), destination, and
 * root. A group additionally reports its template count.
 */
function formatInstalledLine(args: {
  unit: ResolvedUnit;
  provenance: SourceProvenance;
  scope: "local" | "global";
}): string {
  const { unit, provenance, scope } = args;
  const refSuffix =
    provenance.ref !== undefined ? ` (ref ${provenance.ref})` : "";
  const where = displayDestDir(unit.id);
  const rootLabel = scope === "global" ? "global" : "local";

  if (unit.kind === "group") {
    const count = unit.templateCount;
    const plural = count === 1 ? "template" : "templates";
    return `Installed group ${unit.id} (${count} ${plural}) from ${provenance.source}${refSuffix} into ${where} [${rootLabel}].`;
  }
  return `Installed ${unit.id} from ${provenance.source}${refSuffix} into ${where} [${rootLabel}].`;
}

/** The destination directory rendered for messages: `.jastr/<id>` always (the
 * destination namespace is the same shape for both roots). */
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
