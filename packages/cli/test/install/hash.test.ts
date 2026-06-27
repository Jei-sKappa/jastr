import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  hashUnitDir,
  hashUnitFiles,
  type UnitFile,
} from "../../src/install/hash";

const temps: string[] = [];

async function makeTemp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

function file(relPath: string, content: string): UnitFile {
  return { relPath, content: Buffer.from(content, "utf8") };
}

describe("hashUnitFiles", () => {
  it("hashes identical content to an identical digest", () => {
    const a = [file("a.md", "alpha"), file("b/c.md", "beta")];
    const b = [file("a.md", "alpha"), file("b/c.md", "beta")];
    expect(hashUnitFiles(a)).toBe(hashUnitFiles(b));
  });

  it("returns a 64-char sha256 hex digest", () => {
    expect(hashUnitFiles([file("a.md", "x")])).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes the digest when a file is renamed (same bytes)", () => {
    const original = hashUnitFiles([file("a.md", "same bytes")]);
    const renamed = hashUnitFiles([file("b.md", "same bytes")]);
    expect(renamed).not.toBe(original);
  });

  it("changes the digest when a byte changes (same path)", () => {
    const before = hashUnitFiles([file("a.md", "content")]);
    const after = hashUnitFiles([file("a.md", "contenu")]);
    expect(after).not.toBe(before);
  });

  it("normalizes \\\\ and / separators to the same digest", () => {
    const posix = hashUnitFiles([file("dir/sub/file.md", "body")]);
    const windows = hashUnitFiles([file("dir\\sub\\file.md", "body")]);
    expect(windows).toBe(posix);
  });

  it("is order-independent (input order does not change the digest)", () => {
    const forward = hashUnitFiles([
      file("a.md", "1"),
      file("b.md", "2"),
      file("c.md", "3"),
    ]);
    const shuffled = hashUnitFiles([
      file("c.md", "3"),
      file("a.md", "1"),
      file("b.md", "2"),
    ]);
    expect(shuffled).toBe(forward);
  });

  it("does not let path/content bytes blur the framing boundary", () => {
    // Without length-prefixed framing, ("ab","") and ("a","b") could collide.
    const split = hashUnitFiles([file("ab", "")]);
    const joined = hashUnitFiles([file("a", "b")]);
    expect(split).not.toBe(joined);
  });

  it("handles binary (non-UTF-8) content bytes", () => {
    const bytes = Buffer.from([0x00, 0xff, 0x10, 0x80]);
    const digest = hashUnitFiles([{ relPath: "blob.bin", content: bytes }]);
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("hashUnitDir", () => {
  it("matches the pure core over the walked tree", async () => {
    const dir = await makeTemp("jastr-hashdir-");
    await mkdir(path.join(dir, "nested"), { recursive: true });
    await writeFile(path.join(dir, "top.md"), "top", "utf8");
    await writeFile(path.join(dir, "nested", "deep.md"), "deep", "utf8");

    const fromDir = await hashUnitDir(dir);
    const fromFiles = hashUnitFiles([
      file("top.md", "top"),
      file("nested/deep.md", "deep"),
    ]);
    expect(fromDir).toBe(fromFiles);
  });

  it("hashes two trees with identical content identically", async () => {
    const a = await makeTemp("jastr-hashdir-a-");
    const b = await makeTemp("jastr-hashdir-b-");
    for (const dir of [a, b]) {
      await mkdir(path.join(dir, "g"), { recursive: true });
      await writeFile(path.join(dir, "g", "x.md"), "x", "utf8");
      await writeFile(path.join(dir, "y.md"), "y", "utf8");
    }
    expect(await hashUnitDir(a)).toBe(await hashUnitDir(b));
  });

  it("changes the digest when a file in the tree is renamed", async () => {
    const before = await makeTemp("jastr-hashdir-before-");
    await writeFile(path.join(before, "a.md"), "bytes", "utf8");
    const after = await makeTemp("jastr-hashdir-after-");
    await writeFile(path.join(after, "b.md"), "bytes", "utf8");
    expect(await hashUnitDir(after)).not.toBe(await hashUnitDir(before));
  });
});
