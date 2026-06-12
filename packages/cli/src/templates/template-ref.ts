import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import { findProjectRoot } from "../fs/project-root";

const TEMPLATE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const GROUP_MARKER = ".jastrgroup";
const TEMPLATE_FILE = "TEMPLATE.md";

type StandaloneIncludeContext = {
  kind: "standalone";
  boundary: string;
  templateRoot: string;
};

type GroupedIncludeContext = {
  kind: "grouped";
  boundary: string;
  templateRoot: string;
  groupRoot: string;
};

export type IncludeContext = StandaloneIncludeContext | GroupedIncludeContext;

export type LoadedTemplateReference = {
  mode: "named" | "direct";
  templateRef: string;
  templatePath: string;
  cwd: string;
  includeContext: IncludeContext;
  source: string;
};

type NamedTemplateRef =
  | { kind: "standalone"; templateId: string }
  | { kind: "grouped"; group: string; templateId: string };

export async function loadTemplateReference(options: {
  cwd: string;
  templateRef: string;
}): Promise<LoadedTemplateReference> {
  const { cwd, templateRef } = options;

  if (templateRef.endsWith(".md")) {
    const templatePath = await realpath(path.resolve(cwd, templateRef));
    return {
      mode: "direct",
      templateRef,
      templatePath,
      cwd,
      includeContext: await classifyDirectTemplate(templatePath),
      source: await readFile(templatePath, "utf8"),
    };
  }

  const namedRef = parseNamedTemplateRef(templateRef);
  const projectRoot = await findProjectRoot(cwd);

  if (namedRef.kind === "grouped") {
    return loadGroupedNamedTemplate({
      cwd,
      projectRoot,
      templateRef,
      group: namedRef.group,
      templateId: namedRef.templateId,
    });
  }

  return loadStandaloneNamedTemplate({
    cwd,
    projectRoot,
    templateRef,
    templateId: namedRef.templateId,
  });
}

function parseNamedTemplateRef(templateRef: string): NamedTemplateRef {
  const segments = templateRef.split("/");

  if (segments.length === 1) {
    const [templateId] = segments;
    if (isTemplateIdSegment(templateId)) {
      return { kind: "standalone", templateId };
    }
    throwInvalidTemplateReference(templateRef);
  }

  if (segments.length === 2) {
    const [group, templateId] = segments;
    if (isTemplateIdSegment(group) && isTemplateIdSegment(templateId)) {
      return { kind: "grouped", group, templateId };
    }
  }

  throwInvalidTemplateReference(templateRef);
}

async function loadStandaloneNamedTemplate(options: {
  cwd: string;
  projectRoot: string;
  templateRef: string;
  templateId: string;
}): Promise<LoadedTemplateReference> {
  const declaredPath = path.join(
    options.projectRoot,
    ".jastr",
    options.templateId,
    TEMPLATE_FILE,
  );
  if (!(await isFile(declaredPath))) {
    throw new JastrError(
      "template_not_found",
      `Template ${options.templateId} was not found at .jastr/${options.templateId}/TEMPLATE.md.`,
      { templateRef: options.templateId },
    );
  }

  const templatePath = await realpath(declaredPath);
  return {
    mode: "named",
    templateRef: options.templateRef,
    templatePath,
    cwd: options.cwd,
    includeContext: standaloneContext(templatePath),
    source: await readFile(templatePath, "utf8"),
  };
}

async function loadGroupedNamedTemplate(options: {
  cwd: string;
  projectRoot: string;
  templateRef: string;
  group: string;
  templateId: string;
}): Promise<LoadedTemplateReference> {
  const groupRoot = path.join(options.projectRoot, options.group);
  const markerPath = path.join(groupRoot, GROUP_MARKER);
  const declaredPath = path.join(
    groupRoot,
    "templates",
    options.templateId,
    TEMPLATE_FILE,
  );

  if (!(await isFile(markerPath)) || !(await isFile(declaredPath))) {
    throw new JastrError(
      "template_not_found",
      `Template ${options.templateRef} was not found at ${options.group}/templates/${options.templateId}/TEMPLATE.md.`,
      { templateRef: options.templateRef },
    );
  }

  const templatePath = await realpath(declaredPath);
  const realGroupRoot = await realpath(groupRoot);
  return {
    mode: "named",
    templateRef: options.templateRef,
    templatePath,
    cwd: options.cwd,
    includeContext: groupedContext(templatePath, realGroupRoot),
    source: await readFile(templatePath, "utf8"),
  };
}

async function classifyDirectTemplate(
  templatePath: string,
): Promise<IncludeContext> {
  const templateRoot = path.dirname(templatePath);
  if (path.basename(templatePath) !== TEMPLATE_FILE) {
    return standaloneContext(templatePath);
  }

  const templateId = path.basename(templateRoot);
  const templatesDir = path.dirname(templateRoot);
  if (
    path.basename(templatesDir) !== "templates" ||
    !isTemplateIdSegment(templateId)
  ) {
    return standaloneContext(templatePath);
  }

  const groupRoot = path.dirname(templatesDir);
  if (!(await isFile(path.join(groupRoot, GROUP_MARKER)))) {
    return standaloneContext(templatePath);
  }

  return groupedContext(templatePath, groupRoot);
}

function standaloneContext(templatePath: string): StandaloneIncludeContext {
  const templateRoot = path.dirname(templatePath);
  return {
    kind: "standalone",
    boundary: templateRoot,
    templateRoot,
  };
}

function groupedContext(
  templatePath: string,
  groupRoot: string,
): GroupedIncludeContext {
  return {
    kind: "grouped",
    boundary: groupRoot,
    templateRoot: path.dirname(templatePath),
    groupRoot,
  };
}

function isTemplateIdSegment(value: string | undefined): value is string {
  return value !== undefined && TEMPLATE_ID_PATTERN.test(value);
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function throwInvalidTemplateReference(templateRef: string): never {
  throw new JastrError(
    "invalid_template_reference",
    `Template reference ${templateRef} must be a template id, a group/template id, or a .md file path.`,
    { templateRef },
  );
}
