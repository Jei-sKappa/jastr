---
status:
  disposed: 260628100200Z
  disposition: accepted
  rationale: implementation/discussions/260628100200Z-backtick-review-findings-decision-log.md
---

# Implementation Review — backtick-quoting convention for interpolated value tokens in CLI messages

## References

- Implementation under review (READ-ONLY): commit range `d4241af..3985dd7` —
  the 9 commits `98e6fec` → `3985dd7` on branch `feat/improve-missing-input-ux`,
  repo `jastr` (`98e6fec` engine helper · `c82b278` engine inputs/schema ·
  `607f24b` engine directive/render · `62fb16f` CLI helper · `ccc3feb` CLI
  command-parse/input-flag · `de79a3c` CLI core run-path · `dd27e69` CLI install
  command-surface · `5e25ef4` CLI install acquisition/support · `3985dd7` e2e
  sweep + `BEHAVIOR.md`).
- Spec judged against (the contract): `specs/001/spec.md` (approved `260627212538Z`)
- Implementation report (context, not the bar): `implementation/260628084403Z-backtick-quoting-convention-implementation-report.md`
- Plan (navigational aid only — never the bar): `plans/001/plan.md`
- Genesis decision log (P1–P6 provenance): `seed/discussions/260627171749Z-quote-input-names-in-error-messages-decision-log.md`
- Ledger (tier 2): `ledger.md`

## Verdict

**Delivers.** Every machine-checkable acceptance criterion on the spec's §5
surface (FR-1 through FR-7) is satisfied: a per-package internal `quote` helper
exists and is unexported from the engine, every interpolated value token in the
engine and the §5-scoped CLI messages is backtick-quoted through it, out-of-scope
tokens (numerics, fixed vocabulary) stay bare, the three pre-existing backtick
sites route through the helper unchanged, and `targets/agent-skill.ts` plus the
engine public API are untouched. The change is delimiter-only on the message
text. One `issue`-level finding is **spec-rooted, not an implementation
infidelity**: the §1 intended outcome of *uniform* quoting "across all CLI
messages" is not fully achieved because `targets/agent-skill.ts` holds ~10
user-facing **non-Markdown** validation/info messages that stay bare — and the
spec itself excludes that file (AC-6.2 / §5). The implementation is landable as
written; the residual inconsistency is a spec-scoping decision to route back to
the owner.

## Findings

### 1. `issue` — agent-skill.ts non-Markdown messages stay bare (Axis 1: acceptance-criteria coverage / Axis 2: constraint adherence) — spec-rooted

`packages/cli/src/targets/agent-skill.ts` is excluded from the convention at the
**file** level (FR-6 / AC-6.2: "No edit to `targets/agent-skill.ts` is made") and
omitted from the §5 surface list, where it is described as the "Markdown surface."
The implementer honored that exactly — the file is absent from the range's
changed-file set. **But the file mixes two surfaces:** the generated-Markdown body
(correctly excluded) *and* ~10 thrown/emitted user-facing CLI messages that are
plain `Error:`/stdout lines, not Markdown, and that interpolate value tokens
(config-key path labels, field names, output paths, template refs) **without
backticks**.

The cleanest demonstration is one shared helper rendering two ways: the base
target-metadata path calls `validateArgumentHintPrefix` with a **bare** label
(`agent-skill.ts:62`), so `` targets.agent-skill.argument-hint-prefix must be a
string. `` ships unquoted, while the variant path calls the *same* helper with a
**quoted** label (`config.ts:265`), so `` .jastr/config.yml
`variants.…argument-hint-prefix` must be a string. `` ships quoted.

Why it matters for the next reader: a user running `jastr generate agent-skill` /
`jastr validate` sees mixed quoting in adjacent messages — the exact
inconsistency the thread set out to remove (§1). It is an `issue`, not a
`blocker`: every machine-checkable AC passes, and resolving it requires
**relaxing AC-6.2**, which is the spec owner's call — not something the
implementation could have done while staying spec-compliant.

### 2. `nit` — passthrough Node error message left bare (Axis 2: constraint adherence / completeness)

