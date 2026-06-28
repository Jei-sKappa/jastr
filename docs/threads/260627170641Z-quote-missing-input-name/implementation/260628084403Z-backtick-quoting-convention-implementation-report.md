# Implementation Report — backtick-quoting convention for interpolated value tokens in CLI messages

Compiles plan `plans/001/plan.md` (tier 2), itself compiling `specs/001/spec.md`
(approved `260627212538Z`). This report is the durable, immutable record of the
plan-driven, multi-subagent implementation run; it is frozen at emission.

## Run summary

All 9 plan tasks ran in order and committed; the run completed cleanly (no
`BLOCKED` / `NEEDS_CONTEXT` terminus). Every interpolated value token in every
user-facing CLI stdout/stderr message across `@jastr/engine` and `@jastr/cli` is
now backtick-quoted via one tiny internal `quote` helper per package; wording,
numerics, fixed vocabulary, error codes, `details` payloads, the engine public
API, and the generated agent-skill Markdown are untouched. The deferred
whole-change gate is green.

Per-task verified verdicts and subagent audit:

| Task | Verified verdict | Implementer dispatches | Plan-compliance | Code-quality | Commit |
|------|------------------|------------------------|-----------------|--------------|--------|
| 1 — engine `quote` helper | DONE | 1 | PASS (1) | PASS (1) | `98e6fec` |
| 2 — engine inputs/schema messages | DONE | 1 | PASS (1) | PASS (1) | `c82b278` |
| 3 — engine directive/render messages | DONE_WITH_CONCERNS | 2 (1 fix) | ISSUES→PASS (2) | PASS (1) | `607f24b` |
| 4 — CLI `quote` helper | DONE | 1 | PASS (1) | PASS (1) | `62fb16f` |
| 5 — CLI command-parse/input-flag messages | DONE | 1 | PASS (1) | PASS (1) | `ccc3feb` |
| 6 — CLI core run-path messages | DONE | 1 | PASS (1) | PASS (1) | `de79a3c` |
| 7 — CLI install command-surface messages | DONE | 1 | PASS (1) | PASS (1) | `dd27e69` |
| 8 — CLI install acquisition/support messages | DONE | 1 | PASS (1) | PASS (1) | `5e25ef4` |
| 9 — e2e sweep + BEHAVIOR.md + full gate | DONE | 1 | PASS (1, ran full gate) | PASS (1) | `3985dd7` |

All subagents (implementers and both reviewer passes) ran on Opus per the
invocation. The full local gate (`check`, `typecheck`, `test` 597, `test:cli:e2e`
301, `docs:cli:living --check`, `build`) exits 0 as of Task 9, confirmed by two
independent fresh dispatches (implementer + plan-compliance reviewer) plus the
orchestrator's own cheap-gate + no-drift confirmation before the final commit.

## 1. Deviations from the plan, with justification

