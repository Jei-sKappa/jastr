import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  copyCaseFixture,
  expandFixturePlaceholders,
} from "../harness/case-runner";

describe("copyCaseFixture", () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "jastr-harness-"));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    await Promise.all(
      tempDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("copies the case fixture into the temp workspace", async () => {
    const caseDir = await makeTempDir();
    const fixtureDir = path.join(caseDir, "fixture", ".jastr", "demo");
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(path.join(fixtureDir, "template.md"), "hi\n");
    const tempRoot = await makeTempDir();

    await copyCaseFixture(caseDir, tempRoot);

    const copied = await readdir(path.join(tempRoot, ".jastr", "demo"));
    expect(copied).toEqual(["template.md"]);
  });

  it("expands projectRoot placeholders in copied fixture text files without following symlinks", async () => {
    const tempRoot = await makeTempDir();
    const outsideRoot = await makeTempDir();
    const fixtureDir = path.join(tempRoot, ".jastr", "demo");
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(
      path.join(fixtureDir, "template.md"),
      '::include{path="{{projectRoot}}/.jastr/demo/fragment.md"}\n',
    );
    await writeFile(path.join(outsideRoot, "outside.md"), "{{projectRoot}}\n");
    await symlink(
      path.join(outsideRoot, "outside.md"),
      path.join(fixtureDir, "leak.md"),
    );

    await expandFixturePlaceholders(tempRoot, { projectRoot: tempRoot });

    await expect(
      readFile(path.join(fixtureDir, "template.md"), "utf8"),
    ).resolves.toBe(`::include{path="${tempRoot}/.jastr/demo/fragment.md"}\n`);
    await expect(
      readFile(path.join(fixtureDir, "leak.md"), "utf8"),
    ).resolves.toBe("{{projectRoot}}\n");
  });

  it("treats an absent fixture/ folder as an empty workspace", async () => {
    const caseDir = await makeTempDir(); // intentionally no fixture/ subdir
    const tempRoot = await makeTempDir();

    await expect(copyCaseFixture(caseDir, tempRoot)).resolves.toBeUndefined();
    expect(await readdir(tempRoot)).toEqual([]);
  });
});
