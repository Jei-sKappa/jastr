import { readFile } from "node:fs/promises";
import path from "node:path";
import { type IncludeResolver, JastrError } from "@jastr/engine";
import type { LoadedTemplateReference } from "./template-ref";

export function createFileIncludeResolver(
  template: LoadedTemplateReference,
): IncludeResolver {
  return async (request) => {
    const resolved = resolveIncludePath({
      includePath: request.path,
      from: request.from,
      cwd: template.cwd,
      includeRoot: template.includeRoot,
      includeRootLabel: template.includeRootLabel,
    });

    try {
      return {
        id: path.relative(template.cwd, resolved),
        source: await readFile(resolved, "utf8"),
      };
    } catch (error) {
      const code = getFilesystemErrorCode(error);
      if (code === "ENOENT") {
        throw new JastrError(
          "include_not_found",
          `Include file ${request.path} was not found.`,
          { includePath: request.path },
        );
      }

      throw new JastrError(
        "include_read_error",
        `Include file ${request.path} could not be read: ${code ?? "unknown"}.`,
        { includePath: request.path, cause: code ?? "unknown" },
      );
    }
  };
}

function resolveIncludePath(options: {
  includePath: string;
  from: string;
  cwd: string;
  includeRoot: string;
  includeRootLabel: "project root" | "template directory";
}): string {
  const { includePath } = options;

  if (path.isAbsolute(includePath) || includePath.startsWith("~")) {
    throw new JastrError(
      "include_path_rejected",
      `Include path ${includePath} must be relative.`,
      { includePath },
    );
  }

  if (
    includePath === "" ||
    includePath === ".env" ||
    includePath.startsWith(".env.")
  ) {
    throw new JastrError(
      "include_path_rejected",
      `Include path ${includePath} is rejected.`,
      { includePath },
    );
  }

  const fromAbsolute = path.resolve(options.cwd, options.from);
  const resolved = path.normalize(
    path.resolve(path.dirname(fromAbsolute), includePath),
  );
  const relativeToRoot = path.relative(options.includeRoot, resolved);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new JastrError(
      "include_outside_root",
      `Include path ${includePath} escapes the ${options.includeRootLabel}.`,
      { includePath },
    );
  }

  const basename = path.basename(resolved);
  if (basename === ".env" || basename.startsWith(".env.")) {
    throw new JastrError(
      "include_path_rejected",
      `Include path ${includePath} is rejected.`,
      { includePath },
    );
  }

  return resolved;
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
