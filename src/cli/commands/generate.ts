import { Command } from "@commander-js/extra-typings";
import { executeGenerate } from "../commands";

export function makeGenerateCommand() {
  return new Command("generate")
    .description("Generate a minimal router skill from a template")
    .argument("<skill>", "Skill to generate a router for")
    .option("--out <path>", "Output path for the generated router skill")
    .option("--force", "Overwrite an existing output file")
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(async (skill, options) => {
      const output = await executeGenerate({
        skill,
        out: options.out,
        force: Boolean(options.force),
        cwd: process.cwd(),
      });
      process.stdout.write(output);
    });
}
