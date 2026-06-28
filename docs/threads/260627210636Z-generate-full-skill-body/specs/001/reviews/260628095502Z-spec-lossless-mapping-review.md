---
version: 1
status:
  disposed: 260628100051Z
  disposition: accepted
---

# Lossless-mapping review — `inline` rendered-skill mode spec

## References

- Document under review (the spec): `specs/001/spec.md`
- Genesis design discussion / decision log (P1–P4): `seed/discussions/260627214826Z-inline-agent-skill-mode-decision-log.md`
- Seed (genesis framing, pre-discussion): `seed/seed.md`
- Thread lifecycle ledger (tier-2 classification): `ledger.md`

No `specs/001/discussions/` folder exists; the document was produced from the
thread's genesis discussion under `seed/`, and the spec itself names that
decision log (spec lines 38–41, 112–113) as the source it elaborates. That
resolved set — the decision log plus the seed — is what this review maps the
spec against.

## Verdict

**Lossless — the review passes.** Both Findings sections below are empty: every
decision and assumption the spec commits to traces to a decision the user
saw-and-accepted in P1–P4 (or to the seed), to a faithful reuse of established
codebase behavior, or to content the spec explicitly fences as out-of-scope, a
Degree of freedom, or an unresolved question; and every decision the user made
in P1–P4 (and the seed) is carried into the spec — including the seed's initial
"omit `argument-hint`" guess, which the spec correctly drops in favor of the
P3 correction rather than carrying the superseded version.

## Findings

### (a) Smuggled-in — decisions/assumptions the user never accepted

None — every committed choice and presupposition in the spec was checked
against P1–P4 and the seed and traces to an accepted decision, a faithful
reuse of existing behavior, or an explicit fence. Specifically:

- The two pinned decision families — surface shape / `--mode` (P1), input
  resolution and precedence (P2), `argument-hint` rule (P3), and
  `validate`/`--check`/join/value-validation (P4) — are each carried with an
  inline citation to the originating decision (spec behaviors 1–9, each tagged
  `(Pn ...)`).
- Rejected and deferred alternatives are fenced under **Out of scope**, not
  silently re-decided: no `targets.skill` / `generate skill` / compound command
  names (P1), no `targets.agent-skill.mode` (P1), no per-mode `argument-hint`
  field (Option B, P3), no `$ARGUMENTS` first-class concept (Option C, P3), no
  `validate --mode` (P4), no input-flag reconstruction in `--check` messages
  (P4).
- Derived code-grounded claims were spot-checked against the tree and hold, so
  none is an un-established presupposition: all six error codes the spec names
  (`invalid_command`, `missing_required_input`, `missing_target_metadata`,
  `locked_input_flag`, `output_stale`, `output_missing`) exist in the engine
  union (`packages/engine/src/errors.ts`), and the success message the spec says
  it reuses (`Generated <path> from template <source>`, behavior 3 / AC-3.5) is
  the existing one at `packages/cli/src/commands.ts:203`. This confirms the "no
  new `JastrErrorCode`" / "CLI-only" / "reuse" assertions are grounded, not
  smuggled.
- Specifics the author chose not to pin are openly handed to the implementer in
  **Degrees of freedom** (reuse factoring, Commander wiring, validation
  ordering, exact message wording, fixture specifics) — the pressure valve is
  used, so none of those reads as an additive commitment. The body-begins-with-
  `---` edge case is parked under **Unresolved questions** rather than silently
  decided.
- The acceptance criteria (FR-1…FR-11) are derived machine-checkable
  restatements of the behaviors; per the review contract these are never
  flagged, and none introduces a decision absent from the behaviors above it.

### (b) Dropped — decisions the user made that the document failed to capture

None — every decision recorded in P1–P4 and the seed is carried by the spec:

- **P1** (mode of existing target; `--mode=router|inline` default `router`;
  CLI flag not frontmatter; input flags inline-only; backward-compatible
  default) → behaviors 1, 2, 7; Constraints; Out of scope; FR-1/FR-2/FR-7.
- **P2** (reuse `run`'s resolution wholesale; precedence CLI > local > global >
  defaults; variant locked-inputs with conflict rejection; unresolved required
  input → existing `missing_required_input`) → behaviors 4, 5; FR-4/FR-5.
- **P3** (Option A: reuse `argument-hint-prefix`; empty derived form → prefix
  verbatim or field omitted; no new key/validation; router unchanged) →
  behavior 6; FR-6.
- **P4** (`validate` mode-agnostic; mode-aware `--check`/`output_missing`/
  `output_stale` suggested-fix naming `--mode=inline`; fixed byte-deterministic
  `---\n<yaml>\n---\n\n<body>` join; `--mode` value validation via
  `invalid_command`; no new `JastrErrorCode` for the whole feature) →
  behaviors 1, 3, 8, 9; Constraints; FR-8/FR-9/FR-10.
- **Seed** (the ~32-file migration motivation; distribution with no downstream
  jastr; unresolved-required-input-as-hard-error flag) → Intended outcome,
  Context, behavior 5. The seed's *tentative* "`argument-hint` likely should be
  omitted" guess was reversed by the P3 correction; the spec correctly carries
  the corrected rule, which is the right resolution, not a dropped decision.

## Open Questions

- **Should the spec carry the P3 conceptual reframing of `argument-hint`, or is
  it rationale that legitimately stays in the cited decision log?** P3 records a
  substantive correction that *reversed* the seed's direction: `argument-hint`
  describes Claude Code's runtime `$ARGUMENTS` (free-form invocation text), not
  jastr generate-time inputs — which is *why* an inline skill is meaningfully
  hint-bearing despite every jastr input being resolved at generate time. The
  spec carries the **operational** rule faithfully (behavior 6: empty derived
  form → prefix verbatim or omitted) and cites the decision log for the why, so
  this is not a dropped decision. But because the correction overturned an
  earlier proposal, a future maintainer reading the spec alone could re-derive
  the rejected "omit-always" intuition. Worth deciding in the follow-on whether
  one sentence of that framing belongs in behavior 6 — or whether the citation
  is sufficient and adding it would be rationale-padding.

## Next Actions

- The mapping is lossless on both axes, so on the lossless-mapping criterion the
  spec is **ready to be approved** — the human's sign-off will be an approval of
  a document that faithfully carries what they decided in P1–P4 and the seed.
- The single Open Question is non-blocking and is a wording judgment, not a
  mapping defect. If the author wants to settle it, do so in a brief follow-on
  discussion (optionally adding one framing sentence to behavior 6) and treat
  this review's disposition accordingly; no re-run is required for a clean pass.
