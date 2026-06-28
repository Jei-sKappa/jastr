import { spawnSync } from "node:child_process";
import { lstat, mkdtemp, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import { quote } from "../quote";
import { createGitRunner, type GitRunner } from "./git";

/**
 * Provenance facts the lock records for an acquired source. `source` is the
 * as-typed string (display); `url` is the clone URL, or a local source's
 * absolute realpath; `ref`/`commit` are omitted when not applicable.
 */
export type SourceProvenance = {
  source: string;
  url: string;
  ref?: string;
  commit?: string;
};

/**
 * The result of acquiring a source: the resolved source root on disk, the base
 * directory (`<sourceRoot>/<--path>`) the unit is resolved against, a `cleanup`
 * that removes any temp clone (a no-op for local paths), and the provenance the
 * lock needs.
 */
export type AcquiredSource = {
  sourceRoot: string;
  baseDir: string;
  cleanup: () => Promise<void>;
  provenance: SourceProvenance;
};

export type AcquireSourceOptions = {
  source: string;
  ref?: string;
  path?: string;
  git?: GitRunner;
  /**
   * Cleanliness probe for a local git working tree, overridable in tests so the
   * "no clone for a local dir" assertion holds without spawning real git. The
   * default runs `git -C <dir> status --porcelain` and treats empty output as
   * clean. Returns `undefined` when `dir` is not a git working tree.
   */
  isGitClean?: (dir: string) => boolean | undefined;
};

const NO_OP_CLEANUP = async (): Promise<void> => {};

/**
 * Turn a `<repo-source>` (+ optional `--ref`, `--path`) into a resolved source
 * root on disk plus the provenance the lock needs. Remote sources are cloned
 * into an OS-temp dir whose `cleanup` removes it; local directory sources are
 * read in place (no clone, no temp). Cleanup runs on both success and failure so
 * a failed clone never leaves a temp dir behind.
 */
export async function acquireSource(
  options: AcquireSourceOptions,
): Promise<AcquiredSource> {
  const git = options.git ?? createGitRunner();
  const isGitClean = options.isGitClean ?? defaultIsGitClean;

  const localDir = await resolveLocalDirectory(options.source);

  if (localDir !== undefined) {
    const sourceRoot = localDir;
    const baseDir = await resolveBaseDir(sourceRoot, options.path);
    const commit = captureLocalCommit({ git, dir: sourceRoot, isGitClean });
    const provenance: SourceProvenance = {
      source: options.source,
      url: sourceRoot,
      ...(options.ref !== undefined ? { ref: options.ref } : {}),
    };
    const resolvedCommit = await commit;
    if (resolvedCommit !== undefined) {
      provenance.commit = resolvedCommit;
    }
    return {
      sourceRoot,
      baseDir,
      cleanup: NO_OP_CLEANUP,
      provenance,
    };
  }

  return acquireRemote({ ...options, git });
}

/**
 * Classify and acquire a remote source: require git, clone into an OS-temp dir,
 * capture HEAD for provenance, and resolve the base dir. The temp dir is removed
 * on any failure so a failed acquire leaves nothing behind.
 */
async function acquireRemote(options: {
  source: string;
  ref?: string;
  path?: string;
  git: GitRunner;
}): Promise<AcquiredSource> {
  const { source, ref, git } = options;
  const url = expandSource(source);

  if (!(await git.isAvailable())) {
    throw new JastrError(
      "git_unavailable",
      `git is not available; install git to add a remote source (${quote(source)}).`,
    );
  }

  const tempDir = await mkdtemp(path.join(tmpdir(), "jastr-clone-"));
  const cleanup = async (): Promise<void> => {
    await rm(tempDir, { recursive: true, force: true });
  };

  try {
    await git.clone({
      url,
      dir: tempDir,
      ...(ref !== undefined ? { ref } : {}),
    });
    const commit = await git.revParseHead(tempDir);
    const baseDir = await resolveBaseDir(tempDir, options.path);
    const provenance: SourceProvenance = {
      source,
      url,
      ...(ref !== undefined ? { ref } : {}),
      commit,
    };
    return { sourceRoot: tempDir, baseDir, cleanup, provenance };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/**
 * Resolve `source` to an existing local directory's absolute realpath, or
 * `undefined` when it is not an existing directory (a remote source).
 */
async function resolveLocalDirectory(
  source: string,
): Promise<string | undefined> {
  const candidate = path.resolve(source);
  try {
    const stats = await stat(candidate);
    if (!stats.isDirectory()) {
      return undefined;
    }
    return await realpath(candidate);
  } catch {
    return undefined;
  }
}

/**
 * Expand a remote source string to a clone URL: `owner/repo` shorthand becomes
 * a github HTTPS URL; any other string passes through unchanged (arbitrary URL,
 * `git@…`, `ssh://`).
 */
export function expandSource(source: string): string {
  if (isOwnerRepoShorthand(source)) {
    return `https://github.com/${source}.git`;
  }
  return source;
}

/**
 * `owner/repo` shorthand: exactly two non-empty segments, no scheme (`://`), no
 * `@`, no whitespace. A leading/trailing slash or a third segment disqualifies
 * it so it falls through to `git clone` unchanged.
 */
function isOwnerRepoShorthand(source: string): boolean {
  if (source.includes("://") || source.includes("@")) return false;
  if (/\s/.test(source)) return false;
  const segments = source.split("/");
  if (segments.length !== 2) return false;
  const [owner, repo] = segments;
  return (
    owner !== undefined &&
    owner.length > 0 &&
    repo !== undefined &&
    repo.length > 0
  );
}

/**
 * Resolve `<sourceRoot>/<--path>` (default `<sourceRoot>`), validating `--path`
 * as a relative subpath whose resolved realpath stays within `<sourceRoot>`. An
 * absolute path, a lexical `..`-escape, or a path that escapes via a symlink is
 * rejected with `invalid_command` (P27). The base may legitimately not exist yet
 * (a later step reports `template_not_found`); in that case its deepest existing
 * ancestor is realpath-checked instead, so a non-existent-but-contained base is
 * permitted while a symlinked ancestor that escapes the source root is rejected.
 */
async function resolveBaseDir(
  sourceRoot: string,
  subPath?: string,
): Promise<string> {
  if (subPath === undefined || subPath === "") {
    return sourceRoot;
  }

  if (path.isAbsolute(subPath)) {
    throw new JastrError(
      "invalid_command",
      `--path must be a relative subpath, not an absolute path (${quote(subPath)}).`,
    );
  }

  const resolved = path.resolve(sourceRoot, subPath);
  if (!isInsideRoot(sourceRoot, resolved)) {
    throw new JastrError(
      "invalid_command",
      `--path must stay within the source root (${quote(subPath)}).`,
    );
  }

  // Containment by resolved realpath (P27): a `--path` may traverse a symlinked
  // subdir that lexically looks contained yet points outside the source root.
  const realRoot = await realpath(sourceRoot);
  const realResolved = await realpathDeepestExisting(resolved);
  if (!isInsideRoot(realRoot, realResolved)) {
    throw new JastrError(
      "invalid_command",
      `--path must stay within the source root (${quote(subPath)}).`,
    );
  }

  return resolved;
}

/**
 * Lexical containment: `true` when `candidate` is `root` itself or a descendant
 * of it (mirrors `templates/includes.ts` `isInsideBoundary`).
 */
function isInsideRoot(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

/**
 * Realpath `target` if it exists; otherwise realpath its deepest existing
 * ancestor and re-attach the trailing not-yet-existing segments. This lets a
 * base that does not exist yet still be containment-checked by realpath (so a
 * symlinked ancestor escaping the source root is caught), while a genuinely
 * absent-but-contained base passes.
 */
async function realpathDeepestExisting(target: string): Promise<string> {
  let current = target;
  const trailing: string[] = [];
  while (true) {
    try {
      // lstat (never follows) only to detect existence; realpath resolves links.
      await lstat(current);
      const real = await realpath(current);
      return trailing.length === 0 ? real : path.join(real, ...trailing);
    } catch {
      const parent = path.dirname(current);
      if (parent === current) {
        // Reached the filesystem root without an existing ancestor; fall back to
        // the lexical resolve (already `..`/absolute-checked above).
        return target;
      }
      trailing.unshift(path.basename(current));
      current = parent;
    }
  }
}

/**
 * Capture the commit for a local source: a clean git working tree's HEAD, or
 * `undefined` for a non-git directory or a dirty working tree (no commit
 * represents the copied bytes). Uses the injected `GitRunner.revParseHead` (a
 * `git -C` read, never a clone), so the no-clone-for-local-dir invariant holds.
 */
async function captureLocalCommit(options: {
  git: GitRunner;
  dir: string;
  isGitClean: (dir: string) => boolean | undefined;
}): Promise<string | undefined> {
  const clean = options.isGitClean(options.dir);
  if (clean !== true) {
    return undefined;
  }
  try {
    return await options.git.revParseHead(options.dir);
  } catch {
    return undefined;
  }
}

/**
 * Default git-cleanliness probe: `git -C <dir> status --porcelain`. Empty output
 * ⇒ clean (`true`); non-empty ⇒ dirty (`false`); a non-zero exit or a missing
 * binary ⇒ not a git working tree (`undefined`).
 */
function defaultIsGitClean(dir: string): boolean | undefined {
  const result = spawnSync(
    process.env.JASTR_GIT_BIN ?? "git",
    ["-C", dir, "status", "--porcelain"],
    { encoding: "utf8" },
  );
  if (result.error !== undefined || result.status !== 0) {
    return undefined;
  }
  return result.stdout.trim().length === 0;
}
