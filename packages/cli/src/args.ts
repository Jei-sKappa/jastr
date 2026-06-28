import { JastrError } from "@jastr/engine";

export type RawFlag =
  | { name: string; form: "bare"; value: true }
  | { name: string; form: "value"; value: string };

const expectedCommandShape =
  "Expected command shape: jastr run <template-ref> [input flags...], jastr generate agent-skill <template-ref> --out <path> [--mode <router|inline>] [--check] [--force], jastr validate <template-ref>, jastr add <repo-source> <name> [--ref <ref>] [--path <subdir>] [-g], jastr list [--local] [--global], jastr remove <id>... [-g] [--force], or jastr update [<id>...] [-g] [--force] [--check].";

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
    command !== "list" &&
    command !== "remove" &&
    command !== "update"
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

  if (command === "remove") {
    validateRemoveArgs(argv.slice(1));
    return;
  }

  if (command === "update") {
    validateUpdateArgs(argv.slice(1));
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

/**
 * Validate `remove`'s argv shape. `remove` takes one or more positional ids and
 * recognizes only the fixed flags `-g`/`--global` and `--force`; a missing id or
 * an unrecognized option is an `invalid_command`. There is deliberately no
 * `--yes`/prompt path (it falls into the unknown-option branch).
 */
function validateRemoveArgs(rest: string[]): void {
  const positionals: string[] = [];

  for (const arg of rest) {
    if (isHelpToken(arg)) {
      return;
    }
    if (arg === "-g" || arg === "--global" || arg === "--force") {
      continue;
    }
    if (arg.startsWith("-")) {
      throw new JastrError("invalid_command", `Unknown remove option ${arg}.`);
    }
    positionals.push(arg);
  }

  if (positionals.length === 0) {
    throw new JastrError("invalid_command", "Missing template id for remove.");
  }
}

/**
 * Validate `update`'s argv shape. `update` takes zero or more positional ids
 * (bare `update` targets every tracked id) and recognizes only the fixed flags
 * `-g`/`--global`, `--force`, and `--check`; any other option is an
 * `invalid_command`. There is deliberately no `--yes`/prompt path (it falls into
 * the unknown-option branch). Mirroring `generate`, `--check` (which writes
 * nothing) combined with `--force` (which governs overwriting) is incoherent and
 * rejected.
 */
function validateUpdateArgs(rest: string[]): void {
  let sawCheck = false;
  let sawForce = false;

  for (const arg of rest) {
    if (isHelpToken(arg)) {
      return;
    }
    if (arg === "-g" || arg === "--global") {
      continue;
    }
    if (arg === "--force") {
      sawForce = true;
      continue;
    }
    if (arg === "--check") {
      sawCheck = true;
      continue;
    }
    if (arg.startsWith("-")) {
      throw new JastrError("invalid_command", `Unknown update option ${arg}.`);
    }
    // A bare positional is an id; ids are optional, so any count is accepted.
  }

  if (sawCheck && sawForce) {
    throw new JastrError(
      "invalid_command",
      "--check cannot be combined with --force.",
    );
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
  let mode = "router";
  const inputFlagCandidates: string[] = [];

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

    if (arg === "--mode") {
      const value = rest[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new JastrError("invalid_command", "Missing value for --mode.");
      }
      mode = validateGenerateMode(value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--mode=")) {
      const value = arg.slice("--mode=".length);
      if (value === "") {
        throw new JastrError("invalid_command", "Missing value for --mode.");
      }
      mode = validateGenerateMode(value);
      continue;
    }

    if (arg.startsWith("--")) {
      // Any other `--name`/`--name=value` token is a template-input-flag
      // candidate. It is only valid in inline mode; the gate below rejects it
      // when the effective mode is router.
      inputFlagCandidates.push(arg);
      continue;
    }

    throw new JastrError(
      "invalid_command",
      `Invalid generate argument ${arg}.`,
    );
  }

  // `--mode` may appear after an input flag, so the effective mode is only known
  // after scanning the whole argv (the loop above resolves it). Gate the
  // collected input-flag candidates against the effective mode: router rejects
  // them, inline accepts them.
  if (mode === "router" && inputFlagCandidates.length > 0) {
    throw new JastrError(
      "invalid_command",
      "Template input flags are only valid with --mode=inline.",
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

/**
 * Validate a `--mode` value against the accepted set. Returns the value on
 * success; throws `invalid_command` for any other value.
 */
function validateGenerateMode(value: string): string {
  if (value !== "router" && value !== "inline") {
    throw new JastrError(
      "invalid_command",
      `Invalid generate mode ${value}. Expected router or inline.`,
    );
  }
  return value;
}
