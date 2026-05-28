import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execa } from "execa";

export type TempProject = {
  root: string;
  cleanup: () => Promise<void>;
};

export async function createTempProject(): Promise<TempProject> {
  const root = await mkdtemp(path.join(tmpdir(), "skillrouter-"));
  await mkdir(path.join(root, ".skillrouter"), { recursive: true });
  return {
    root,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

export async function writeProjectFile(
  projectRoot: string,
  relativePath: string,
  contents: string,
): Promise<void> {
  const absolutePath = path.join(projectRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, "utf8");
}

export async function readProjectFile(
  projectRoot: string,
  relativePath: string,
): Promise<string> {
  return readFile(path.join(projectRoot, relativePath), "utf8");
}

export async function runCli(args: string[], cwd: string) {
  const cliPath = path.resolve(
    import.meta.dirname,
    "../..",
    "src/cli/index.ts",
  );
  return execa("bun", [cliPath, ...args], {
    cwd,
    reject: false,
  });
}
