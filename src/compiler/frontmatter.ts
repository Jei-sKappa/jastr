import YAML from "yaml";
import { SkillrouterError } from "../errors";

export type ParsedTemplateSource = {
  frontmatter: unknown;
  body: string;
};

export function parseTemplateSource(source: string): ParsedTemplateSource {
  if (!source.startsWith("---\n")) {
    throw new SkillrouterError(
      "invalid_frontmatter",
      "Root template must start with YAML frontmatter.",
    );
  }

  const closeIndex = source.indexOf("\n---\n", 4);
  if (closeIndex === -1) {
    throw new SkillrouterError(
      "invalid_frontmatter",
      "Root template frontmatter must close with --- on its own line.",
    );
  }

  const frontmatterSource = source.slice(4, closeIndex);
  const body = source.slice(closeIndex + "\n---\n".length);

  try {
    return { frontmatter: YAML.parse(frontmatterSource), body };
  } catch {
    throw new SkillrouterError("invalid_frontmatter", "Root template frontmatter is invalid YAML.");
  }
}
