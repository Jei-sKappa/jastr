# Implementation Report — `jastr list` group-member tree

Run mode: single-agent (implement → self-review → commit per task). Input form:
raw user prompt (a fully-enumerated work item against the `list` command). Base
commit: `23e443a`. Three implicit tasks, all `DONE`.

## Per-task summary

| Task | Status | Commit | Subject |
|---|---|---|---|
| 1 — core code (shared helper + tree render) | DONE | `4d96c2f` | feat(cli): list group member templates as a tree |
| 2 — requirements AC + e2e case | DONE | `1518093` | test(cli): cover list group-member tree with LIST-FR-0001.AC-0002 |
| 3 — docs reconciliation + living doc | DONE | `9e564d4` | docs(cli): document list group-member tree rendering |

No task reached `DONE_WITH_CONCERNS`, `BLOCKED`, or `NEEDS_CONTEXT`.

`jastr list` now renders each group row's member templates as a sorted tree
(`├── ` for every member but the last, `└── ` for the last) at the row's 2-space
indent, carrying the runnable `<group>/<member>` ref and no per-member
provenance. The group-member enumeration `countGroupTemplates` already performed
was factored into a shared, exported `listGroupTemplateIds(groupDir)` so both the
install output count and `list`'s tree reuse the one walk.

Final whole-change verification (all exit 0): `bun run check`, `bun run
typecheck`, `bun run test` (593), `bun run test:cli:e2e` (301), `bun run
docs:cli:living --check`, `bun run build`. The engine was not touched: the only
non-test, non-doc source edits are in `packages/cli/src/install/list.ts` and
`packages/cli/src/install/unit.ts`. No new dependency, no new `JastrErrorCode`.

## 1. Deviations from the input, with justification

- **Helper placed in `packages/cli/src/install/unit.ts`, not `list.ts`.** The
  input named `list.ts` as the home of all rendering and suggested the helper
  "e.g." live there, but `countGroupTemplates` — the existing duplicate the helper
  must absorb — lives in `unit.ts` alongside the `safeLstat` it relies on. Keeping
  the shared walk next to its second caller (and exporting it for `list.ts` to
  import) honors DRY/Law of Demeter without moving the install-count logic. The
  tree *rendering* stays entirely in `list.ts` as directed.
- **The e2e case pins three edge cases in one fixture, not just the headline
  one.** Beyond the required tracked group with two members (full `├──`/`└──`
  tree), the case adds an untracked `tools` group with a single member, which
  also exercises (a) a `local` group still listing its members and (b) the
  single-member `└── ` connector. The input invited the local-group assertion
  "if cheap" and listed both as edge cases to pin; folding them into the one
  hermetic case keeps the suite lean while covering them. Assumption made: one
  case may cover several facets of a single AC — consistent with existing
  multi-facet `list-*` cases.
- **Lock entry carries a `ref` (`main`), so the tracked group row reads
  `Jei-sKappa/jastr@main @ 814343598f39`** rather than the ref-less form shown in
  the goal's illustrative "After" block. The ARTIFACTS instruction explicitly
  asked for "a ref + commit so the row is rich", which is the more specific
  directive; the goal block was illustrating the tree, not the exact provenance.

## 2. Surprises

- None. The enumeration the input pointed at (`countGroupTemplates`) was an exact
  structural match for what `list` needed, so the factoring was clean. The e2e
  harness runs `src/index.ts` directly (not the built bundle), so the new case
  picked up the source change with no rebuild.

## 3. Problems hit

- None. The first commit's only friction was a Biome line-wrap on the new
  exported function signature, auto-resolved by `bun run format` before the
  commit.

## 4. Follow-ups

- None required. One observation, surfaced as a **candidate seed** for the user
  to open later if desired: `list` member lines are plain text with no status
  marker, so a member template that is on disk but, say, malformed is
  indistinguishable from a healthy one in the tree (the lock tracks only the
  group, by design). Per-member health/status annotation was neither asked for nor
  implied here (YAGNI); if it is ever wanted it is a standalone feature, not a
  fix to this run.
