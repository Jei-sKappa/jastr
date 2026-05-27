# Authoring Templates

A Skillrouter template lives at `.skillrouter/<skill>/SKILL.template.md`.

The root template starts with YAML frontmatter. At minimum, generated router
skills need `name` and `description`. Templates that accept inputs declare them
under `inputs`.

Input names are reused consistently:

- CLI flag: `--target-file=src/index.ts`
- Condition reference: `${target-file}`
- Interpolation placeholder: `{{target-file}}`

Templates use Markdown for instructions and Skillrouter directives for
deterministic routing.

<Example id="run-string-interpolation" />
