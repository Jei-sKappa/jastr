import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

const CASE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const ACCEPTANCE_REF_PATTERN = /^[A-Z]+-FR-\d{4}\.AC-\d{4}$/;
const CASE_FIELDS = new Set([
  "id",
  "covers",
  "title",
  "description",
  "cwd",
  "command",
  "substitute",
  "env",
  "setup",
  "expect",
]);
const SETUP_STEP_FIELDS = new Set(["cli", "cp"]);
const CP_STEP_FIELDS = new Set(["from", "to"]);
const EXPECT_FIELDS = new Set([
  "exitCode",
  "stdout",
  "stdoutFile",
  "stdoutContains",
  "stderr",
  "stderrFile",
  "files",
  "fileContains",
  "fileNotContains",
]);

// The closed set of built-in values a case may substitute into its fixtures or
// expected output. The case `substitute` map binds author-chosen literal tokens
// to one of these names; the runner owns the token→value resolution and which
// side (fixture vs expected output) each name applies to.
export const SUBSTITUTION_VALUES = [
  "projectRoot",
  "jastrCliVersion",
  "globalRoot",
] as const;
export type SubstitutionValue = (typeof SUBSTITUTION_VALUES)[number];
const SUBSTITUTION_VALUE_SET: ReadonlySet<string> = new Set(
  SUBSTITUTION_VALUES,
);

export type CaseExpect = {
  exitCode: number;
  stdout?: string;
  stdoutFile?: string;
  stdoutContains?: string[];
  stderr?: string;
  stderrFile?: string;
  files?: Record<string, string>;
  fileContains?: Record<string, string[]>;
  fileNotContains?: Record<string, string[]>;
};

/** A `cli:` setup step: run the jastr CLI before the main `command`, sharing the
 * case's cwd, env, and `JASTR_HOME`. A non-zero exit fails the case loudly. */
export type SetupCliStep = { cli: string[] };

/** A `cp:` setup step: copy a case-relative fixture path onto a root-relative
 * destination in the temp tree (used to mutate a recorded source or installed
 * unit between, say, an `add` and an `update`). Both paths are safe relatives. */
export type SetupCpStep = { cp: { from: string; to: string } };

/** One ordered setup pre-step: exactly a `cli:` or a `cp:` step. */
export type SetupStep = SetupCliStep | SetupCpStep;

export type CaseManifest = {
  id: string;
  covers: string[];
  title: string;
  description: string;
  cwd: string;
  command: string[];
  substitute: Record<string, SubstitutionValue>;
  env: Record<string, string>;
  setup: SetupStep[];
  expect: CaseExpect;
};

export type RawCaseManifest = CaseManifest;

export type LoadedCase = {
  manifest: CaseManifest;
  dirPath: string;
  filePath: string;
};

type Source = {
  filePath: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(source: Source, detail: string): never {
  throw new Error(`${source.filePath}: ${detail}`);
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
  source: Source,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(source, `unknown ${label} field ${key}`);
  }
}

function requireString(value: unknown, field: string, source: Source): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(source, `${field} must be a non-empty string.`);
  }
  return value;
}

function optionalString(
  value: unknown,
  field: string,
  source: Source,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail(source, `${field} must be a string.`);
  return value;
}

function optionalStringArray(
  value: unknown,
  field: string,
  source: Source,
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length === 0) {
    fail(source, `${field} must be a non-empty string array.`);
  }
  if (!value.every((item) => typeof item === "string")) {
    fail(source, `${field} must contain only strings.`);
  }
  return value;
}

export function validateSafePath(
  field: string,
  value: unknown,
  source: Source,
): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(source, `${field} must be a non-empty relative path.`);
  }
  if (value.includes("\\"))
    fail(source, `${field} must use forward slashes: ${value}`);
  if (path.posix.isAbsolute(value))
    fail(source, `${field} must not be absolute: ${value}`);
  if (value.split("/").some((segment) => segment === "..")) {
    fail(source, `${field} must not contain .. path segments: ${value}`);
  }
  return value;
}

function validateStringMap(
  value: unknown,
  field: string,
  source: Source,
): Record<string, string> {
  if (!isRecord(value)) fail(source, `${field} must be a mapping.`);
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
  source: Source,
): Record<string, string[]> {
  if (!isRecord(value)) fail(source, `${field} must be a mapping.`);
  const result: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(value)) {
    validateSafePath(`${field}["${key}"]`, key, source);
    if (!Array.isArray(raw) || raw.length === 0) {
      fail(source, `${field}.${key} must be a non-empty string array.`);
    }
    if (!raw.every((item) => typeof item === "string")) {
      fail(source, `${field}.${key} must contain only strings.`);
    }
    result[key] = raw;
  }
  return result;
}

