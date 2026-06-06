import { Command } from "@commander-js/extra-typings";

export function makeRunCommand() {
  return new Command("run")
    .description("Render a Jastr template to Markdown")
    .argument("<template-ref>", "Template id or .md file path")
    .argument(
      "[inputs...]",
      "Template input flags (--name=value or --name for booleans)",
    )
    .allowUnknownOption()
    .passThroughOptions()
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(() => {
      throw new Error("run command is not wired yet");
    });
}
