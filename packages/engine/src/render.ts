import { evaluateCondition } from "./conditions";
import {
  scanDirectives,
  type TemplateDocument,
  type TemplateNode,
  validateDirectives,
} from "./directives";
import { JastrError } from "./errors";
import { parseTemplateSource } from "./frontmatter";
import { validateTemplateInputs } from "./inputs";
import {
  interpolateText,
  validateInterpolationReferences,
} from "./interpolation";
import type { TemplateInputValues, TemplateSchema } from "./schema";
import { validateTemplateSchema } from "./schema";

export type IncludeRequest = {
  path: string;
  from: string;
  raw: boolean;
  stack: string[];
};

export type IncludeResolution = {
  id: string;
  source: string;
};

export type IncludeResolver = (
  request: IncludeRequest,
) => Promise<IncludeResolution>;

export type RenderTemplateSourceOptions = {
  source: string;
  inputs: TemplateInputValues;
  sourceId?: string;
  includeResolver?: IncludeResolver;
};

export type RenderTemplateSourceResult = {
  markdown: string;
  schema: TemplateSchema;
};

type RenderContext = {
  schema: TemplateSchema;
  values: TemplateInputValues;
  includeResolver: IncludeResolver;
};

export async function renderTemplateSource(
  options: RenderTemplateSourceOptions,
): Promise<RenderTemplateSourceResult> {
  const sourceId = options.sourceId ?? "<memory>";
  const parsed = parseTemplateSource(options.source);
  const schema = validateTemplateSchema(parsed.frontmatter);
  const document = scanDirectives(parsed.body);

  validateDirectives(document, schema);
  validateStaticInterpolation(document, schema);
  await validateStaticIncludes({
    document,
    schema,
    includeResolver: options.includeResolver ?? missingIncludeResolver,
    sourceId,
    stack: [sourceId],
  });

  const values = validateTemplateInputs(schema, options.inputs);
  const markdown = await renderDocument(
    {
      schema,
      values,
      includeResolver: options.includeResolver ?? missingIncludeResolver,
    },
    document,
    sourceId,
    [sourceId],
  );

  return { markdown, schema };
}

async function missingIncludeResolver(
  request: IncludeRequest,
): Promise<IncludeResolution> {
  throw new JastrError(
    "include_not_found",
    `Include file ${request.path} was not found.`,
    { includePath: request.path },
  );
}

async function validateStaticIncludes(options: {
  document: TemplateDocument;
  schema: TemplateSchema;
  includeResolver: IncludeResolver;
  sourceId: string;
  stack: string[];
}): Promise<void> {
  for (const node of options.document.nodes) {
    if (node.type === "include" || node.type === "include-raw") {
      const include = await options.includeResolver({
        path: node.path,
        from: options.sourceId,
        raw: node.type === "include-raw",
        stack: options.stack,
      });
      detectIncludeCycle(options.stack, include.id);
      if (node.type === "include-raw") continue;
      const parsed = scanDirectives(include.source);
      validateDirectives(parsed, options.schema);
      validateStaticInterpolation(parsed, options.schema);
      await validateStaticIncludes({
        document: parsed,
        schema: options.schema,
        includeResolver: options.includeResolver,
        sourceId: include.id,
        stack: [...options.stack, include.id],
      });
    }

    if (node.type === "conditionalGroup") {
      for (const branch of node.branches) {
        await validateStaticIncludes({
          document: { nodes: branch.children },
          schema: options.schema,
          includeResolver: options.includeResolver,
          sourceId: options.sourceId,
          stack: options.stack,
        });
      }
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

async function renderDocument(
  context: RenderContext,
  document: TemplateDocument,
  sourceId: string,
  stack: string[],
): Promise<string> {
  let output = "";
  for (const node of document.nodes) {
    output += await renderNode(context, node, sourceId, stack);
  }
  return output;
}

async function renderNode(
  context: RenderContext,
  node: TemplateNode,
  sourceId: string,
  stack: string[],
): Promise<string> {
  if (node.type === "text") {
    return interpolateText(node.value, context.schema, context.values);
  }

  if (node.type === "include" || node.type === "include-raw") {
    const include = await context.includeResolver({
      path: node.path,
      from: sourceId,
      raw: node.type === "include-raw",
      stack,
    });
    detectIncludeCycle(stack, include.id);

    if (node.type === "include-raw") {
      return include.source;
    }

    const document = scanDirectives(include.source);
    validateDirectives(document, context.schema);
    validateStaticInterpolation(document, context.schema);
    return renderDocument(context, document, include.id, [
      ...stack,
      include.id,
    ]);
  }

  if (node.type === "conditionalGroup") {
    for (const branch of node.branches) {
      if (
        branch.kind === "else" ||
        evaluateCondition(branch.condition, context.values)
      ) {
        return renderDocument(
          context,
          { nodes: branch.children },
          sourceId,
          stack,
        );
      }
    }
  }

  return "";
}

function detectIncludeCycle(stack: string[], nextId: string): void {
  const existingIndex = stack.indexOf(nextId);
  if (existingIndex === -1) return;

  const chain = [...stack.slice(existingIndex), nextId].join(" -> ");
  throw new JastrError("include_cycle", `Include cycle detected: ${chain}.`, {
    chain,
  });
}
