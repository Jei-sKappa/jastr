# AGENTS.md

This file provides guidance to AI Agents when working with code in this
repository.

## Update rule

Future agents read this file as a contract: every claim in it is treated as
currently true. Stale claims actively mislead — they're worse than missing
ones. Treat keeping this file accurate as part of the change, not a
follow-up.

Update `AGENTS.md` when:

- You make significant changes that needs to be remembered across session.
- You made a mistake that should not be repeated.
- The user told you a new rule that should be remembered.
- **You change behavior, restrictions, defaults, or interfaces that this
  file describes.** Before considering a feature done, grep this file for
  claims about the area you touched and reconcile them with the new state.
  Pay particular attention to phrases like "v1 restrictions", "requires",
  "always", "never", "only", and "default" — these are the assertions most
  likely to go stale when a feature is extended.
- **You add, supersede, or extend a spec.** Add (or update) the spec link in
  the relevant Architecture Decisions bullet. If the new spec changes what an
  existing bullet asserts, rewrite the bullet, do not just append the link.

Also update `README.md` when a meaningful project change affects the public
description, user-facing behavior, setup/usage instructions, or current status.

> Note: `CLAUDE.md` is a symlink to `AGENTS.md`.

## Project

Skillrouter is a CLI for deterministic AI-agent skill specialization. Its goal
is to keep agent-facing skill files tiny while moving argument validation,
branch selection, includes, interpolation, and final instruction rendering into
a command-line workflow.

The authoring surface is project-local Markdown templates under
`.skillrouter/<skill>/SKILL.template.md`. Agent-facing skills should be minimal
router files that tell the agent to run `skillrouter run <skill> $ARGUMENTS`
and follow the rendered Markdown output.

The project has a v1 CLI implementation. The primary design thread remains
`docs/threads/260526113604Z-agent-skill-router-cli/`; treat claims there as
design context and prefer the current implementation plus the latest discussion
decisions over older proposal examples when they disagree.

Current v1 direction:

- The implemented v1 contract is
  `docs/threads/260526113604Z-agent-skill-router-cli/specs/260526140146Z-v1-spec.md`.
- Canonical commands are `skillrouter run <skill> [input flags...]` and
  `skillrouter generate <skill> --out <path> [--force]`, plus `--help`,
  `help [command]`, and `--version`.
- V1 stays agent-agnostic; generated router skill output paths are explicit.
- Templates use Markdown with frontmatter inputs and a small directive set:
  `if`, `else-if`, `else`, `include`, and `include-raw`.
- The CLI is built on Commander (`@commander-js/extra-typings`):
  `src/cli/program.ts` assembles the `run`/`generate` command factories
  (`src/cli/commands/`), `--help`, and `--version`. Command bodies stay thin
  over the testable `executeRun`/`executeGenerate` helpers
  (`src/cli/commands.ts`), which front the parsing, validation, rendering,
  include resolution, condition evaluation, and interpolation modules.
- `run`'s per-template input flags are deliberately **not** Commander options
  (they vary per template). Commander passes them through
  (`passThroughOptions` + `allowUnknownOption`) to skillrouter's own
  `parseRunFlags` (`src/cli/args.ts`), which enforces the strict v1 flag
  syntax. `generate` declares `--out`/`--force` as Commander options.
- Error UX is uniform: every failure prints `Error: <message>` to stderr with
  exit code 1 (the entry point re-emits Commander usage errors in this form);
  only `--help`, `help [command]`, and `--version` exit 0. Commander's own
  stderr is silenced via `configureOutput`.
- `--version` prints `<package version> (<git short SHA>)`, or `(dev)` when run
  from source/tests. The SHA is injected at build time via
  `bun build --define SKILLROUTER_GIT_SHA=...` and resolved in
  `src/cli/version.ts` (with `src/cli/globals.d.ts` declaring the global).
- Use Bun as runtime/package manager/bundler, but avoid Bun-specific runtime
  APIs and Bun's test runner so the project can move to Node or another runtime
  later if needed. (The `--define` git-SHA injection is a build-time bundler
  flag, not a runtime API.)

## Engineering Principles

These principles guide all implementation decisions in this project:

- **Law of Demeter**: A module should know as little as possible about the
  internal structure of other modules. Reduce coupling.
- **Principle of Least Astonishment**: Code should behave in a way other
  developers would reasonably expect.
- **Separation of Concerns**: Split a system into distinct parts, each handling
  a specific concern.
- **Premature Optimization is the Root of All Evil**: Optimize only when there
  is evidence it matters. Readability and correctness come first.
- **Defensive Programming**: Assume inputs, dependencies, and environments may
  fail or misbehave. Validate and safeguard at system boundaries.
- **Design for Testability**: Structure code so it is easy to verify
  automatically. Testable code tends to be more modular and loosely coupled.
- **KISS**: Avoid unnecessary complexity. Simplicity is better than cleverness.
- **YAGNI**: Do not build features until they are actually needed.
- **DRY**: Avoid duplication. Code that repeats itself is harder to maintain.

## Behavioral guidelines

Behavioral guidelines to reduce common LLM coding mistakes. Merge with
project-specific instructions or explicit user requests as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial
tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes,
simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it
work") require constant clarification.

## Playground

The `playground` folder is for testing out ideas and concepts and, more
importantly, to actually exercise skillrouter for real. Use it as you wish
because it's gitignored.

## Test Layout

- Skillrouter is a single package: source lives under root `src/`, tests under
  root `test/`.
- Tests are vitest specs named `test/<area>.test.ts` (for example
  `test/includes.test.ts`, `test/cli-integration.test.ts`). Run the whole suite
  with `bun run test` (which invokes `vitest run`).
- Shared test helpers and fixtures live in `test/helpers.ts` and alongside the
  specs that use them.
- Keep `tsconfig.json` source-only unless there is a specific reason to include
  tests in the TypeScript project.
- Executable documentation examples live under `docs/examples/` and are
  validated by `test/docs/`. Final-user docs pages live under `docs/site/`.
  Any user-facing command, output, generated file, or behavior shown in docs
  must be backed by an executable docs example or generated from one.
- The VitePress docs site must render Skillrouter `{{...}}` placeholders
  literally. The docs Markdown config marks inline code as `v-pre`, and
  generated example code blocks are emitted with `v-pre`. Do not solve this by
  changing Vue's global delimiters in VitePress config; that breaks VitePress
  theme interpolation.

## Notes

A senior developer reviews all output once you finished your tasks.

To check that the project has no known local issues, run all of:

- `bun run check` for Biome formatting, lint, and assist diagnostics.
- `bun run typecheck` for TypeScript compiler errors.
- `bun run test` for the automated test suite.
- `bun run docs:check` for executable documentation example validation.
- `bun run docs:build` for the static documentation site build.

All of the above commands should exit with code 0 before considering the
codebase clean.

Use `bun run format` to apply Biome formatting.

Biome is configured with `vcs.useIgnoreFile` so it honors `.gitignore` and
skips gitignored vendored content (e.g. `.library/`); without this, a nested
`biome.json` inside a vendored project breaks `bun run check`/`format`.

IMPORTANT: This project is currently private and in a high development phase.
When considering making changes to the codebase we do need to worry about
breaking changes because currently no one is using it.
