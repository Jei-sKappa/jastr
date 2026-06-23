import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { type IncludeResolver, JastrError } from "@jastr/engine";
import { displayPath } from "./display";
import type { LoadedTemplateReference } from "./template-ref";

type IncludeRoot = "template" | "group" | "file";

export function createFileIncludeResolver(
  template: LoadedTemplateReference,
): IncludeResolver {
  return async (request) => {
    const root = normalizeIncludeRoot(request.root);
    const startDirectory = selectStartDirectory({
      root,
      from: request.from,
      template,
    });
    const resolved = await resolveIncludePath({
      includePath: request.path,
      startDirectory,
      boundary: template.includeContext.boundary,
    });

    try {
      return {
        id: displayPath(template, resolved),
        source: await readFile(resolved, "utf8"),
      };
    } catch (error) {
      throw includeReadFailure(request.path, error);
    }
  };
}

function normalizeIncludeRoot(root: string | undefined): IncludeRoot {
  if (root === undefined || root === "template") return "template";
  if (root === "group" || root === "file") return root;

  throw new JastrError(
    "invalid_include_root",
    `Include root ${root} must be template, group, or file.`,
    { root },
  );
}

function selectStartDirectory(options: {
  root: IncludeRoot;
  from: string;
  template: LoadedTemplateReference;
}): string {
  if (options.root === "template") {
    return options.template.includeContext.templateRoot;
  }

  if (options.root === "group") {
    if (options.template.includeContext.kind !== "grouped") {
      throw new JastrError(
        "include_group_missing",
        "Include root group requires the template to be inside a .jastrgroup.",
      );
    }
    return options.template.includeContext.groupRoot;
  }

  return path.dirname(
    sourceIdToAbsolutePath(options.template.cwd, options.from),
  );
}

async function resolveIncludePath(options: {
  includePath: string;
  startDirectory: string;
  boundary: string;
}): Promise<string> {
  const candidate = path.resolve(options.startDirectory, options.includePath);
  let resolved: string;

  try {
    resolved = await realpath(candidate);
  } catch (error) {
    throw includeReadFailure(options.includePath, error);
  }

  if (!isInsideBoundary(resolved, options.boundary)) {
    throw new JastrError(
      "include_outside_root",
      `Include path ${options.includePath} escapes the allowed include boundary.`,
      { includePath: options.includePath },
    );
  }

  return resolved;
}

function isInsideBoundary(candidate: string, boundary: string): boolean {
  const relative = path.relative(boundary, candidate);
  return (
    relative === "" ||
    (relative !== ".." &&
      !relative.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relative))
  );
}

function sourceIdToAbsolutePath(cwd: string, sourceId: string): string {
  return path.isAbsolute(sourceId) ? sourceId : path.resolve(cwd, sourceId);
}

function includeReadFailure(includePath: string, error: unknown): JastrError {
  const code = getFilesystemErrorCode(error);
  if (code === "ENOENT") {
    return new JastrError(
      "include_not_found",
      `Include file ${includePath} was not found.`,
      { includePath },
    );
  }

  return new JastrError(
    "include_read_error",
    `Include file ${includePath} could not be read: ${code ?? "unknown"}.`,
    { includePath, cause: code ?? "unknown" },
  );
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
