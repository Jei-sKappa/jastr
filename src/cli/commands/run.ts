import { Command } from "@commander-js/extra-typings";
import { parseRunFlags } from "../args";
import { executeRun } from "../commands";

export function makeRunCommand() {
  return new Command("run")
    .description("Render a skill template to its final instructions")
    .argument("<skill>", "Skill to render")
    .argument(
      "[inputs...]",
      "Template input flags (--name=value or --name for booleans)",
    )
    .allowUnknownOption()
    .passThroughOptions()
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(async (skill, inputs) => {
      const flags = parseRunFlags(inputs);
      const output = await executeRun({ skill, flags, cwd: process.cwd() });
      process.stdout.write(output);
    });
}
