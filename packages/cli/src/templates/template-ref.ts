import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import {
  type ResolvedRoot,
  type ResolvedRoots,
  resolveProjectRoots,
} from "../fs/project-root";

const TEMPLATE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const GROUP_MARKER = ".jastrgroup";
const GROUP_TEMPLATES_DIR = "templates";
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

type LoadedTemplateReferenceBase = {
  templateRef: string;
  requestedTemplateRef: string;
  variantId?: string;
  templatePath: string;
  cwd: string;
  includeContext: IncludeContext;
  source: string;
};

export type LoadedTemplateReference =
  | (LoadedTemplateReferenceBase & {
      mode: "named";
      roots: { local?: string; global?: string }; // both discovered project roots
      resolvedRootKind: "local" | "global"; // which root supplied the body
    })
  | (LoadedTemplateReferenceBase & {
      mode: "direct";
    });

type NamedTemplateRef =
  | { kind: "standalone"; templateId: string }
  | { kind: "grouped"; group: string; templateId: string };

export type ParsedTemplateReference = {
  baseTemplateRef: string;
  variantId?: string;
};

export async function loadTemplateReference(options: {
  cwd: string;
  templateRef: string;
}): Promise<LoadedTemplateReference> {
  const { cwd, templateRef } = options;
  const parsedRef = parseTemplateReference(templateRef);

  if (parsedRef.baseTemplateRef.endsWith(".md")) {
    const templatePath = await realpath(
      path.resolve(cwd, parsedRef.baseTemplateRef),
    );
    return {
      mode: "direct",
      templateRef: parsedRef.baseTemplateRef,
      requestedTemplateRef: templateRef,
      templatePath,
      cwd,
      includeContext: await classifyDirectTemplate(templatePath),
      source: await readFile(templatePath, "utf8"),
    };
  }

  const namedRef = parseNamedTemplateRef(parsedRef.baseTemplateRef);
  const roots = await resolveProjectRoots(cwd);
  const resolvedRoots = { local: roots.local, global: roots.global };

  for (const root of roots.ordered) {
    const loaded =
      namedRef.kind === "grouped"
        ? await tryLoadGroupedNamedTemplate({
            cwd,
            root,
            roots: resolvedRoots,
            templateRef: parsedRef.baseTemplateRef,
            requestedTemplateRef: templateRef,
            variantId: parsedRef.variantId,
            group: namedRef.group,
            templateId: namedRef.templateId,
          })
        : await tryLoadStandaloneNamedTemplate({
            cwd,
            root,
            roots: resolvedRoots,
            templateRef: parsedRef.baseTemplateRef,
            requestedTemplateRef: templateRef,
            variantId: parsedRef.variantId,
            templateId: namedRef.templateId,
          });

    if (loaded !== undefined) {
      return loaded;
    }
  }

  throw templateNotFound(parsedRef.baseTemplateRef, namedRef, roots, cwd);
}

function templateNotFound(
  templateRef: string,
  namedRef: NamedTemplateRef,
  roots: ResolvedRoots,
  cwd: string,
): JastrError {
  const searched = roots.ordered
    .map((root) => {
      const declaredPath = declaredTemplatePath(root.projectRoot, namedRef);
      if (root.kind === "local") {
        return `local ${path.relative(cwd, declaredPath)}`;
      }
      return `global ${declaredPath}`;
    })
    .join(" and ");

  return new JastrError(
    "template_not_found",
    `Template ${templateRef} was not found. Searched ${searched}.`,
    { templateRef },
  );
}

function declaredTemplatePath(
  projectRoot: string,
  namedRef: NamedTemplateRef,
): string {
  if (namedRef.kind === "grouped") {
    return path.join(
      projectRoot,
      ".jastr",
      namedRef.group,
      GROUP_TEMPLATES_DIR,
      namedRef.templateId,
      TEMPLATE_FILE,
    );
  }
  return path.join(projectRoot, ".jastr", namedRef.templateId, TEMPLATE_FILE);
}