`packages/cli/src/install/git.ts:170` renders `` git could not be run:
${error.message} `` with the underlying `error.message` bare. This is defensible:
a free-form OS error sentence is none of the value-token kinds the spec
enumerates in §4.1, and §8 Degrees-of-freedom item 2 grants per-site tokenization
latitude. Noted for completeness only; no action required unless the owner
decides nested error strings should also be delimited.

## Evidence

**Finding 1**
- Diff/code (bare interpolations, all *unchanged* in the range): `packages/cli/src/targets/agent-skill.ts:78`, `:81`, `:87`, `:105`, `:173`, `:187`, `:232`, `:404`, `:438`, `:448`, `:453`. Base call site passing a bare label: `agent-skill.ts:62-65` (`"targets.agent-skill.argument-hint-prefix"`). Contrast (in-scope, quoted) variant call site: `packages/cli/src/config.ts:265`. The file does not appear in `git diff --name-only d4241af..3985dd7`.
- Spec: §1 Intended outcome ("every value … in a user-facing CLI message … consistently, across both `@jastr/engine` and `@jastr/cli`"); §3 non-scope ("the generated agent-skill **Markdown**"); §5 Affected surface ("`targets/agent-skill.ts` backticks are **excluded** — Markdown surface"); FR-6 / AC-6.2; AC-7.1 (completeness scoped "across the §5 surface").

**Finding 2**
- Diff/code: `packages/cli/src/install/git.ts:170`.
- Spec: §4.1 (domain enumeration of value-token kinds); §8 Degrees of freedom, item 2 (per-site tokenization is the implementer's).

## Open Questions

- **Spec scope (drives Finding 1):** Did the spec author intend AC-6.2's
  *file-level* exclusion to also cover `agent-skill.ts`'s non-Markdown
  validation/info messages, or only the generated Markdown body? §3 and §5 both
  frame the exclusion around "Markdown," which suggests the non-Markdown messages
  may have fallen through a scoping crack rather than being deliberately exempted.
  This is a question for the spec owner, not a gap to autofill.
- **Test-coverage axis (Axis 5) — NOT skipped.** The spec's testable ACs are
  covered: engine `packages/engine/test/quote.test.ts` (AC-1.1), CLI
  `packages/cli/test/quote.test.ts` (AC-1.2), engine `inputs.test.ts` /
  `template-schema.test.ts` assertions for AC-2.1/2.2/2.3, and the e2e
  expected-output sweep including the `*-tampered-lock` `"`→backtick delimiter
  swap for AC-2.8. One residual gap the implementation report itself flagged: no
  unit test asserts the condition-parser `` Unexpected token … `` message family
  (the Task 3 miss that slipped past tests and was caught only on review). Worth a
  confirming follow-up if that message family is treated as AC-2.x-relevant.
- **AC-7.2 green gate — not independently re-run.** Per this skill's read-only
  mandate I did **not** execute `bun run check / typecheck / test / test:cli:e2e /
  docs:cli:living --check / build`. The green-gate claim rests on the
  implementation report (test 597 / e2e 301) and the visible, internally
  consistent test-file + `packages/cli/docs/BEHAVIOR.md` updates in the range.
  Whoever lands the change should confirm the gate locally.

## Next Actions

- **Finding 1 → spec owner (amendment, not a code edit here).** Open a follow-up
  that decides whether the backtick convention extends to
  `targets/agent-skill.ts`'s non-Markdown validation/info messages. This is the
  same class of "defer extra visual consistency to a future decision" call already
  parked in §9. If the owner says yes, it relaxes AC-6.2 and is a fresh, small
  implementation pass — quote `${label}` / `${field}` / `${options.out}` /
  `${options.templateRef}` at the ~10 sites while leaving the generated-Markdown
  body bare. Until that decision lands, the current implementation is
  spec-compliant and needs no change.
- **Finding 2 → optional.** No action required; fold into the same follow-up only
  if nested OS error strings are deemed in-domain.
- **Merge/land.** The implementation **delivers** the spec's acceptance criteria
  and is landable on the spec as written; confirm the §6/AC-7.2 gate locally
  first (this read-only review did not re-run it).
- **General-purpose code review:** not warranted. The change is delimiter-only
  and the implementer mechanically verified that stripping backticks and
  double-quotes makes every removed line equal its added line across the sweep;
  there is no regression/style surface beyond the spec's ACs to escalate.
