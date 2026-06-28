import { randomBytes } from "node:crypto";
import type { Dirent, Stats } from "node:fs";
import { copyFile, lstat, mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import { quote } from "../quote";
import {
  classifyUnitDir,
  GROUP_TEMPLATES_DIR,
  TEMPLATE_FILE,
} from "../templates/template-ref";

/**
 * A classified, installable unit resolved at a source base. `id` is the
 * single-segment name (the destination directory name under `.jastr/`); `dir` is
 * the source unit directory (`<base>/.jastr/<id>/`). A group also reports how
 * many templates it carries, so the caller can name the count in its output.
 */
export type ResolvedUnit =
  | { kind: "standalone"; id: string; dir: string }
  | { kind: "group"; id: string; dir: string; templateCount: number };

export type ResolveNamedUnitOptions = {
  /** The acquired source base directory (`acquireSource`'s `baseDir`). */
  base: string;
  /** The as-typed `<name>` to resolve under `<base>/.jastr/`. */
  name: string;
  /**
   * The as-typed source string, named in a `template_not_found` message so the
   * user sees which source was searched.
   */
  source: string;
};

/**
 * Resolve `<name>` to an installable unit under `<base>/.jastr/<name>/`, reusing
 * the existing standalone/grouped classification (`classifyUnitDir`).
 *
 * - A two-segment `group/template` name is a grouped reference, rejected with
 *   `grouped_template_not_addable` — groups install as a whole.
 * - A single-segment name classifies its directory as `standalone` (has
 *   `TEMPLATE.md`) or `group` (has `.jastrgroup`); neither (or absent) →
 *   `template_not_found` naming the source.
 */
export async function resolveNamedUnit(
  options: ResolveNamedUnitOptions,
): Promise<ResolvedUnit> {
  const { base, name, source } = options;

  if (name.includes("/")) {
    throw new JastrError(
      "grouped_template_not_addable",
      `${quote(name)} refers to a template inside a group; add the whole group by its name instead (groups install as a unit).`,
      { name },
    );
  }

  const dir = path.join(base, ".jastr", name);
  const kind = await classifyUnitDir(dir);

  if (kind === "standalone") {
    return { kind, id: name, dir };
  }
  if (kind === "group") {
    return {
      kind,
      id: name,
      dir,
      templateCount: await countGroupTemplates(dir),
    };
  }

  throw new JastrError(
    "template_not_found",
    `Template ${quote(name)} was not found in ${quote(source)}.`,
    { name },
  );
}

/**
 * List a group's member template ids: directories under `<groupDir>/templates/`
 * that hold a `TEMPLATE.md`, sorted ascending. A directory without a
 * `TEMPLATE.md` is simply not listed (the validation gate enforces structure
 * separately), and a missing `templates/` dir yields an empty list.
 *
 * Shared so both the install output count (`countGroupTemplates`) and `jastr
 * list`'s member tree reuse the one enumeration instead of re-encoding it.
 */
export async function listGroupTemplateIds(
  groupDir: string,
): Promise<string[]> {
  const templatesDir = path.join(groupDir, GROUP_TEMPLATES_DIR);
  let entries: Dirent[];
  try {
    entries = await readdir(templatesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const ids: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const template = await safeLstat(
      path.join(templatesDir, entry.name, TEMPLATE_FILE),
    );
    if (template?.isFile()) {
      ids.push(entry.name);
    }
  }
  ids.sort();
  return ids;
}

/**
 * Count the templates a group carries. Used only for the install output count;
 * delegates to {@link listGroupTemplateIds} so the enumeration lives in one place.
 */
async function countGroupTemplates(groupDir: string): Promise<number> {
  return (await listGroupTemplateIds(groupDir)).length;
}

/**
 * Reject any non-regular, non-directory entry anywhere in the unit. The tree is
 * walked with `lstat` so symlinks are never followed; the first symlink, FIFO,
 * device, socket, or other special entry raises `unsupported_source_entry`.
 *
 * This must run BEFORE any validation, copy, or hashing — it closes
 * local-file-disclosure, boundary-escape, and hang-on-special-file vectors from
 * a hostile source (a symlink could otherwise be followed by a later copy/read).
 */
export async function assertRegularUnit(dir: string): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    // Stat the entry itself, never its target, so a symlink is seen as a link.
    const stats = await lstat(entryPath);
    if (stats.isDirectory()) {
      await assertRegularUnit(entryPath);
    } else if (!stats.isFile()) {
      throw new JastrError(
        "unsupported_source_entry",
        `${quote(entryPath)} is not a regular file or directory (symlinks and special files are not allowed in a source unit).`,
        { path: entryPath },
      );
    }
  }
}

