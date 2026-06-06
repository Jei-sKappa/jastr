import type { Dirent } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";
import { loadCases } from "../test/e2e/harness/case-manifest";
import {
  acceptanceRef,
  type Requirement,
  validateRequirements,
} from "../test/e2e/harness/requirements";

export const OUTPUT_PATH = "docs/BEHAVIOR.md";

export type Area = {
  title: string;
  requirements: Requirement[];
};

/** One fixture file surfaced in the document: a project-relative POSIX path
 * paired with its verbatim contents. */
export type FixtureFile = {
  path: string;
  content: string;
};

/** A case flattened to exactly what the document renders. */
export type RenderCase = {
  id: string;
  title: string;
  description: string;
  cwd: string;
  command: string[];
  covers: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Every file under the case's `project/` fixture — the command's inputs. */
  inputFiles: FixtureFile[];
  /** Files the command is expected to produce, resolved from `expect.files`. */
  outputFiles: FixtureFile[];
};

/** Turn `01-run.yml` into a chapter title like `Run`. */
function areaTitle(fileName: string): string {
  return fileName
    .replace(/\.yml$/, "")
    .replace(/^\d+-/, "")
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Load requirements grouped by their source file so the generated document
 * keeps the curated `01..10` chapter order. Reuses the harness validator so
 * the schema stays single-sourced.
 */
export async function loadAreas(root: string): Promise<Area[]> {
  const dirPath = "requirements/functional";
  const absoluteDir = path.join(root, dirPath);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".yml"))
    .map((entry) => entry.name)
    .sort();

  const areas: Area[] = [];
  for (const name of files) {
    const filePath = `${dirPath}/${name}`;
    const source = await readFile(path.join(absoluteDir, name), "utf8");
    const requirements = validateRequirements(YAML.parse(source), { filePath });
    areas.push({ title: areaTitle(name), requirements });
  }
  return areas;
}

/** Read whichever stream a case stored inline or in a sidecar file. */
async function readStream(
  inline: string | undefined,
  file: string | undefined,
  dirPath: string,
): Promise<string> {
  if (inline !== undefined) return inline;
  if (file !== undefined) return readFile(path.join(dirPath, file), "utf8");
  return "";
}

/**
 * Recursively read every file under a case's `project/` fixture, returning
 * project-relative POSIX paths with verbatim contents, sorted by path. A case
 * with no `project/` directory (for example, `missing-project-root`) yields an
 * empty list rather than throwing, so the renderer can state the project is
 * empty — and so generation stays deterministic whether or not the untracked
 * empty directory happens to exist locally.
 */
async function loadProjectFiles(projectDir: string): Promise<FixtureFile[]> {
  const files: FixtureFile[] = [];
  const walk = async (dir: string, relative: string): Promise<void> => {
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      const childPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(childPath, childRelative);
      } else if (entry.isFile()) {
        files.push({
          path: childRelative,
          content: await readFile(childPath, "utf8"),
        });
      }
    }
  };
  await walk(projectDir, "");
  files.sort((a, b) => a.path.localeCompare(b.path));
  return files;
}

/** Resolve a case's `expect.files` map to the contents the command produces. */
async function loadOutputFiles(
  dirPath: string,
  files: Record<string, string> | undefined,
): Promise<FixtureFile[]> {
  if (files === undefined) return [];
  const resolved = await Promise.all(
    Object.entries(files).map(async ([actualPath, fixturePath]) => ({
      path: actualPath,
      content: await readFile(path.join(dirPath, fixturePath), "utf8"),
    })),
  );
  resolved.sort((a, b) => a.path.localeCompare(b.path));
  return resolved;
}

/**
 * Load cases and resolve their expected streams to strings so the renderer can
 * stay pure (and therefore unit-testable without touching the filesystem).
 */
