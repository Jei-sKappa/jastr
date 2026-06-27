import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JastrError } from "@jastr/engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCloneArgs, createGitRunner } from "../../src/install/git";

const SLOW_GIT = path.resolve(import.meta.dirname, "fixtures/slow-git.sh");

/** Run real git once for repo setup; pinned identity/date for determinism. */
function git(args: string[], cwd: string): void {
  const result = spawnSync("git", args, {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Jastr Test",
      GIT_AUTHOR_EMAIL: "test@jastr.invalid",
      GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z",
      GIT_COMMITTER_NAME: "Jastr Test",
      GIT_COMMITTER_EMAIL: "test@jastr.invalid",
      GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z",
    },
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
}

describe("buildCloneArgs", () => {
  it("places -- before positionals with no ref", () => {
    const args = buildCloneArgs({ url: "https://x/y.git", dir: "/dest" });
    expect(args).toEqual([
      "clone",
      "--depth",
      "1",
      "--",
      "https://x/y.git",
      "/dest",
    ]);
    const dashDash = args.indexOf("--");
    expect(dashDash).toBeGreaterThan(-1);
    expect(args.indexOf("https://x/y.git")).toBeGreaterThan(dashDash);
    expect(args.indexOf("/dest")).toBeGreaterThan(dashDash);
  });

  it("sends a ref verbatim to --branch, still before --", () => {
    const args = buildCloneArgs({
      url: "https://x/y.git",
      dir: "/dest",
      ref: "v1.2.3",
    });
    expect(args).toEqual([
      "clone",
      "--depth",
      "1",
      "--branch",
      "v1.2.3",
      "--",
      "https://x/y.git",
      "/dest",
    ]);
    const dashDash = args.indexOf("--");
    expect(args.indexOf("--branch")).toBeLessThan(dashDash);
  });

  it("sends a commit-SHA ref verbatim to --branch (no detection)", () => {
    const sha = "0123456789abcdef0123456789abcdef01234567";
    const args = buildCloneArgs({ url: "u", dir: "d", ref: sha });
    expect(args).toContain("--branch");
    expect(args[args.indexOf("--branch") + 1]).toBe(sha);
  });
});

describe("createGitRunner (integration)", () => {
  const temps: string[] = [];
  let originalGitBin: string | undefined;
  let originalTimeout: string | undefined;

  async function makeTemp(prefix: string): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), prefix));
    temps.push(dir);
    return dir;
  }

  beforeEach(() => {
    originalGitBin = process.env.JASTR_GIT_BIN;
    originalTimeout = process.env.JASTR_GIT_TIMEOUT_MS;
  });

  afterEach(async () => {
    if (originalGitBin === undefined) delete process.env.JASTR_GIT_BIN;
    else process.env.JASTR_GIT_BIN = originalGitBin;
    if (originalTimeout === undefined) delete process.env.JASTR_GIT_TIMEOUT_MS;
    else process.env.JASTR_GIT_TIMEOUT_MS = originalTimeout;
    await Promise.all(
      temps.splice(0).map((d) => rm(d, { recursive: true, force: true })),
    );
  });

  it("clones a real local repo and revParseHead returns the commit", async () => {
    const srcRepo = await makeTemp("jastr-git-src-");
    git(["init", "-q"], srcRepo);
    await writeFile(path.join(srcRepo, "README.md"), "hello\n", "utf8");
    git(["add", "."], srcRepo);
    git(["commit", "-q", "-m", "initial"], srcRepo);

    const dest = path.join(await makeTemp("jastr-git-dest-"), "clone");
    const runner = createGitRunner();
    await runner.clone({ url: pathToFileURL(srcRepo).href, dir: dest });

    const cloned = await readFile(path.join(dest, "README.md"), "utf8");
    expect(cloned).toBe("hello\n");

    const headInSrc = (() => {
      const r = spawnSync("git", ["-C", srcRepo, "rev-parse", "HEAD"], {
        encoding: "utf8",
      });
      return r.stdout.trim();
    })();
    const headInClone = await runner.revParseHead(dest);
    expect(headInClone).toBe(headInSrc);
    expect(headInClone).toMatch(/^[0-9a-f]{40}$/);
  });

  it("maps a bogus file:// source to clone_failed carrying stderr", async () => {
    const dest = path.join(await makeTemp("jastr-git-bogus-"), "clone");
    const runner = createGitRunner();
    const bogus = pathToFileURL(
      path.join(tmpdir(), "jastr-does-not-exist-xyz", "repo"),
    ).href;
    await expect(runner.clone({ url: bogus, dir: dest })).rejects.toMatchObject(
      {
        code: "clone_failed",
      },
    );
    try {
      await runner.clone({ url: bogus, dir: dest });
    } catch (error) {
      expect(error).toBeInstanceOf(JastrError);
      expect((error as JastrError).message.length).toBeGreaterThan(0);
    }
  });

  it("maps a missing git binary to git_unavailable", async () => {
    process.env.JASTR_GIT_BIN = "/nonexistent/path/to/git";
    const runner = createGitRunner();
    expect(await runner.isAvailable()).toBe(false);
    const dest = path.join(await makeTemp("jastr-git-missing-"), "clone");
    await expect(
      runner.clone({ url: "https://example.invalid/x.git", dir: dest }),
    ).rejects.toMatchObject({ code: "git_unavailable" });
  });

  it("kills a slow clone and surfaces clone_failed within a bound (no hang)", async () => {
    process.env.JASTR_GIT_BIN = SLOW_GIT;
    process.env.JASTR_GIT_TIMEOUT_MS = "200";
    const runner = createGitRunner();
    const dest = path.join(await makeTemp("jastr-git-slow-"), "clone");

    const start = Date.now();
    await expect(
      runner.clone({ url: "file:///whatever", dir: dest }),
    ).rejects.toMatchObject({ code: "clone_failed" });
    const elapsed = Date.now() - start;
    // The shim sleeps 60s; the bound proves it was killed by the 200ms timeout.
    expect(elapsed).toBeLessThan(10_000);
  });
});
