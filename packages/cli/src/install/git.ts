import { type SpawnOptions, spawn } from "node:child_process";
import { JastrError } from "@jastr/engine";
import { quote } from "../quote";

/**
 * Options for a single shallow clone.
 *
 * `ref` (a branch or tag) is sent verbatim to `--branch`. A commit SHA passed
 * here is not detected: git's `--branch` rejects it, surfacing as `clone_failed`
 * rather than a silent default-branch fallback.
 */
export type CloneOptions = {
  url: string;
  dir: string;
  ref?: string;
};

/**
 * The single seam every `git` invocation runs through. Command modules accept a
 * `GitRunner` (defaulting to `createGitRunner()`) so tests can inject a fake.
 */
export type GitRunner = {
  clone(opts: CloneOptions): Promise<void>;
  revParseHead(dir: string): Promise<string>;
  isAvailable(): Promise<boolean>;
};

/**
 * Default clone timeout in milliseconds (2 minutes). Overridable for tests and
 * non-default environments via `JASTR_GIT_TIMEOUT_MS`.
 */
const DEFAULT_CLONE_TIMEOUT_MS = 120_000;

/**
 * Build the clone argv. `--` precedes every positional (URL, dir) so a hostile
 * `url`/`dir`/`ref` value can never be read as a git option (option-injection
 * guard).
 */
export function buildCloneArgs(opts: CloneOptions): string[] {
  const { url, dir, ref } = opts;
  return [
    "clone",
    "--depth",
    "1",
    ...(ref ? ["--branch", ref] : []),
    "--",
    url,
    dir,
  ];
}

/** Resolve the git binary, honoring the documented `JASTR_GIT_BIN` test seam. */
function gitBin(): string {
  return process.env.JASTR_GIT_BIN ?? "git";
}

/** The bounded clone timeout, honoring the `JASTR_GIT_TIMEOUT_MS` override. */
function cloneTimeoutMs(): number {
  const override = process.env.JASTR_GIT_TIMEOUT_MS;
  if (override !== undefined) {
    const parsed = Number.parseInt(override.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_CLONE_TIMEOUT_MS;
}

/**
 * Environment that makes git fully non-interactive: no terminal, credential, or
 * SSH prompting can hang the process, and LFS smudge is disabled (pinned) so a
 * shallow clone never fetches LFS blobs.
 */
function nonInteractiveEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_ASKPASS: "true",
    SSH_ASKPASS: "true",
    GIT_SSH_COMMAND: "ssh -oBatchMode=yes",
    GCM_INTERACTIVE: "Never",
    GIT_LFS_SKIP_SMUDGE: "1",
  };
}

/**
 * SIGKILL a spawned (detached) child and its whole process group. Killing the
 * group reaps grandchildren that inherited the stdio pipes; falling back to the
 * lone pid covers the rare case where group kill is unavailable.
 */
function killTree(pid: number | undefined): void {
  if (pid === undefined) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already exited; nothing to kill.
    }
  }
}

type SpawnResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

type RunGitOptions = {
  args: string[];
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
};

/**
 * Spawn git once and collect its output. On `ENOENT` (binary missing) rejects
 * with `git_unavailable`; on a timeout the child is killed and the rejection is
 * tagged so the caller can map it to `clone_failed` with a deterministic
 * message. All other spawn errors reject with `git_unavailable` (the binary
 * could not be run).
 */
function runGit(opts: RunGitOptions): Promise<SpawnResult> {
  const { args, env, timeoutMs } = opts;
  const spawnOptions: SpawnOptions = {
    env: env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
    // Run as a process-group leader so a timeout can SIGKILL the whole group,
    // reaping any grandchild (e.g. a credential helper or SSH) that would
    // otherwise keep the inherited stdio pipes open and prevent `close`.
    detached: true,
  };

  return new Promise<SpawnResult>((resolve, reject) => {
    const child = spawn(gitBin(), args, spawnOptions);

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let timer: NodeJS.Timeout | undefined;

    if (timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true;
        killTree(child.pid);
      }, timeoutMs);
    }

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer);
      if (error.code === "ENOENT") {
        reject(
          new JastrError(
            "git_unavailable",
            `git is not available (could not run ${quote(gitBin())}).`,
          ),
        );
        return;
      }
      reject(
        new JastrError(
          "git_unavailable",
          `git could not be run: ${error.message}`,
        ),
      );
    });

    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        reject(
          new JastrError(
            "clone_failed",
            `git clone timed out after ${timeoutMs}ms and was terminated.`,
          ),
        );
        return;
      }
      resolve({ code, stdout, stderr });
    });
  });
}

async function clone(opts: CloneOptions): Promise<void> {
  const args = buildCloneArgs(opts);
  const result = await runGit({
    args,
    env: nonInteractiveEnv(),
    timeoutMs: cloneTimeoutMs(),
  });

  if (result.code !== 0) {
    const detail = result.stderr.trim();
    const suffix = detail.length > 0 ? `\n${detail}` : "";
    throw new JastrError(
      "clone_failed",
      `git clone failed for ${quote(opts.url)} (exit ${result.code}).${suffix}`,
    );
  }
}

async function revParseHead(dir: string): Promise<string> {
  const result = await runGit({ args: ["-C", dir, "rev-parse", "HEAD"] });
  if (result.code !== 0) {
    const detail = result.stderr.trim();
    const suffix = detail.length > 0 ? `\n${detail}` : "";
    throw new JastrError(
      "clone_failed",
      `git rev-parse HEAD failed in ${quote(dir)} (exit ${result.code}).${suffix}`,
    );
  }
  return result.stdout.trim();
}

async function isAvailable(): Promise<boolean> {
  try {
    const result = await runGit({ args: ["--version"] });
    return result.code === 0;
  } catch {
    return false;
  }
}

/** Construct the real `GitRunner` backed by `node:child_process` + the `git` binary. */
export function createGitRunner(): GitRunner {
  return { clone, revParseHead, isAvailable };
}
