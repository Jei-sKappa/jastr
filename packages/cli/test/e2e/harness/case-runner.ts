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
  SubstitutionValue,
} from "./case-manifest";
import { loadPackageVersion } from "./requirements";

type Side = "fixture" | "expected";
type ResolveCtx = { projectRoot: string; repoRoot: string };

// The runner owns how each built-in substitution name resolves to a runtime
// value and which side it applies to: `projectRoot` is injected into copied
// fixture files; `jastrCliVersion` is injected into expected output. A case's
// `substitute` map only binds author-chosen tokens to these names.
const SUBSTITUTIONS: Record<
  SubstitutionValue,
  { side: Side; resolve: (ctx: ResolveCtx) => string | Promise<string> }
> = {
  projectRoot: { side: "fixture", resolve: (ctx) => ctx.projectRoot },
  jastrCliVersion: {
    side: "expected",
    resolve: (ctx) => loadPackageVersion(ctx.repoRoot),
  },
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

async function createTempProject(): Promise<{
  root: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "jastr-e2e-"));
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export async function copyCaseFixture(
  caseDir: string,
  tempRoot: string,
): Promise<void> {
  const source = path.join(caseDir, "fixture");
  // A case's `fixture/` folder holds the files that exist when the CLI runs;
  // its *contents* are copied to `tempRoot`, so `tempRoot` becomes the project
  // root the command sees. Some cases intentionally have an *empty* workspace —
  // `missing-project-root`, for instance, asserts the "no .jastr/ directory"
  // error and so must run somewhere that contains nothing. Git cannot track an
  // empty directory, so on a fresh clone that case ships with no `fixture/`
  // folder at all (only `case.yml`). Treat an absent fixture as an empty
  // workspace: `tempRoot` was just created by `mkdtemp`, so an empty workspace
  // is exactly what we want. Without this guard, `cp` throws ENOENT on a clean
  // checkout and the case fails before the CLI is ever invoked. (An
  // empty-but-present `fixture/` dir, as may linger locally, copies to the same
  // empty result.)
  try {
    await cp(source, tempRoot, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
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

export async function runCase(
  repoRoot: string,
  testCase: LoadedCase,
): Promise<void> {
  const temp = await createTempProject();
  try {
    await copyCaseFixture(testCase.dirPath, temp.root);
    const projectRoot = await realpath(temp.root);

    // Resolve the case's declared substitutions, routing each to the side its
    // built-in name applies to. Fixture-side tokens are rewritten in the copied
    // files before the CLI runs; expected-side tokens are rewritten in the
    // expected output before comparison.
    const fixtureReplacements = new Map<string, string>();
    const expectedReplacements = new Map<string, string>();
    for (const [token, name] of Object.entries(testCase.manifest.substitute)) {
      const spec = SUBSTITUTIONS[name];
      const value = await spec.resolve({ projectRoot, repoRoot });
      (spec.side === "fixture"
        ? fixtureReplacements
        : expectedReplacements
      ).set(token, value);
    }
    if (fixtureReplacements.size > 0) {
      await expandFixturePlaceholders(projectRoot, fixtureReplacements);
    }

    const cwd = await resolveCwd(
      projectRoot,
      testCase.manifest.cwd,
      testCase.manifest,
    );
    const cliPath = path.resolve(repoRoot, "src/index.ts");
    const result = await execa("bun", [cliPath, ...testCase.manifest.command], {
      cwd,
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
    expect(result.stdout, context(testCase.manifest, "stdout")).toBe(
      expandExpected(stdout, expectedReplacements),
    );
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
  }
}
