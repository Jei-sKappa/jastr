import { Command } from "@commander-js/extra-typings";
import { parseRunFlags } from "../args";
import { executeRun } from "../commands";

export function makeRunCommand() {
  return new Command("run")
    .description("Render a Jastr template to Markdown")
    .argument(
      "<template-ref>",
      "Template id, template variant (<id>#<variant>), or .md file path",
    )
    .argument(
      "[inputs...]",
      "Template input flags (--name=value or --name for booleans)",
    )
    .allowUnknownOption()
    .passThroughOptions()
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(async (templateRef, inputs) => {
      const flags = parseRunFlags(inputs);
      const output = await executeRun({
        templateRef,
        flags,
        cwd: process.cwd(),
      });
      process.stdout.write(output);
    });
}