export async function loadRenderCases(root: string): Promise<RenderCase[]> {
  const cases = await loadCases(root);
  return Promise.all(
    cases.map(async ({ manifest, dirPath }) => ({
      id: manifest.id,
      title: manifest.title,
      description: manifest.description,
      cwd: manifest.cwd,
      command: manifest.command,
      covers: manifest.covers,
      exitCode: manifest.expect.exitCode,
      stdout: await readStream(
        manifest.expect.stdout,
        manifest.expect.stdoutFile,
        dirPath,
      ),
      stderr: await readStream(
        manifest.expect.stderr,
        manifest.expect.stderrFile,
        dirPath,
      ),
      inputFiles: await loadProjectFiles(path.join(dirPath, "project")),
      outputFiles: await loadOutputFiles(dirPath, manifest.expect.files),
    })),
  );
}

function formatCommand(command: string[]): string {
  const args = command.map((arg) =>
    arg.length === 0 || /\s/.test(arg) ? `"${arg}"` : arg,
  );
  return ["jastr", ...args].join(" ");
}

function trimOneTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value.slice(0, -1) : value;
}

/** The invoked command, as its own console block. */
function renderCommandSection(entry: RenderCase): string {
  return [
    "**Command**",
    "",
    "```console",
    `$ ${formatCommand(entry.command)}`,
    "```",
  ].join("\n");
}

/** Captured stdout/stderr as its own console block, with the exit code in the
 * section label rather than inside the block — so it can't be mistaken for a
 * line the command actually printed. */
function renderCliOutputSection(entry: RenderCase): string {
  const heading = `**CLI output** — exit ${entry.exitCode}`;
  const streams: string[] = [];
  if (entry.stdout.length > 0)
    streams.push(trimOneTrailingNewline(entry.stdout));
  if (entry.stderr.length > 0)
    streams.push(trimOneTrailingNewline(entry.stderr));
  if (streams.length === 0) return `${heading}\n\n_No stdout or stderr._`;
  return [heading, "", "```console", ...streams, "```"].join("\n");
}

type TreeNode = {
  name: string;
  isFile: boolean;
  children: Map<string, TreeNode>;
};

