import { Command } from "@commander-js/extra-typings";
import { makeGenerateCommand } from "./commands/generate";
import { makeRunCommand } from "./commands/run";
import { JASTR_GIT_SHA_OR_DEV, JASTR_VERSION } from "./version";

export function buildProgram(): Command {
  return new Command()
    .name("jastr")
    .description("Deterministic Markdown template rendering")
    .version(`${JASTR_VERSION} (${JASTR_GIT_SHA_OR_DEV})`)
    .enablePositionalOptions()
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .addCommand(makeRunCommand())
    .addCommand(makeGenerateCommand());
}
