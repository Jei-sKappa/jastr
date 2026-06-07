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

`<template-ref>` is syntactic:

- A value ending in `.md` is a direct Markdown template file path.
- A value matching `^[a-z0-9][a-z0-9-]*$` is a named template id and resolves to
  `.jastr/<template-id>/template.md` under the nearest ancestor containing
  `.jastr/`.

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
targets:
  agent-skill:
    name: analyze-code
    description: Analyze code with the rendered Jastr template output.
    frontmatter:
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

Named templates live at `.jastr/<template-id>/template.md`. Direct file
templates can live anywhere the caller can reference with a `.md` path.

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
