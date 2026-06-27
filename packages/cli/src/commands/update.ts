import { Command } from "@commander-js/extra-typings";
import { executeUpdate } from "../install/update";

export function makeUpdateCommand() {
  return new Command("update")
    .description("Refresh installed templates or groups from where they came")
    .argument(
      "[id...]",
      "Installed template or group id(s) to update (default: all tracked)",
    )
    .option(
      "-g, --global",
      "Update in the global root instead of the local one",
    )
    .option("--force", "Overwrite a locally-modified unit instead of refusing")
    .option(
      "--check",
      "Report whether each target is up to date without changing anything",
    )
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(async (ids, options) => {
      const result = await executeUpdate({
        ids,
        global: Boolean(options.global),
        force: Boolean(options.force),
        check: Boolean(options.check),
        cwd: process.cwd(),
        // Per-id success/up-to-date lines go to stdout; per-id failures/skips
        // (and `--check` staleness) go to stderr as uniform `Error:` lines. Both
        // are emitted as they complete so a partial best-effort run reports every
        // id even though the overall command exits 1.
        emitOut: (line) => process.stdout.write(`${line}\n`),
        emitErr: (line) => process.stderr.write(`${line}\n`),
      });

      // Best-effort: the command never throws on a per-id failure (that would
      // abort the remaining ids and collapse to one top-level error). Instead it
      // sets exit 1 when anything errored, was skipped-dirty, or (under --check)
      // is stale, while a fully up-to-date / cleanly-updated run exits 0.
      if (!result.ok) {
        process.exitCode = 1;
      }
    });
}
