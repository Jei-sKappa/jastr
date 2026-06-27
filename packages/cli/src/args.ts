import { JastrError } from "@jastr/engine";

export type RawFlag =
  | { name: string; form: "bare"; value: true }
  | { name: string; form: "value"; value: string };

const expectedCommandShape =
  "Expected command shape: jastr run <template-ref> [input flags...], jastr generate agent-skill <template-ref> --out <path> [--check] [--force], jastr validate <template-ref>, jastr add <repo-source> <name> [--ref <ref>] [--path <subdir>] [-g], or jastr list [--local] [--global].";

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

  if (
    command !== "run" &&
    command !== "generate" &&
    command !== "validate" &&
    command !== "add" &&
    command !== "list"
  ) {
    throw new JastrError("invalid_command", expectedCommandShape);
  }

  if (command === "add") {
    validateAddArgs(argv.slice(1));
    return;
  }

  if (command === "list") {
    validateListArgs(argv.slice(1));
    return;
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

  if (command === "validate") {
    validateValidateArgs(argv.slice(1));
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

/**
 * Validate `add`'s argv shape. `add` takes two positionals (`<repo-source>` and
 * `<name>`) plus the fixed options `--ref <v>`, `--path <v>`, and `-g`/`--global`;
 * a missing positional, an unknown option, or an extra positional is an
 * `invalid_command`. There is deliberately no `--yes`/prompt path (it falls into
 * the unknown-option branch).
 */
function validateAddArgs(rest: string[]): void {
  const valueOptions = new Set(["--ref", "--path"]);
  const positionals: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === undefined) continue;

    if (isHelpToken(arg)) {
      return;
    }

    if (arg === "-g" || arg === "--global") {
      continue;
    }

    if (valueOptions.has(arg)) {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new JastrError("invalid_command", `Missing value for ${arg}.`);
      }
      index += 1;
      continue;
    }

    if (arg.startsWith("--ref=")) {
      requireOptionValue(arg, "--ref");
      continue;
    }
    if (arg.startsWith("--path=")) {
      requireOptionValue(arg, "--path");
      continue;
    }

    if (arg.startsWith("-")) {
      throw new JastrError("invalid_command", `Unknown add option ${arg}.`);
    }

    positionals.push(arg);
  }

  if (positionals.length === 0) {
    throw new JastrError("invalid_command", "Missing repo source for add.");
  }
  if (positionals.length === 1) {
    throw new JastrError("invalid_command", "Missing template name for add.");
  }
  if (positionals.length > 2) {
    throw new JastrError(
      "invalid_command",
      `Invalid add argument ${positionals[2]}.`,
    );
  }
}

/**
 * Validate `list`'s argv shape. `list` takes no positionals and recognizes only
 * the scope flags `--local` and `--global`; any other option or a positional is
 * an `invalid_command`.
 */
function validateListArgs(rest: string[]): void {
  for (const arg of rest) {
    if (isHelpToken(arg)) {
      return;
    }
    if (arg === "--local" || arg === "--global") {
      continue;
    }
    if (arg.startsWith("-")) {
      throw new JastrError("invalid_command", `Unknown list option ${arg}.`);
    }
    throw new JastrError("invalid_command", `Invalid list argument ${arg}.`);
  }
}

/** Require a non-empty value on an `--opt=value` form, else `invalid_command`. */
function requireOptionValue(arg: string, option: string): void {
  const value = arg.slice(`${option}=`.length);
  if (value === "") {
    throw new JastrError("invalid_command", `Missing value for ${option}.`);
  }
}

function validateValidateArgs(rest: string[]): void {
  let sawRef = false;
  for (const arg of rest) {
    if (isHelpToken(arg)) return;
    if (arg.startsWith("--")) {
      throw new JastrError(
        "invalid_command",
        `Unknown validate option ${arg}.`,
      );
    }
    if (sawRef) {
      throw new JastrError(
        "invalid_command",
        `Invalid validate argument ${arg}.`,
      );
    }
    sawRef = true;
  }
  if (!sawRef) {
    throw new JastrError(
      "invalid_command",
      "Missing template reference for validate.",
    );
  }
}

function validateGenerateArgs(rest: string[]): void {
  let sawCheck = false;
  let sawForce = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === undefined) continue;

    if (isHelpToken(arg)) {
      return;
    }

    if (arg === "--force") {
      sawForce = true;
      continue;
    }

    if (arg === "--check") {
      sawCheck = true;
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

  // --force governs overwriting and --check never writes, so the combination is
  // incoherent rather than ignorable. Reject it here, alongside the other
  // generate flag-shape diagnostics.
  if (sawCheck && sawForce) {
    throw new JastrError(
      "invalid_command",
      "--check cannot be combined with --force.",
    );
  }
}
