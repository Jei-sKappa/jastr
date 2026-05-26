import { stat } from "node:fs/promises";
import path from "node:path";
import { SkillrouterError } from "../errors";

export async function findProjectRoot(startCwd: string): Promise<string> {
  let current = path.resolve(startCwd);

  while (true) {
    if (await isDirectory(path.join(current, ".skillrouter"))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new SkillrouterError(
        "missing_project_root",
        "No .skillrouter directory found from the current directory.",
      );
    }

    current = parent;
  }
}

async function isDirectory(candidate: string): Promise<boolean> {
  try {
    return (await stat(candidate)).isDirectory();
  } catch {
    return false;
  }
}
