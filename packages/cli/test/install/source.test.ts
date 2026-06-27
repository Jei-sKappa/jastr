import { spawnSync } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import { afterEach, describe, expect, it } from "vitest";
import type { CloneOptions, GitRunner } from "../../src/install/git";
import { acquireSource, expandSource } from "../../src/install/source";

const temps: string[] = [];

async function makeTemp(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  temps.push(dir);
  // Return the realpath so comparisons match acquireSource's realpath-resolved
  // sourceRoot (on macOS `/var/...` realpaths to `/private/var/...`).
  return await realpath(dir);
}

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

/**
 * A `GitRunner` whose `clone` throws if called — used to assert a local-dir
 * source performs no clone. `revParseHead` is allowed (a `git -C` read, not a
 * clone) so local-git commit capture still works.
 */
function noCloneRunner(
  overrides: Partial<GitRunner> = {},
): GitRunner & { cloneCalls: CloneOptions[] } {
  const cloneCalls: CloneOptions[] = [];
  return {
    cloneCalls,
    clone: async (opts) => {
      cloneCalls.push(opts);
      throw new Error("clone must not be called for a local-dir source");
    },
    revParseHead: async () => "0".repeat(40),
    isAvailable: async () => true,
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

describe("expandSource", () => {
  it("expands owner/repo shorthand to a github URL", () => {
    expect(expandSource("owner/repo")).toBe(
      "https://github.com/owner/repo.git",
    );
  });

  it("passes an arbitrary https URL through unchanged", () => {
    const url = "https://example.com/team/project.git";
    expect(expandSource(url)).toBe(url);
  });

  it("passes a git@ scp-style URL through unchanged", () => {
    const url = "git@github.com:owner/repo.git";
    expect(expandSource(url)).toBe(url);
  });

  it("passes an ssh:// URL through unchanged", () => {
    const url = "ssh://git@host/owner/repo.git";
    expect(expandSource(url)).toBe(url);
  });

  it("does not treat a three-segment path as shorthand", () => {
    expect(expandSource("a/b/c")).toBe("a/b/c");
  });
});

describe("acquireSource: remote classification", () => {
  it("expands owner/repo and clones it (no local dir of that name)", async () => {
    const cloned: CloneOptions[] = [];
    const git: GitRunner = {
      clone: async (opts) => {
        cloned.push(opts);
      },
      revParseHead: async () => "a".repeat(40),
      isAvailable: async () => true,
    };
    const acquired = await acquireSource({ source: "owner/repo", git });
    try {
      expect(cloned).toHaveLength(1);
      expect(cloned[0]?.url).toBe("https://github.com/owner/repo.git");
      expect(acquired.provenance.url).toBe("https://github.com/owner/repo.git");
      expect(acquired.provenance.source).toBe("owner/repo");
      expect(acquired.provenance.commit).toBe("a".repeat(40));
    } finally {
      await acquired.cleanup();
    }
  });

  it("passes an arbitrary URL straight to clone", async () => {
    const cloned: CloneOptions[] = [];
    const git: GitRunner = {
      clone: async (opts) => {
        cloned.push(opts);
      },
      revParseHead: async () => "b".repeat(40),
      isAvailable: async () => true,
    };
    const url = "https://example.com/team/project.git";
    const acquired = await acquireSource({ source: url, ref: "main", git });
    try {
      expect(cloned[0]?.url).toBe(url);
      expect(cloned[0]?.ref).toBe("main");
      expect(acquired.provenance.ref).toBe("main");
    } finally {
      await acquired.cleanup();
    }
  });

  it("requires git availability for a remote source", async () => {
    const git = noCloneRunner({ isAvailable: async () => false });
    await expect(
      acquireSource({ source: "owner/repo", git }),
    ).rejects.toMatchObject({ code: "git_unavailable" });
  });

  it("cleans up the temp dir when the clone fails", async () => {
    let capturedDir: string | undefined;
    const git: GitRunner = {
      clone: async (opts) => {
        capturedDir = opts.dir;
        throw new JastrError("clone_failed", "boom");
      },
      revParseHead: async () => "c".repeat(40),
      isAvailable: async () => true,
    };
    await expect(
      acquireSource({ source: "owner/repo", git }),
    ).rejects.toMatchObject({ code: "clone_failed" });
    expect(capturedDir).toBeDefined();
    const stillThere = spawnSync("test", ["-d", capturedDir as string]);
    expect(stillThere.status).not.toBe(0);
  });
});

describe("acquireSource: local-path classification (no clone)", () => {
  it("reads an existing directory in place with no clone", async () => {
    const src = await makeTemp("jastr-src-");
    await writeFile(path.join(src, "file.txt"), "x", "utf8");
    const git = noCloneRunner();
    const acquired = await acquireSource({
      source: src,
      git,
      isGitClean: () => undefined,
    });
    expect(git.cloneCalls).toHaveLength(0);
    expect(acquired.sourceRoot).toBe(src);
    // url is the source's absolute realpath; source keeps the as-typed string.
    expect(path.isAbsolute(acquired.provenance.url)).toBe(true);
    expect(acquired.provenance.source).toBe(src);
    expect(acquired.provenance.commit).toBeUndefined();
    // cleanup is a no-op (does not remove the live source dir).
    await acquired.cleanup();
    const stillThere = spawnSync("test", ["-d", src]);
    expect(stillThere.status).toBe(0);
  });

  it("records url as the absolute realpath even for a relative source", async () => {
    const src = await makeTemp("jastr-relsrc-");
    const original = process.cwd();
    try {
      process.chdir(path.dirname(src));
      const relName = path.basename(src);
      const git = noCloneRunner();
      const acquired = await acquireSource({
        source: relName,
        git,
        isGitClean: () => undefined,
      });
      expect(acquired.provenance.source).toBe(relName);
      expect(path.isAbsolute(acquired.provenance.url)).toBe(true);
      expect(git.cloneCalls).toHaveLength(0);
    } finally {
      process.chdir(original);
    }
  });
});

describe("acquireSource: --path containment", () => {
  it("resolves a valid relative subpath as the base dir", async () => {
    const src = await makeTemp("jastr-path-");
    await mkdir(path.join(src, "nested", "deep"), { recursive: true });
    const git = noCloneRunner();
    const acquired = await acquireSource({
      source: src,
      path: "nested/deep",
      git,
      isGitClean: () => undefined,
    });
    expect(acquired.baseDir).toBe(path.join(src, "nested", "deep"));
    expect(acquired.sourceRoot).toBe(src);
  });

  it("defaults the base dir to the source root with no --path", async () => {
    const src = await makeTemp("jastr-nopath-");
    const git = noCloneRunner();
    const acquired = await acquireSource({
      source: src,
      git,
      isGitClean: () => undefined,
    });
    expect(acquired.baseDir).toBe(src);
  });

  it("rejects an absolute --path with invalid_command", async () => {
    const src = await makeTemp("jastr-abspath-");
    const git = noCloneRunner();
    await expect(
      acquireSource({
        source: src,
        path: path.join(src, "abs"),
        git,
        isGitClean: () => undefined,
      }),
    ).rejects.toMatchObject({ code: "invalid_command" });
  });

  it("rejects a ..-escape --path with invalid_command", async () => {
    const src = await makeTemp("jastr-escape-");
    const git = noCloneRunner();
    await expect(
      acquireSource({
        source: src,
        path: "../outside",
        git,
        isGitClean: () => undefined,
      }),
    ).rejects.toMatchObject({ code: "invalid_command" });
  });

  it("rejects a --path through an in-source symlink that escapes the root", async () => {
    const src = await makeTemp("jastr-symesc-");
    // An out-of-source directory the in-source symlink points at.
    const outside = await makeTemp("jastr-symtarget-");
    await mkdir(path.join(outside, "deep"), { recursive: true });
    // `escape` lives inside the source root but resolves outside it.
    await symlink(outside, path.join(src, "escape"));
    const git = noCloneRunner();
    await expect(
      acquireSource({
        source: src,
        path: "escape/deep",
        git,
        isGitClean: () => undefined,
      }),
    ).rejects.toMatchObject({ code: "invalid_command" });
  });

  it("resolves a real (non-symlink) in-source subpath", async () => {
    const src = await makeTemp("jastr-realsub-");
    await mkdir(path.join(src, "real", "deep"), { recursive: true });
    const git = noCloneRunner();
    const acquired = await acquireSource({
      source: src,
      path: "real/deep",
      git,
      isGitClean: () => undefined,
    });
    expect(acquired.baseDir).toBe(path.join(src, "real", "deep"));
    expect(acquired.sourceRoot).toBe(src);
  });

  it("permits a contained --path that does not exist yet", async () => {
    const src = await makeTemp("jastr-absent-");
    const git = noCloneRunner();
    const acquired = await acquireSource({
      source: src,
      path: "not/created/yet",
      git,
      isGitClean: () => undefined,
    });
    expect(acquired.baseDir).toBe(path.join(src, "not", "created", "yet"));
  });
});

describe("acquireSource: local-git commit capture", () => {
  it("captures HEAD for a clean local git repo", async () => {
    const src = await makeTemp("jastr-clean-");
    git(["init", "-q"], src);
    await writeFile(path.join(src, "README.md"), "hello\n", "utf8");
    git(["add", "."], src);
    git(["commit", "-q", "-m", "initial"], src);
    const head = spawnSync("git", ["-C", src, "rev-parse", "HEAD"], {
      encoding: "utf8",
    }).stdout.trim();

    // Use the real runner's revParseHead; clone still must not be called.
    const git_ = noCloneRunner({
      revParseHead: async (dir) =>
        spawnSync("git", ["-C", dir, "rev-parse", "HEAD"], {
          encoding: "utf8",
        }).stdout.trim(),
    });
    const acquired = await acquireSource({ source: src, git: git_ });
    expect(git_.cloneCalls).toHaveLength(0);
    expect(acquired.provenance.commit).toBe(head);
    expect(acquired.provenance.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("omits commit for a dirty local git repo", async () => {
    const src = await makeTemp("jastr-dirty-");
    git(["init", "-q"], src);
    await writeFile(path.join(src, "README.md"), "hello\n", "utf8");
    git(["add", "."], src);
    git(["commit", "-q", "-m", "initial"], src);
    // Make the tree dirty.
    await writeFile(path.join(src, "README.md"), "changed\n", "utf8");

    const acquired = await acquireSource({ source: src, git: noCloneRunner() });
    expect(acquired.provenance.commit).toBeUndefined();
  });

  it("omits commit for a non-git local directory", async () => {
    const src = await makeTemp("jastr-nongit-");
    await writeFile(path.join(src, "file.txt"), "x", "utf8");
    const acquired = await acquireSource({ source: src, git: noCloneRunner() });
    expect(acquired.provenance.commit).toBeUndefined();
  });
});
