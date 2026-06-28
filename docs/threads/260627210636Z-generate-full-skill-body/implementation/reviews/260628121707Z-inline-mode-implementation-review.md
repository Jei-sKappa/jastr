---
status:
  disposed: 260628141513Z
  disposition: accepted
  rationale: implementation/discussions/260628140531Z-inline-mode-review-findings-decision-log.md
---

# Implementation Review — `inline` rendered-skill mode for `jastr generate agent-skill`

## References

- Implementation under review (READ-ONLY): repo `jastr`, branch
  `feat/generate-full-skill-body`, commit range `main...HEAD`
  (`c247c79..cbf9cd5`, 8 commits).
- Spec (the contract): `specs/001/spec.md` (v1, approved `260628101300Z`).
- Implementation report (implementer's account, context only):
  `implementation/260628120230Z-inline-agent-skill-mode-implementation-report.md`.
- Decision log cited by the spec (P1–P4):
  `seed/discussions/260627214826Z-inline-agent-skill-mode-decision-log.md`.
- Plan (navigational aid only, not the bar): `plans/001/plan.md`.
- Prior spec-side reviews (context): `specs/001/reviews/260628095502Z-spec-lossless-mapping-review.md`,
  `specs/001/reviews/260628095818Z-inline-mode-spec-review.md`.

Note on method: per this skill's read-only constraint, the review did not run
the test suite, check out the branch, or execute the green gate — it judges the
diff text against the spec. The "all six gates exit 0" claim is the
implementation report's, not independently re-run here (see Next Actions).

## Verdict

**Delivers.** Every one of the spec's eleven functional requirements and their
acceptance criteria is covered by a corresponding change in the diff, the
pinned constraints (CLI-only, engine untouched, no new `JastrErrorCode`, maximal
reuse, exact byte format) are all honored, and the feature stays inside scope. No
`blocker` and no `issue` findings — two `nit`s only, both already anticipated by
the implementer and within the spec's degrees of freedom.

## Findings

### nit 1 — Router mode no longer emits "Unknown generate option" for a mistyped option

- **Axis:** constraint adherence (backward-compat) / behavior fidelity.
- **What:** The pre-change `validateGenerateArgs` threw `invalid_command`
  `Unknown generate option <arg>.` for any unrecognized `--flag` in `generate`.
  The diff replaces that branch with collect-as-input-flag-candidate, so in
  router mode a *typo'd known option* (e.g. `--ou=x` for `--out`) now surfaces as
  `Template input flags are only valid with --mode=inline.` The literal
  "Unknown generate option" message is gone from `@jastr/cli` source entirely.
- **Why it matters:** The new message is technically accurate (the token *is* an
  unrecognized flag) and the spec pins neither the message nor unknown-option
  handling; the chosen "always collect passthrough flags and reject any in router
  mode" wiring is **explicitly granted** in Degrees of freedom, and the raw-argv
  guard still catches the typo (it is not silently swallowed). The only friction
  is a mild tension with the spec's "with no `--mode`… behavior is byte-identical
  to today" line for that one error path — worth a downstream reader knowing the
  typo diagnostic changed, not worth a fix.

### nit 2 — `missing_target_metadata`'s "writes no file" half has no machine assertion

- **Axis:** test coverage.
- **What:** The inline `missing_target_metadata` e2e case
  (`generate-inline-missing-target`) asserts exit 1 + stderr but not file
  absence, because the harness has no `fileAbsent:` primitive (the report's
  follow-up #2). Its sibling `missing_required_input` *does* get a unit-level
  "…and writes no file" assertion in `generate-command.test.ts`, so AC-5.1's
  no-file half has teeth while AC-6.5's relies on code-path inspection.
- **Why it matters:** The code path guarantees no write for both — the throw
  happens before `writeAgentSkill` — so this is a test-rigor gap, not a behavior
  gap. Matches the existing `generate-check-invalid-template` convention; already
  surfaced as a candidate seed.

## Evidence

- **nit 1:** diff `packages/cli/src/args.ts:377-401` (the `--mode`/candidate
  collection replacing the old `Unknown generate option` throw) and the post-loop
  gate at `args.ts:410-417`; the message's total removal confirmed by grep (no
  `Unknown generate option` remains under `packages/`). Spec
  `specs/001/spec.md` Constraints ("Backward compatibility… behavior and output
  are byte-identical", line ~103) vs. Degrees of freedom ("Commander wiring for
  mode-gated flags… always collect passthrough flags and reject any in router
  mode", lines ~310-313) and behavior 7 / FR-7.
- **nit 2:** case `packages/cli/test/e2e/cases/generate-inline-missing-target/case.yml`
  (exit/stderr only) vs. the file-write ordering in
  `packages/cli/src/commands.ts:172-233` (target resolution + render both throw
  before `writeAgentSkill` at `commands.ts:248`). Spec AC-5.1 / AC-6.5
  (`specs/001/spec.md:243-245`, `:257-258`).

## Open Questions

- **FR-2 byte-identity (AC-2.1) is proven by proxy, not a dedicated test.** No
  new requirement asserts `--mode=router` bytes equal the *pre-change* output for
  shapes A/B/C/D; instead the unmodified router e2e suite (whose committed
  expected files *are* the pre-change bytes) passing unchanged stands in for it
  (AC-2.2). This is sound — an unmodified, still-green expected-file suite is a
  byte-identity check — and falls under the granted test-specifics freedom.
  Flagged only so a downstream reader knows the proof is "suite unchanged + green"
  rather than an explicit old-vs-new diff assertion.
- **Test-coverage axis was NOT skipped** — the spec's ACs name testable behavior
  throughout and the diff covers them with both e2e cases and unit tests
  (`agent-skill-target.test.ts`, `generate-command.test.ts`). Recorded here per
  the skill's requirement to state the axis disposition.

## Next Actions

- **Land / merge** — verdict is `delivers`; the contract is met.
- **Run the green gate before merge if CI has not.** This review is read-only and
  did not execute `bun run check / typecheck / test / test:cli:e2e /
  docs:cli:living --check / build`; the report claims all six exit 0 (627 unit +
  322 e2e). Confirm in CI or a separate verify pass rather than trusting the
  self-report.
- **(Optional, nit 2)** If the team wants machine teeth on every "writes no file"
  AC, open the `fileAbsent:`-style harness primitive already named as a candidate
  seed — out of scope for this thread.
- No spec-fault findings: the spec's lone Unresolved question (body beginning
  with `---`) was handled exactly as requested — `generate-inline-body-leading-dashes`
  is the confirming fixture. No owner-approved amendment is needed.
