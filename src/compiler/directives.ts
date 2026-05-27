import remarkDirective from "remark-directive";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { SkillrouterError } from "../errors";
import {
  type ConditionAst,
  parseCondition,
  validateConditionInputs,
} from "./conditions";
import type { TemplateSchema } from "./schema";

export type TextNode = { type: "text"; value: string };
export type IncludeNode = { type: "include" | "include-raw"; path: string };
export type ConditionalBranch =
  | {
      kind: "if" | "else-if";
      condition: ConditionAst;
      children: TemplateNode[];
    }
  | {
      kind: "else";
      children: TemplateNode[];
    };
export type ConditionalGroupNode = {
  type: "conditionalGroup";
  branches: ConditionalBranch[];
};
export type TemplateNode = TextNode | IncludeNode | ConditionalGroupNode;
export type TemplateDocument = { nodes: TemplateNode[] };

type OpenContainer =
  | {
      name: "if" | "else-if";
      fenceLength: number;
      condition: ConditionAst;
      children: TemplateNode[];
    }
  | {
      name: "else";
      fenceLength: number;
      children: TemplateNode[];
    };

export function scanDirectives(body: string): TemplateDocument {
  validateRemarkDirectiveSyntax(body);
  const lines = body.split(/(?<=\n)/);
  const root: TemplateNode[] = [];
  const stack: OpenContainer[] = [];
  const pendingGroups = new Map<TemplateNode[], ConditionalGroupNode>();

  for (const line of lines) {
    const opening = parseDirectiveOpening(line);
    const closing = parseClosingFence(line);

    if (closing) {
      const current = stack.pop();
      if (!current || current.fenceLength !== closing.fenceLength) {
        throw new SkillrouterError(
          "invalid_directive",
          "Nested conditional containers require a longer outer fence than inner fences.",
        );
      }
      appendBranch(targetNodes(stack, root), pendingGroups, current);
      continue;
    }

    if (!opening) {
      if (line.trim() !== "") {
        pendingGroups.delete(targetNodes(stack, root));
      }
      targetNodes(stack, root).push({ type: "text", value: line });
      continue;
    }

    if (opening.name === "include" || opening.name === "include-raw") {
      const attrs = parseAttributes(opening.attributes);
      const keys = Object.keys(attrs);
      if (keys.length !== 1 || !attrs.path) {
        throw new SkillrouterError(
          "invalid_directive",
          `${opening.name} directive accepts only path.`,
        );
      }
      pendingGroups.delete(targetNodes(stack, root));
      targetNodes(stack, root).push({ type: opening.name, path: attrs.path });
      continue;
    }

    const attrs = parseAttributes(opening.attributes);
    if (opening.name === "if" || opening.name === "else-if") {
      if (Object.keys(attrs).length !== 1 || !attrs.condition) {
        throw new SkillrouterError(
          "invalid_directive",
          `${opening.name} directive requires condition.`,
        );
      }
    } else if (Object.keys(attrs).length !== 0) {
      throw new SkillrouterError(
        "invalid_directive",
        "else directive does not accept attributes.",
      );
    }

    const parent = stack.at(-1);
    if (parent && opening.fenceLength >= parent.fenceLength) {
      throw new SkillrouterError(
        "invalid_directive",
        "Nested conditional containers require a longer outer fence than inner fences.",
      );
    }

    if (opening.name === "if") {
      pendingGroups.delete(targetNodes(stack, root));
    }

    if (
      (opening.name === "else-if" || opening.name === "else") &&
      !pendingGroups.has(targetNodes(stack, root))
    ) {
      throw new SkillrouterError(
        "invalid_directive",
        `${opening.name} directive must immediately follow an if or else-if branch.`,
      );
    }

    if (opening.name === "else") {
      stack.push({
        name: opening.name,
        fenceLength: opening.fenceLength,
        children: [],
      });
      continue;
    }

    const condition = attrs.condition;
    if (!condition) {
      throw new SkillrouterError(
        "invalid_directive",
        `${opening.name} directive requires condition.`,
      );
    }

    stack.push({
      name: opening.name,
      fenceLength: opening.fenceLength,
      condition: parseCondition(condition),
      children: [],
    });
  }

  if (stack.length > 0) {
    throw new SkillrouterError(
      "invalid_directive",
      "Unclosed conditional directive.",
    );
  }

  return { nodes: root };
}

