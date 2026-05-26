export type SkillrouterErrorCode =
  | "invalid_command"
  | "missing_project_root"
  | "invalid_skill_name"
  | "missing_skill"
  | "invalid_frontmatter"
  | "malformed_schema"
  | "invalid_directive"
  | "invalid_input_name"
  | "missing_required_input"
  | "unknown_input_flag"
  | "duplicate_input_flag"
  | "invalid_input_value"
  | "condition_parse_error"
  | "undeclared_condition_input"
  | "invalid_interpolation"
  | "absent_optional_interpolation"
  | "include_not_found"
  | "include_outside_project"
  | "include_path_rejected"
  | "include_cycle"
  | "missing_output_path"
  | "output_exists"
  | "generate_validation_failed";

export class SkillrouterError extends Error {
  readonly code: SkillrouterErrorCode;

  constructor(code: SkillrouterErrorCode, message: string) {
    super(message);
    this.name = "SkillrouterError";
    this.code = code;
  }
}

export function formatCliError(error: unknown): string {
  if (error instanceof SkillrouterError) {
    return `Error: ${error.message}`;
  }

  if (error instanceof Error && error.message.trim() !== "") {
    return `Error: ${error.message}`;
  }

  return "Error: Unexpected failure.";
}
