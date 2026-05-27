import { CommanderError } from "@commander-js/extra-typings";
import { formatCliError } from "../errors";
import { validateCliArgv } from "./args";
import { buildProgram } from "./program";

const program = buildProgram();

try {
  validateCliArgv(process.argv.slice(2));
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof CommanderError) {
    // --help, the generated help subcommand, and --version are successful exits.
    if (
      error.code === "commander.helpDisplayed" ||
      error.code === "commander.help" ||
      error.code === "commander.version"
    ) {
      process.exitCode = 0;
    } else {
      // Structural usage errors Commander detected: re-emit in skillrouter's
      // single-line form (strip Commander's own "error: " prefix).
      process.stderr.write(`Error: ${error.message.replace(/^error: /, "")}\n`);
      process.exitCode = 1;
    }
  } else {
    process.stderr.write(`${formatCliError(error)}\n`);
    process.exitCode = 1;
  }
}
