# Jastr

Jastr is a deterministic Markdown template renderer for AI-agent workflows. It
lets authors keep reusable templates in a conventional `.jastr/` catalog or in
direct `.md` files, validate typed inputs, evaluate template directives, resolve
safe includes, and print final Markdown to stdout.

Agent Skill generation is a CLI target. A generated `SKILL.md` remains a small
wrapper that runs `jastr run` and tells the agent to follow the rendered output.

## Packages

- `packages/engine` is `@jastr/engine`: pure template parsing, schema
  validation, domain input validation, directive evaluation, interpolation, and
  rendering from explicit source through injected include resolvers.
- `packages/cli` is `@jastr/cli`: the `jastr` binary, Commander wiring,
  filesystem template lookup, CLI flag parsing, include containment, Agent Skill
  generation, output writing, error formatting, help, and version output.

## Commands

```bash
jastr run <template-ref> [input flags...]
jastr generate agent-skill <template-ref> --out <path> [--force]
jastr --help
jastr help [command]
jastr --version
```

Input values are resolved in this order: CLI input flags, then selected
`.jastr/config.yml` values for named template runs, then template-author
`default:` values in frontmatter. Direct `.md` template runs use only CLI input
flags and frontmatter defaults; they do not read `.jastr/config.yml`.

`<template-ref>` is syntactic:

- A value ending in `.md` is a direct Markdown template file path.
- A value matching `^[a-z0-9][a-z0-9-]*$` is a named template id and resolves to
  `.jastr/<template-id>/TEMPLATE.md` under the nearest ancestor containing
  `.jastr/`.
- A value shaped as `<group>/<template-id>`, where both segments match
  `^[a-z0-9][a-z0-9-]*$`, is a grouped named template and resolves to
  `<group>/templates/<template-id>/TEMPLATE.md` when `<group>/.jastrgroup`
  exists as a file.

`--version` reports the `@jastr/cli` package version together with the git commit
it was built from, for example `0.1.0 (abc1234)`, or `0.1.0 (dev)` when run from
source.

## Template Example

```md
---
inputs:
  language:
    type: enum
    values: [typescript, python]
    required: true
  target-file:
    type: string
    required: false
    default: src/index.ts
targets:
  agent-skill:
    frontmatter:
      name: analyze-code
      description: Analyze code with the rendered Jastr template output.
      allowed-tools: Read, Grep
---

# Analyze {{language}}

::::if{condition="${language} == 'typescript'"}
Use the TypeScript checklist.
::include{path="fragments/typescript.md"}
::::

::::else-if{condition="${language} == 'python'"}
Use the Python checklist.
::::

::::else
Ask the user for a supported language.
::::
```

Named templates live at `.jastr/<template-id>/TEMPLATE.md`. Grouped templates
live at `<group>/templates/<template-id>/TEMPLATE.md` with a `.jastrgroup`
marker at `<group>`. Direct file templates can live anywhere the caller can
reference with a `.md` path.

Named template runs may use project-local config at `.jastr/config.yml`:

```yaml
inputs:
  analyze:
    language: typescript
    target-file: src/index.ts
  team/review:
    depth: deep
```

Keys under `inputs` are exact named template refs. A one-segment template uses a
key such as `analyze`; a grouped template uses a key such as `team/review`.
Config values are strict YAML values, so boolean inputs use YAML booleans such
as `true` rather than quoted strings.

Includes are contained by final resolved realpath. Standalone templates can
include only inside the top-level template directory. Grouped templates can
include only inside the group root. `::include{path="fragment.md"}` resolves
from the top-level template directory,
`::include{root="group", path="shared.md"}` resolves from the group root, and
`::include{root="file", path="sibling.md"}` resolves from the file containing
the directive.

## Development

```bash
bun install
bun run format
bun run check
bun run typecheck
bun run test
bun run test:cli:e2e
bun run docs:cli:living --check
bun run build
```

CLI functional requirements live under
`packages/cli/requirements/functional/`. CLI e2e cases live under
`packages/cli/test/e2e/cases/<case-id>/case.yml` and are executed by
`bun run test:cli:e2e`.

`bun run docs:cli:living` regenerates `packages/cli/docs/BEHAVIOR.md` from the
CLI requirements and e2e cases. Use `bun run docs:cli:living --check` to fail
when the committed behavior reference is stale.
