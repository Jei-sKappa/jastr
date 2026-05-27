import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execa } from "execa";
import { expect } from "vitest";
import {
  expandPlaceholders,
  type ExampleManifest,
  type LoadedExample,
} from "./example-manifest";

async function readExpectedText(
  example: LoadedExample,
  inline: string | undefined,
  file: string | undefined,
): Promise<string> {
  if (inline !== undefined) return inline;
  if (file === undefined) return "";
  return readFile(path.join(example.dirPath, file), "utf8");
}

async function createTempProject(): Promise<{
  root: string;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(path.join(tmpdir(), "skillrouter-docs-"));
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

function context(example: ExampleManifest, field: string): string {
  return `[${example.id}] ${field}`;
}

async function resolveCwd(
  projectRoot: string,
  cwd: string,
  example: ExampleManifest,
): Promise<string> {
  const realRoot = await realpath(projectRoot);
  const absoluteCwd = path.resolve(realRoot, cwd);
  const relative = path.relative(realRoot, absoluteCwd);
  if (relative === "") return realRoot;
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${context(example, "cwd")} escapes temp project`);
  }
  await mkdir(absoluteCwd, { recursive: true });
  return absoluteCwd;
}

async function copyProjectFixture(
  example: LoadedExample,
  tempRoot: string,
): Promise<void> {
  const source = path.join(example.dirPath, "project");
  await cp(source, tempRoot, { recursive: true });
}

function expandExpected(
  value: string,
  projectRoot: string,
  cwd: string,
): string {
  return expandPlaceholders(value, { projectRoot, cwd });
}

export async function runExample(
  repoRoot: string,
  example: LoadedExample,
): Promise<void> {
  const temp = await createTempProject();
  try {
    await copyProjectFixture(example, temp.root);
    const cwd = await resolveCwd(temp.root, example.manifest.cwd, example.manifest);
    const projectRoot = await realpath(temp.root);
    const cliPath = path.resolve(repoRoot, "src/cli/index.ts");
    const result = await execa("bun", [cliPath, ...example.manifest.command], {
      cwd,
      reject: false,
      stripFinalNewline: false,
    });

    const stdout = await readExpectedText(
      example,
      example.manifest.expect.stdout,
      example.manifest.expect.stdoutFile,
    );
    const stderr = await readExpectedText(
      example,
      example.manifest.expect.stderr,
      example.manifest.expect.stderrFile,
    );

    expect(result.exitCode, context(example.manifest, "exitCode")).toBe(
      example.manifest.expect.exitCode,
    );
    expect(result.stdout, context(example.manifest, "stdout")).toBe(
      expandExpected(stdout, projectRoot, cwd),
    );
    expect(result.stderr, context(example.manifest, "stderr")).toBe(
      expandExpected(stderr, projectRoot, cwd),
    );

    if (example.manifest.expect.files !== undefined) {
      for (const [actualPath, expectedPath] of Object.entries(
        example.manifest.expect.files,
      )) {
        const actual = await readFile(path.join(projectRoot, actualPath), "utf8");
        const expected = await readFile(path.join(example.dirPath, expectedPath), "utf8");
        expect(actual, context(example.manifest, `files.${actualPath}`)).toBe(
          expandExpected(expected, projectRoot, cwd),
        );
      }
    }

    if (example.manifest.expect.fileContains !== undefined) {
      for (const [actualPath, substrings] of Object.entries(
        example.manifest.expect.fileContains,
      )) {
        const actual = await readFile(path.join(projectRoot, actualPath), "utf8");
        for (const substring of substrings) {
          expect(
            actual.includes(expandExpected(substring, projectRoot, cwd)),
            context(example.manifest, `fileContains.${actualPath}`),
          ).toBe(true);
        }
      }
    }

    if (example.manifest.expect.fileNotContains !== undefined) {
      for (const [actualPath, substrings] of Object.entries(
        example.manifest.expect.fileNotContains,
      )) {
        const actual = await readFile(path.join(projectRoot, actualPath), "utf8");
        for (const substring of substrings) {
          expect(
            actual.includes(expandExpected(substring, projectRoot, cwd)),
            context(example.manifest, `fileNotContains.${actualPath}`),
          ).toBe(false);
        }
      }
    }
  } finally {
    await temp.cleanup();
  }
}
