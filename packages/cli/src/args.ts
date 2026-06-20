import { JastrError } from "@jastr/engine";

export type RawFlag =
  | { name: string; form: "bare"; value: true }
  | { name: string; form: "value"; value: string };

const expectedCommandShape =
  "Expected command shape: jastr run <template-ref> [input flags...] or jastr generate agent-skill <template-ref> --out <path> [--check] [--force].";

function isHelpToken(arg: string | undefined): boolean {
  return arg === "--help" || arg === "-h";
}

function isRootHelpOrVersionToken(arg: string | undefined): boolean {
  return (
    isHelpToken(arg) || arg === "--version" || arg === "-V" || arg === "help"
  );
}

export function validateCliArgv(argv: string[]): void {
  const [command, first, second, ...rest] = argv;

  if (!command) {
    throw new JastrError("invalid_command", expectedCommandShape);
  }

  if (isRootHelpOrVersionToken(command)) {
    return;
  }

  if (command !== "run" && command !== "generate") {
    throw new JastrError("invalid_command", expectedCommandShape);
  }

  if (command === "run") {
    if (!first) {
      throw new JastrError(
        "invalid_command",
        "Missing template reference for run.",
      );
    }
    return;
  }

  if (isHelpToken(first)) {
    return;
  }

  if (!first) {
    throw new JastrError("invalid_command", "Missing generate target.");
  }

  if (!second) {
    throw new JastrError(
      "invalid_command",
      `Missing template reference for generate ${first}.`,
    );
  }

  validateGenerateArgs(rest);
}

export function parseRunFlags(rest: string[]): RawFlag[] {
  const flags: RawFlag[] = [];
  const seen = new Set<string>();

  for (const arg of rest) {
    if (!arg.startsWith("--") || arg === "--") {
      throw new JastrError("invalid_command", `Invalid flag syntax ${arg}.`);
    }

    if (arg.startsWith("--no-")) {
      throw new JastrError(
        "invalid_command",
        `Boolean negation form ${arg} is not supported.`,
      );
    }

    const raw = arg.slice(2);
    const equalsIndex = raw.indexOf("=");
    const name = equalsIndex === -1 ? raw : raw.slice(0, equalsIndex);

    if (name === "") {
      throw new JastrError("invalid_command", `Invalid flag syntax ${arg}.`);
    }

    if (seen.has(name)) {
      throw new JastrError(
        "duplicate_input_flag",
        `Duplicate flag --${name}.`,
        {
          inputName: name,
        },
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
    throw new JastrError(
      "missing_output_path",
      "Missing required --out <path>.",
    );
  }

  if (out === "" || out.startsWith("--")) {
    throw new JastrError("missing_output_path", "Missing value for --out.");
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
      validateGenerateOut(rest[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--out=")) {
      validateGenerateOut(arg.slice("--out=".length));
      continue;
    }

    if (arg.startsWith("--")) {
      throw new JastrError(
        "invalid_command",
        `Unknown generate option ${arg}.`,
      );
    }

    throw new JastrError(
      "invalid_command",
      `Invalid generate argument ${arg}.`,
    );
  }
}