export function validateDirectives(
  document: TemplateDocument,
  schema: TemplateSchema,
): void {
  for (const node of walkNodes(document.nodes)) {
    if (node.type === "conditionalGroup") {
      for (const branch of node.branches) {
        if (branch.kind !== "else") {
          validateConditionInputs(branch.condition, schema);
        }
      }
    }
  }
}

function appendBranch(
  nodes: TemplateNode[],
  pendingGroups: Map<TemplateNode[], ConditionalGroupNode>,
  container: OpenContainer,
): void {
  const branch: ConditionalBranch =
    container.name === "else"
      ? {
          kind: container.name,
          children: container.children,
        }
      : {
          kind: container.name,
          condition: container.condition,
          children: container.children,
        };

  if (container.name === "if") {
    const group: ConditionalGroupNode = {
      type: "conditionalGroup",
      branches: [branch],
    };
    nodes.push(group);
    pendingGroups.set(nodes, group);
    return;
  }

  const group = pendingGroups.get(nodes);
  if (!group) {
    throw new SkillrouterError(
      "invalid_directive",
      `${container.name} directive must immediately follow an if or else-if branch.`,
    );
  }

  group.branches.push(branch);
  if (container.name === "else") {
    pendingGroups.delete(nodes);
  }
}

function targetNodes(
  stack: OpenContainer[],
  root: TemplateNode[],
): TemplateNode[] {
  return stack.at(-1)?.children ?? root;
}

function* walkNodes(nodes: TemplateNode[]): Generator<TemplateNode> {
  for (const node of nodes) {
    yield node;
    if (node.type === "conditionalGroup") {
      for (const branch of node.branches) {
        yield* walkNodes(branch.children);
      }
    }
  }
}

function parseDirectiveOpening(line: string):
  | {
      fenceLength: number;
      name: "if" | "else-if" | "else" | "include" | "include-raw";
      attributes: string;
    }
  | undefined {
  const match = line.match(
    /^(:{2,})(if|else-if|else|include-raw|include)([^\n]*)\n?$/,
  );
  if (!match) {
    return undefined;
  }

  const fence = match[1];
  const rawName = match[2];
  const rawRest = match[3];
  if (!fence || !rawName || rawRest === undefined) {
    throw new SkillrouterError(
      "invalid_directive",
      `Invalid directive syntax ${line.trim()}.`,
    );
  }

  const fenceLength = fence.length;
  const name = rawName as "if" | "else-if" | "else" | "include" | "include-raw";
  const rest = rawRest.trim();
  if (rest !== "" && !(rest.startsWith("{") && rest.endsWith("}"))) {
    throw new SkillrouterError(
      "invalid_directive",
      `Invalid directive attributes ${rest}.`,
    );
  }

  const isLeaf = name === "include" || name === "include-raw";
  if (isLeaf && fenceLength !== 2) {
    throw new SkillrouterError(
      "invalid_directive",
      `${name} is a leaf directive and must start with exactly two colons (::${name}).`,
    );
  }
  if (!isLeaf && fenceLength < 3) {
    throw new SkillrouterError(
      "invalid_directive",
      `${name} is a container directive and must start with three or more colons (:::${name}).`,
    );
  }

  return {
    fenceLength,
    name,
    attributes: rest === "" ? "" : rest.slice(1, -1),
  };
}

function parseClosingFence(line: string): { fenceLength: number } | undefined {
  const match = line.match(/^(:{3,})\s*\n?$/);
  const fence = match?.[1];
  return fence ? { fenceLength: fence.length } : undefined;
}

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  let remaining = source.trim();

  while (remaining !== "") {
    const match = remaining.match(/^([a-z-]+)="((?:\\"|[^"])*)"\s*/);
    if (!match) {
      throw new SkillrouterError(
        "invalid_directive",
        `Invalid directive attributes ${source}.`,
      );
    }
    const key = match[1];
    const value = match[2];
    if (!key || value === undefined) {
      throw new SkillrouterError(
        "invalid_directive",
        `Invalid directive attributes ${source}.`,
      );
    }
    attributes[key] = value.replace(/\\"/g, '"');
    remaining = remaining.slice(match[0].length);
  }

  return attributes;
}

function validateRemarkDirectiveSyntax(body: string): void {
  try {
    unified().use(remarkParse).use(remarkDirective).parse(body);
  } catch {
    throw new SkillrouterError(
      "invalid_directive",
      "Markdown directive syntax is invalid.",
    );
  }
}
