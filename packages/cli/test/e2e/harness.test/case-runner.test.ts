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
import { execa } from "execa";
import { afterEach, describe, expect, it } from "vitest";
import {
  copyCaseFixture,
  copyCaseGlobalFixture,
  expandFixturePlaceholders,
  runSetupSteps,
} from "../harness/case-runner";

const FAKE_GIT = path.resolve(import.meta.dirname, "../harness/fake-git/git");

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
    await writeFile(path.join(fixtureDir, "TEMPLATE.md"), "hi\n");
    const tempRoot = await makeTempDir();

    await copyCaseFixture(caseDir, tempRoot);

    const copied = await readdir(path.join(tempRoot, ".jastr", "demo"));
    expect(copied).toEqual(["TEMPLATE.md"]);
  });

  it("expands substitution tokens in copied fixture text files without following symlinks", async () => {
    const tempRoot = await makeTempDir();
    const outsideRoot = await makeTempDir();
    const fixtureDir = path.join(tempRoot, ".jastr", "demo");
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(
      path.join(fixtureDir, "TEMPLATE.md"),
      '::include{path="__PROJECT_ROOT__/.jastr/demo/fragment.md"}\n',
    );
    await writeFile(path.join(outsideRoot, "outside.md"), "__PROJECT_ROOT__\n");
    await symlink(
      path.join(outsideRoot, "outside.md"),
      path.join(fixtureDir, "leak.md"),
    );

    await expandFixturePlaceholders(
      tempRoot,
      new Map([["__PROJECT_ROOT__", tempRoot]]),
    );

    await expect(
      readFile(path.join(fixtureDir, "TEMPLATE.md"), "utf8"),
    ).resolves.toBe(`::include{path="${tempRoot}/.jastr/demo/fragment.md"}\n`);
    await expect(
      readFile(path.join(fixtureDir, "leak.md"), "utf8"),
    ).resolves.toBe("__PROJECT_ROOT__\n");
  });

  it("treats an absent fixture/ folder as an empty workspace", async () => {
    const caseDir = await makeTempDir(); // intentionally no fixture/ subdir
    const tempRoot = await makeTempDir();

    await expect(copyCaseFixture(caseDir, tempRoot)).resolves.toBeUndefined();
    expect(await readdir(tempRoot)).toEqual([]);
  });
});

describe("copyCaseGlobalFixture", () => {
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

  it("copies a global-fixture/ into the per-case global base", async () => {
    const caseDir = await makeTempDir();
    const fixtureDir = path.join(caseDir, "global-fixture", ".jastr", "demo");
    await mkdir(fixtureDir, { recursive: true });
    await writeFile(path.join(fixtureDir, "TEMPLATE.md"), "global hi\n");
    const globalBase = await makeTempDir();

    await copyCaseGlobalFixture(caseDir, globalBase);

    const copied = await readdir(path.join(globalBase, ".jastr", "demo"));
    expect(copied).toEqual(["TEMPLATE.md"]);
  });

  it("treats an absent global-fixture/ folder as an empty global base", async () => {
    const caseDir = await makeTempDir(); // intentionally no global-fixture/ subdir
    const globalBase = await makeTempDir();

    await expect(
      copyCaseGlobalFixture(caseDir, globalBase),
    ).resolves.toBeUndefined();
    expect(await readdir(globalBase)).toEqual([]);
  });
});

