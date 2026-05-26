import { parseCliArgs } from "./args";
import { findProjectRoot } from "../fs/project-root";
import { resolveSkillTemplatePath, validateSkillName } from "../skills/skill";
import { renderSkillTemplate, validateSkillTemplate } from "../compiler/render";
import { buildRouterSkillContent, writeRouterSkill } from "../generate/router-skill";
import { SkillrouterError } from "../errors";

export async function runSkillrouterCommand(argv: string[], cwd: string): Promise<string> {
  const parsed = parseCliArgs(argv);
  const projectRoot = await findProjectRoot(cwd);
  const skill = validateSkillName(parsed.skill);
  const templatePath = await resolveSkillTemplatePath(projectRoot, skill);

  if (parsed.command === "run") {
    return renderSkillTemplate({
      projectRoot,
      templatePath,
      rawFlags: parsed.flags,
    });
  }

  // A completely absent --out is enforced here; args.ts only rejects a present-but-valueless --out.
  if (!parsed.out) {
    throw new SkillrouterError("missing_output_path", "Missing required --out <path>.");
  }

  const loaded = await validateSkillTemplate(projectRoot, templatePath);
  const content = buildRouterSkillContent({
    skill,
    name: loaded.schema.name,
    description: loaded.schema.description,
  });
  await writeRouterSkill({
    cwd,
    out: parsed.out,
    force: parsed.force,
    content,
  });
  return "";
}
