import { access } from "node:fs/promises";
import path from "node:path";
import { SkillrouterError } from "../errors";

const SKILL_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function validateSkillName(skill: string): string {
  if (!SKILL_NAME_PATTERN.test(skill)) {
    throw new SkillrouterError("invalid_skill_name", `Invalid skill name ${skill}.`);
  }
  return skill;
}

export async function resolveSkillTemplatePath(
  projectRoot: string,
  skill: string,
): Promise<string> {
  const validSkill = validateSkillName(skill);
  const templatePath = path.join(
    projectRoot,
    ".skillrouter",
    validSkill,
    "SKILL.template.md",
  );

  try {
    await access(templatePath);
  } catch {
    throw new SkillrouterError(
      "missing_skill",
      `Skill ${validSkill} was not found at .skillrouter/${validSkill}/SKILL.template.md.`,
    );
  }

  return templatePath;
}
