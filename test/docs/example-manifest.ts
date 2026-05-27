import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

const EXAMPLE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const TOP_LEVEL_FIELDS = new Set([
  "id",
  "title",
  "description",
  "cwd",
  "command",
  "expect",
  "render",
  "hidden",
]);
const EXPECT_FIELDS = new Set([
  "exitCode",
  "stdout",
  "stdoutFile",
  "stderr",
  "stderrFile",
  "files",
  "fileContains",
  "fileNotContains",
]);
const RENDER_ITEM_KINDS = new Set([
  "file",
  "command",
  "stdout",
  "stderr",
  "generated-file",
]);

export type ExampleRenderItem =
  | { kind: "file"; path: string; label?: string; language?: string }
  | { kind: "command"; label?: string; language?: string }
  | { kind: "stdout"; label?: string; language?: string }
  | { kind: "stderr"; label?: string; language?: string }
  | {
      kind: "generated-file";
      path: string;
      label?: string;
      language?: string;
    };

export type ExampleManifest = {
  id: string;
  title: string;
  description: string;
  cwd: string;
  command: string[];
  expect: {
    exitCode: number;
    stdout?: string;
    stdoutFile?: string;
    stderr?: string;
    stderrFile?: string;
    files?: Record<string, string>;
    fileContains?: Record<string, string[]>;
    fileNotContains?: Record<string, string[]>;
  };
  render: {
    show: ExampleRenderItem[];
  };
  hidden?: boolean;
};

export type LoadedExample = {
  manifest: ExampleManifest;
  dirPath: string;
  filePath: string;
};

export type ExampleReference = {
  id: string;
  filePath: string;
};

type ValidationSource = {
  filePath: string;
  idHint?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function error(source: ValidationSource, detail: string): Error {
  const id = source.idHint ? ` (${source.idHint})` : "";
  return new Error(`${source.filePath}${id}: ${detail}`);
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
  source: ValidationSource,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw error(source, `unknown ${label} field ${key}`);
    }
  }
}

export function validateSafePath(
  field: string,
  value: unknown,
  source: ValidationSource,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw error(source, `${field} must be a non-empty relative path.`);
  }
  if (value.includes("\\")) {
    throw error(source, `${field} must use forward slashes: ${value}`);
  }
  if (path.posix.isAbsolute(value)) {
    throw error(source, `${field} must not be absolute: ${value}`);
  }
  if (value.split("/").some((segment) => segment === "..")) {
    throw error(source, `${field} must not contain .. path segments: ${value}`);
  }
  return value;
}

function requireString(
  value: unknown,
  field: string,
  source: ValidationSource,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw error(source, `${field} must be a non-empty string.`);
  }
  return value;
}

function optionalString(
  value: unknown,
  field: string,
  source: ValidationSource,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw error(source, `${field} must be a string.`);
  }
  return value;
}

function validateStringMap(
  value: unknown,
  field: string,
  source: ValidationSource,
): Record<string, string> {
  if (!isRecord(value)) {
    throw error(source, `${field} must be a mapping.`);
  }
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    validateSafePath(`${field}["${key}"]`, key, source);
    result[key] = validateSafePath(`${field}.${key}`, raw, source);
  }
  return result;
}

function validateSubstringMap(
  value: unknown,
  field: string,
  source: ValidationSource,
): Record<string, string[]> {
  if (!isRecord(value)) {
    throw error(source, `${field} must be a mapping.`);
  }
  const result: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(value)) {
    validateSafePath(`${field}["${key}"]`, key, source);
    if (!Array.isArray(raw) || raw.length === 0) {
      throw error(source, `${field}.${key} must be a non-empty string array.`);
    }
    if (!raw.every((item) => typeof item === "string")) {
      throw error(source, `${field}.${key} must contain only strings.`);
    }
    result[key] = raw;
  }
  return result;
}

function validateRenderItem(
  value: unknown,
  index: number,
  source: ValidationSource,
): ExampleRenderItem {
  if (!isRecord(value)) {
    throw error(source, `render.show[${index}] must be a mapping.`);
  }
  const kind = requireString(value.kind, `render.show[${index}].kind`, source);
  if (!RENDER_ITEM_KINDS.has(kind)) {
    throw error(source, `unsupported render item kind ${kind}.`);
  }
  const label = optionalString(
    value.label,
    `render.show[${index}].label`,
    source,
  );
  const language = optionalString(
    value.language,
    `render.show[${index}].language`,
    source,
  );
  if (kind === "file" || kind === "generated-file") {
    return {
      kind: kind as "file" | "generated-file",
      path: validateSafePath(`render.show[${index}].path`, value.path, source),
      ...(label === undefined ? {} : { label }),
      ...(language === undefined ? {} : { language }),
    };
  }
  return {
    kind,
    ...(label === undefined ? {} : { label }),
    ...(language === undefined ? {} : { language }),
  } as ExampleRenderItem;
}