export function parseTemplateReference(
  templateRef: string,
): ParsedTemplateReference {
  const hashIndex = templateRef.indexOf("#");
  if (hashIndex === -1) return { baseTemplateRef: templateRef };

  if (templateRef.indexOf("#", hashIndex + 1) !== -1) {
    throwInvalidTemplateReference(templateRef);
  }

  const baseTemplateRef = templateRef.slice(0, hashIndex);
  const variantId = templateRef.slice(hashIndex + 1);

  if (baseTemplateRef.endsWith(".md") || !isTemplateIdSegment(variantId)) {
    throwInvalidTemplateReference(templateRef);
  }

  parseNamedTemplateRef(baseTemplateRef, templateRef);
  return { baseTemplateRef, variantId };
}

function parseNamedTemplateRef(
  templateRef: string,
  errorTemplateRef = templateRef,
): NamedTemplateRef {
  const segments = templateRef.split("/");

  if (segments.length === 1) {
    const [templateId] = segments;
    if (isTemplateIdSegment(templateId)) {
      return { kind: "standalone", templateId };
    }
    throwInvalidTemplateReference(errorTemplateRef);
  }

  if (segments.length === 2) {
    const [group, templateId] = segments;
    if (isTemplateIdSegment(group) && isTemplateIdSegment(templateId)) {
      return { kind: "grouped", group, templateId };
    }
  }

  throwInvalidTemplateReference(errorTemplateRef);
}

async function tryLoadStandaloneNamedTemplate(options: {
  cwd: string;
  root: ResolvedRoot;
  roots: { local?: string; global?: string };
  templateRef: string;
  requestedTemplateRef: string;
  variantId?: string;
  templateId: string;
}): Promise<LoadedTemplateReference | undefined> {
  const declaredPath = path.join(
    options.root.projectRoot,
    ".jastr",
    options.templateId,
    TEMPLATE_FILE,
  );
  if (!(await isFile(declaredPath))) {
    return undefined;
  }

  const templatePath = await realpath(declaredPath);
  return {
    mode: "named",
    templateRef: options.templateRef,
    requestedTemplateRef: options.requestedTemplateRef,
    variantId: options.variantId,
    templatePath,
    cwd: options.cwd,
    roots: options.roots,
    resolvedRootKind: options.root.kind,
    includeContext: standaloneContext(templatePath),
    source: await readFile(templatePath, "utf8"),
  };
}

async function tryLoadGroupedNamedTemplate(options: {
  cwd: string;
  root: ResolvedRoot;
  roots: { local?: string; global?: string };
  templateRef: string;
  requestedTemplateRef: string;
  variantId?: string;
  group: string;
  templateId: string;
}): Promise<LoadedTemplateReference | undefined> {
  const groupRoot = path.join(
    options.root.projectRoot,
    ".jastr",
    options.group,
  );
  const markerPath = path.join(groupRoot, GROUP_MARKER);
  const declaredPath = path.join(
    groupRoot,
    GROUP_TEMPLATES_DIR,
    options.templateId,
    TEMPLATE_FILE,
  );

  if (!(await isFile(markerPath)) || !(await isFile(declaredPath))) {
    return undefined;
  }

  const templatePath = await realpath(declaredPath);
  const realGroupRoot = await realpath(groupRoot);
  return {
    mode: "named",
    templateRef: options.templateRef,
    requestedTemplateRef: options.requestedTemplateRef,
    variantId: options.variantId,
    templatePath,
    cwd: options.cwd,
    roots: options.roots,
    resolvedRootKind: options.root.kind,
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
    path.basename(templatesDir) !== GROUP_TEMPLATES_DIR ||
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
    `Template reference ${templateRef} must be a template id, a group/template id, a template id#variant id, a group/template id#variant id, or a .md file path.`,
    { templateRef },
  );
}
