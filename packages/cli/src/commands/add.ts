import { Command } from "@commander-js/extra-typings";
import { executeAdd } from "../install/add";

export function makeAddCommand() {
  return new Command("add")
    .description(
      "Install a template (or group) from a git source or local path into .jastr/",
    )
    .argument("<repo-source>", "Local path, owner/repo shorthand, or git URL")
    .argument(
      "<name>",
      "Template or group name to install from the source's .jastr/",
    )
    .option("--ref <ref>", "Branch or tag to clone (not a commit SHA)")
    .option("--path <path>", "Subdirectory to cd into before resolving .jastr/")
    .option(
      "-g, --global",
      "Install into the global root instead of the local one",
    )
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(async (source, name, options) => {
      const output = await executeAdd({
        source,
        name,
        ref: options.ref,
        path: options.path,
        global: Boolean(options.global),
        cwd: process.cwd(),
      });
      process.stdout.write(output);
    });
}
