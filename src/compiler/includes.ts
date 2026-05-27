import { readFile } from "node:fs/promises";
import path from "node:path";
import { SkillrouterError } from "../errors";

export type IncludeFile = {
  path: string;
  contents: string;
};

export function resolveIncludePath(
  projectRoot: string,
  containingFilePath: string,
  includePath: string,
): string {
  if (path.isAbsolute(includePath) || includePath.startsWith("~")) {
    throw new SkillrouterError(
      "include_path_rejected",
      `Include path ${includePath} must be relative.`,
    );
  }

  if (includePath === ".env" || includePath.startsWith(".env.")) {
    throw new SkillrouterError(
      "include_path_rejected",
      `Include path ${includePath} is rejected.`,
    );
  }

  const resolved = path.normalize(
    path.resolve(path.dirname(containingFilePath), includePath),
  );
  const relativeToRoot = path.relative(projectRoot, resolved);

  // TODO: Consider resolving symlinks here; lexical containment can be bypassed
  // by a project-local symlink that points outside the project root.
  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new SkillrouterError(
      "include_outside_project",
      `Include path ${includePath} escapes the project root.`,
    );
  }

  const basename = path.basename(resolved);
  if (basename === ".env" || basename.startsWith(".env.")) {
    throw new SkillrouterError(
      "include_path_rejected",
      `Include path ${includePath} is rejected.`,
    );
  }

  return resolved;
}

export async function readIncludeFile(
  projectRoot: string,
  containingFilePath: string,
  includePath: string,
): Promise<IncludeFile> {
  const resolved = resolveIncludePath(
    projectRoot,
    containingFilePath,
    includePath,
  );

  try {
    return { path: resolved, contents: await readFile(resolved, "utf8") };
  } catch (error) {
    const code = getFilesystemErrorCode(error);
    if (code === "ENOENT") {
      throw new SkillrouterError(
        "include_not_found",
        `Include file ${includePath} was not found.`,
      );
    }

    throw new SkillrouterError(
      "include_error",
      `Include file ${includePath} could not be read: ${code ?? "unknown"}.`,
    );
  }
}

function getFilesystemErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return undefined;
}

export function detectIncludeCycle(stack: string[], nextPath: string): void {
  const existingIndex = stack.indexOf(nextPath);
  if (existingIndex === -1) {
    return;
  }

  const chain = [...stack.slice(existingIndex), nextPath]
    .map((entry) => path.basename(entry))
    .join(" -> ");
  throw new SkillrouterError(
    "include_cycle",
    `Include cycle detected: ${chain}.`,
  );
}
