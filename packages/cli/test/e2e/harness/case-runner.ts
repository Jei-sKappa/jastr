import {
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execa } from "execa";
import { expect } from "vitest";
import type {
  CaseManifest,
  LoadedCase,
  SetupStep,
  SubstitutionValue,
} from "./case-manifest";
import { loadPackageVersion } from "./requirements";

type Side = "fixture" | "expected";
type ResolveCtx = { projectRoot: string; globalRoot: string; repoRoot: string };

// The runner owns how each built-in substitution name resolves to a runtime
// value and which side it applies to: `projectRoot` is injected into copied
// fixture files; `jastrCliVersion` and `globalRoot` are injected into expected
// output. A case's `substitute` map only binds author-chosen tokens to these
// names. `globalRoot` is the realpath of the per-case global base (which the
// runner also points `JASTR_HOME` at), so a case asserting a global absolute
// path stays machine-independent.
const SUBSTITUTIONS: Record<
  SubstitutionValue,
  { side: Side; resolve: (ctx: ResolveCtx) => string | Promise<string> }
> = {
  projectRoot: { side: "fixture", resolve: (ctx) => ctx.projectRoot },
  jastrCliVersion: {
    side: "expected",
    resolve: (ctx) => loadPackageVersion(ctx.repoRoot),
  },
  globalRoot: { side: "expected", resolve: (ctx) => ctx.globalRoot },
};

function context(testCase: CaseManifest, field: string): string {
  return `[${testCase.id}] covers ${testCase.covers.join(", ")} ${field}`;
}

async function readExpectedText(
  testCase: LoadedCase,
  inline: string | undefined,
  file: string | undefined,
): Promise<string> {
  if (inline !== undefined) return inline;
  if (file === undefined) return "";
  return readFile(path.join(testCase.dirPath, file), "utf8");
}

function expandExpected(
  value: string,
  replacements: ReadonlyMap<string, string>,
): string {
  let result = value;
  for (const [token, replacement] of replacements) {
    result = result.replaceAll(token, replacement);
  }
  return result;
}

