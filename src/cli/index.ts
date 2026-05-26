#!/usr/bin/env node
import { formatCliError } from "../errors";
import { runSkillrouterCommand } from "./commands";

const cwd = process.env.SKILLROUTER_TEST_CWD ?? process.cwd();

try {
  const output = await runSkillrouterCommand(process.argv.slice(2), cwd);
  if (output !== "") {
    process.stdout.write(output);
  }
} catch (error) {
  process.stderr.write(`${formatCliError(error)}\n`);
  process.exitCode = 1;
}
