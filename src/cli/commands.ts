import { renderSkillTemplate, validateSkillTemplate } from "../compiler/render";
import { findProjectRoot } from "../fs/project-root";
import {
  buildRouterSkillContent,
  writeRouterSkill,
} from "../generate/router-skill";
import { resolveSkillTemplatePath, validateSkillName } from "../skills/skill";
import { type RawFlag, validateGenerateOut } from "./args";

export async function executeRun(opts: {
  skill: string;
  flags: RawFlag[];
  cwd: string;
}): Promise<string> {
  const projectRoot = await findProjectRoot(opts.cwd);
  const skill = validateSkillName(opts.skill);
  const templatePath = await resolveSkillTemplatePath(projectRoot, skill);

  return renderSkillTemplate({
    projectRoot,
    templatePath,
    rawFlags: opts.flags,
  });
}

export async function executeGenerate(opts: {
  skill: string;
  out?: string;
  force: boolean;
  cwd: string;
}): Promise<string> {
  const out = validateGenerateOut(opts.out);
  const projectRoot = await findProjectRoot(opts.cwd);
  const skill = validateSkillName(opts.skill);
  const templatePath = await resolveSkillTemplatePath(projectRoot, skill);

  const loaded = await validateSkillTemplate(projectRoot, templatePath);
  const content = buildRouterSkillContent({
    skill,
    name: loaded.schema.name,
    description: loaded.schema.description,
    frontmatter: loaded.frontmatter,
  });
  const outputPath = await writeRouterSkill({
    cwd: opts.cwd,
    out,
    force: opts.force,
    content,
  });
  return `Generated \`${outputPath}\` from template \`${templatePath}\``;
}
