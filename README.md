# Skillrouter

> Deterministic skill routing for AI agents: write rich Markdown templates once,
> then render only the instructions each task actually needs.

Skillrouter is a CLI for keeping agent-facing skills tiny while moving
validation, branching, includes, and instruction rendering into a deterministic
command-line workflow.

Authors write project-local templates under `.skillrouter/<skill>/`, while
visible agent skills only tell the agent to run `skillrouter run <skill>
$ARGUMENTS` and follow the Markdown output.

## Commands

```bash
skillrouter run <skill> [input flags...]
skillrouter generate <skill> --out <path> [--force]
skillrouter --help
skillrouter help [command]
skillrouter --version
```

`--version` reports the package version together with the git commit it was
built from, e.g. `0.1.0 (abc1234)` (or `0.1.0 (dev)` when run from source). The
commit hash is baked in at build time.

`run` discovers the nearest ancestor containing `.skillrouter/`, loads
`.skillrouter/<skill>/SKILL.template.md`, validates declared inputs, evaluates
Skillrouter directives, resolves includes, interpolates inputs, and prints
Markdown to stdout.

`generate` writes a minimal router `SKILL.md` to an explicit destination. It
validates Agent Skills `name` and `description` frontmatter, omits
Skillrouter-owned fields such as `inputs`, and passes through additional
kebab-case frontmatter fields for ecosystem-specific skill specs. On success it
prints the generated path and source template path. It does not guess
agent-specific skill folders.

## Template Example

```md
---
name: analyze-code
description: Analyze code for bugs, security issues, and quality issues
inputs:
  language:
    type: enum
    values: [typescript, python]
    required: true
  target-file:
    type: string
    required: false
  dry-run:
    type: boolean
    required: false
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

## Development

```bash
bun install
bun run format
bun run check
bun run typecheck
bun run test
bun run test:e2e
```

Functional requirements live in area files under `requirements/functional/`.
Requirement IDs use `<AREA>-FR-<NNNN>` (for example `RUN-FR-0001`); each
requirement owns acceptance criteria with `AC-NNNN` IDs, referenced as
`<FR-ID>.AC-NNNN`. E2E cases under `test/e2e/cases/<case-id>/case.yml`
exercise those criteria via `covers: [<FR-ID>.AC-NNNN, ...]` and are executed by
the Vitest suite under `test/e2e/`. Run `bun run test:e2e` for focused
functional-requirement validation and traceability checks.
