# Generating Router Skills

`skillrouter generate <skill> --out <path> [--force]` writes a small router
`SKILL.md` file that tells an agent to run Skillrouter and follow the rendered
output.

The output path is explicit. Skillrouter does not guess agent-specific folders.
Existing files are protected unless `--force` is provided.

<Example id="generate-router" />
