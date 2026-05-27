# Executable UX Regression Coverage

## Intent

Add a lightweight executable documentation layer for Skillrouter's user-facing
CLI behavior. The goal is to let the project owner describe expected behavior
in readable examples, then have those examples run as regression tests.

This is especially important because Skillrouter is expected to be built mostly
through AI-agent sessions where the user says what they want and then needs a
clear way to verify that the implementation matches the intended UX.

The central rule proposed here is:

> Any new user-facing CLI behavior, flag, error, config rule, or output contract
> must be represented by at least one executable UX case.

## Context

Skillrouter is a private, early-stage CLI for deterministic AI-agent skill
specialization. It renders project-local
`.skillrouter/<skill>/SKILL.template.md` templates through:

```bash
skillrouter run <skill> [input flags...]
```

and generates minimal router skills through:

```bash
skillrouter generate <skill> --out <path> [--force]
```

The project already has conventional Vitest tests under `test/`. Those tests
cover parser, compiler, condition, include, interpolation, generation, and CLI
integration behavior. The current v1 spec already contains an "Acceptance
Guidance" section that reads like a manual regression checklist.

The missing layer is not more unit coverage. The missing layer is a durable,
reviewable artifact that lists the product's user-facing behaviors and executes
them as black-box CLI examples:

- input files
- current working directory
- command and arguments
- expected exit code
- expected stdout
- expected stderr
- expected generated or modified files
- important edge cases and rejected forms

This would let the user inspect a small set of docs and ask, "Does this describe
what I meant?" Then `bun run test` can verify that the code actually behaves
that way.

## Recommendation

Use a Markdown-backed executable UX contract, implemented with Vitest.

The proposal is to add readable Markdown case files under `docs/ux/`, then add a
small Vitest runner that parses structured case blocks from those Markdown files
and runs the real CLI against temporary fixture projects.

This keeps the source of truth close to documentation while avoiding a separate
BDD framework.

Suggested files:

```text
docs/ux/feature-inventory.md
docs/ux/cases/run.md
docs/ux/cases/generate.md
docs/ux/cases/errors-and-flags.md
test/ux/cli-ux.test.ts
test/ux/case-loader.ts
```

`docs/ux/feature-inventory.md` should list the user-facing feature matrix with
stable case IDs. It should not be an exhaustive implementation map. It should
answer: what can users observe, what flags/configs exist, what edge cases are
intentional, and which executable cases protect those claims.

The case Markdown files should be human-readable first, with embedded structured
blocks for execution.

Example case shape:

````md
## RUN-001 renders selected TypeScript branch

```skillrouter-case
id: RUN-001
cwd: "."
command: ["run", "demo", "--language=typescript", "--target-file=src/index.ts"]
files:
  .skillrouter/demo/SKILL.template.md: |
    ---
    name: demo
    description: Demo skill
    inputs:
      language:
        type: enum
        values: [typescript, python]
        required: true
      target-file:
        type: string
        required: false
    ---
    # Demo

    :::if{condition="${language} == 'typescript'"}
    Analyze {{target-file}} as TypeScript.
    :::
expect:
  exitCode: 0
  stdout: |
    # Demo

    Analyze src/index.ts as TypeScript.
  stderr: ""
```
````

The exact block format can be refined in the spec, but the shape should remain
boring and explicit: setup files, command, expected process result, and expected
filesystem result.

## How This Coexists With Existing Tests

The existing Vitest tests should remain. This proposal adds a new test layer
rather than replacing the current suite.

Existing unit/module tests should continue to cover:

- frontmatter parsing
- input schema validation
- raw flag parsing
- input coercion
- condition parsing and evaluation
- directive scanning
- include resolution and cycle detection
- interpolation
- rendering internals
- router skill content generation

Existing CLI integration tests should continue to cover command plumbing and
important smoke tests.

The new executable UX tests should cover observable product behavior:

- command shape
- accepted and rejected flag forms
- cwd-sensitive behavior
- stdout/stderr separation
- exact success and error text where that text is part of UX
- generated file contents
- overwrite behavior
- project root discovery
- important include and template edge cases
- help and version behavior

The new layer should not exhaustively retest every parser permutation. It should
lock the behavior that a user or agent can observe.

## Alternatives Considered

BDD/Gherkin is probably overkill right now.

Skillrouter's current UX contract is deterministic CLI I/O. Most Gherkin
scenarios would become ceremony around the same shape:

- given these files
- when I run this command
- then stdout/stderr/exit/files equal this

That can be expressed more directly in Markdown plus structured executable
blocks, without adding Cucumber, step definitions, or natural-language parsing.

User stories are useful for framing but not sufficient for regression. A story
like "As a skill author, I want to generate a router skill" does not preserve
byte-stable stdout, exact error messages, or path resolution behavior.

Acceptance criteria are highly appropriate. The existing v1 spec already has
acceptance guidance. The next step is to convert the most important criteria
into executable examples with stable IDs.

A feature model is useful only in lightweight form. A Markdown table that maps
features, flags, configs, edge cases, and case IDs is enough. A formal modeling
tool would be too much for this project stage.

Golden or snapshot CLI tests are appropriate, with caution. Skillrouter has
byte-stable Markdown output as part of the contract, so expected stdout should
be compared exactly. However, broad auto-updated snapshots would make review
weaker. Prefer explicit expected outputs in named UX cases or focused golden
files that reviewers can understand.

Docs-driven tests are the best fit if kept small. The docs should be readable
Markdown, and the test runner should enforce that the examples still work.

A generated documentation website from Markdown would not be enough by itself.
A site can render stale examples beautifully. The docs need to be executable and
test-backed first. A website can come later as a presentation layer over the
same Markdown.

