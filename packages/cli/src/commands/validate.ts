import { Command } from "@commander-js/extra-typings";
import { executeValidate } from "../commands";

export function makeValidateCommand() {
  return new Command("validate")
    .description(
      "Validate a Jastr template without rendering or writing output",
    )
    .argument(
      "<template-ref>",
      "Template id, template variant (<id>#<variant>), or .md file path",
    )
    .configureOutput({ outputError: () => {} })
    .exitOverride()
    .action(async (templateRef) => {
      const output = await executeValidate({
        templateRef,
        cwd: process.cwd(),
      });
      process.stdout.write(output);
    });
}
