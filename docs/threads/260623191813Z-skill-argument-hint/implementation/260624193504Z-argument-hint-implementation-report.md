# Implementation Report — `argument-hint` in generated Agent Skill wrappers

Executed plan lineage: `plans/001/plan.md` (compiles `specs/001/spec.md`).
Run: autonomous, plan-driven, multi-subagent orchestration (implementer +
plan-compliance reviewer + code-quality reviewer per task; one commit per task).

## Outcome summary

All four plan tasks ran in order and committed. No fix-loop iterations were
needed — every task passed both review passes on the first dispatch.

| Task | Verified verdict | Commit | Subject |
| --- | --- | --- | --- |
| 1 | DONE | `c80f031` | feat(cli): derive and emit argument-hint in agent-skill wrappers |
| 2 | DONE | `7016c54` | feat(cli): read and resolve argument-hint-prefix (base + variant) |
| 3 | DONE_WITH_CONCERNS | `e8250c3` | test(cli): add argument-hint requirements and e2e cases |
| 4 | DONE_WITH_CONCERNS | `95d9583` | chore(cli): regenerate goldens/docs and reconcile argument-hint AGENTS.md |

Final state: all six project gates exit 0 (`check`, `typecheck`, `test` = 399
tests, `test:cli:e2e` = 229 tests, `docs:cli:living --check`, `build`); the
FR-8 invariants hold — `git diff packages/engine` against the pre-feature base
is empty (AC-8.1) and `JastrErrorCode` gained no new member (AC-8.2).

## 1. Deviations from the plan, with justification

- **Task 4 reflowed two source files outside its declared "Files modified"
  list.** The plan's Task 4 declared only the stale goldens, `BEHAVIOR.md`, and
  `AGENTS.md`. Task 4 additionally ran `bun run format`, which line-wrap-reflowed
  `packages/cli/src/commands.ts` and `packages/cli/src/targets/agent-skill.ts`
  (4 lines each, no semantic change). Justification: those two files carried two
  pre-existing Biome formatting defects committed in Tasks 1–2 (see Surprises),
  and Task 4's own verification requires `bun run check` to exit 0. The reflow
  was orchestrator-directed in the Task 4 brief and is the natural owner of the
  fix (Task 4's objective is "bring the whole repository green"). Both reviewers
  confirmed it is reflow-only with no regression risk.
- **Task 3 hand-authored one golden rather than producing it from the CLI.**
  The `generate-argument-hint-check-stale` case's committed wrapper is
  deliberately authored to predate the feature (no `argument-hint` line) so that
  `generate … --check` reports `output_stale` (spec AC-6.3). This is the sole
  golden not produced by the real CLI, and intentionally so — the plan calls for
  "a case whose committed golden omits the now-derived line." Recorded as a
  judgment call rather than a divergence; it matches the plan's intent.

## 2. Surprises

- **Formatting debt was committed in Tasks 1–2 because their plan-prescribed
  verification blocks omitted `bun run check`.** The plan deliberately deferred
  all-gates-green to the closing Task 4 (Sequencing note), and Tasks 1–2 verified
  only against targeted unit tests + `typecheck` + grep. As a side effect, two
  Biome line-wrap defects in `commands.ts` / `targets/agent-skill.ts` were
  committed in Task 2 and only surfaced when Task 3 and Task 4 ran the full
  `bun run check`. This was not a code defect — it was a consequence of the
  plan's verification phasing — and it was cleanly resolved within Task 4's
  green-the-repo mandate. The Task 3 implementer correctly identified it as
  pre-existing and out of its own scope.
- **The expected intermediate-red window behaved exactly as the plan predicted.**
  The full e2e suite was red from the end of Task 1 through Task 4 (on-by-default
  derivation, spec §4.6). This was anticipated, not a regression: Tasks 1–3
  verified against narrowed targets and only Task 4 closed the full suite (10
  pre-existing goldens regenerated, each gaining exactly one `argument-hint`
  line).

## 3. Problems hit

- None. No blocker, no failed commit, no non-converging fix loop. Each of the
  four orchestration cycles passed plan-compliance and code-quality on the first
  review dispatch, so no fresh fix-iteration implementer was ever respawned.

## 4. Follow-ups

- **Candidate seed (process improvement, for the user to open later):** consider
  having future strict-granularity plans include `bun run check` (or a
  `bun run format` step) in each task's verification block — or have the
  orchestrator run `bun run check` as a per-cycle pre-commit gate — so formatting
  debt is not committed in early tasks and deferred to a closing task. This run
  absorbed the debt cleanly because Task 4 owned the green-the-repo mandate, but
  the phasing left two intermediate commits (`c80f031`'s descendant `7016c54`)
  carrying Biome-non-conforming source. This is a workflow refinement, not work
  this thread needs; routed here as a labelled candidate seed rather than opened
  as a thread.

No other follow-ups were discovered.

## References

- Plan: `plans/001/plan.md`
- Spec: `specs/001/spec.md`
- Genesis decision log: `seed/discussions/260623193024Z-argument-hint-design-decision-log.md`
- Implementer outcome scratch (gitignored `.wip/`): Task 3
  `260624191005Z-task-3-implementer-outcome.md`, Task 4
  `260624192817Z-task-4-implementer-outcome.md`. (Tasks 1–2 wrote no outcome
  file — plain `DONE` with nothing to flag.)
- All four review passes returned no-findings `PASS`, so no `.wip/` review files
  were written.