function appendTreeLines(
  node: TreeNode,
  prefix: string,
  lines: string[],
): void {
  const children = [...node.children.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  children.forEach((child, index) => {
    const isLast = index === children.length - 1;
    const label = child.isFile ? child.name : `${child.name}/`;
    lines.push(`${prefix}${isLast ? "└─ " : "├─ "}${label}`);
    appendTreeLines(child, `${prefix}${isLast ? "   " : "│  "}`, lines);
  });
}

/**
 * Render a sorted list of project-relative file paths as an ASCII tree rooted
 * at `project/`. Pure and deterministic: paths are folded into a node trie and
 * each level is emitted in locale order.
 */
export function buildFileTree(paths: string[]): string {
  const root: TreeNode = {
    name: "project",
    isFile: false,
    children: new Map(),
  };
  for (const filePath of paths) {
    let node = root;
    const segments = filePath.split("/");
    segments.forEach((segment, index) => {
      const isFile = index === segments.length - 1;
      let child = node.children.get(segment);
      if (child === undefined) {
        child = { name: segment, isFile, children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    });
  }
  const lines = ["project/"];
  appendTreeLines(root, "", lines);
  return lines.join("\n");
}

/** Best-effort fenced-code language hint from a file extension. */
function languageHint(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  const extension = dot === -1 ? "" : filePath.slice(dot + 1).toLowerCase();
  if (extension === "md" || extension === "markdown") return "md";
  if (extension === "yml" || extension === "yaml") return "yaml";
  return "text";
}

/** Longest run of consecutive backticks anywhere in the content. */
function longestBacktickRun(content: string): number {
  let longest = 0;
  let current = 0;
  for (const char of content) {
    if (char === "`") {
      current += 1;
      if (current > longest) longest = current;
    } else {
      current = 0;
    }
  }
  return longest;
}

/** Wrap a fixture file in a path label plus a fence long enough to survive any
 * backticks inside it (file contents themselves contain ``` fences). */
function renderFileBlock(file: FixtureFile): string {
  const ticks = "`".repeat(Math.max(3, longestBacktickRun(file.content) + 1));
  return [
    `\`${file.path}\``,
    "",
    `${ticks}${languageHint(file.path)}`,
    trimOneTrailingNewline(file.content),
    ticks,
  ].join("\n");
}

/** Wrap a body in a GitHub-rendered collapsible `<details>` block. */
function renderCollapsible(summary: string, body: string): string {
  return [
    "<details>",
    `<summary>${summary}</summary>`,
    "",
    body,
    "",
    "</details>",
  ].join("\n");
}

function describeCwd(cwd: string): string {
  return cwd === "." ? "the project root" : `\`${cwd}/\``;
}

/** Input section: the project tree plus every fixture file's contents. */
function renderInputSection(entry: RenderCase): string {
  if (entry.inputFiles.length === 0) {
    return `**Input project**\n\n_Empty — no \`.jastr/\` directory present (command ran from ${describeCwd(entry.cwd)})._`;
  }
  const tree = [
    "```text",
    buildFileTree(entry.inputFiles.map((file) => file.path)),
    "```",
  ].join("\n");
  const fileBlocks = entry.inputFiles.map(renderFileBlock).join("\n\n");
  return `**Input project** — ran from ${describeCwd(entry.cwd)}\n\n${tree}\n\n${fileBlocks}`;
}

/** Output-files section: the files the command leaves on disk, if any. */
function renderOutputFilesSection(entry: RenderCase): string | null {
  if (entry.outputFiles.length === 0) return null;
  const fileBlocks = entry.outputFiles.map(renderFileBlock).join("\n\n");
  return `**Output files**\n\n${fileBlocks}`;
}

/** GitHub-compatible heading anchor for ASCII headings: lowercase, drop
 * punctuation other than hyphens/underscores, spaces become hyphens. */
function slugify(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^\w\- ]/g, "")
    .replace(/ /g, "-");
}

function requirementBadge(requirement: Requirement): string {
  return requirement.status === "active" ? "" : ` _(${requirement.status})_`;
}

/** The exact heading text used for a requirement; shared by the section
 * heading and its table-of-contents anchor so the two never drift. */
function requirementHeading(requirement: Requirement): string {
  return `${requirement.id} — ${requirement.title}${requirementBadge(requirement)}`;
}

/** Active, non-removed criteria — the ones the contract still asserts. */
function liveAcceptance(requirement: Requirement) {
  return requirement.acceptance.filter((ac) => ac.status !== "removed");
}

function renderAcceptanceTable(
  requirement: Requirement,
  byRef: Map<string, RenderCase[]>,
): string {
  const rows = liveAcceptance(requirement).map((ac) => {
    const cases = byRef.get(acceptanceRef(requirement.id, ac.id)) ?? [];
    const coverage =
      cases.length === 0
        ? "❌ uncovered"
        : `✅ ${cases.map((c) => `\`${c.id}\``).join(", ")}`;
    return `| ${ac.id} | ${ac.statement} | ${coverage} |`;
  });
  return [
    "| Criterion | Statement | Coverage |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/** Distinct covering cases for a requirement, in stable case-id order. */
function coveringCases(
  requirement: Requirement,
  byRef: Map<string, RenderCase[]>,
): RenderCase[] {
  const seen = new Map<string, RenderCase>();
  for (const ac of liveAcceptance(requirement)) {
    for (const entry of byRef.get(acceptanceRef(requirement.id, ac.id)) ?? []) {
      seen.set(entry.id, entry);
    }
  }
  return [...seen.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** Which of this requirement's criteria a given case demonstrates. */
function demonstratedRefs(
  requirement: Requirement,
  entry: RenderCase,
): string[] {
  const live = new Set(
    liveAcceptance(requirement).map((ac) =>
      acceptanceRef(requirement.id, ac.id),
    ),
  );
  return entry.covers.filter((ref) => live.has(ref));
}

function renderRequirement(
  requirement: Requirement,
  byRef: Map<string, RenderCase[]>,
): string {
  const blocks = [
    `### ${requirementHeading(requirement)}`,
    "",
    requirement.description.trim(),
    "",
    renderAcceptanceTable(requirement, byRef),
  ];

  if (requirement.status === "deferred" && requirement.coverage !== undefined) {
    blocks.push("", `> Deferred: ${requirement.coverage.trim()}`);
  }

  for (const entry of coveringCases(requirement, byRef)) {
    const acIds = demonstratedRefs(requirement, entry).map((ref) =>
      ref.slice(requirement.id.length + 1),
    );
    const sections = [
      renderInputSection(entry),
      renderCommandSection(entry),
      renderOutputFilesSection(entry),
      renderCliOutputSection(entry),
    ].filter((section): section is string => section !== null);
    blocks.push(
      "",
      `#### Case: ${entry.title}`,
      "",
      `Description: ${entry.description.trim()}`,
      "",
      `Covers: ${acIds.join(", ")}`,
      "",
      renderCollapsible("Input, command & output", sections.join("\n\n")),
    );
  }

  return blocks.join("\n");
}

