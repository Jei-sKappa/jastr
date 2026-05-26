import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { SkillrouterError } from "../errors";

export type RouterSkillMetadata = {
  skill: string;
  name: string;
  description: string;
};

export function buildRouterSkillContent(metadata: RouterSkillMetadata): string {
  return `---
name: ${metadata.name}
description: ${metadata.description}
---

Run this command and follow its output exactly:

\`\`\`bash
skillrouter run ${metadata.skill} $ARGUMENTS
\`\`\`

If the command exits non-zero, report the exact error output to the user and stop.
`;
}

export async function writeRouterSkill(options: {
  cwd: string;
  out: string;
  force: boolean;
  content: string;
}): Promise<string> {
  const outputPath = path.isAbsolute(options.out)
    ? options.out
    : path.resolve(options.cwd, options.out);

  if (!options.force && (await exists(outputPath))) {
    throw new SkillrouterError(
      "output_exists",
      `Output file ${options.out} already exists. Use --force to overwrite it.`,
    );
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, options.content, "utf8");
  return outputPath;
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