1. **Task 3 — parameter rename (`conditions.ts`).** `readString`'s `quote:
   string` parameter shadowed the newly imported `quote` helper, raising TS2349
   at the `Unsupported escape` call site. The implementer renamed the parameter
   (and its three internal references) to `quoteChar`. This is the minimal change
   that makes the helper callable in that function; it is behavior-preserving (the
   positional call site is unchanged) and confined to a Task 3 file. The
   code-quality reviewer assessed the rename consistent and regression-free. This
   is the cycle's `DONE_WITH_CONCERNS`.
2. **Task 6 — `roots.test.ts` not edited.** The plan's Task 6 "Files modified"
   lists `packages/cli/test/roots.test.ts`, but it needed no change: its
   `toContain` substring assertions still hold under the quoted output. The
   plan-compliance reviewer ran it green unchanged and confirmed leaving it
   untouched is plan-compliant (the listed file simply required no edit).
3. **Task 7 — `lock.test.ts` not edited.** The plan's Task 7 "Files modified"
   lists `packages/cli/test/install/lock.test.ts`, but its assertions are
   error-code / regex / serialized-JSON only, so no expectation drifted. Confirmed
   passing unchanged by the reviewer.
4. **Task 8 — three test files not edited; two small in-scope additions.** Of the
   four test files the plan lists, only `validate-unit.test.ts` needed editing;
   `source.test.ts`, `git.test.ts`, and `unit.test.ts` pass unchanged
   (structural/substring assertions). Additionally the implementer (a) quoted the
   `${dir}` path in git's `rev-parse HEAD failed in <dir>` message — beyond the
   plan's enumerated examples but in-scope under AC-7.1 completeness (spec §4.1 is
   stateless; file paths are value tokens), and (b) updated a `validate-unit.ts`
   JSDoc example to the backtick form to keep the comment faithful to the emitted
   message (comment-only, no behavior). Both reviewers assessed these sound and
   in-scope.

> Note on the "Files modified" deviations (2–4): the plan's lists were a
> conservative/maximal set; a listed test file that needs no edit because its
> assertions don't touch the changed message text is not a missed substep. Each
> was verified to pass unchanged before being left alone.

## 2. Surprises

- **Exactly one name collision.** Across the entire two-package surface, the only
  place the helper name `quote` collided with existing code was `readString`'s
  parameter in `conditions.ts` (Task 3). Every other file imported and used the
  helper without conflict.
- **Several listed test files needed no edit** (Tasks 6, 7, 8) because their
  assertions are structural / substring / error-code / serialized-JSON rather
  than full-message comparisons.
- **The e2e sweep was almost perfectly mechanical.** Of ~130 changed test/doc
  files in Task 9, every changed line is delimiter-only (purely-added backticks)
  except the two `*-tampered-lock` cases, which carry the intended Task 7 AC-2.8
  `"`→backtick lock-entry delimiter swap at identical token positions. The
  orchestrator mechanically confirmed this: stripping backticks **and**
  double-quotes makes every removed line equal its added line across all 130
  files — zero wording or word-order change.

## 3. Problems hit

- **One fix-loop iteration (Task 3, non-converging? no).** The first Task 3
  implementer missed the second of the two `Unexpected token ${tokenValue(token)}.`
  sites (`conditions.ts` `parsePrimary`, the plan's Step 3 "(both sites)"). The
  plan-compliance reviewer caught it (the gap slipped past unit tests because no
  test asserts that particular message). A fresh implementer quoted it and
  re-audited the file; the re-review passed. The loop converged in one iteration;
  no escalation, no `BLOCKED`.
- **Environment (not a repo change).** The first implementer had to run
  `bun install` because `node_modules` was absent in the working tree — a setup
  step, not a code change.
- No commit failures, no non-converging loops, no terminal verdicts.

## 4. Follow-ups

- **Document the convention in `AGENTS.md` (and possibly `README.md`).** The plan
  did not task a docs update, and `AGENTS.md` currently makes **no** claim about
  message quoting (so nothing there is stale or contradicted by this change). But
  future agents touching CLI messages would benefit from a stated rule: "every
  interpolated value token in a user-facing CLI message is backtick-quoted via the
  per-package internal `quote` helper; numerics, fixed vocabulary, error codes,
  `details` payloads, and the agent-skill Markdown stay bare/raw." **Routing:**
  candidate seed for a future thread (this is tier-2 work, not tier-3 phased work,
  so there is no next-phase `discussions/` to route to). NOT done in this run —
  out of the plan's scope; flagged here for the user to open if desired.

## References

- Plan: `plans/001/plan.md`
- Spec: `specs/001/spec.md` (§4 convention, §6 gate, FR-1/-2/-3/-6/-7)
- Ledger: `ledger.md` (tier 2)
- Commits: `98e6fec`, `c82b278`, `607f24b`, `62fb16f`, `ccc3feb`, `de79a3c`,
  `dd27e69`, `5e25ef4`, `3985dd7`