function validateSubstitute(
  value: unknown,
  field: string,
  source: Source,
): Record<string, SubstitutionValue> {
  if (!isRecord(value)) fail(source, `${field} must be a mapping.`);
  const result: Record<string, SubstitutionValue> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key.length === 0) fail(source, `${field} keys must be non-empty.`);
    if (typeof raw !== "string" || !SUBSTITUTION_VALUE_SET.has(raw)) {
      fail(
        source,
        `${field}["${key}"] must be one of ${SUBSTITUTION_VALUES.join(", ")}: ${String(raw)}`,
      );
    }
    result[key] = raw as SubstitutionValue;
  }
  return result;
}

/**
 * `env` is a free-form string→string map merged into the CLI subprocess
 * environment after `JASTR_HOME`. Unlike `files`/`substitute`, its values are
 * environment variables (e.g. `JASTR_GIT_BIN` pointing at the fake-git shim
 * outside the temp tree), so they are not constrained to safe relative paths.
 */
function validateEnvMap(
  value: unknown,
  field: string,
  source: Source,
): Record<string, string> {
  if (!isRecord(value)) fail(source, `${field} must be a mapping.`);
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key.length === 0) fail(source, `${field} keys must be non-empty.`);
    if (typeof raw !== "string") {
      fail(source, `${field}["${key}"] must be a string: ${String(raw)}`);
    }
    result[key] = raw;
  }
  return result;
}

/**
 * `setup` is an optional ordered list of pre-`command` steps. Each entry is
 * exactly one of a `cli:` step (a CLI argv run before the main command) or a
 * `cp:` step (a fixture copy into the temp tree). The runner executes them in
 * order after fixture/substitute expansion and before the main `command`.
 */
function validateSetup(
  value: unknown,
  field: string,
  source: Source,
): SetupStep[] {
  if (!Array.isArray(value)) fail(source, `${field} must be an array.`);
  return value.map((entry, index) => {
    const where = `${field}[${index}]`;
    if (!isRecord(entry)) fail(source, `${where} must be a mapping.`);
    rejectUnknownFields(entry, SETUP_STEP_FIELDS, "setup step", source);
    const hasCli = entry.cli !== undefined;
    const hasCp = entry.cp !== undefined;
    if (hasCli === hasCp) {
      fail(source, `${where} must set exactly one of cli or cp.`);
    }
    if (hasCli) {
      if (!Array.isArray(entry.cli) || entry.cli.length === 0) {
        fail(source, `${where}.cli must be a non-empty string array.`);
      }
      const cli = entry.cli.map((item, argIndex) => {
        if (typeof item !== "string") {
          fail(source, `${where}.cli[${argIndex}] must be a string.`);
        }
        return item;
      });
      return { cli };
    }
    if (!isRecord(entry.cp)) fail(source, `${where}.cp must be a mapping.`);
    rejectUnknownFields(entry.cp, CP_STEP_FIELDS, "cp step", source);
    const from = validateSafePath(`${where}.cp.from`, entry.cp.from, source);
    const to = validateSafePath(`${where}.cp.to`, entry.cp.to, source);
    return { cp: { from, to } };
  });
}

