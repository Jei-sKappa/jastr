import { Command } from "@commander-js/extra-typings";
import { makeGenerateCommand } from "./commands/generate";
import { makeRunCommand } from "./commands/run";
import { SKILLROUTER_GIT_SHA_OR_DEV, SKILLROUTER_VERSION } from "./version";

export function buildProgram(): Command {
  return (
    new Command()
      .name("skillrouter")
      .description("Deterministic AI-agent skill specialization")
      .version(`${SKILLROUTER_VERSION} (${SKILLROUTER_GIT_SHA_OR_DEV})`)
      .enablePositionalOptions()
      // Silence Commander's own stderr; the entry point re-emits usage errors
      // in skillrouter's "Error: <message>" form.
      .configureOutput({ outputError: () => {} })
      .exitOverride()
      .addCommand(makeRunCommand())
      .addCommand(makeGenerateCommand())
  );
}