/** Map every acceptance-criterion ref to the cases that cover it. */
function indexCasesByRef(cases: RenderCase[]): Map<string, RenderCase[]> {
  const byRef = new Map<string, RenderCase[]>();
  for (const entry of cases) {
    for (const ref of entry.covers) {
      const existing = byRef.get(ref);
      if (existing === undefined) byRef.set(ref, [entry]);
      else existing.push(entry);
    }
  }
  return byRef;
}

/** Render the full behavior reference. Pure: same inputs always yield the
 * same Markdown, so a committed copy can be drift-checked with `--check`. */
export function renderDocument(areas: Area[], cases: RenderCase[]): string {
  const byRef = indexCasesByRef(cases);

  const visibleAreas = areas
    .map((area) => ({
      ...area,
      requirements: area.requirements.filter((r) => r.status !== "removed"),
    }))
    .filter((area) => area.requirements.length > 0);

  const requirementCount = visibleAreas.reduce(
    (sum, area) => sum + area.requirements.length,
    0,
  );
  const acceptanceCount = visibleAreas.reduce(
    (sum, area) =>
      sum + area.requirements.reduce((n, r) => n + liveAcceptance(r).length, 0),
    0,
  );

  const sections: string[] = [
    "<!-- Generated by `bun run docs:cli:living`. Do not edit by hand. -->",
    "",
    "# Behavior reference",
    "",
    "Living documentation generated from the functional requirements in",
    "`packages/cli/requirements/functional/` and the end-to-end cases in",
    "`packages/cli/test/e2e/cases/`. Every example below is the expected output",
    "asserted by the e2e suite, so a passing `bun run test:cli:e2e` is also proof",
    "this document is accurate.",
    "",
    `**${requirementCount}** requirements · **${acceptanceCount}** acceptance ` +
      `criteria · **${cases.length}** end-to-end cases.`,
    "",
    "Each example shows its full input project (the fixture the command ran",
    "against, including any templates and includes) and, for `generate`, the",
    "files it writes — collapsed by default; expand to verify the recorded",
    "output against its inputs.",
  ];

  sections.push("", "## Contents");
  for (const area of visibleAreas) {
    sections.push("", `- [${area.title}](#${slugify(area.title)})`);
    for (const requirement of area.requirements) {
      sections.push(
        `  - [${requirement.id} — ${requirement.title}](#${slugify(requirementHeading(requirement))})`,
      );
    }
  }

  for (const area of visibleAreas) {
    sections.push("", `## ${area.title}`);
    for (const requirement of area.requirements) {
      sections.push("", renderRequirement(requirement, byRef));
    }
  }

  return `${sections.join("\n")}\n`;
}
