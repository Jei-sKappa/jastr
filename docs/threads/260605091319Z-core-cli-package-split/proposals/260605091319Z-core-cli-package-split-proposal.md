# Core and CLI Package Split

## Intent

Split Skillrouter from a single root package into separate core and CLI
packages. The intended outcome is a clearer internal boundary where the core
behavior can be consumed without CLI concerns, while the CLI remains a thin
adapter over that core.

This is not a proposal to copy the referenced bylaw project wholesale. Bylaw is
useful prior art for the workspace shape, but Skillrouter should avoid carrying
over Bun-specific runtime assumptions.

## Context

The current codebase is organized as one package with source under root `src/`
and tests under root `test/`. That has been sufficient for v1 CLI work, but it
makes the project boundary less clear as the implementation grows.

The main drivers are code organization and future extension. A hypothetical
TypeScript library should be able to depend on Skillrouter's core behavior
without depending on CLI-only behavior such as Commander wiring, command-line
flag parsing, binary entrypoints, stdout/stderr formatting, or process-level
exit handling.

The split should create a library-consumable boundary first. It does not need
to promise a polished public SDK as part of the initial package move.

## Rough shape

The repository becomes a workspace with at least two packages:

- `packages/core` owns the reusable Skillrouter behavior: template parsing and
  validation, condition evaluation, include resolution, interpolation, rendering,
  project and skill lookup if kept in core, router skill content generation, and
  process-free execution helpers where appropriate.
- `packages/cli` owns the command-line adapter: Commander program wiring,
  command-line argument tokenization, CLI-specific validation and error
  presentation, stdout/stderr behavior, exit-code behavior, binary entrypoint,
  and version/build metadata.

One important boundary is the shape of inputs. Today `RawFlag`-style values are
closely tied to CLI syntax. If a future TypeScript library should consume core
without pretending to be a shell command, core likely needs a typed API using a
better domain vocabulary such as inputs or parameters, with the CLI translating
argv-derived flags into that API.

Another important boundary is filesystem access. If core directly performs all
project and template I/O, future consumers inherit Skillrouter's file layout and
Node filesystem assumptions. If core is mostly pure with injectable file access
or a separate file-backed loader layer, the CLI takes on more adapter work but
the core package becomes easier to reuse and test.

Bun may remain useful as a local package manager or build tool, but package
boundaries and runtime code should avoid Bun-specific APIs unless a later spec
explicitly decides otherwise.

## Open questions

- What should the core-facing input vocabulary be: `RawFlag`, `Flag`, `Input`,
  `Parameter`, or another name?
- Should core expose a typed API that avoids CLI-shaped inputs, with CLI
  translating command-line tokens into that API?
- How should core access the filesystem, if at all: direct Node `fs`, injected
  filesystem/project reader, or a split between pure rendering and file-backed
  loading?
- How should e2e tests and `docs/BEHAVIOR.md` be treated after the split?
  They probably need some division between core and CLI concerns, but the risk
  is that a mechanical split produces two weaker documents. `docs/BEHAVIOR.md`
  currently documents CLI behavior from functional cases, not just core
  behavior, so the spec phase should identify the intended reader and purpose
  before splitting the living behavior reference.
- Where is Bun acceptable after the split: package manager/dev scripts only,
  build tooling, or nowhere in package/runtime boundaries?
- Which current helpers belong in core versus CLI when they sit on the boundary,
  especially `executeRun`, `executeGenerate`, `parseRunFlags`, project-root
  discovery, and router-skill file writing?