describe("runSetupSteps", () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "jastr-setup-"));
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

  // A stand-in for the bundled CLI entrypoint: a tiny script run via `bun`. It
  // appends its argv to `marker.log` in the cwd, then exits with the code named
  // by its first argument so a test can drive both success and failure.
  async function writeFakeCli(dir: string): Promise<string> {
    const cliPath = path.join(dir, "fake-cli.mjs");
    await writeFile(
      cliPath,
      [
        "import { appendFileSync } from 'node:fs';",
        "const argv = process.argv.slice(2);",
        "appendFileSync('marker.log', argv.join(' ') + '\\n');",
        "process.exit(Number(argv[0]) || 0);",
        "",
      ].join("\n"),
    );
    return cliPath;
  }

  it("runs cli and cp setup steps in order, sharing cwd and env", async () => {
    const projectRoot = await makeTempDir();
    const caseDir = await makeTempDir();
    const scriptDir = await makeTempDir();
    const cliPath = await writeFakeCli(scriptDir);

    // The cp step's source file lives under the case dir; its destination is a
    // (not-yet-existing) nested path under the project root.
    await mkdir(path.join(caseDir, "mutated"), { recursive: true });
    await writeFile(
      path.join(caseDir, "mutated", "TEMPLATE.md"),
      "mutated body\n",
    );

    await runSetupSteps(
      [
        { cli: ["0", "add", "./src", "demo"] },
        { cp: { from: "mutated/TEMPLATE.md", to: ".jastr/demo/TEMPLATE.md" } },
      ],
      {
        caseDir,
        projectRoot,
        cwd: projectRoot,
        cliPath,
        env: { ...process.env },
        label: "[setup-ok]",
      },
    );

    // The cli step ran from the project cwd and recorded its argv there.
    await expect(
      readFile(path.join(projectRoot, "marker.log"), "utf8"),
    ).resolves.toBe("0 add ./src demo\n");
    // The cp step copied the fixture, creating the missing parent directory.
    await expect(
      readFile(path.join(projectRoot, ".jastr", "demo", "TEMPLATE.md"), "utf8"),
    ).resolves.toBe("mutated body\n");
  });

  it("fails loudly when a cli setup step exits non-zero", async () => {
    const projectRoot = await makeTempDir();
    const caseDir = await makeTempDir();
    const scriptDir = await makeTempDir();
    const cliPath = await writeFakeCli(scriptDir);

    await expect(
      runSetupSteps([{ cli: ["7", "boom"] }], {
        caseDir,
        projectRoot,
        cwd: projectRoot,
        cliPath,
        env: { ...process.env },
        label: "[setup-fail]",
      }),
    ).rejects.toThrow(/setup\[0\] cli step failed \(exit 7\)/);
  });

  it("does nothing for an empty setup list", async () => {
    const projectRoot = await makeTempDir();
    const caseDir = await makeTempDir();

    await expect(
      runSetupSteps([], {
        caseDir,
        projectRoot,
        cwd: projectRoot,
        cliPath: path.join(caseDir, "unused.mjs"),
        env: { ...process.env },
        label: "[setup-empty]",
      }),
    ).resolves.toBeUndefined();
    expect(await readdir(projectRoot)).toEqual([]);
  });
});

describe("fake-git shim", () => {
  const tempDirs: string[] = [];

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(tmpdir(), "jastr-fakegit-"));
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

  function runShim(
    args: string[],
    cwd: string,
    env: Record<string, string> = {},
  ) {
    return execa(FAKE_GIT, args, {
      cwd,
      env: { ...process.env, ...env },
      reject: false,
      stripFinalNewline: false,
    });
  }

  it("answers --version (isAvailable) with exit 0", async () => {
    const cwd = await makeTempDir();
    const result = await runShim(["--version"], cwd);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("git version");
  });

  it("simulates clone by copying FAKE_GIT_SOURCE and records the argv", async () => {
    const cwd = await makeTempDir();
    const source = await makeTempDir();
    await mkdir(path.join(source, ".jastr", "demo"), { recursive: true });
    await writeFile(
      path.join(source, ".jastr", "demo", "TEMPLATE.md"),
      "cloned body\n",
    );
    const target = path.join(cwd, "clone-dest");

    const result = await runShim(
      ["clone", "--depth", "1", "--branch", "main", "--", "owner/repo", target],
      cwd,
      { FAKE_GIT_SOURCE: source },
    );

    expect(result.exitCode).toBe(0);
    await expect(
      readFile(path.join(target, ".jastr", "demo", "TEMPLATE.md"), "utf8"),
    ).resolves.toBe("cloned body\n");
    // The argv is recorded verbatim, so a case can assert `--` placement.
    const recorded = await readFile(path.join(cwd, ".fake-git-argv"), "utf8");
    expect(JSON.parse(recorded.trim())).toEqual([
      "clone",
      "--depth",
      "1",
      "--branch",
      "main",
      "--",
      "owner/repo",
      target,
    ]);
  });

  it("answers rev-parse HEAD and status --porcelain", async () => {
    const cwd = await makeTempDir();

    const head = await runShim(["-C", cwd, "rev-parse", "HEAD"], cwd, {
      FAKE_GIT_COMMIT: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
    });
    expect(head.exitCode).toBe(0);
    expect(head.stdout.trim()).toBe("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef");

    const clean = await runShim(["-C", cwd, "status", "--porcelain"], cwd);
    expect(clean.exitCode).toBe(0);
    expect(clean.stdout).toBe("");

    const dirty = await runShim(["-C", cwd, "status", "--porcelain"], cwd, {
      FAKE_GIT_DIRTY: " M file",
    });
    expect(dirty.exitCode).toBe(0);
    expect(dirty.stdout.trim()).toBe("M file");
  });

  it("fails the clone with stderr when FAKE_GIT_FAIL is set", async () => {
    const cwd = await makeTempDir();
    const result = await runShim(
      ["clone", "--depth", "1", "--", "bogus", path.join(cwd, "x")],
      cwd,
      { FAKE_GIT_FAIL: "1", FAKE_GIT_STDERR: "fatal: simulated clone failure" },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("fatal: simulated clone failure");
  });
});
