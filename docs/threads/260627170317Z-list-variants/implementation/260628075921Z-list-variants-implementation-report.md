# Implementation Report — `jastr list --variants`

Plan executed: `plans/001/plan.md` (compiles `specs/001/spec.md`, tier 2).
Run mode: orchestrated, plan-driven, multi-subagent (implementer + dual reviewers
per task). All four numbered plan tasks ran in order; the run completed without a
`BLOCKED` or `NEEDS_CONTEXT` halt.

## Outcome by task

| Task | Verified verdict | Commit | Fix iterations |
| ---- | ---------------- | ------ | -------------- |
| 1 — Implement `--variants` (config read, flag wiring, tree rendering) | DONE_WITH_CONCERNS | `2c05235` | 0 / 0 |
| 2 — `LIST-FR-0006` + `LIST-FR-0007` + four rendering e2e cases | DONE | `7ecdee0` | 0 / 0 |
| 3 — `LIST-FR-0008` + three malformed-config e2e cases | DONE | `2c15096` | 0 / 0 |
| 4 — Docs reconciliation + `BEHAVIOR.md` regen + full gate suite | DONE | `850add1` | 0 / 0 |

Every task passed BOTH review passes (plan-compliance first, code-quality second)
on the first dispatch — no fix loop was entered for any task. The implementer's
claimed status matched the orchestrator's verified verdict in every case.

## 1. Deviations from the plan, with justification

- **Task 1 — one extra file beyond the named "Files modified" set:
  `packages/cli/src/args.ts`.** The plan's Task-1 `Files modified` named exactly
  `config.ts`, `install/list.ts`, `commands/list.ts`. The implementer also edited
  `args.ts` to allowlist `--variants` in the pre-Commander argv validator
  (`validateListArgs`). Justification: the pre-Commander validator rejects any
  unrecognized `list` option, so without this entry `jastr list --variants` throws
  `invalid_command` `Unknown list option --variants.` — which would have failed
  Task 1's OWN binding Verification block (it requires `list --variants` to exit 0
  and print the tree). The plan's file list was internally inconsistent with its
  verification block; the implementer correctly prioritized the verification. The
  edit was surgical (one recognized-flags allowlist entry, usage string left
  unchanged, deferring user-facing prose to Task 4). Both reviewers assessed the
  deviation as justified and non-blocking. Recorded as the sole concern behind the
  Task-1 `DONE_WITH_CONCERNS`.
- Tasks 2, 3, 4 — no deviations.

## 2. Surprises

- **The plan's Task-1 file list omitted `args.ts` despite its own verification
  block requiring the flag to be accepted.** This is the root of the only
  deviation above. The CLI keeps a pre-Commander argv-shape allowlist
  (`validateListArgs`) separate from the Commander option definitions, so adding a
  Commander `.option("--variants", …)` alone is insufficient to make the flag
  runnable — both layers must recognize it. A plan that names CLI flag files
  should include `args.ts` whenever a new `list`/command flag is added.
- **Dependencies were absent from the working tree.** The Task-1 implementer ran
  `bun install` before the gates. This produced no diff (no lockfile/package.json
  change) and was pure environment setup, not a code change.

## 3. Problems hit

- None. No fix loops, no non-converging reviews, no failed commits, no gate
  failures. Every standing gate was green at every task boundary, and the full
  closing gate suite (Task 4) passed: `bun run check`, `bun run typecheck`,
  `bun run test` (600 tests), `bun run test:cli:e2e` (308 tests),
  `bun run docs:cli:living --check` (BEHAVIOR.md up to date), and
  `bun run build` (both packages bundle) all exit 0.

## 4. Follow-ups

- None requiring code work. The forward-compatibility P1 guard rail (orphan /
  missing-row suppression kept emergent, no transitional behavior encoded) was
  honored across all tasks, so the anticipated future co-location constraint needs
  no edit here. The one observation worth a future plan author's attention — that
  CLI flag additions must also touch `packages/cli/src/args.ts`'s `validateListArgs`
  allowlist — is captured under Surprises above; it is a planning note, not a
  standalone work item, so no thread seed is opened.

## Notes

- Engine untouched: no task modified `packages/engine/` and no new
  `JastrErrorCode` was added, exactly as the spec Constraints and decision P3
  require.
- The reviewer review files for this run live under the thread's recursively
  gitignored `.wip/` folder (plus the Task-1 implementer outcome file); they are
  the in-flight audit trail and are not version-controlled. The four commits above
  plus this report are the durable record.
