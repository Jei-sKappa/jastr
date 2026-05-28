import { cp, mkdir, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execa } from "execa";
import { expect } from "vitest";
import type { CaseManifest, LoadedCase } from "./case-manifest";
import { loadPackageVersion } from "./requirements";

type PlaceholderValues = {
  projectRoot: string;
  cwd: string;
  version: string;
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
  placeholders: PlaceholderValues,
): string {
  return value
    .replaceAll("{{projectRoot}}", placeholders.projectRoot)
    .replaceAll("{{cwd}}", placeholders.cwd)
    .replaceAll("{{version}}", placeholders.version);
}

async function createTempProject(): Promise<{
  root: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "skillrouter-e2e-"));
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

async function copyProjectFixture(
  testCase: LoadedCase,
  tempRoot: string,
): Promise<void> {
  const source = path.join(testCase.dirPath, "project");
  await cp(source, tempRoot, { recursive: true });
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
    await copyProjectFixture(testCase, temp.root);
    const cwd = await resolveCwd(
      temp.root,
      testCase.manifest.cwd,
      testCase.manifest,
    );
    const projectRoot = await realpath(temp.root);
    const version = await loadPackageVersion(repoRoot);
    const placeholders = { projectRoot, cwd, version };
    const cliPath = path.resolve(repoRoot, "src/cli/index.ts");
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
      expandExpected(stdout, placeholders),
    );
    expect(result.stderr, context(testCase.manifest, "stderr")).toBe(
      expandExpected(stderr, placeholders),
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
          expandExpected(expected, placeholders),
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
            actual.includes(expandExpected(substring, placeholders)),
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
            actual.includes(expandExpected(substring, placeholders)),
            context(testCase.manifest, `fileNotContains.${actualPath}`),
          ).toBe(false);
        }
      }
    }
  } finally {
    await temp.cleanup();
  }
}
