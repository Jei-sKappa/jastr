# Implementation Report — `inline` rendered-skill mode for `jastr generate agent-skill`

Plan executed: `plans/001/plan.md` (all 6 tasks, in order).
Spec compiled: `specs/001/spec.md` (tier 2).
Run topology: orchestrator + per-task implementer/plan-compliance-reviewer/code-quality-reviewer subagents (all Opus), sequential on a single working tree, one commit per task.

## Outcome at a glance

| Task | Verified verdict | Implementer dispatches | Plan-compliance | Code-quality | Commit |
| --- | --- | --- | --- | --- | --- |
| 1 — gate `--mode` + input flags in argv validation | DONE | 1 | PASS (0 fix) | PASS (0 fix) | `2396b9e` |
| 2 — extract `resolveTemplateInputs` helper | DONE | 1 | PASS (0 fix) | PASS (0 fix) | `9a8a71b` |
| 3 — inline content builders + mode-aware `--check` | DONE | 1 | PASS (0 fix) | PASS (0 fix) | `33f06ab` |
| 4 — wire `--mode`/inline through generate | DONE_WITH_CONCERNS | 2 (1 + 1 fix) | PASS (0 fix) | PASS after 1 fix iteration | `a8b8ae7` |
| 5 — inline requirements + e2e cases | DONE | 1 | PASS (0 fix) | PASS (0 fix) | `d1efe10` |
| 6 — reconcile docs + close the green gate | DONE | 1 | PASS (0 fix) | PASS (0 fix) | `1f0fc8a` |

Final state: the full standing gate — `bun run check`, `bun run typecheck`, `bun run test` (627), `bun run test:cli:e2e` (322), `bun run docs:cli:living --check`, `bun run build` — all exit 0; `packages/engine` is unmodified (CLI-only feature; no new `JastrErrorCode`). Every implementer status claim was confirmed by the verified verdict; the only claim↔verdict divergence was Task 4 (claimed `DONE`, verified `DONE_WITH_CONCERNS` — see below).

## 1. Deviations from the plan, with justification

- **Task 1 — single-pass loop + deferred gate instead of a separate `--mode` pre-scan.** The plan's step 4 suggested a pre-scan for the effective mode; the implementer instead resolved `mode` during the main argv loop and applied the input-flag gate after the loop. The plan-compliance reviewer confirmed this is order-independent (router rejection / inline acceptance hold whether `--mode` precedes or follows an input flag), so it satisfies the pinned contract. Within the plan's stated degrees of freedom; non-blocking.
- **Task 3 — `mode?: "router" | "inline"` (optional) instead of a required `mode` parameter with a default.** The plan said "add a `mode` parameter (default `router`)". The implementer made it optional, defaulting to router when undefined. Both reviewers confirmed this preserves the "default router / existing call sites byte-identical" intent exactly. Non-blocking.
- **Task 4 — fixed two e2e help fixtures outside the task's stated `Files modified`.** The new `[inputs...]` variadic on the Commander `generate` command widened the help-text gutter and re-wrapped output, breaking the committed `help-generate` and `help-root` e2e cases. A fix-loop implementer updated `help-root/expected/stdout.txt` (refreshed to actual bytes) and `help-generate/case.yml` (assertion made robust to the wrap). This is fallout the diff introduced; fixing it where it broke is the obvious correction. Justified; recorded as the source of Task 4's `DONE_WITH_CONCERNS`.
- **Task 5 — reconciled the pre-existing `unknown-command` e2e case.** Not a "new inline case", but Task 5's own verification requires `bun run test:cli:e2e` to exit 0, and `unknown-command` was red from Task 1's `expectedCommandShape` change (it is neither a router nor a validate case, so the plan permits touching it). Required to satisfy the task's verification block.
- **Task 5 — no dedicated FR-2 (router byte-identity) requirement added.** The plan assigns FR-2's evidence to the existing, unmodified router/check suite; the implementer relied on that rather than authoring a new requirement. Consistent with the plan's own framing.
- **Task 6 — reconciled `cli-shell.test.ts` outside the task's stated `Files modified` (`AGENTS.md`/`README.md`/`BEHAVIOR.md`).** Task 6 step 4 ("run the full standing gate and fix any fallout") required it: two `cli-shell` assertions were red. Justified by the explicit fallout-fix step.
- **Task 6 — second `cli-shell` failure was a help-text wrap, not the `expectedCommandShape` string the brief predicted.** Adding `--mode <mode>` widened Commander's options column so `.md file path` wrapped across two lines in `generate --help`. The implementer fixed the assertion by collapsing whitespace (`replace(/\s+/g, " ")`) before the `toContain(".md file path")` check, preserving the full phrase without coupling to Commander's padding. Both reviewers judged it sound and non-weakening.

