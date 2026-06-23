# Implementation Report — Home-directory (global) `.jastr` support

Plan executed: `plans/001/plan.md` (compiles `specs/001/spec.md`, version 2, approved).
Orchestrated via "Implement Plan With Subagents Auto" — one implementer + two
review passes (plan-compliance, then code-quality), all Opus, per orchestration
cycle. All 8 tasks completed; every task passed BOTH review passes on the first
implementer dispatch (zero fix-loop iterations across the whole run).

## Run summary (per-task verified verdicts + commits)

| Task | Verified verdict | Implementer | Plan-compliance | Code-quality | Commit |
|------|------------------|-------------|-----------------|--------------|--------|
| 1 — Dual-root discovery (`resolveProjectRoots`) | DONE_WITH_CONCERNS | 1 | PASS (0 fix) | PASS (0 fix) | `fc68e86` |
| 2 — Layered template resolution | DONE_WITH_CONCERNS | 1 | PASS (0 fix) | PASS (0 fix) | `2f407b9` |
| 3 — Path display by resolved root | DONE | 1 | PASS (0 fix) | PASS (0 fix) | `5c4db3d` |
| 4 — Two-layer config + variant shadowing | DONE | 1 | PASS (0 fix) | PASS (0 fix) | `dbc4ab7` |
| 5 — E2E harness hermetic `JASTR_HOME` | DONE_WITH_CONCERNS | 1 | PASS (0 fix) | PASS (0 fix) | `074dec8` |
| 6 — GLOBAL functional requirements file | DONE | 1 | PASS (0 fix) | PASS (0 fix) | `9457dd3` |
| 7 — E2E cases for global support | DONE | 1 | PASS (0 fix) | PASS (0 fix) | `7add0af` |
| 8 — Living docs, AGENTS.md, full clean bar | DONE | 1 | PASS (0 fix) | PASS (0 fix) | `16f17f3` |

Final state: working tree clean; full clean bar green at `16f17f3` — `bun run check`,
`bun run typecheck`, `bun run test` (353), `bun run test:cli:e2e` (208),
`bun run docs:cli:living --check`, `bun run build` all exit 0 (verified by the Task 8
implementer and re-run by the Task 8 plan-compliance reviewer at the committed state).

## 1. Deviations from the plan, with justification

- **Task 5 — reconciled 4 pre-existing e2e cases the plan's Files-modified list
  omitted (orchestrator-sanctioned, gate-forced).** The plan's Task 5 "Files
  modified" named only the 4 harness files, and its acceptance criterion said
  "all pre-existing e2e cases still pass unchanged." That AC overlooked that
  Tasks 1–2 changed two error messages (`template_not_found` →
  "...was not found. Searched local …"; `missing_project_root` → the relaxed
  both-roots wording), which broke 4 existing cases (`missing-skill`,
  `grouped-named-missing-marker`, `grouped-named-old-location-rejected`,
  `missing-project-root`). Task 5's own verification gate (`bun run test:cli:e2e`
  exit 0) could not pass without updating those cases' expected `stderr`. The
  orchestrator instructed the minimal reconciliation (only those 4 cases; only
  `stderr` + the one `substitute:` map needed for `missing-project-root`'s now
  machine-dependent global-base path), verified against actual CLI output. Both
  reviewers confirmed it minimal and spec-matching. **This is the one substantive
  plan↔implementation divergence the verify stage should note.**

