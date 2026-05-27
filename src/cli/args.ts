import { SkillrouterError } from "../errors";

export type RawFlag =
  | { name: string; form: "bare"; value: true }
  | { name: string; form: "value"; value: string };

const expectedCommandShape =
  "Expected command shape: skillrouter run <skill> [input flags...] or skillrouter generate <skill> --out <path> [--force].";

function isHelpToken(arg: string | undefined): boolean {
  return arg === "--help" || arg === "-h";
}

function isRootHelpOrVersionToken(arg: string | undefined): boolean {
  return (
    isHelpToken(arg) || arg === "--version" || arg === "-V" || arg === "help"
  );
}

export function validateCliArgv(argv: string[]): void {
  const [command, skill, ...rest] = argv;

  if (!command) {
    throw new SkillrouterError("invalid_command", expectedCommandShape);
  }

  if (isRootHelpOrVersionToken(command)) {
    return;
  }

  if (command !== "run" && command !== "generate") {
    throw new SkillrouterError("invalid_command", expectedCommandShape);
  }

  if (!skill) {
    throw new SkillrouterError(
      "invalid_command",
      `Missing skill name for ${command}.`,
    );
  }

  if (isHelpToken(skill)) {
    return;
  }

  if (command === "generate") {
    validateGenerateArgs(rest);
  }
}

// Parses the raw trailing tokens of `run <skill> [inputs...]` into skillrouter
// flags. The accepted input flags are defined per template (frontmatter
// inputs), so Commander passes these tokens through untouched and this parser
// enforces the strict v1 syntax.
export function parseRunFlags(rest: string[]): RawFlag[] {
  const flags: RawFlag[] = [];
  const seen = new Set<string>();

  for (const arg of rest) {
    if (!arg.startsWith("--") || arg === "--") {
      throw new SkillrouterError(
        "invalid_command",
        `Invalid flag syntax ${arg}.`,
      );
    }

    if (arg.startsWith("--no-")) {
      throw new SkillrouterError(
        "invalid_command",
        `Boolean negation form ${arg} is not supported in v1.`,
      );
    }

    const raw = arg.slice(2);
    const equalsIndex = raw.indexOf("=");
    const name = equalsIndex === -1 ? raw : raw.slice(0, equalsIndex);

    if (name === "") {
      throw new SkillrouterError(
        "invalid_command",
        `Invalid flag syntax ${arg}.`,
      );
    }

    if (seen.has(name)) {
      throw new SkillrouterError(
        "duplicate_input_flag",
        `Duplicate flag --${name}.`,
      );
    }
    seen.add(name);

    if (equalsIndex === -1) {
      flags.push({ name, form: "bare", value: true });
      continue;
    }

    flags.push({ name, form: "value", value: raw.slice(equalsIndex + 1) });
  }

  return flags;
}

export function validateGenerateOut(out: string | undefined): string {
  if (out === undefined) {
    throw new SkillrouterError(
      "missing_output_path",
      "Missing required --out <path>.",
    );
  }

  if (out === "" || out.startsWith("--")) {
    throw new SkillrouterError(
      "missing_output_path",
      "Missing value for --out.",
    );
  }

  return out;
}

function validateGenerateArgs(rest: string[]): void {
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === undefined) continue;

    if (isHelpToken(arg)) {
      return;
    }

    if (arg === "--force") {
      continue;
    }

    if (arg === "--out") {
      const value = rest[index + 1];
      validateGenerateOut(value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--out=")) {
      validateGenerateOut(arg.slice("--out=".length));
      continue;
    }

    if (arg.startsWith("--")) {
      throw new SkillrouterError(
        "invalid_command",
        `Unknown generate option ${arg}.`,
      );
    }

    throw new SkillrouterError(
      "invalid_command",
      `Invalid generate argument ${arg}.`,
    );
  }
}
