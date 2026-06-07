import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyCaseFixture } from "../harness/case-runner";

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

  it("treats an absent fixture/ folder as an empty workspace", async () => {
    const caseDir = await makeTempDir(); // intentionally no fixture/ subdir
    const tempRoot = await makeTempDir();

    await expect(copyCaseFixture(caseDir, tempRoot)).resolves.toBeUndefined();
    expect(await readdir(tempRoot)).toEqual([]);
  });
});
