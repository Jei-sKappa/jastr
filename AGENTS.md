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
  `skillrouter generate <skill> --out <path> [--force]`.
- V1 stays agent-agnostic; generated router skill output paths are explicit.
- Templates use Markdown with frontmatter inputs and a small directive set:
  `if`, `else-if`, `else`, `include`, and `include-raw`.
- The CLI should remain a thin shell around independently testable parsing,
  validation, rendering, include resolution, condition evaluation, and
  interpolation modules.
- Use Bun as runtime/package manager/bundler, but avoid Bun-specific runtime
  APIs and Bun's test runner so the project can move to Node or another runtime
  later if needed.

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

## Documents

This folders serves as a knowledge base for the project, update as needed.

Run `tree documents` to see all the available documents.

### Specs

Specs live under `docs/superpowers/specs/` and are named
`YYYY-MM-DD-<slug>-design.md`.

**Specs are immutable records of past decisions.** When implementing a feature
that revises, extends, or supersedes an earlier decision (including resolving
something that was filed as an "Open Question" in a prior spec), do **not**
edit the prior spec. Write a new dated spec that:

- Cites the prior spec at the top (e.g., "Supersedes the X open question in
  `docs/superpowers/specs/<old-spec>.md`.").
- Stands on its own enough that a reader can understand the new decision
  without reconstructing it from a diff against the old spec.
- May be small. A few paragraphs is fine if the decision is small.

The old spec stays as-is so the historical reasoning remains legible. New
specs are how decisions evolve; edits would erase the trail.

## Playground

The `playground` folder is a for testing out ideas and concepts and more
importantly to actually test bylaw for real. Use it as you wish because it's
gitignored.

## Test Layout

- Package-specific tests live beside the package they test:
  `packages/<name>/test/**`.
- Root `test/` is reserved for integration tests, end-to-end tests, and shared
  fixtures.
- LAW author tests live under each law directory as
  `laws/<law-name>/tests/<case-name>/`. Keep these fixtures small and readable
  because they are both regression tests and examples for law authors. Run them
  with `bun packages/cli/src/index.ts test laws` or target one law with
  `bun packages/cli/src/index.ts test laws/<law-name>`. Use
  `--format json` when checking machine-readable output.
- Keep package `tsconfig.json` files source-only unless there is a specific
  reason to include tests in a package-local TypeScript project.

## Notes

A senior developer reviews all output once you finished your tasks.

To check that the project has no known local issues, run all of:

- `bun run check` for Biome formatting, lint, and assist diagnostics.
- `bun run typecheck` for TypeScript compiler errors.
- `bun test` for the automated test suite.

All three commands should exit with code 0 before considering the codebase
clean.

IMPORTANT: This project is currently private and in a high development phase.
When considering making changes to the codebase we do need to worry about
breaking changes because currently no one is using it.