export type StageUnitOptions = {
  /** The vetted source unit directory to copy. */
  unitDir: string;
  /** The destination root whose `.jastr/` the staging dir lives beside. */
  destRoot: string;
};

/**
 * Copy the unit into a temp staging directory ON the destination filesystem
 * (`<destRoot>/.jastr/.jastr-stage-*`), so the final commit is an
 * intra-filesystem `rename` (atomic) rather than a cross-filesystem copy.
 * Returns the staging directory path.
 *
 * The staging dir is removed on any copy failure, so a partial copy never
 * lingers beside the destination. Callers commit it with `commitUnit` and are
 * responsible for removing it on a later (post-copy) failure.
 */
export async function stageUnit(options: StageUnitOptions): Promise<string> {
  const jastrDir = path.join(options.destRoot, ".jastr");
  await mkdir(jastrDir, { recursive: true });
  const stageDir = path.join(
    jastrDir,
    `.jastr-stage-${randomBytes(6).toString("hex")}`,
  );

  try {
    await copyTree(options.unitDir, stageDir);
  } catch (error) {
    await rm(stageDir, { recursive: true, force: true });
    throw error;
  }

  return stageDir;
}

export type CommitUnitOptions = {
  /** The staged copy produced by `stageUnit`. */
  stageDir: string;
  /** The final unit directory (`<destRoot>/.jastr/<id>/`). */
  destDir: string;
};

/**
 * Commit a staged unit by an atomic intra-filesystem `rename` into `destDir`.
 * Because the stage lives under the same `.jastr/` the destination does, the
 * rename never crosses filesystems and is atomic. The caller must have already
 * guarded against an existing `destDir` (create-only semantics) or removed it
 * (a `remove`/`update` swap).
 */
export async function commitUnit(options: CommitUnitOptions): Promise<void> {
  await rename(options.stageDir, options.destDir);
}

/**
 * Remove a unit directory (a `remove`, or the old unit in an `update` swap).
 * Idempotent: a missing directory is not an error.
 */
export async function removeUnit(destDir: string): Promise<void> {
  await rm(destDir, { recursive: true, force: true });
}

/**
 * Recursively copy `src` to `dest` using an explicit `lstat` walk (never
 * following symlinks). The unit is already special-file-free once
 * `assertRegularUnit` has run, so this only ever copies regular files and
 * directories; the lstat-based walk keeps the copy consistent with the rejection
 * pass and avoids `fs.cp`'s default symlink-following.
 */
async function copyTree(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    const stats = await lstat(srcPath);
    if (stats.isDirectory()) {
      await copyTree(srcPath, destPath);
    } else if (stats.isFile()) {
      await copyFile(srcPath, destPath);
    } else {
      // Defensive: assertRegularUnit runs first, so this is unreachable for a
      // vetted unit. Fail closed rather than silently follow/skip a special file.
      throw new JastrError(
        "unsupported_source_entry",
        `${quote(srcPath)} is not a regular file or directory (symlinks and special files are not allowed in a source unit).`,
        { path: srcPath },
      );
    }
  }
}

/** `lstat` that returns `undefined` instead of throwing on a missing entry. */
async function safeLstat(target: string): Promise<Stats | undefined> {
  try {
    return await lstat(target);
  } catch {
    return undefined;
  }
}
