import { JastrError } from "./errors";
import type { TemplateInputValues, TemplateSchema } from "./schema";
import { validateInputName } from "./schema";

export type ConditionAst =
  | { type: "literal"; value: string | number | boolean }
  | { type: "input"; name: string }
  | { type: "not"; value: ConditionAst }
  | {
      type: "binary";
      operator: "==" | "!=" | "&&" | "||";
      left: ConditionAst;
      right: ConditionAst;
    };

type Token =
  | { type: "input"; value: string }
  | { type: "string"; value: string }
  | { type: "number"; value: number; raw: string }
  | { type: "boolean"; value: boolean }
  | { type: "operator"; value: "!" | "==" | "!=" | "&&" | "||" }
  | { type: "paren"; value: "(" | ")" }
  | { type: "unknown"; value: string }
  | { type: "eof" };

export function parseCondition(source: string): ConditionAst {
  const parser = new Parser(tokenize(source));
  const ast = parser.parseExpression();
  parser.expectEof();
  return ast;
}

export function validateConditionInputs(
  ast: ConditionAst,
  schema: TemplateSchema,
): void {
  for (const name of collectInputNames(ast)) {
    validateInputName(name);
    if (!(name in schema.inputs)) {
      throw new JastrError(
        "undeclared_condition_input",
        `Condition references undeclared input ${name}.`,
      );
    }
  }
}

export function evaluateCondition(
  ast: ConditionAst,
  values: TemplateInputValues,
): boolean {
  return toTruthValue(evaluateValue(ast, values));
}

function evaluateValue(
  ast: ConditionAst,
  values: TemplateInputValues,
): string | number | boolean | undefined {
  switch (ast.type) {
    case "literal":
      return ast.value;
    case "input":
      return values[ast.name];
    case "not":
      return !toTruthValue(evaluateValue(ast.value, values));
    case "binary": {
      if (ast.operator === "&&") {
        return (
          toTruthValue(evaluateValue(ast.left, values)) &&
          toTruthValue(evaluateValue(ast.right, values))
        );
      }
      if (ast.operator === "||") {
        return (
          toTruthValue(evaluateValue(ast.left, values)) ||
          toTruthValue(evaluateValue(ast.right, values))
        );
      }
      const left = evaluateValue(ast.left, values);
      const right = evaluateValue(ast.right, values);
      const equal = typeof left === typeof right && left === right;
      return ast.operator === "==" ? equal : !equal;
    }
  }
}

function toTruthValue(value: string | number | boolean | undefined): boolean {
  if (value === undefined) {
    return false;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.length > 0;
  }
  return value !== 0;
}

function collectInputNames(ast: ConditionAst): string[] {
  if (ast.type === "input") {
    return [ast.name];
  }
  if (ast.type === "not") {
    return collectInputNames(ast.value);
  }
  if (ast.type === "binary") {
    return [...collectInputNames(ast.left), ...collectInputNames(ast.right)];
  }
  return [];
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source.charAt(index);

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (source.startsWith("${", index)) {
      const end = source.indexOf("}", index + 2);
      if (end === -1) {
        throw conditionError("Unclosed input reference.");
      }
      const name = source.slice(index + 2, end);
      validateInputName(name);
      tokens.push({ type: "input", value: name });
      index = end + 1;
      continue;
    }

    if (char === "'" || char === '"') {
      const [value, nextIndex] = readString(source, index, char);
      tokens.push({ type: "string", value });
      index = nextIndex;
      continue;
    }

    const numberMatch = source
      .slice(index)
      .match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?/);
    if (numberMatch) {
      const raw = numberMatch[0];
      tokens.push({ type: "number", value: Number(raw), raw });
      index += raw.length;
      continue;
    }

    if (source.startsWith("true", index) && isBoundary(source[index + 4])) {
      tokens.push({ type: "boolean", value: true });
      index += 4;
      continue;
    }

    if (source.startsWith("false", index) && isBoundary(source[index + 5])) {
      tokens.push({ type: "boolean", value: false });
      index += 5;
      continue;
    }

    const operator = ["==", "!=", "&&", "||", "!"].find((candidate) =>
      source.startsWith(candidate, index),
    );
    if (operator) {
      tokens.push({
        type: "operator",
        value: operator as "!" | "==" | "!=" | "&&" | "||",
      });
      index += operator.length;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char });
      index += 1;
      continue;
    }

    const unknownMatch = source.slice(index).match(/^[^\s()]+/);
    const unknown = unknownMatch ? unknownMatch[0] : char;
    tokens.push({ type: "unknown", value: unknown });
    index += unknown.length;
  }

  tokens.push({ type: "eof" });
  return tokens;
}

