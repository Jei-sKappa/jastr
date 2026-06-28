---
version: 1
status:
  disposed: 260628100051Z
  disposition: accepted
---

# Spec review — `inline` rendered-skill mode (handoff-grade bar)

## References

- Spec under review: `specs/001/spec.md`
- Genesis decision log (P1 surface shape, P2 input resolution, P3 `argument-hint`, P4 `validate`/`--check`/join/value-validation): `seed/discussions/260627214826Z-inline-agent-skill-mode-decision-log.md`
- Seed (genesis framing, pre-discussion): `seed/seed.md`
- Thread lifecycle ledger (tier-2 classification): `ledger.md`
- Prior review on this spec (lossless-mapping pass): `specs/001/reviews/260628095502Z-spec-lossless-mapping-review.md`

## Verdict

**Ready.** All eight semantic-contract elements are present and coherent, and
the spec is consistent with decision-log records P1–P4 — no settled decision is
contradicted and no settled point is silently reversed. There are no blocker or
issue findings. The single non-blocking item worth confirming is whether the
`--check` suggested-fix message's deliberate omission of input flags (P4 detail
2) could surprise a maintainer who generated an inline skill with ad-hoc flags
rather than a stable variant ref.

## Findings

No `blocker` and no `issue` findings.

**Eight-element check — all pass:**

- **Intended outcome** (`## Intended outcome`) — concrete: a single
  self-contained `SKILL.md` (frontmatter + fully-rendered body) that runs with
  no jastr installed. Pass.
- **Context** (`## Context`) — the ~32-file skills-repo migration, the
  two-commands-two-halves gap, and the citation to the genesis discussion
  ground the motivation. Pass.
- **Scope / non-scope** (`## Scope`) — explicit `### Out of scope` with eight
  bullets, each tied to a rejected/deferred option. This is the element most
  specs underspecify; here it is exemplary. Pass.
- **Expected behavior** (`## Expected behavior`, 1–9) — covers state changes,
  the success-message side effect, and every error surface (`invalid_command`,
  `missing_required_input`, `locked_input_flag`, `missing_target_metadata`,
  `output_stale`, `output_missing`), not just the happy path. Pass.
- **Constraints** (`## Constraints`) — CLI-only/engine-untouched, maximal reuse
  (with concrete code references), byte-determinism, unchanged error UX,
  backward compatibility, no Bun APIs, green gate. Pass.
- **Explicit decisions** — settled trade-offs are inlined *where operative*,
  each tagged `(P1)`–`(P4)`, and rejected alternatives are named in
  `## Out of scope`. This is exactly what the bar asks for. Pass.
- **Unresolved questions** (`## Unresolved questions`) — the
  body-begins-with-`---` edge case is named openly and flagged non-blocking.
  Pass.
- **Acceptance guidance** (`## Acceptance criteria`, FR-1…FR-11) —
  machine-checkable ACs, each FR citing its enforcing decision(s) and mapping
  back to a behavior. Pass.

**Decision-log consistency — pass.** P1 (mode of existing target, `--mode`
default `router`), P2 (reuse `run`'s resolution; precedence; variant locks;
`missing_required_input`), P3 (Option A `argument-hint-prefix`, empty form), and
P4 (mode-agnostic `validate`; mode-aware `--check` messages; fixed join;
`invalid_command` value validation; no new error code) are each carried
faithfully. The seed's tentative "omit `argument-hint`" guess is correctly
*not* carried — it was reversed by P3, and the spec follows the corrected rule.

**Soft language — checked, no actionable finding.** Behavior 1's "fails as
`invalid_command` with a clear message" uses a subjective qualifier, but it
carries no downstream-guess impact: the `## Degrees of freedom` section
explicitly hands "exact wording of new/edited error and status messages" to the
implementer, and AC-1.3/1.4 assert the `JastrErrorCode` and the `Error:`
shape rather than the text. The softness is intentionally fenced, so it is not
recorded as a nit.

**Grounding spot-check.** The six error codes the spec names exist in
`packages/engine/src/errors.ts`, and the reused success message
`Generated <path> from template <source>` exists at
`packages/cli/src/commands.ts:203` — so the "no new `JastrErrorCode`" /
"reuse" / "engine untouched" assertions are grounded, not presupposed.

## Evidence

- Eight elements: section headings `## Intended outcome`, `## Context`,
  `## Scope` (with `### In scope` / `### Out of scope (non-scope)`),
  `## Expected behavior`, `## Constraints`, the inline `(P1)`–`(P4)` tags
  throughout, `## Unresolved questions`, and `## Acceptance criteria`.
- Soft-language item: behavior 1 ("with a clear message") read against
  `## Degrees of freedom` bullet 4 and AC-1.3/AC-1.4.
- `--check` suggested-fix scope: `## Out of scope` ("No reconstruction of input
  flags into `--check` suggested-fix messages (per P4)") and behavior 8, against
  decision log P4 detail 2 ("the message does NOT attempt to reconstruct
  arbitrary input flags … re-running the author's own command with `--force`
  suffices") and the P2 rationale on `--check` reproducibility under ad-hoc
  flags.

## Open Questions

- **`--check` suggested-fix under ad-hoc input flags (author confirm).** P4
  detail 2 deliberately keeps the `output_stale`/`output_missing` suggested-fix
  command flag-free, on the rationale that authors pin inline skills with a
  stable variant ref rather than ad-hoc `--name=value` flags. For a skill that
  *was* generated with ad-hoc flags, a maintainer who copies the suggested-fix
  command verbatim would regenerate a *different* file (inputs resolved from
  config/defaults instead of the original flags). The spec faithfully carries
  the decision, so this is not a defect — but is it worth one sentence in
  behavior 8 or `## Unresolved questions` stating the assumption, so a future
  maintainer is not surprised by a suggested-fix that under-specifies? This can
  only be settled by the spec author.

## Next Actions

- The spec passes the handoff-grade bar; it can proceed to planning /
  implementation as-is. No revision is required to unblock downstream work.
- Optionally, fold the one Open Question into the spec (a sentence in behavior 8
  or `## Unresolved questions`) if the author wants the ad-hoc-flag caveat made
  explicit — accept-and-revise, recorded by setting this review's disposition.
- This was a standard (handoff-grade + decision-log) pass, not an adversarial
  one. The feature is CLI-only, well-scoped, and engine-untouched, so the risk
  surface is modest; an adversarial pre-mortem pass is **optional** rather than
  warranted here, but remains available if the author wants pressure on the
  byte-determinism / `--check` reproducibility surface specifically.