async function createTempDir(): Promise<{
  root: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "jastr-e2e-"));
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function copyCaseDir(
  caseDir: string,
  subdir: string,
  tempRoot: string,
): Promise<void> {
  const source = path.join(caseDir, subdir);
  // A case's source folder holds the files that exist when the CLI runs; its
  // *contents* are copied to `tempRoot`, so `tempRoot` becomes the root the
  // command sees. Some cases intentionally have an *empty* workspace —
  // `missing-project-root`, for instance, asserts the "no .jastr/ directory"
  // error and so must run somewhere that contains nothing. Git cannot track an
  // empty directory, so on a fresh clone that case ships with no source folder
  // at all (only `case.yml`). Treat an absent source as an empty workspace:
  // `tempRoot` was just created by `mkdtemp`, so an empty workspace is exactly
  // what we want. Without this guard, `cp` throws ENOENT on a clean checkout
  // and the case fails before the CLI is ever invoked. (An empty-but-present
  // source dir, as may linger locally, copies to the same empty result.)
  try {
    await cp(source, tempRoot, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function copyCaseFixture(
  caseDir: string,
  tempRoot: string,
): Promise<void> {
  // The `fixture/` contents populate the project root the command sees.
  await copyCaseDir(caseDir, "fixture", tempRoot);
}

export async function copyCaseGlobalFixture(
  caseDir: string,
  tempRoot: string,
): Promise<void> {
  // The optional `global-fixture/` contents populate the per-case global base
  // (pointed at by `JASTR_HOME`), mirroring how `fixture/` populates the
  // project root. An absent `global-fixture/` yields an empty global base, so
  // the case sees no global root.
  await copyCaseDir(caseDir, "global-fixture", tempRoot);
}

export async function expandFixturePlaceholders(
  root: string,
  replacements: ReadonlyMap<string, string>,
): Promise<void> {
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await expandFixturePlaceholders(absolutePath, replacements);
      continue;
    }
    if (!entry.isFile()) continue;

    const original = await readFile(absolutePath, "utf8");
    let expanded = original;
    for (const [token, replacement] of replacements) {
      expanded = expanded.replaceAll(token, replacement);
    }
    if (expanded !== original) {
      await writeFile(absolutePath, expanded, "utf8");
    }
  }
}

async function resolveCwd(
  projectRoot: string,
  cwd: string,
  testCase: CaseManifest,
): Promise<string> {
  const realRoot = await realpath(projectRoot);
  const absoluteCwd = path.resolve(realRoot, cwd);
  const relative = path.relative(realRoot, absoluteCwd);
  if (relative === "") return realRoot;
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${context(testCase, "cwd")} escapes temp project`);
  }
  await mkdir(absoluteCwd, { recursive: true });
  return absoluteCwd;
}

type SetupContext = {
  /** The case directory (source of `cp:` `from` paths). */
  caseDir: string;
  /** The temp project root (target of `cp:` `to` paths). */
  projectRoot: string;
  /** The cwd the CLI runs from (same as the main command). */
  cwd: string;
  /** The bundled CLI entrypoint argv[0]. */
  cliPath: string;
  /** The subprocess environment (already includes `JASTR_HOME` + case `env`). */
  env: NodeJS.ProcessEnv;
  /** Label prefix for assertion/error context. */
  label: string;
};

/**
 * Run the case's `setup` pre-steps in order, before the main `command`. A `cli:`
 * step runs the jastr CLI through the same bundled entrypoint, cwd, and
 * environment as the main command — a non-zero exit fails the case loudly so a
 * broken setup never silently masquerades as the behavior under test. A `cp:`
 * step copies a case-relative fixture path onto a root-relative destination in
 * the temp tree (creating parent directories), the primitive that mutates a
 * recorded source or installed unit between, say, an `add` and an `update`.
 */
export async function runSetupSteps(
  steps: readonly SetupStep[],
  ctx: SetupContext,
): Promise<void> {
  for (const [index, step] of steps.entries()) {
    if ("cli" in step) {
      const result = await execa("bun", [ctx.cliPath, ...step.cli], {
        cwd: ctx.cwd,
        env: ctx.env,
        reject: false,
        stripFinalNewline: false,
      });
      if (result.exitCode !== 0) {
        throw new Error(
          `${ctx.label} setup[${index}] cli step failed (exit ${result.exitCode}): ` +
            `jastr ${step.cli.join(" ")}\n${result.stderr}`,
        );
      }
    } else {
      const from = path.join(ctx.caseDir, step.cp.from);
      const to = path.join(ctx.projectRoot, step.cp.to);
      await mkdir(path.dirname(to), { recursive: true });
      await cp(from, to, { recursive: true });
    }
  }
}

export async function runCase(
  repoRoot: string,
  testCase: LoadedCase,
): Promise<void> {
  const temp = await createTempDir();
  // A second temp dir is the per-case global base. `JASTR_HOME` always points
  // here so the CLI never reads the developer's real ~/.jastr: a case with no
  // `global-fixture/` gets an empty base (no `.jastr` → no global root), while a
  // `global-fixture/` populates the case's global root deterministically.
  const globalTemp = await createTempDir();
  try {
    await copyCaseFixture(testCase.dirPath, temp.root);
    await copyCaseGlobalFixture(testCase.dirPath, globalTemp.root);
    const projectRoot = await realpath(temp.root);
    // Realpath the global base and point `JASTR_HOME` at the same realpath so
    // CLI output (the `missing_project_root` message and global absolute paths)
    // matches the `globalRoot` substitution token exactly, even where /var is a
    // symlink to /private/var (macOS).
    const globalRoot = await realpath(globalTemp.root);

    // Resolve the case's declared substitutions, routing each to the side its
    // built-in name applies to. Fixture-side tokens are rewritten in the copied
    // files before the CLI runs; expected-side tokens are rewritten in the
    // expected output before comparison.
    const fixtureReplacements = new Map<string, string>();
    const expectedReplacements = new Map<string, string>();
    for (const [token, name] of Object.entries(testCase.manifest.substitute)) {
      const spec = SUBSTITUTIONS[name];
      const value = await spec.resolve({ projectRoot, globalRoot, repoRoot });
      (spec.side === "fixture"
        ? fixtureReplacements
        : expectedReplacements
      ).set(token, value);
    }
    if (fixtureReplacements.size > 0) {
      // Expand fixture-side tokens in the project root and the global base
      // alike, so an absolute path baked into a global fixture resolves too.
      await expandFixturePlaceholders(projectRoot, fixtureReplacements);
      await expandFixturePlaceholders(globalRoot, fixtureReplacements);
    }

    const cwd = await resolveCwd(
      projectRoot,
      testCase.manifest.cwd,
      testCase.manifest,
    );
    const cliPath = path.resolve(repoRoot, "src/index.ts");
    // The CLI subprocess always sees `JASTR_HOME` (global-base hermeticity); a
    // case's `env` map is merged after it, so a case can add (or override) extra
    // environment such as `JASTR_GIT_BIN` pointing at the fake-git shim.
    const env: NodeJS.ProcessEnv = {
      JASTR_HOME: globalRoot,
      ...testCase.manifest.env,
    };

    // Run any `setup` pre-steps (in order) after fixture/substitute expansion and
    // before the main command, sharing the same cwd and environment.
    await runSetupSteps(testCase.manifest.setup, {
      caseDir: testCase.dirPath,
      projectRoot,
      cwd,
      cliPath,
      env,
      label: `[${testCase.manifest.id}]`,
    });

    const result = await execa("bun", [cliPath, ...testCase.manifest.command], {
      cwd,
      env,
      reject: false,
      stripFinalNewline: false,
    });

    const stdout = await readExpectedText(
      testCase,
      testCase.manifest.expect.stdout,
      testCase.manifest.expect.stdoutFile,
    );
    const stderr = await readExpectedText(
      testCase,
      testCase.manifest.expect.stderr,
      testCase.manifest.expect.stderrFile,
    );

    expect(result.exitCode, context(testCase.manifest, "exitCode")).toBe(
      testCase.manifest.expect.exitCode,
    );
    if (
      testCase.manifest.expect.stdout !== undefined ||
      testCase.manifest.expect.stdoutFile !== undefined
    ) {
      expect(result.stdout, context(testCase.manifest, "stdout")).toBe(
        expandExpected(stdout, expectedReplacements),
      );
    }
    for (const substring of testCase.manifest.expect.stdoutContains ?? []) {
      expect(
        result.stdout.includes(expandExpected(substring, expectedReplacements)),
        context(testCase.manifest, `stdoutContains.${substring}`),
      ).toBe(true);
    }
    expect(result.stderr, context(testCase.manifest, "stderr")).toBe(
      expandExpected(stderr, expectedReplacements),
    );

    if (testCase.manifest.expect.files !== undefined) {
      for (const [actualPath, expectedPath] of Object.entries(
        testCase.manifest.expect.files,
      )) {
        const actual = await readFile(
          path.join(projectRoot, actualPath),
          "utf8",
        );
        const expected = await readFile(
          path.join(testCase.dirPath, expectedPath),
          "utf8",
        );
        expect(actual, context(testCase.manifest, `files.${actualPath}`)).toBe(
          expandExpected(expected, expectedReplacements),
        );
      }
    }

    if (testCase.manifest.expect.fileContains !== undefined) {
      for (const [actualPath, substrings] of Object.entries(
        testCase.manifest.expect.fileContains,
      )) {
        const actual = await readFile(
          path.join(projectRoot, actualPath),
          "utf8",
        );
        for (const substring of substrings) {
          expect(
            actual.includes(expandExpected(substring, expectedReplacements)),
            context(testCase.manifest, `fileContains.${actualPath}`),
          ).toBe(true);
        }
      }
    }

    if (testCase.manifest.expect.fileNotContains !== undefined) {
      for (const [actualPath, substrings] of Object.entries(
        testCase.manifest.expect.fileNotContains,
      )) {
        const actual = await readFile(
          path.join(projectRoot, actualPath),
          "utf8",
        );
        for (const substring of substrings) {
          expect(
            actual.includes(expandExpected(substring, expectedReplacements)),
            context(testCase.manifest, `fileNotContains.${actualPath}`),
          ).toBe(false);
        }
      }
    }
  } finally {
    await temp.cleanup();
    await globalTemp.cleanup();
  }
}
