export type JastrErrorCode =
  | "invalid_command"
  | "invalid_template_reference"
  | "missing_project_root"
  | "template_not_found"
  | "unsupported_generate_target"
  | "invalid_frontmatter"
  | "malformed_schema"
  | "invalid_directive"
  | "invalid_input_name"
  | "missing_required_input"
  | "unknown_input"
  | "unknown_input_flag"
  | "duplicate_input_flag"
  | "invalid_input_value"
  | "condition_parse_error"
  | "undeclared_condition_input"
  | "invalid_interpolation"
  | "absent_optional_interpolation"
  | "include_not_found"
  | "include_read_error"
  | "include_outside_root"
  | "include_path_rejected"
  | "include_cycle"
  | "missing_output_path"
  | "output_exists"
  | "missing_target_metadata"
  | "invalid_target_metadata";

export type JastrErrorDetails = Record<
  string,
  string | number | boolean | string[] | undefined
>;

export class JastrError extends Error {
  readonly code: JastrErrorCode;
  readonly details?: JastrErrorDetails;

  constructor(
    code: JastrErrorCode,
    message: string,
    details?: JastrErrorDetails,
  ) {
    super(message);
    this.name = "JastrError";
    this.code = code;
    this.details = details;
  }
}
