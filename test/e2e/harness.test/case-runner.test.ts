import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { copyProjectFixture } from "../harness/case-runner";

describe("copyProjectFixture", () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "skillrouter-harness-"));
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
    const fixtureDir = path.join(caseDir, "project", ".skillrouter", "demo");
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(path.join(fixtureDir, "SKILL.template.md"), "hi\n");
    const tempRoot = await makeTempDir();

    await copyProjectFixture(caseDir, tempRoot);

    const copied = await readdir(path.join(tempRoot, ".skillrouter", "demo"));
    expect(copied).toEqual(["SKILL.template.md"]);
  });

  it("treats an absent project/ fixture as an empty workspace", async () => {
    const caseDir = await makeTempDir(); // intentionally no project/ subdir
    const tempRoot = await makeTempDir();

    await expect(
      copyProjectFixture(caseDir, tempRoot),
    ).resolves.toBeUndefined();
    expect(await readdir(tempRoot)).toEqual([]);
  });
});
