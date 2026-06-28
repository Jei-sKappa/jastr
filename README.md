# Jastr

Jastr is a deterministic Markdown template renderer for AI-agent workflows. It
lets authors keep reusable templates in a conventional `.jastr/` catalog or in
direct `.md` files, validate typed inputs, evaluate template directives, resolve
safe includes, and print final Markdown to stdout.

Agent Skill generation is a CLI target with two output modes, selected by
`--mode <router|inline>` (default `router`). In **router** mode a generated
`SKILL.md` is a small wrapper that runs `jastr run` and tells the agent to follow
the rendered output. Required inputs are inlined into the command as
`--flag=<value>` placeholders the agent fills in. A template with exactly one
input folds it into a tailored instruction sentence with no `## Inputs` section; a
template with two or more inputs lists them under a `## Inputs` section and
instructs the agent to construct the matching `--flag=value` arguments. In
**inline** mode the generated `SKILL.md` is fully self-contained: the same YAML
frontmatter followed by the fully-rendered template body (includes resolved,
conditionals evaluated, interpolations substituted), so it runs as an Agent Skill
on a machine with no `jastr` installed — nothing is shelled out at invocation.
Inline resolves every input at generate time through `run`'s precedence pipeline
(template input flags are accepted only in inline mode), so an unresolved required
input is a hard error.

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
jastr generate agent-skill <template-ref> --out <path> [--mode <router|inline>] [--check] [--force] [input flags...]
jastr validate <template-ref>
jastr add <repo-source> <name> [--ref <ref>] [--path <subdir>] [-g|--global]
jastr list [--variants] [--local] [--global]
jastr remove <id>... [-g|--global] [--force]
jastr update [<id>...] [-g|--global] [--force] [--check]
jastr --help
jastr help [command]
jastr --version
```

The `add` / `list` / `remove` / `update` family shares templates between
repositories with the same mental model as installing packages: **install** a
template (or whole group) into a `.jastr/` root, **inspect** what is installed,
**refresh** it from where it came, and **remove** it.

- `jastr add <repo-source> <name>` fetches the named template — a standalone
  template or a whole group — from the source's `.jastr/<name>/` and installs it
  into the local `.jastr/` root (or the global root with `-g`/`--global`). A
  `<repo-source>` that is a local directory is read in place; an `owner/repo`
  shorthand expands to its GitHub URL; any other string is passed to `git clone`.
  `--ref` selects a branch or tag and `--path` cds into a subdirectory of the
  source before resolving `.jastr/`. A two-segment `group/template` is rejected —
  groups install whole. Each fetched template is validated before it is committed,
  so a broken template is never installed.
- `jastr list` shows the installed and authored inventory across both roots
  (`--local` / `--global` restrict scope), marking tracked installs with their
  source and locally-authored templates as `local`. A group row lists its member
  templates beneath it as a sorted tree of `group/template` refs. The opt-in
  `--variants` flag additionally shows config-defined variants as a sorted
  `<ref>#<variant>` tree under each runnable template or group-member, read from
  each root's own `config.yml`.
- `jastr update [<id>...]` refreshes tracked installs from their recorded source;
  bare `update` refreshes everything in the root. `--check` reports drift without
  changing anything (exit 0 when all up to date, exit 1 otherwise) and cannot be
  combined with `--force`.
- `jastr remove <id>...` deletes tracked installs from one root; `--force`
  overrides the locally-modified guard.

Each root records what it installed in a per-root provenance lock at
`<root>/.jastr/lock.json`. The lock is committed and team-shared, written
deterministically, and ignored by template discovery (so `run`/`validate`/
`generate` behave the same whether or not it is present). Remote `add` and
`update` shell out to `git`, so **`git` must be on PATH** for those operations;
its absence is reported rather than hung on.

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
`jastr run analyze#strict`, inlining any unlocked required input as
`--flag=<value>`. The wrapper renders only the inputs the variant did not lock:
two or more unlocked inputs get a `## Inputs` section, exactly one unlocked input
gets a tailored single-input sentence, and a variant that locks every declared
input omits the inputs view entirely.

`generate agent-skill --check` answers "is the committed output still up to date
with its template?" It rebuilds the output in memory (the wrapper in router mode,
the inline `SKILL.md` in `--mode=inline`), byte-compares it against the file at
`--out`, and writes nothing. It exits `0` with `agent-skill at <out> is up to
date.` on an exact match, and exits `1` when the committed file is stale (its
bytes differ) or missing; in inline mode the suggested-fix command in those
failures names `--mode=inline`. Comparison is exact bytes with no normalization,
so even a line-ending or trailing-newline drift is reported as stale. Because
`--check` runs the full template and variant validation first, an invalid template
fails with its own error rather than a stale or missing report. `--check` cannot
be combined with `--force`.

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
