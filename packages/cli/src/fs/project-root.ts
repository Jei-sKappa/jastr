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
