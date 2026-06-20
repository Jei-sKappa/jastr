import { Command } from "@commander-js/extra-typings";
import { executeGenerate } from "../commands";

export function makeGenerateCommand() {
  return new Command("generate")
    .description("Generate an artifact target from a Jastr template")
    .argument("<target>", "Artifact target to generate (agent-skill)")
    .argument(
      "<template-ref>",
      "Template id, template variant (<id>#<variant>), or .md file path",
    )
    .option("--out <path>", "Output path for the generated artifact")
    .option(
      "--check",
      "Verify the committed output matches the template without writing",
    )
    .option("--force", "Overwrite an existing output file")
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(async (target, templateRef, options) => {
      const output = await executeGenerate({
        target,
        templateRef,
        out: options.out,
        force: Boolean(options.force),
        check: Boolean(options.check),
        cwd: process.cwd(),
      });
      process.stdout.write(output);
    });
}
