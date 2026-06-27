import { Command } from "@commander-js/extra-typings";
import { executeList } from "../install/list";

export function makeListCommand() {
  return new Command("list")
    .description("List installed templates and groups across the .jastr/ roots")
    .option("--local", "Restrict the inventory to the local root")
    .option("--global", "Restrict the inventory to the global root")
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(async (options) => {
      const output = await executeList({
        local: Boolean(options.local),
        global: Boolean(options.global),
        cwd: process.cwd(),
      });
      process.stdout.write(output);
    });
}
