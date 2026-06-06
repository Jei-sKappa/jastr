import { Command } from "@commander-js/extra-typings";

export function makeGenerateCommand() {
  const generate = new Command("generate")
    .description("Generate an artifact target from a Jastr template")
    .configureOutput({ outputError: () => {} })
    .exitOverride();

  generate
    .command("agent-skill")
    .description("Generate a minimal Agent Skill wrapper")
    .argument("<template-ref>", "Template id or .md file path")
    .option("--out <path>", "Output path for the generated SKILL.md")
    .option("--force", "Overwrite an existing output file")
    .action(() => {
      throw new Error("generate agent-skill command is not wired yet");
    });

  return generate;
}