export function validateCaseManifest(
  value: unknown,
  source: Source,
): CaseManifest {
  if (!isRecord(value)) fail(source, "case manifest must be a mapping.");
  rejectUnknownFields(value, CASE_FIELDS, "case", source);
  const id = requireString(value.id, "id", source);
  if (!CASE_ID_PATTERN.test(id)) fail(source, `invalid case id ${id}`);

  if (!Array.isArray(value.covers) || value.covers.length === 0) {
    fail(source, `${id}.covers must be a non-empty string array.`);
  }
  const seenCovers = new Set<string>();
  const covers = value.covers.map((item, index) => {
    if (typeof item !== "string" || item.length === 0) {
      fail(source, `${id}.covers[${index}] must be a non-empty string.`);
    }
    if (!ACCEPTANCE_REF_PATTERN.test(item)) {
      fail(
        source,
        `${id}.covers[${index}] must be an acceptance criterion ref.`,
      );
    }
    if (seenCovers.has(item))
      fail(source, `${id}.covers contains duplicate ref ${item}`);
    seenCovers.add(item);
    return item;
  });

  const title = requireString(value.title, `${id}.title`, source);
  const description = requireString(
    value.description,
    `${id}.description`,
    source,
  );
  // `cwd` is optional: cases run from the project root by default (the 99%
  // scenario a real user is in). The rare case that needs to exercise running
  // from a subdirectory can still set it explicitly.
  const cwd =
    value.cwd === undefined
      ? "."
      : validateSafePath(`${id}.cwd`, value.cwd, source);

  if (!Array.isArray(value.command) || value.command.length === 0) {
    fail(source, `${id}.command must be a non-empty string array.`);
  }
  const command = value.command.map((item, index) => {
    if (typeof item !== "string")
      fail(source, `${id}.command[${index}] must be a string.`);
    return item;
  });

  // `substitute` is optional: only cases that need a runtime value (the temp
  // project root, the CLI version) injected into their fixtures or expected
  // output declare it. Keys are author-chosen literal tokens; values name the
  // built-in substitution to apply.
  const substitute =
    value.substitute === undefined
      ? {}
      : validateSubstitute(value.substitute, `${id}.substitute`, source);

  // `env` is optional: only cases that need extra environment for the CLI
  // subprocess (e.g. `JASTR_GIT_BIN` pointing at the fake-git shim) declare it.
  const env =
    value.env === undefined
      ? {}
      : validateEnvMap(value.env, `${id}.env`, source);

  // `setup` is optional: only stateful cases that must mutate the temp tree or
  // run a prior CLI invocation (e.g. `add` before `update`/`remove`) declare it.
  const setup =
    value.setup === undefined
      ? []
      : validateSetup(value.setup, `${id}.setup`, source);

  if (!isRecord(value.expect)) fail(source, `${id}.expect must be a mapping.`);
  rejectUnknownFields(value.expect, EXPECT_FIELDS, "expect", source);
  if (typeof value.expect.exitCode !== "number") {
    fail(source, `${id}.expect.exitCode must be a number.`);
  }
  const stdout = optionalString(
    value.expect.stdout,
    `${id}.expect.stdout`,
    source,
  );
  const stderr = optionalString(
    value.expect.stderr,
    `${id}.expect.stderr`,
    source,
  );
  const stdoutFile =
    value.expect.stdoutFile === undefined
      ? undefined
      : validateSafePath(
          `${id}.expect.stdoutFile`,
          value.expect.stdoutFile,
          source,
        );
  const stdoutContains = optionalStringArray(
    value.expect.stdoutContains,
    `${id}.expect.stdoutContains`,
    source,
  );
  const stderrFile =
    value.expect.stderrFile === undefined
      ? undefined
      : validateSafePath(
          `${id}.expect.stderrFile`,
          value.expect.stderrFile,
          source,
        );
  if (
    stdout === undefined &&
    stdoutFile === undefined &&
    stdoutContains === undefined
  ) {
    fail(
      source,
      `${id}.expect requires stdout, stdoutFile, or stdoutContains.`,
    );
  }
  if (stderr === undefined && stderrFile === undefined) {
    fail(source, `${id}.expect requires stderr or stderrFile.`);
  }
  if (stdout !== undefined && stdoutFile !== undefined) {
    fail(source, `${id}.expect must not set both stdout and stdoutFile.`);
  }
  if (stderr !== undefined && stderrFile !== undefined) {
    fail(source, `${id}.expect must not set both stderr and stderrFile.`);
  }

  const expect: CaseExpect = { exitCode: value.expect.exitCode };
  if (stdout !== undefined) expect.stdout = stdout;
  if (stdoutFile !== undefined) expect.stdoutFile = stdoutFile;
  if (stdoutContains !== undefined) expect.stdoutContains = stdoutContains;
  if (stderr !== undefined) expect.stderr = stderr;
  if (stderrFile !== undefined) expect.stderrFile = stderrFile;
  if (value.expect.files !== undefined) {
    expect.files = validateStringMap(
      value.expect.files,
      `${id}.expect.files`,
      source,
    );
  }
  if (value.expect.fileContains !== undefined) {
    expect.fileContains = validateSubstringMap(
      value.expect.fileContains,
      `${id}.expect.fileContains`,
      source,
    );
  }
  if (value.expect.fileNotContains !== undefined) {
    expect.fileNotContains = validateSubstringMap(
      value.expect.fileNotContains,
      `${id}.expect.fileNotContains`,
      source,
    );
  }

  return {
    id,
    covers,
    title,
    description,
    cwd,
    command,
    substitute,
    env,
    setup,
    expect,
  };
}

async function findCaseManifestFiles(root: string): Promise<string[]> {
  const casesDir = path.join(root, "test/e2e/cases");
  const entries = await readdir(casesDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory())
      files.push(path.join(casesDir, entry.name, "case.yml"));
  }
  return files.sort();
}

export async function loadCases(root: string): Promise<LoadedCase[]> {
  const files = await findCaseManifestFiles(root);
  const loaded: LoadedCase[] = [];
  const seen = new Map<string, string>();
  for (const file of files) {
    const relativeFile = path.relative(root, file);
    const raw = YAML.parse(await readFile(file, "utf8"));
    const manifest = validateCaseManifest(raw, { filePath: relativeFile });
    const previous = seen.get(manifest.id);
    if (previous !== undefined) {
      throw new Error(
        `duplicate case id ${manifest.id} (${previous} and ${relativeFile})`,
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