function readString(
  source: string,
  start: number,
  quote: string,
): [string, number] {
  let value = "";
  let index = start + 1;

  while (index < source.length) {
    const char = source.charAt(index);
    if (char === quote) {
      return [value, index + 1];
    }
    if (char === "\\") {
      const escaped = source[index + 1];
      if (escaped === quote || escaped === "\\") {
        value += escaped;
        index += 2;
        continue;
      }
      throw conditionError(`Unsupported escape \\${escaped ?? ""}.`);
    }
    value += char;
    index += 1;
  }

  throw conditionError("Unclosed string literal.");
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parseExpression(): ConditionAst {
    return this.parseOr();
  }

  expectEof(): void {
    const token = this.peek();
    if (token.type !== "eof") {
      throw conditionError(`Unexpected token ${tokenValue(token)}.`);
    }
  }

  private parseOr(): ConditionAst {
    let left = this.parseAnd();
    while (this.matchOperator("||")) {
      left = { type: "binary", operator: "||", left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): ConditionAst {
    let left = this.parseEquality();
    while (this.matchOperator("&&")) {
      left = {
        type: "binary",
        operator: "&&",
        left,
        right: this.parseEquality(),
      };
    }
    return left;
  }

  private parseEquality(): ConditionAst {
    let left = this.parsePrefix();
    while (true) {
      if (this.matchOperator("==")) {
        left = {
          type: "binary",
          operator: "==",
          left,
          right: this.parsePrefix(),
        };
        continue;
      }
      if (this.matchOperator("!=")) {
        left = {
          type: "binary",
          operator: "!=",
          left,
          right: this.parsePrefix(),
        };
        continue;
      }
      return left;
    }
  }

  private parsePrefix(): ConditionAst {
    if (this.matchOperator("!")) {
      return { type: "not", value: this.parsePrefix() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ConditionAst {
    const token = this.advance();
    if (token.type === "input") {
      return { type: "input", name: token.value };
    }
    if (
      token.type === "string" ||
      token.type === "number" ||
      token.type === "boolean"
    ) {
      return { type: "literal", value: token.value };
    }
    if (token.type === "paren" && token.value === "(") {
      const expression = this.parseExpression();
      const close = this.advance();
      if (close.type !== "paren" || close.value !== ")") {
        throw conditionError("Expected closing parenthesis.");
      }
      return expression;
    }
    if (
      token.type === "unknown" &&
      /^[A-Za-z_][A-Za-z0-9_.-]*$/.test(token.value)
    ) {
      throw conditionError("Expected ${input-name} reference.");
    }
    throw conditionError(`Unexpected token ${tokenValue(token)}.`);
  }

  private matchOperator(operator: "!" | "==" | "!=" | "&&" | "||"): boolean {
    const token = this.peek();
    if (token.type === "operator" && token.value === operator) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private peek(): Token {
    return this.tokens[this.index] ?? { type: "eof" };
  }

  private advance(): Token {
    const token = this.peek();
    this.index += 1;
    return token;
  }
}

function isBoundary(char: string | undefined): boolean {
  return char === undefined || !/[A-Za-z0-9_-]/.test(char);
}

function tokenValue(token: Token): string {
  if ("value" in token) {
    return String(token.value);
  }
  return "end of input";
}

function conditionError(message: string): JastrError {
  return new JastrError("condition_parse_error", message);
}
