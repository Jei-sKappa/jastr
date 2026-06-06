import { JastrError } from "@jastr/engine";

export function formatCliError(error: unknown): string {
  if (error instanceof JastrError) {
    return `Error: ${error.message}`;
  }

  if (error instanceof Error && error.message.trim() !== "") {
    return `Error: ${error.message}`;
  }

  return "Error: Unexpected failure.";
}