## Concrete Initial Case Set

Start with a small set of high-value UX cases rather than trying to encode the
entire compiler test suite.

`RUN-001`: `run` from a nested cwd discovers the nearest `.skillrouter`, renders
the selected branch, strips root frontmatter, strips directive syntax, and
prints Markdown only to stdout.

`RUN-002`: `include` evaluates directives and interpolation inside included
files, while `include-raw` inserts literal content without evaluating
Skillrouter syntax.

`RUN-003`: a missing optional input is falsey in conditions, but direct
interpolation of that missing optional input fails.

`FLAGS-001`: accepted flag forms for enum, string, and boolean inputs:
`--language=typescript`, `--target-file=src/index.ts`, `--dry-run`,
`--dry-run=true`, and `--dry-run=false`.

`FLAGS-002`: rejected flag forms and values: unknown input flag, duplicate flag,
`--no-dry-run`, bare string flag, bare enum flag, invalid enum value, and empty
string/enum value.

`GENERATE-001`: `generate` writes a router skill, preserves valid extra
frontmatter fields, omits Skillrouter-owned fields such as `inputs`, includes
the exact `skillrouter run demo $ARGUMENTS` command, and prints the generated
path plus source template path.

`GENERATE-002`: `--out` is required; relative `--out` resolves from the
invoking cwd; missing parent directories are created; existing output is refused
unless `--force` is provided.

`EDGE-001`: missing `.skillrouter` root fails with a single-line stderr error,
non-zero exit code, and empty stdout.

`EDGE-002`: include paths reject absolute paths, `~` paths, paths that escape
the project root, `.env`, and `.env.*`.

`CLI-001`: `--help`, `help`, `help run`, and `--version` are successful paths.
Help output should include the canonical command names, while version output
should match the source/test behavior.

## Example Case Details To Preserve

The UX runner should support temporary project setup so each case can define
only the files it needs. It should use the same real CLI entry point as existing
integration tests, not internal function calls.

Useful assertion fields:

```yaml
expect:
  exitCode: 0
  stdout: |
    ...
  stderr: ""
  files:
    out/SKILL.md: |
      ...
  fileContains:
    out/SKILL.md:
      - "skillrouter run demo $ARGUMENTS"
      - "If the command exits non-zero"
  fileNotContains:
    out/SKILL.md:
      - "inputs:"
```

Useful setup fields:

```yaml
cwd: "."
command: ["run", "demo", "--language=typescript"]
files:
  .skillrouter/demo/SKILL.template.md: |
    ...
```

The spec should decide whether `stdout` expectations require a trailing newline
to be explicit. The current CLI writes rendered output directly and many tests
compare exact strings, so byte-for-byte behavior should remain deliberate.

## Workflow For AI-Built Changes

The intended workflow for future AI-agent changes is:

1. The user describes desired user-facing behavior.
2. The agent adds or updates an executable UX case first.
3. The case fails if the behavior does not exist yet.
4. The agent implements the change.
5. The case passes and becomes living documentation.
6. The reviewer inspects the UX case to confirm it matches the user's intent.

This turns the user's rough product expectations into reviewable artifacts
before or alongside implementation. It also gives future agents a concrete
contract to preserve.

## Phased Implementation Plan

Phase 1: Create the inventory.

Add `docs/ux/feature-inventory.md` from the current README, v1 spec, and
existing CLI integration tests. Give each public behavior a stable case ID. Do
not attempt to make this exhaustive at first; prioritize high-value UX behavior.

Phase 2: Add the case format and runner.

Add `test/ux/case-loader.ts` and `test/ux/cli-ux.test.ts`. The runner should
parse `skillrouter-case` fenced blocks from Markdown, create an isolated temp
project, write declared files, run the real CLI, and assert exit code, stdout,
stderr, and declared file expectations.

Phase 3: Port the highest-value existing CLI integration cases.

Mirror or move representative cases from `test/cli-integration.test.ts` into
`docs/ux/cases/`. Keep low-level or command-plumbing-only checks in normal
tests.

Phase 4: Add edge cases from the v1 acceptance guidance.

Add cases for flags, generate behavior, include path rejection, missing root,
stdout/stderr rules, and optional input behavior. Avoid duplicating every unit
test permutation.

Phase 5: Add contributor guidance.

Document the rule that new user-facing CLI behavior must add or update a UX
case. This probably belongs in `AGENTS.md` and possibly `README.md` once the
workflow exists.

Phase 6: Optional docs presentation.

Only after the executable docs stabilize, consider generating a static
documentation website from the Markdown. The website should be presentation,
not the source of truth. The executable Markdown cases remain authoritative.

## Open Questions

Should executable case blocks live directly in narrative docs, or should docs
link to separate `.case.yml` files? Inline Markdown blocks are more readable and
reviewable at this project stage, but separate files may be easier to validate
strictly later.

Should expected generated files be exact full-file comparisons by default, or
should cases prefer `fileContains` / `fileNotContains` for generated content?
Exact output is better for stable contracts, while contains-style checks are
better when irrelevant formatting would make tests brittle.

Should the UX runner support environment variables, stdin, or pre-existing
filesystem permissions? These do not appear necessary for v1 and should likely
be excluded until a real use case appears.

Should the docs runner be part of `bun run test` only, or should there also be a
separate `bun run test:ux` script? It should eventually run under `bun run test`
so regressions are not optional, but a focused script may be convenient.

Should existing `test/cli-integration.test.ts` cases be moved into docs-backed
cases or kept as-is and duplicated selectively? The conservative first step is
to keep them and add docs-backed UX cases for the most review-relevant behavior.
