import { SkillrouterError } from "../errors";

export type RawFlag =
  | { name: string; form: "bare"; value: true }
  | { name: string; form: "value"; value: string };

export type ParsedCliArgs =
  | { command: "run"; skill: string; flags: RawFlag[] }
  | { command: "generate"; skill: string; out?: string; force: boolean };

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const [command, skill, ...rest] = argv;

  if (command !== "run" && command !== "generate") {
    throw new SkillrouterError(
      "invalid_command",
      "Expected command shape: skillrouter run <skill> [input flags...] or skillrouter generate <skill> --out <path> [--force].",
    );
  }

  if (!skill) {
    throw new SkillrouterError("invalid_command", `Missing skill name for ${command}.`);
  }

  return command === "run"
    ? parseRunArgs(skill, rest)
    : parseGenerateArgs(skill, rest);
}

function parseRunArgs(skill: string, rest: string[]): ParsedCliArgs {
  const flags: RawFlag[] = [];
  const seen = new Set<string>();

  for (const arg of rest) {
    if (!arg.startsWith("--") || arg === "--") {
      throw new SkillrouterError("invalid_command", `Invalid flag syntax ${arg}.`);
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
      throw new SkillrouterError("invalid_command", `Invalid flag syntax ${arg}.`);
    }

    if (seen.has(name)) {
      throw new SkillrouterError("duplicate_input_flag", `Duplicate flag --${name}.`);
    }
    seen.add(name);

    if (equalsIndex === -1) {
      flags.push({ name, form: "bare", value: true });
      continue;
    }

    flags.push({ name, form: "value", value: raw.slice(equalsIndex + 1) });
  }

  return { command: "run", skill, flags };
}

function parseGenerateArgs(skill: string, rest: string[]): ParsedCliArgs {
  let out: string | undefined;
  let force = false;

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === undefined) continue;

    if (arg === "--force") {
      force = true;
      continue;
    }

    if (arg === "--out") {
      const value = rest[index + 1];
      if (!value || value.startsWith("--")) {
        throw new SkillrouterError("missing_output_path", "Missing value for --out.");
      }
      out = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--out=")) {
      out = arg.slice("--out=".length);
      if (out === "") {
        throw new SkillrouterError("missing_output_path", "Missing value for --out.");
      }
      continue;
    }

    if (arg.startsWith("--")) {
      throw new SkillrouterError("invalid_command", `Unknown generate option ${arg}.`);
    }

    throw new SkillrouterError("invalid_command", `Invalid generate argument ${arg}.`);
  }

  return { command: "generate", skill, out, force };
}
