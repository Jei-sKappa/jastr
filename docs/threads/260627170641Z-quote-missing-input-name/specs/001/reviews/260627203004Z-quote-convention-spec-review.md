---
status:
  disposed: 260627210833Z
  disposition: accepted
---

# Spec review — backtick-quoting convention spec (`specs/001/spec.md`)

## References

- Spec under review: `specs/001/spec.md`
- Genesis decision log (P1–P6, checked for consistency): `seed/discussions/260627171749Z-quote-input-names-in-error-messages-decision-log.md`
- Seed (original tier-1 ask): `seed/seed.md`
- Lifecycle ledger (tier-1 → tier-2 escalation): `ledger.md`
- Prior review on this spec (lossless-mapping): `specs/001/reviews/260627201723Z-spec-lossless-mapping-review.md`

## Verdict

**Ready.** All eight semantic-contract elements are present and handoff-grade, and
the decision-log consistency check is clean against P1–P6 (no settled decision
contradicted, no silent reversal). A downstream implementer can read this spec
alone and know what to build. The two items below are minor and do not block
handoff; the highest-impact one is the wording tension between the §7
"machine-checkable" header and AC-7.1's review-based verification.

Element coverage (all pass):

- **Intended outcome** — §1, with a concrete before→after. Strong.
- **Context** — §2, traces the one-line patch → project-wide convention escalation. Strong.
- **Scope / non-scope** — §3, explicit in- and out-of-scope lists. Strong.
- **Expected behavior** — §4 (§4.1–§4.5), the four-rule convention plus a representative before→after table. Strong.
- **Constraints** — §6, purity / public API / no-code-change / wording-frozen / living-docs / green-gate. Strong.
- **Explicit decisions** — inlined with `P<N>` citations throughout plus the §7 traceability table. Strong.
- **Unresolved questions** — §9 (plus §8 Degrees of freedom). Present and openly named.
- **Acceptance guidance** — §7, FR-1…FR-7 with exact-string ACs and a coverage statement. Strong (see nit on AC-7.1).

## Findings

- **[nit] Acceptance (element 8): the §7 "machine-checkable" header over-generalizes
  over AC-7.1.** The §7 preamble asserts "Tier 2 → machine-checkable. Each AC is a
  pass/fail assertion," but AC-7.1 — the completeness criterion that actually
  guarantees the spec's headline goal (eliminate *all* inconsistency, not relocate
  it) — is verified by "exhaustive review across the §5 surface" with only an
  *optional* grep/lint, and DoF #4 explicitly accepts manual review as a valid
  enforcement mechanism. AC-7.1 is a pass/fail *assertion* but is not mechanically
  *checkable* the way AC-2.x/AC-3.x (exact rendered strings) are. **Why it matters:**
  a reviewer who takes "every AC is machine-checkable" at face value will expect a
  deterministic gate for completeness and instead has to perform or trust an
  exhaustive manual review — the very judgment-dependence tier-2 machine-checkability
  is meant to reduce, applied to the most important AC. A one-clause caveat on the
  §7 header (or on AC-7.1) acknowledging that completeness is review-verified would
  remove the tension. The spec is internally honest about this (DoF #4), so it is a
  wording fix, not a missing element.

## Open Questions

- **Rendered `jastr run` output vs. diagnostic messages in `interpolation.ts` /
  `render.ts`.** §5 lists `interpolation.ts` and `render.ts` in the engine affected
  surface, and §3 takes care to explicitly carve out the generated agent-skill
  Markdown as a non-message content surface — but the spec never explicitly states
  that the `jastr run` *rendered template output* (also content, not a message) is
  out of scope. The §5 preamble ("every file that interpolates a value token into a
  user-facing **message**") already implies only the diagnostic message strings in
  those files are in scope, so a careful implementer will scope it correctly. Worth
  confirming with the author whether an explicit non-scope line (parallel to the
  agent-skill carve-out) is wanted, since mis-scoping here would corrupt rendered
  document content — low probability, high consequence. This is a confirmation, not
  a defect; the preamble arguably already answers it.

## Next Actions

- Optionally tighten the §7 header or AC-7.1 wording to acknowledge that AC-7.1's
  completeness is verified by exhaustive review (per DoF #4), not a deterministic
  check — a one-line edit. Disposition can be accept-and-revise on this review.
- Confirm the rendered-output Open Question with the author; add an explicit
  non-scope line only if they want the symmetry. No revision required if the §5
  preamble is considered sufficient.
- **Adversarial pass not run.** This skill performed the handoff-grade-bar and
  decision-log-consistency checks only. Given the spec is a mechanical,
  message-formatting-only convention in a private pre-release repo (low risk despite
  the ~190-site blast radius), a separate adversarial review is low priority — note
  it as available rather than warranted.
