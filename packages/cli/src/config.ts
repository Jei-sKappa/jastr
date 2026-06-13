import { readFile } from "node:fs/promises";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import YAML from "yaml";

export async function loadProjectConfigInputs(options: {
  projectRoot: string;
  templateRef: string;
}): Promise<Record<string, unknown>> {
  const configPath = path.join(options.projectRoot, ".jastr", "config.yml");
  let source: string;

  try {
    source = await readFile(configPath, "utf8");
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) return {};
    throw error;
  }

  if (source.trim() === "") return {};

  let parsed: unknown;
  try {
    parsed = YAML.parse(source);
  } catch {
    throw new JastrError(
      "invalid_config",
      ".jastr/config.yml could not be parsed.",
    );
  }

  if (parsed === null || parsed === undefined) return {};
  if (!isRecord(parsed)) {
    throw new JastrError(
      "invalid_config",
      ".jastr/config.yml must be a mapping.",
    );
  }

  const inputs = parsed.inputs;
  if (inputs === undefined) return {};
  if (!isRecord(inputs)) {
    throw new JastrError(
      "invalid_config",
      ".jastr/config.yml inputs must be a mapping.",
    );
  }

  const selected = inputs[options.templateRef];
  if (selected === undefined) return {};
  if (!isRecord(selected)) {
    throw new JastrError(
      "invalid_config",
      `.jastr/config.yml inputs.${options.templateRef} must be a mapping.`,
    );
  }

  return selected;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
