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
jastr generate agent-skill <template-ref> --out <path> [--check] [--force]
jastr validate <template-ref>
jastr --help
jastr help [command]
jastr --version
```

Input values for bare named template runs are resolved in this order: CLI input
flags, then selected `.jastr/config.yml` values for `inputs.<template-ref>`,
then template-author `default:` values in frontmatter. Variant runs add a
stronger selected lock layer: `variants.<template-ref>.<variant-id>.locked-inputs`
overrides CLI flags, baseline config inputs, and template defaults. A CLI flag
for a locked input is rejected instead of silently overwritten. Direct `.md`
template runs use only CLI input flags and frontmatter defaults; they do not
read `.jastr/config.yml` and cannot select variants.

`<template-ref>` is syntactic:

- A value ending in `.md` is a direct Markdown template file path.
- A value matching `^[a-z0-9][a-z0-9-]*$` is a named template id and resolves to
  `.jastr/<template-id>/TEMPLATE.md` under the nearest ancestor containing
  `.jastr/`.
- A value shaped as `<group>/<template-id>`, where both segments match
  `^[a-z0-9][a-z0-9-]*$`, is a grouped named template and resolves to
  `.jastr/<group>/templates/<template-id>/TEMPLATE.md` under the nearest ancestor
  containing `.jastr/`, when `.jastr/<group>/.jastrgroup` exists as a file.
- A named or grouped named template may add `#<variant-id>`, where
  `<variant-id>` uses the same lowercase kebab-case segment grammar. For
  example, `analyze#strict` selects `variants.analyze.strict`; `team/review#deep`
  selects `variants["team/review"].deep`. Direct `.md#variant` refs are invalid.

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
live alongside them under `.jastr/`, at
`.jastr/<group>/templates/<template-id>/TEMPLATE.md` with a `.jastrgroup` marker
at `.jastr/<group>`. Direct file templates can live anywhere the caller can
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

Keys under `inputs` and `variants` are exact named template refs. A one-segment
template uses a key such as `analyze`; a grouped template uses a key such as
`team/review`. Config values are strict YAML values, so boolean inputs use YAML
booleans such as `true` rather than quoted strings.

Variants specialize a base template without copying it:

```yaml
variants:
  analyze:
    strict:
      locked-inputs:
        language: typescript
      agent-skill:
        frontmatter:
          name: analyze-typescript
          description: Analyze TypeScript using the strict policy.
```

`jastr run analyze#strict` renders the base `.jastr/analyze/TEMPLATE.md` with
`language` locked to `typescript`. `jastr generate agent-skill analyze#strict
--out path/to/SKILL.md` writes a wrapper whose command points back to
`jastr run analyze#strict`. The wrapper forwards `$ARGUMENTS` only when the
base template still has at least one declared input that the variant did not
lock.

`generate agent-skill --check` answers "is the committed wrapper still up to date
with its template?" It rebuilds the wrapper in memory, byte-compares it against
the file at `--out`, and writes nothing. It exits `0` with
`agent-skill at <out> is up to date.` on an exact match, and exits `1` when the
committed file is stale (its bytes differ) or missing. Comparison is exact bytes
with no normalization, so even a line-ending or trailing-newline drift is
reported as stale. Because `--check` runs the full template and variant
validation first, an invalid template fails with its own error rather than a
stale or missing report. `--check` cannot be combined with `--force`.

`jastr validate <template-ref>` answers "is this template well-formed enough to
use at all?" It runs the same static-validation pipeline as `run` and `generate`
— frontmatter and schema validation, variant resolution for a `#<variant-id>`
ref, a static render that exercises directives, conditions, interpolation, and
include resolution, and (when the ref declares it) agent-skill target metadata
validation — without taking input flags, requiring an `--out`, or writing
anything. On success it prints `Template <template-ref> is valid.` and exits `0`;
on any defect it fails with the same `Error: <message>` and exit code that defect
produces under `run`/`generate`. A template with no `targets.agent-skill` still
passes, because it remains runnable via `jastr run`.

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