## 2. Surprises

- **The feature's CLI-surface change cascaded broadly into the deferred whole-change gates.** Two surface edits — `expectedCommandShape` gaining `[--mode <router|inline>]` (Task 1) and the `[inputs...]` variadic (Task 4) — broke committed artifacts that only surface in the deferred gates: `cli-shell` unit tests, the `help-generate`/`help-root`/`unknown-command` e2e cases, and the regenerated `BEHAVIOR.md`. The plan anticipated this with Task 6's "fix any fallout," but the breakage was spread across three task cycles and three artifact kinds, requiring deliberate routing of each red item to the task that owns it (per the Commit Policy's deferred-gate rule).
- **Commander's `allowUnknownOption()` + trailing `[inputs...]` variadic worked as the primary input-flag capture path** without needing the `process.argv` fallback the plan documented as a contingency. The upstream `validateGenerateArgs` guard (raw-argv, pre-parse) keeps `allowUnknownOption()` from silently swallowing a mistyped known option, so the looser Commander config is safe.

## 3. Problems hit

- **Task 4 entered the code-quality fix loop once.** First code-quality pass returned `ISSUES` (the `[inputs...]` help-wrap broke `help-generate`/`help-root`). A fresh implementer fixed the two help fixtures (byte-correct, both cases green). The re-review then surfaced a *second* blocking finding: `BEHAVIOR.md` had gone stale (it derives from those help cases) and `bun run docs:cli:living --check` failed. Rather than loop Task 4 again, the orchestrator resolved this by judgment: `docs:cli:living` is a **living-docs deferred whole-change gate** that the Commit Policy explicitly permits deferring to a closing task, and the plan explicitly assigns `BEHAVIOR.md` regeneration to Task 6 — and Task 5's new cases would re-stale any Task-4 regen anyway. The finding was routed (loudly, not silently) to Task 6, whose verification gate (`docs:cli:living --check` exit 0) was the hard checkpoint that closed it. No non-converging loop; no `BLOCKED`.
- **No other blockers.** No `BLOCKED` or `NEEDS_CONTEXT` cycle; no failed commit; no history rewriting.

## 4. Follow-ups

- **`--check` reproducibility under ad-hoc inline flags (documented usage trade-off, candidate seed).** Inline `--check`'s suggested-fix command omits any template input flags used at generation time, so an inline skill generated with ad-hoc `--name=value` flags is not reproducibly re-checkable unless those inputs are pinned to a `#variant` or `config.yml`. The plan flagged this as a known, non-novel trade-off (plan `## Notes`); no code guards it and none was added. Surfaced here as a candidate seed for a future thread if it becomes a real pain point. **Routing: candidate seed (default), not opened.**
- **No "file is absent" assertion primitive in the e2e harness (candidate seed).** The "writes no file" half of the `missing_required_input` / `missing_target_metadata` inline ACs is verified by inspection during fixture capture, not by a machine assertion — matching the existing `generate-check-invalid-template` convention. A future harness enhancement (a `fileAbsent:`-style primitive) would give those ACs machine teeth. **Routing: candidate seed (default), not opened.**

Both follow-ups are standalone (this thread is tier 2, not tier-3 phased work), so they are surfaced as candidate seeds for the user to open later rather than appended to any phase discussion. There is no inbox in this workflow.
