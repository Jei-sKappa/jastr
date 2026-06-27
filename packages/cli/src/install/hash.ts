import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * One file in a unit, ready to be hashed. `relPath` is relative to the unit
 * root; `content` is the raw file bytes.
 */
export type UnitFile = {
  relPath: string;
  content: Buffer;
};

/**
 * Compute the canonical, cross-machine-stable sha256 of a unit's files (hex).
 *
 * The digest is deterministic and OS-independent so a committed, team-shared
 * lock hashes identically everywhere:
 * - each `relPath` is POSIX-normalized (`/` separators) before hashing, so the
 *   same tree on Windows and POSIX yields the same digest;
 * - entries are sorted by their normalized `relPath` (UTF-8 byte order), so the
 *   input order does not affect the result;
 * - both the path and the content are fed into a single sha256 stream with
 *   length-prefixed framing (a big-endian uint32 length before each), so a path
 *   can never be confused with content (or a boundary) and any rename — same
 *   bytes, different path — changes the digest;
 * - file mode / permissions / symlink-ness do not participate (symlinks are
 *   rejected upstream before a unit ever reaches here).
 *
 * Pure: it touches no filesystem and depends only on its inputs.
 */
export function hashUnitFiles(files: UnitFile[]): string {
  const sorted = files
    .map((file) => ({
      relPath: toPosix(file.relPath),
      content: file.content,
    }))
    .sort((a, b) => compareUtf8(a.relPath, b.relPath));

  const hash = createHash("sha256");
  for (const { relPath, content } of sorted) {
    const pathBytes = Buffer.from(relPath, "utf8");
    hash.update(uint32be(pathBytes.length));
    hash.update(pathBytes);
    hash.update(uint32be(content.length));
    hash.update(content);
  }
  return hash.digest("hex");
}

/**
 * Walk `dir` recursively, reading every regular file, and return its canonical
 * sha256 via {@link hashUnitFiles}. Paths are recorded relative to `dir`.
 *
 * Only regular files contribute (the same set that gets installed); the walker
 * descends directories and ignores anything else. A hostile unit's symlinks /
 * special files are rejected upstream, so this walker is only ever pointed at a
 * vetted tree.
 */
export async function hashUnitDir(dir: string): Promise<string> {
  const files = await collectRegularFiles(dir, "");
  return hashUnitFiles(files);
}

/**
 * Recursively collect every regular file under `<dir>/<prefix>`, recording each
 * `relPath` relative to the walked root (`prefix` is the path accumulated so
 * far). Directories are descended; non-regular, non-directory entries are
 * skipped (they are rejected upstream before hashing matters).
 */
async function collectRegularFiles(
  dir: string,
  prefix: string,
): Promise<UnitFile[]> {
  const entries = await readdir(path.join(dir, prefix), {
    withFileTypes: true,
  });
  const files: UnitFile[] = [];
  for (const entry of entries) {
    const relPath = prefix === "" ? entry.name : path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectRegularFiles(dir, relPath)));
    } else if (entry.isFile()) {
      const content = await readFile(path.join(dir, relPath));
      files.push({ relPath, content });
    }
  }
  return files;
}

/** Normalize a path to POSIX (`/`) separators, independent of the host OS. */
function toPosix(relPath: string): string {
  return relPath.split(path.sep).join("/").split("\\").join("/");
}

/** A 4-byte big-endian length prefix for unambiguous, binary-safe framing. */
function uint32be(value: number): Buffer {
  const buffer = Buffer.allocUnsafe(4);
  buffer.writeUInt32BE(value, 0);
  return buffer;
}

/** Compare two strings by their UTF-8 byte order for a stable, total sort. */
function compareUtf8(a: string, b: string): number {
  return Buffer.from(a, "utf8").compare(Buffer.from(b, "utf8"));
}
