---
status: {}
---

# Spec review — Spec 001 (`argument-hint` in generated Agent Skill wrappers)

## References

- Spec under review: `specs/001/spec.md`
- Genesis decision log (consistency check, decisions P1–P8): `seed/discussions/260623193024Z-argument-hint-design-decision-log.md`
- Seed (motivation / upstream sketch): `seed/260623191813Z-skill-argument-hint-seed.md`
- Thread lifecycle ledger (tier 2): `ledger.md`
- Prior review on this spec (lossless-mapping pass, clean): `specs/001/reviews/260623203424Z-spec-lossless-mapping-review.md`

## Verdict

**Ready.** All eight semantic-contract elements are present and handoff-grade, the spec is internally coherent, and it is consistent with decision log P1–P8. No blockers, issues, or nits found. A downstream implementer can build from this spec alone. (The highest-residual item is not a defect: §8 deliberately parks pathological enum-value escaping as an out-of-scope future decision rather than guessing — the correct handling.)

## Findings

No blocker, issue, or nit findings. Each of the eight elements was checked against the handoff-grade bar and the cross-cutting passes (gaps / ambiguities / false-precision / unjustified-absolutes / decision-log consistency) surfaced nothing actionable. Account of the checks:

- **(1) Intended outcome** — present and grounded (§1): emit an `argument-hint` = author intent prefix + auto-derived flag form. Not vague.
- **(2) Context** — present (§2): wrappers carry no hint today; jastr can derive *form* but not *intent*; tier-2 mandate for machine-checkable ACs. Motivation is reconstructable without inference.
- **(3) Scope / non-scope** — present with an explicit, itemized out-of-scope list (§3): no engine change, no full-literal override, no concatenation, no per-input placeholders, no new error code, no product-skill migration. Boundary is closed, not left to the implementer.
- **(4) Expected behavior** — present and exhaustive (§4.1–§4.6): directive shape, derived-flag grammar, assembly incl. all four empty/non-empty cases, field position, variant interaction, and the error surface (which codes fire on which defect). Covers error paths, not just happy path.
- **(5) Constraints** — present (§5): CLI-only, no new `JastrErrorCode`, single author knob, deterministic byte-stable `YAML.stringify` output, uniform error UX, Node-compatible source, living-docs currency.
- **(6) Explicit decisions** — settled trade-offs are inlined where operative and each is tethered to a `(P<N>)` decision (e.g. one-knob/no-override at §4.5 ← P2; `=` separator and bare booleans at §4.2 ← P4; insert-after-`description` at §4.3 ← P5). Resolutions are included, not merely referenced.
- **(7) Unresolved questions** — present and openly named (§8: pathological enum values), with an explicit non-block statement and a deliberate "do not invent escaping" instruction. §7 additionally separates author-pinned *whats* from implementer-granted *hows* (Degrees of freedom). The spec signals its closure state rather than leaving it implicit.
- **(8) Acceptance guidance** — present and machine-checkable (§6): FR-1…FR-8 with pass/fail ACs, a coverage note mapping every §4 behavior to ≥1 AC, and the green-gate list. A downstream reviewer can self-verify.

Cross-cutting verifications that could have produced findings but did not:

- **Decision-log consistency** — every spec commitment traces to an accepted decision in P1–P8; no settled decision is contradicted and none is silently reversed (the seed's space-separated `--manifest <file>` sketch was superseded by P4's `=` grammar, and the spec carries the `=` form with the divergence noted in §4.2 — the later decision, explicitly).
- **Grammar exhaustiveness** — the engine's input schema admits exactly `string` / `boolean` / `enum` (`packages/engine/src/schema.ts` rejects any other type), so the §4.2 / FR-1 grammar table covers every input type with no silent gap.
- **Field-position soundness** — `name` and `description` are required and always emitted by `buildAgentSkillContent` (`packages/cli/src/targets/agent-skill.ts`), so "insert immediately after `description`" (§4.3) is always well-defined.
- **Acceptance-target validity** — the three Traceability area files (`06-generate.yml`, `12-variants.yml`, `13-validate.yml`) all exist and the §7 next-free counters are accurate, so the durable-requirement landing sites are real.
- **Soft-language / absolutes scan** — no red-flag vagueness ("robust", "appropriate", "as needed", etc.); the `must`/`never`/`only`/`always`-class claims (no engine change, CLI-only, field omitted when neither part present) each have a precise boundary.

## Open Questions

None for the spec author — the spec's own §8 already isolates the only genuinely open item (enum-value escaping) and correctly scopes it out. No clarification is needed before downstream work.

## Next Actions

- **Escalate to planning / implementation.** The spec passes the handoff-grade bar and the lossless-mapping pass; it is ready to be approved on these axes and handed to an implementer. (Note `status.approved` is still unset in the spec frontmatter — approval is the user's act, not this skill's.)
- **Optional, given tier 2:** no adversarial / pre-mortem pass has been run against this spec. This skill performs only the handoff-grade-bar and decision-log-consistency checks. If the feature is considered high-stakes, run a separate adversarial review pass before approval; otherwise the standard passes are sufficient for a private, pre-release tool.
