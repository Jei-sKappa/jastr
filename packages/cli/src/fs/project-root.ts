import { realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JastrError } from "@jastr/engine";

export type ResolvedRoot = { kind: "local" | "global"; projectRoot: string };

export type ResolvedRoots = {
  ordered: ResolvedRoot[]; // local first (if any), then global (if any, uncollapsed)
  local?: string; // projectRoot dir whose ./.jastr is the local root
  global?: string; // projectRoot dir whose ./.jastr is the global root
};

export async function resolveProjectRoots(cwd: string): Promise<ResolvedRoots> {
  const local = await findLocalProjectRoot(cwd);
  const global = await findGlobalProjectRoot();

  const ordered: ResolvedRoot[] = [];
  const roots: ResolvedRoots = { ordered };

  if (local !== undefined) {
    roots.local = local;
    ordered.push({ kind: "local", projectRoot: local });
  }

  if (global !== undefined) {
    // Collapse identical roots so a single root is applied once: no
    // self-shadowing and no self-merge.
    if (local !== undefined && (await isSameRealpath(local, global))) {
      // The local entry already represents this root.
    } else {
      roots.global = global;
      ordered.push({ kind: "global", projectRoot: global });
    }
  }

  if (ordered.length === 0) {
    throw new JastrError(
      "missing_project_root",
      `No .jastr directory found locally (searched from the current directory up) or globally (${path.join(
        globalBase(),
        ".jastr",
      )}).`,
    );
  }

  return roots;
}

async function findLocalProjectRoot(
  startCwd: string,
): Promise<string | undefined> {
  let current = path.resolve(startCwd);

  while (true) {
    if (await isDirectory(path.join(current, ".jastr"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }

    current = parent;
  }
}

async function findGlobalProjectRoot(): Promise<string | undefined> {
  const base = globalBase();
  if (await isDirectory(path.join(base, ".jastr"))) {
    return base;
  }
  return undefined;
}

function globalBase(): string {
  const override = process.env.JASTR_HOME;
  if (override !== undefined) {
    const trimmed = override.trim();
    if (trimmed.length > 0 && path.isAbsolute(trimmed)) {
      return trimmed;
    }
  }
  return os.homedir();
}

/**
 * Resolve the single destination root for an `add` install, additively beside
 * `resolveProjectRoots` and WITHOUT its throwing `missing_project_root` path.
 *
 * - `-g/--global` targets the global base (`$JASTR_HOME` else home directory),
 *   which is created on demand at install time when absent.
 * - The default (local) walks up from `cwd` for an existing `.jastr/`; when none
 *   exists up the tree, the install bootstraps a fresh `.jastr/` in `cwd` — so a
 *   default `add` never raises `missing_project_root`.
 *
 * The `.jastr/` directory itself is NOT created here (a caller may still fail the
 * conflict/validation gate before any write); the caller ensures it exists before
 * writing the unit and lock.
 */
export async function resolveAddDestination(
  cwd: string,
  scope: "local" | "global",
): Promise<string> {
  if (scope === "global") {
    return globalBase();
  }
  const local = await findLocalProjectRoot(cwd);
  return local ?? path.resolve(cwd);
}

/**
 * Resolve the in-scope roots for `list`, additively beside `resolveProjectRoots`
 * and WITHOUT its throwing `missing_project_root` path: `list` reports an empty
 * inventory rather than erroring when nothing is installed anywhere.
 *
 * - `local` returns the existing local root (the upward `.jastr/` walk), if any.
 * - `global` returns the existing global root (`$JASTR_HOME` else home), if any.
 * - `both` returns local-then-global, collapsing identical realpaths so a single
 *   root (e.g. cwd under `$JASTR_HOME`) is listed once.
 *
 * A root is included only when its `.jastr/` exists on disk; an absent root is
 * simply omitted (no error).
 */
export async function resolveListRoots(
  cwd: string,
  scope: "local" | "global" | "both",
): Promise<ResolvedRoot[]> {
  const local =
    scope === "global" ? undefined : await findLocalProjectRoot(cwd);
  const global = scope === "local" ? undefined : await findGlobalProjectRoot();

  const roots: ResolvedRoot[] = [];
  if (local !== undefined) {
    roots.push({ kind: "local", projectRoot: local });
  }
  if (global !== undefined) {
    if (local !== undefined && (await isSameRealpath(local, global))) {
      // The local entry already represents this root; do not list it twice.
    } else {
      roots.push({ kind: "global", projectRoot: global });
    }
  }
  return roots;
}

async function isSameRealpath(a: string, b: string): Promise<boolean> {
  try {
    return (await realpath(a)) === (await realpath(b));
  } catch {
    return false;
  }
}

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}