- **Task 6 — verification method corrected (orchestrator).** The plan's stated
  Task 6 verification (`bunx vitest run packages/cli/test/living-docs.test.ts`) is
  a synthetic unit test that does NOT load the real `14-global.yml` from disk, so
  it cannot prove the new file parses. The orchestrator added a real parse check
  (`bun run docs:cli:living`, which exercises the production
  `loadRequirements`/`loadCases` path and throws on a malformed area file, then
  discards the regenerated `BEHAVIOR.md` since its regeneration is Task 8's job).
  No code change; a stricter gate than the plan literally named.

- **Task 8 — broader (but in-mandate) AGENTS.md reconciliation.** Beyond the
  claims the plan's Step 2 enumerated, the implementer also reconciled two further
  stale claims invalidated by Task 5: the Test Layout `substitute` closed set
  (added `globalRoot`) and a new hermetic-harness fixtures bullet (per-case
  `JASTR_HOME`, optional `global-fixture/`). This is within Task 8's "reconcile
  stale single-root claims" mandate — an over-delivery keeping the contract file
  accurate, not a scope violation.

## 2. Surprises

- **The e2e suite was intentionally RED between tasks, by plan design.** The
  per-task verification blocks for Tasks 1–4 run only targeted unit tests +
  typecheck + check, deliberately NOT the full e2e suite. Tasks 1–2's message
  changes left the e2e suite with 4 reds until Task 5 reconciled them; Task 6's new
  active GLOBAL ACs left the e2e suite red on `uncovered acceptance criterion`
  (thrown by `validateTraceability`) until Task 7 added covering cases. The
  orchestrator confirmed the Tasks 1–2 reds were pre-existing (failing identically
  at each cycle's start commit), so no task wrongly inherited blame. Caveat for
  readers: the plan intro's phrase "each [task] leaves the repo … test suite
  green" is NOT literally true for the e2e dimension during Tasks 1–7; it holds
  for the per-task targeted gates and for the final state.

- **Absolute included-file path display (FR-8 AC-0003) is only observable via an
  include CYCLE.** Include *error* messages render the literal include `path`, not
  the resolved `id`, so the absolute global path never surfaces in a plain include
  error. The resolved `id` (which runs through `displayPath`) surfaces in the
  include-cycle chain, so the Task 7 case exercises it with a global cycle
  (`__GLOBAL_ROOT__/.jastr/demo/a.md -> … -> a.md`), contrasted against a
  cwd-relative local cycle for AC-0002.

- **macOS realpath consistency was load-bearing for the harness.** `JASTR_HOME`
  had to be set to `realpath(globalBase)` (not the raw `mkdtemp` path) so the
  `missing_project_root` message and global absolute paths match the `globalRoot`
  substitution token (which resolves to `realpath(globalBase)`); the `/var →
  /private/var` symlink would otherwise split token from CLI output. Mirrors the
  existing `projectRoot` realpath handling.

## 3. Problems hit

- **None that halted progress.** No fix-loop iterations were required — every task
  passed both review passes on its first implementer dispatch. No `BLOCKED` or
  `NEEDS_CONTEXT` cycle occurred. (Orchestrator-side only: the shell working
  directory drifted into a `cases/` subdir after an early `cd` in a compound
  command, briefly making relative `git`/`cat` paths miss; resolved by switching to
  absolute paths / `git -C`. No effect on the deliverable.)

## 4. Follow-ups

- **E2E harness temp-dir cleanup ordering (test-infra hardening).** Surfaced as a
  non-blocking code-quality concern on Task 5: `case-runner.ts`'s `finally` runs
  `await temp.cleanup(); await globalTemp.cleanup();` sequentially, so a rejecting
  first cleanup would skip the second and leak the global temp dir. Low-impact
  (`rm(..., { force: true })` suppresses most teardown errors). Optional hardening:
  `await Promise.allSettled([temp.cleanup(), globalTemp.cleanup()])`. **Routing:**
  standalone → candidate seed for a future thread (this thread is tier-2, not
  tier-3 phased work). Not done in this run; deliberately deferred.

- **Stale parenthetical in a `.wip` scratch note (no action needed).** The Task 6
  implementer's outcome file claimed the FR-4 `coverage` target `roots.test.ts` was
  "not yet present at Task 6 HEAD" — inaccurate (it was committed in Task 1). This
  lives only in a recursively-gitignored `.wip/` scratch file, not in any committed
  artifact (the `14-global.yml` `coverage` note itself correctly points at the
  existing test, confirmed by the plan-compliance reviewer). Recorded for
  completeness; nothing to fix.

## References

- Plan: `plans/001/plan.md`
- Spec (implemented contract): `specs/001/spec.md` (version 2, approved)
- Requirements added: `packages/cli/requirements/functional/14-global.yml`
- Reviewer scratch (gitignored): `.wip/260623091457Z-task-*-{plan-compliance,code-quality}-review.md`
  and `.wip/260623091457Z-task-*-implementer-outcome.md`
- Commits: `fc68e86`, `2f407b9`, `5c4db3d`, `dbc4ab7`, `074dec8`, `9457dd3`,
  `7add0af`, `16f17f3`
