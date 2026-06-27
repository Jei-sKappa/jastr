---
status:
  disposed: 260627210833Z
  disposition: accepted
---

# Lossless-mapping review — backtick-quoting convention spec (`specs/001/spec.md`)

## References

- Document under review (the spec): `specs/001/spec.md`
- Genesis decision log (P1–P6, the source decisions): `seed/discussions/260627171749Z-quote-input-names-in-error-messages-decision-log.md`
- Seed (original tier-1 ask): `seed/seed.md`
- Lifecycle ledger (tier-1 → tier-2 escalation record): `ledger.md`

The decision log is the sole discussion the spec maps from; the spec's own
provenance note (lines 7–12) names it as the source of every `P<N>` citation.
The seed and ledger are read as supporting context (the original request and the
tier escalation), not as additional decision sources.

## Verdict

**Lossless — the review passes.** Both Findings sections below are empty: every
decision and assumption the spec commits to traces to something the user
saw-and-accepted in P1–P6 (or is explicitly handed to the implementer in
`## Degrees of freedom`), and every decision the user made in P1–P6 is captured
in the spec.

## Findings

### (a) Smuggled-in — decisions/assumptions the user never accepted

**None.** Every flaggable commitment in the spec maps to an accepted decision,
and the genuinely under-determined specifics are openly deferred. Spot-checks of
the assertions most prone to over-commitment:

- The convention's four rules — **what gets quoted** (§4.1), **the quoted unit**
  (§4.2), **backticks with no exceptions** (§4.3), **a per-package internal
  helper** (§4.4) — map one-to-one onto **P2**, **P3**, **P4** (decision B), and
  **P6** (decision B), including the P4 supersession of the original
  double-quote preference and the P6 refinement that the helper accepts `string`
  only (§4.4, AC-1.4).
- The boundary (§3 non-scope / FR-3 / FR-6) — numerics and fixed vocabulary stay
  bare, agent-skill Markdown excluded, success/info messages included — matches
  **P5** exactly, including both flagged judgment calls (success/info IN,
  numerics OUT).
- The §4.2 **config-key** tokenization rule (`` `inputs.myTemplate` ``,
  prefix-inside-quotes) is not a new choice: it is the direct combination of
  **P5** item 2 (config-key paths are value tokens to quote) and **P3** (quote
  the complete logical token), and the genuinely ambiguous compound cases (e.g.
  the P5 `.jastr/config.yml variants.x.y` filename-plus-key compound) are
  explicitly deferred to the implementer in DoF #2 — not silently pinned.
- "Wording is frozen / only backtick delimiters added" (§3, §6) is the
  conservative reading of "quote interpolated tokens," not a choice among live
  alternatives; the spec self-labels it "Derived from the discussion's intent."
- "No new error codes / no schema change / `details.inputName` stays raw" (§6) is
  entailed by the accepted domain — **P2/P5** scope the convention to
  *user-facing CLI stdout/stderr messages*, which excludes structured error
  `details` payloads by definition — so it is a derivation of the domain
  decision, not an additional guarantee the user was never shown.
- The §5 affected-surface file list and the ~42/~150/~154 counts trace to the
  **P4** correction (~154 throw sites, ~190 message lines) and the **P6**
  engine/CLI split (~42 / ~150); the spec keeps them explicitly *approximate*
  with AC-7.1 as the completeness backstop, so it pins no exact file set.

### (b) Dropped — decisions the user made that the document failed to capture

**None.** Every decision recorded in P1–P6 is carried into the spec:

- **P1** (decision C — expand to a project-wide convention; tier-2 escalation) →
  §2 (scope growth and tier escalation) + the `ledger.md` tier-2 line.
- **P2** (decision C — quote every interpolated value token across engine + CLI;
  fixed vocabulary stays bare) → §4.1, FR-2/FR-3.
- **P3** (quoted unit = complete logical token; per-item lists, whole-token
  flags/refs/usage-hints) → §4.2, AC-2.3/AC-2.6.
- **P4** (decision B — backticks everywhere, supersedes double quotes; records
  the "already-quoted today" correction) → §4.3, §3 non-scope, §1.
- **P5** (boundary: all CLI messages, value tokens backticked, numerics + fixed
  vocab bare, agent-skill Markdown excluded; judgment calls a/b) → §3, §4.5,
  FR-3/FR-4/FR-6.
- **P6** (decision B — one internal helper per package, not exported, `string`
  only; refinement: refactor the 3 existing backtick sites) → §4.4, FR-1, FR-5
  (the three named sites `commands.ts:203`, `install/add.ts:183`,
  `install/update.ts:190` match P4 exactly).

The spec also correctly drops the stale **P2** "~40 sites" estimate in favor of
the larger **P4**-corrected scope — a superseded estimate, not a dropped
decision.

## Next Actions

- The spec is a lossless, additive-free mapping of P1–P6. On the
  lossless-mapping axis it is **ready to be approved** — the human's sign-off
  will be an approval of a document that faithfully carries what they decided.
- No follow-on disposition discussion is required for this review; with both
  Findings sections empty there is nothing to add, remove, or mark-as-DoF.
