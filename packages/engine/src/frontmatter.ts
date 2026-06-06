import YAML from "yaml";
import { JastrError } from "./errors";

export type ParsedTemplate = {
  frontmatter: unknown;
  body: string;
};

export function parseTemplateSource(source: string): ParsedTemplate {
  if (!source.startsWith("---\n")) {
    return { frontmatter: {}, body: source };
  }

  // Empty frontmatter: the closing fence immediately follows the opening fence,
  // so there is no leading newline for the "\n---\n" search below to match.
  if (source.startsWith("---\n---\n")) {
    return { frontmatter: {}, body: source.slice("---\n---\n".length) };
  }

  const closeIndex = source.indexOf("\n---\n", 4);
  if (closeIndex === -1) {
    throw new JastrError(
      "invalid_frontmatter",
      "Template frontmatter must close with --- on its own line.",
    );
  }

  const frontmatterSource = source.slice(4, closeIndex);
  const body = source.slice(closeIndex + "\n---\n".length);

  try {
    return {
      frontmatter: YAML.parse(frontmatterSource) ?? {},
      body,
    };
  } catch {
    throw new JastrError(
      "invalid_frontmatter",
      "Template frontmatter is invalid YAML.",
    );
  }
}
