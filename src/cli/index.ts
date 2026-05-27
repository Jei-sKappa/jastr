import { formatCliError } from "../errors";
import { runSkillrouterCommand } from "./commands";

try {
  const output = await runSkillrouterCommand(
    process.argv.slice(2),
    process.cwd(),
  );
  if (output !== "") {
    process.stdout.write(output);
  }
} catch (error) {
  process.stderr.write(`${formatCliError(error)}\n`);
  process.exitCode = 1;
}
