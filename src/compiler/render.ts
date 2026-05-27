import { readFile } from "node:fs/promises";
import type { RawFlag } from "../cli/args";
import { evaluateCondition } from "./conditions";
import {
  scanDirectives,
  type TemplateDocument,
  type TemplateNode,
  validateDirectives,
} from "./directives";
import { coerceInputFlags, type InputValues } from "./flags";
import { parseTemplateSource } from "./frontmatter";
import { detectIncludeCycle, readIncludeFile } from "./includes";
import {
  interpolateText,
  validateInterpolationReferences,
} from "./interpolation";
import { type TemplateSchema, validateTemplateSchema } from "./schema";

export type LoadedTemplate = {
  schema: TemplateSchema;
  frontmatter: Record<string, unknown>;
  body: string;
  document: TemplateDocument;
};

export type RenderSkillTemplateOptions = {
  projectRoot: string;
  templatePath: string;
  rawFlags: RawFlag[];
};

export async function loadAndValidateTemplate(
  templatePath: string,
): Promise<LoadedTemplate> {
  const source = await readFile(templatePath, "utf8");
  const parsed = parseTemplateSource(source);
  const schema = validateTemplateSchema(parsed.frontmatter);
  const document = scanDirectives(parsed.body);
  validateDirectives(document, schema);
  validateStaticInterpolation(document, schema);
  return {
    schema,
    frontmatter: parsed.frontmatter as Record<string, unknown>,
    body: parsed.body,
    document,
  };
}

export async function validateSkillTemplate(
  projectRoot: string,
  templatePath: string,
): Promise<LoadedTemplate> {
  const loaded = await loadAndValidateTemplate(templatePath);
  await validateStaticIncludes(
    projectRoot,
    templatePath,
    loaded.document,
    loaded.schema,
    [templatePath],
  );
  return loaded;
}

export async function renderSkillTemplate(
  options: RenderSkillTemplateOptions,
): Promise<string> {
  const loaded = await loadAndValidateTemplate(options.templatePath);
  const values = coerceInputFlags(loaded.schema, options.rawFlags);
  return renderDocument({
    projectRoot: options.projectRoot,
    containingFilePath: options.templatePath,
    document: loaded.document,
    schema: loaded.schema,
    values,
    includeStack: [options.templatePath],
  });
}

async function validateStaticIncludes(
  projectRoot: string,
  containingFilePath: string,
  document: TemplateDocument,
  schema: TemplateSchema,
  includeStack: string[],
): Promise<void> {
  for (const node of document.nodes) {
    await validateNodeInclude(
      projectRoot,
      containingFilePath,
      node,
      schema,
      includeStack,
    );
  }
}

async function validateNodeInclude(
  projectRoot: string,
  containingFilePath: string,
  node: TemplateNode,
  schema: TemplateSchema,
  includeStack: string[],
): Promise<void> {
  if (node.type === "include" || node.type === "include-raw") {
    const include = await readIncludeFile(
      projectRoot,
      containingFilePath,
      node.path,
    );
    if (node.type === "include-raw") {
      return;
    }
    detectIncludeCycle(includeStack, include.path);
    const parsed = scanDirectives(include.contents);
    validateDirectives(parsed, schema);
    validateStaticInterpolation(parsed, schema);
    await validateStaticIncludes(projectRoot, include.path, parsed, schema, [
      ...includeStack,
      include.path,
    ]);
    return;
  }

  if (node.type === "conditionalGroup") {
    for (const branch of node.branches) {
      await validateStaticIncludes(
        projectRoot,
        containingFilePath,
        { nodes: branch.children },
        schema,
        includeStack,
      );
    }
  }
}

function validateStaticInterpolation(
  document: TemplateDocument,
  schema: TemplateSchema,
): void {
  for (const node of document.nodes) {
    if (node.type === "text") {
      validateInterpolationReferences(node.value, schema);
    }
    if (node.type === "conditionalGroup") {
      for (const branch of node.branches) {
        validateStaticInterpolation({ nodes: branch.children }, schema);
      }
    }
  }
}

async function renderDocument(options: {
  projectRoot: string;
  containingFilePath: string;
  document: TemplateDocument;
  schema: TemplateSchema;
  values: InputValues;
  includeStack: string[];
}): Promise<string> {
  let output = "";

  for (const node of options.document.nodes) {
    output += await renderNode(options, node);
  }

  return output;
}

async function renderNode(
  options: {
    projectRoot: string;
    containingFilePath: string;
    schema: TemplateSchema;
    values: InputValues;
    includeStack: string[];
  },
  node: TemplateNode,
): Promise<string> {
  if (node.type === "text") {
    return interpolateText(node.value, options.schema, options.values);
  }

  if (node.type === "include" || node.type === "include-raw") {
    const include = await readIncludeFile(
      options.projectRoot,
      options.containingFilePath,
      node.path,
    );
    if (node.type === "include-raw") {
      return include.contents;
    }

    detectIncludeCycle(options.includeStack, include.path);
    const document = scanDirectives(include.contents);
    validateDirectives(document, options.schema);
    validateStaticInterpolation(document, options.schema);
    return renderDocument({
      projectRoot: options.projectRoot,
      containingFilePath: include.path,
      document,
      schema: options.schema,
      values: options.values,
      includeStack: [...options.includeStack, include.path],
    });
  }

  if (node.type === "conditionalGroup") {
    for (const branch of node.branches) {
      if (
        branch.kind === "else" ||
        evaluateCondition(branch.condition, options.values)
      ) {
        return renderDocument({
          projectRoot: options.projectRoot,
          containingFilePath: options.containingFilePath,
          document: { nodes: branch.children },
          schema: options.schema,
          values: options.values,
          includeStack: options.includeStack,
        });
      }
    }
  }

  return "";
}
