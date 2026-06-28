import { Command } from "@commander-js/extra-typings";
import { parseRunFlags } from "../args";
import { executeGenerate } from "../commands";

export function makeGenerateCommand() {
  return new Command("generate")
    .description("Generate an artifact target from a Jastr template")
    .argument("<target>", "Artifact target to generate (agent-skill)")
    .argument(
      "<template-ref>",
      "Template id, template variant (<id>#<variant>), or .md file path",
    )
    .argument(
      "[inputs...]",
      "Template input flags for --mode=inline (--name=value or --name)",
    )
    .option("--out <path>", "Output path for the generated artifact")
    .option(
      "--check",
      "Verify the committed output matches the template without writing",
    )
    .option("--force", "Overwrite an existing output file")
    .option(
      "--mode <mode>",
      "Generation mode: router (wrapper) or inline (rendered body)",
      "router",
    )
    .allowUnknownOption()
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(async (target, templateRef, inputs, options) => {
      const mode = options.mode === "inline" ? "inline" : "router";
      const output = await executeGenerate({
        target,
        templateRef,
        out: options.out,
        force: Boolean(options.force),
        check: Boolean(options.check),
        mode,
        flags: parseRunFlags(inputs),
        cwd: process.cwd(),
      });
      process.stdout.write(output);
    });
}
