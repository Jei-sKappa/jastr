# Implementation report — living-docs `global-fixture/` rendering

Thread: `260623121648Z-living-docs-global-fixture`
Input: the seed (`seed/260623121648Z-living-docs-global-fixture-seed.md`) and its
genesis decision log
(`seed/discussions/260623123602Z-global-fixture-rendering-decision-log.md`, P1).
Tier: 1 (per `ledger.md`) — contained fix to the docs generator.

## Summary

The living-docs generator (`packages/cli/scripts/living-docs.ts`) only read each
e2e case's `fixture/` folder, so the 17 cases carrying a `global-fixture/`
rendered without their global root in `packages/cli/docs/BEHAVIOR.md`: 5
global-only cases (e.g. `global-only-resolve`) showed a misleading "Empty" input
followed by global output from nowhere, and 12 both-root cases (e.g.
`local-shadows-global`) silently dropped the global half. `docs:cli:living
--check` still passed because it only verifies the (blind) generator is
deterministic, not that its output is complete.

Implemented as **one implicit task / one commit** — the generator code, its unit
tests, the regenerated `BEHAVIOR.md`, and the `AGENTS.md` note are mutually
dependent (the project's `test` and `docs:cli:living --check` invariants tie them
together), so splitting them would leave intermediate states that fail the
project's own checks.

Changes (commit `a34309d`):

- Added a `globalInputFiles: FixtureFile[]` field to `RenderCase`.
- `loadRenderCases` now reads `global-fixture/` with the same recursive
  `loadFixtureFiles` walk as `fixture/` (an absent folder yields an empty list,
  unchanged behavior).
- Rewrote `renderInputSection` per decision-log P1 (Option A): symmetric
  **Local project** / **Global root** (`$JASTR_HOME/.jastr`) labels, each root
  rendered only when it has files; an empty local root in a global case shows an
  explicit Empty note; a both-empty case shows that note alone. Extracted the
  shared tree+contents rendering into a root-agnostic `renderRootTree` helper
  (reusing the existing `buildFileTree`/`renderFileBlock`).
- Updated and extended `packages/cli/test/living-docs.test.ts`, regenerated
  `packages/cli/docs/BEHAVIOR.md`, and reconciled the `docs:cli:living` bullet
  in `AGENTS.md`.

Verification — all green: `bun run check`, `bun run typecheck`, `bun run test`
(355 passed), `bun run test:cli:e2e` (208 passed), `bun run docs:cli:living
--check`, and `bun run build`.

## 1. Deviations from the plan/input, with justification

- **Both-empty case relabeled "Input project" → "Local project".** The decision
  log specified "both empty shows a single Empty note" without naming its label.
  I relabeled it to **Local project** so every case in the document leads with
  the same local-root label (full symmetry, Option A's intent), at the cost of
  changing the label on the handful of empty-workspace cases (e.g.
  `missing-project-root`).
- **Kept the original informative empty wording over the log's shorthand.** The
  log wrote the empty-local note as "Local project: _Empty_"; I rendered
  "_Empty — no `.jastr/` directory present._" to carry forward the original,
  more-informative message. The "(command ran from …)" parenthetical was dropped
  from the note because that information now lives in the "— ran from …" label.
- **Reconciled `AGENTS.md` as part of this run.** Per the repo's Update rule, the
  `docs:cli:living` bullet now describes the two-root input rendering. This is a
  contract-accuracy edit for the area touched, not a new artifact; it matches the
  prior thread's precedent of bundling the regeneration and the `AGENTS.md`
  reconciliation into one commit.

## 2. Surprises

- None. The decision log noted `buildFileTree`/`renderFileBlock` were already
  root-agnostic and reusable for a second root; that held — the only new helper
  is the thin `renderRootTree` wrapper around them.

## 3. Problems hit

- None. No blockers, no commit failures, no mid-run course changes.

## 4. Follow-ups

- **Candidate seed (for the user to open later): `docs:cli:living --check`
  verifies determinism, not completeness.** This run's root cause was that
  `--check` passed while the output silently omitted the global roots — a blind
  generator is self-consistent. A future thread could add a completeness guard
  (for example, asserting every case with a `global-fixture/` renders a "Global
  root" section) so an ignored input surface fails the check rather than
  rendering misleading output. Routed as a candidate seed (the default for a
  standalone follow-up); not opened in this run.