export function validateExampleManifest(
  value: unknown,
  source: ValidationSource,
): ExampleManifest {
  if (!isRecord(value)) {
    throw error(source, "manifest must be a mapping.");
  }
  rejectUnknownFields(value, TOP_LEVEL_FIELDS, "top-level", source);

  const id = requireString(value.id, "id", source);
  const withId = { ...source, idHint: id };
  if (!EXAMPLE_ID_PATTERN.test(id)) {
    throw error(withId, `invalid example id ${id}.`);
  }

  const title = requireString(value.title, "title", withId);
  const description = requireString(value.description, "description", withId);
  const cwd = validateSafePath("cwd", value.cwd, withId);

  if (!Array.isArray(value.command) || value.command.length === 0) {
    throw error(withId, "command must be a non-empty string array.");
  }
  const command = value.command.map((item, index) => {
    if (typeof item !== "string") {
      throw error(withId, `command[${index}] must be a string.`);
    }
    return item;
  });

  if (!isRecord(value.expect)) {
    throw error(withId, "expect must be a mapping.");
  }
  rejectUnknownFields(value.expect, EXPECT_FIELDS, "expect", withId);
  if (typeof value.expect.exitCode !== "number") {
    throw error(withId, "expect.exitCode must be a number.");
  }

  const expect: ExampleManifest["expect"] = {
    exitCode: value.expect.exitCode,
  };
  const stdout = optionalString(value.expect.stdout, "expect.stdout", withId);
  const stderr = optionalString(value.expect.stderr, "expect.stderr", withId);
  if (stdout !== undefined) expect.stdout = stdout;
  if (stderr !== undefined) expect.stderr = stderr;
  if (value.expect.stdoutFile !== undefined) {
    expect.stdoutFile = validateSafePath(
      "expect.stdoutFile",
      value.expect.stdoutFile,
      withId,
    );
  }
  if (value.expect.stderrFile !== undefined) {
    expect.stderrFile = validateSafePath(
      "expect.stderrFile",
      value.expect.stderrFile,
      withId,
    );
  }
  if (expect.stdout === undefined && expect.stdoutFile === undefined) {
    throw error(withId, "expect requires stdout or stdoutFile.");
  }
  if (expect.stderr === undefined && expect.stderrFile === undefined) {
    throw error(withId, "expect requires stderr or stderrFile.");
  }
  if (expect.stdout !== undefined && expect.stdoutFile !== undefined) {
    throw error(withId, "expect must not set both stdout and stdoutFile.");
  }
  if (expect.stderr !== undefined && expect.stderrFile !== undefined) {
    throw error(withId, "expect must not set both stderr and stderrFile.");
  }
  if (value.expect.files !== undefined) {
    expect.files = validateStringMap(
      value.expect.files,
      "expect.files",
      withId,
    );
  }
  if (value.expect.fileContains !== undefined) {
    expect.fileContains = validateSubstringMap(
      value.expect.fileContains,
      "expect.fileContains",
      withId,
    );
  }
  if (value.expect.fileNotContains !== undefined) {
    expect.fileNotContains = validateSubstringMap(
      value.expect.fileNotContains,
      "expect.fileNotContains",
      withId,
    );
  }

  if (!isRecord(value.render) || !Array.isArray(value.render.show)) {
    throw error(withId, "render.show must be an array.");
  }
  const render = {
    show: value.render.show.map((item, index) =>
      validateRenderItem(item, index, withId),
    ),
  };
  const hidden = value.hidden;
  if (hidden !== undefined && typeof hidden !== "boolean") {
    throw error(withId, "hidden must be a boolean.");
  }

  return {
    id,
    title,
    description,
    cwd,
    command,
    expect,
    render,
    ...(hidden === undefined ? {} : { hidden }),
  };
}

async function findExampleManifestFiles(root: string): Promise<string[]> {
  const examplesDir = path.join(root, "docs/examples");
  const entries = await readdir(examplesDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    files.push(path.join(examplesDir, entry.name, "example.yml"));
  }
  return files.sort();
}

export async function loadExamples(root: string): Promise<LoadedExample[]> {
  const files = await findExampleManifestFiles(root);
  const loaded: LoadedExample[] = [];
  const seen = new Map<string, string>();

  for (const file of files) {
    const sourceText = await readFile(file, "utf8");
    const relativeFile = path.relative(root, file);
    const raw = YAML.parse(sourceText);
    const manifest = validateExampleManifest(raw, { filePath: relativeFile });
    const previous = seen.get(manifest.id);
    if (previous !== undefined) {
      throw new Error(
        `duplicate example id ${manifest.id} (${previous} and ${relativeFile})`,
      );
    }
    seen.set(manifest.id, relativeFile);
    loaded.push({
      manifest,
      dirPath: path.dirname(file),
      filePath: relativeFile,
    });
  }

  return loaded;
}

export async function findExampleReferences(
  root: string,
): Promise<ExampleReference[]> {
  const siteDir = path.join(root, "docs/site");
  const references: ExampleReference[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".vitepress") continue;
        await walk(full);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const text = await readFile(full, "utf8");
      const relativeFile = path.relative(root, full);
      const pattern = /<Example\s+id="([a-z][a-z0-9]*(?:-[a-z0-9]+)*)"\s*\/>/g;
      for (const match of text.matchAll(pattern)) {
        const id = match[1];
        if (id !== undefined) {
          references.push({ id, filePath: relativeFile });
        }
      }
    }
  }

  await walk(siteDir);
  return references.sort((a, b) =>
    `${a.filePath}:${a.id}`.localeCompare(`${b.filePath}:${b.id}`),
  );
}

export async function validateExampleReferences(root: string): Promise<void> {
  const [examples, references] = await Promise.all([
    loadExamples(root),
    findExampleReferences(root),
  ]);
  const exampleIds = new Set(examples.map((entry) => entry.manifest.id));
  const referencedIds = new Set(references.map((entry) => entry.id));

  for (const reference of references) {
    if (!exampleIds.has(reference.id)) {
      throw new Error(
        `${reference.filePath}: missing docs example ${reference.id}`,
      );
    }
  }

  for (const example of examples) {
    if (example.manifest.hidden === true) continue;
    if (!referencedIds.has(example.manifest.id)) {
      throw new Error(
        `${example.filePath}: example ${example.manifest.id} is not referenced by docs/site`,
      );
    }
  }
}

export function expandPlaceholders(
  value: string,
  placeholders: { projectRoot: string; cwd: string },
): string {
  return value
    .replaceAll("{{projectRoot}}", placeholders.projectRoot)
    .replaceAll("{{cwd}}", placeholders.cwd);
}
