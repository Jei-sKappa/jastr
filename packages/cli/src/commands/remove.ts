import { Command } from "@commander-js/extra-typings";
import { executeRemove } from "../install/remove";

export function makeRemoveCommand() {
  return new Command("remove")
    .description("Remove installed templates or groups from a .jastr/ root")
    .argument("<id...>", "Installed template or group id(s) to remove")
    .option(
      "-g, --global",
      "Remove from the global root instead of the local one",
    )
    .option("--force", "Delete a locally-modified unit instead of refusing")
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(async (ids, options) => {
      await executeRemove({
        ids,
        global: Boolean(options.global),
        force: Boolean(options.force),
        cwd: process.cwd(),
        // Emit each outcome line as it completes so a partial run (a later id
        // throws) still reports the ids it already removed.
        emit: (line) => process.stdout.write(`${line}\n`),
      });
    });
}
