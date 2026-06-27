import { Command } from "@commander-js/extra-typings";
import { makeAddCommand } from "./commands/add";
import { makeGenerateCommand } from "./commands/generate";
import { makeListCommand } from "./commands/list";
import { makeRemoveCommand } from "./commands/remove";
import { makeRunCommand } from "./commands/run";
import { makeUpdateCommand } from "./commands/update";
import { makeValidateCommand } from "./commands/validate";
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
    .addCommand(makeGenerateCommand())
    .addCommand(makeValidateCommand())
    .addCommand(makeAddCommand())
    .addCommand(makeListCommand())
    .addCommand(makeRemoveCommand())
    .addCommand(makeUpdateCommand());
}
