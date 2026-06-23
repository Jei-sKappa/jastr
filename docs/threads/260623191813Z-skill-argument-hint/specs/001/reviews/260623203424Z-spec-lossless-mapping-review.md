---
status: {}
---

# Lossless-mapping review — Spec 001 (`argument-hint` in generated Agent Skill wrappers)

## References

- Document under review: `specs/001/spec.md`
- Genesis decision log (the discussions mapped against, decisions P1–P8): `seed/discussions/260623193024Z-argument-hint-design-decision-log.md`
- Seed (upstream sketch the decision log refines): `seed/260623191813Z-skill-argument-hint-seed.md`
- Thread lifecycle ledger (tier 2): `ledger.md`

Source-set resolution: the spec's own preamble names the genesis decision log as the authority for its `(P<N>)` citations, and that log is the sole discussion record in the thread (there is no `specs/001/discussions/` folder). The mapping was checked against decisions P1–P8 of that log, with the seed treated as upstream input.

## Verdict

**Lossless — the review passes.** Both Findings sections are empty: every decision and assumption in the spec traces to a decision the user saw and accepted in P1–P8 (or is explicitly parked in `## Degrees of freedom` / `## Unresolved questions`), and every decision P1–P8 records is carried somewhere in the spec.

## Findings

### (a) Smuggled-in — decisions/assumptions the user never accepted

None — every committed choice and presupposition in the spec maps to an accepted decision, an existing documented behavior, or an explicit Degree of freedom. The cross-walk:

- §1/§2/§3 composition (derive-by-default flags + author intent prefix) ← P1.
- §3 non-scope (no full-literal override, no concatenation) and §4.5/§5 single-knob reservation ← P2.
- §4.1 sibling directive key `targets.agent-skill.argument-hint-prefix` ← P3.
- §4.2 / FR-1 grammar table — `=` separator, bare booleans, uniform `<value>`, pipe-joined enums, bracketed optionals, declaration order, single-space join ← P4 (which accepted exactly this grammar including all three judgment calls).
- §4.3 / FR-3 join rules, four empty-case outcomes, `name`/`description`/`argument-hint`/passthrough ordering, and body-shapes-unchanged ← P5.
- §4.4 / FR-5 locked-input exclusion and per-variant `agent-skill.argument-hint-prefix` that replaces the base wholesale ← P6 (locked exclusion confirmed; option B per-variant override chosen).
- §4.5 / FR-2 / FR-4 validation codes (`invalid_target_metadata` base/reservation, `invalid_config` variant), trim rule, and reservation of `argument-hint` in base **or** variant `frontmatter` via the shared `collectPassthroughFrontmatter` path ← P7.
- §4.6 / FR-6 `YAML.stringify` serialization, `--check` byte-comparison, accepted derive-by-default churn, and validate riding the existing path ← P8.
- §6 ACs are derived (machine-checkable assertions that follow mechanically from P1–P8) — not flaggable by rule.

Three statements were scrutinized as candidate additions and judged faithful, not smuggled:
- §1 "verified against the official skills frontmatter reference" restates and backs the seed's own premise that Claude Code supports an `argument-hint` field; it commits the design to nothing.
- §4.1 "It has no maximum length" makes explicit the absence of a length rule in P7's enumerated validation set (string / non-empty-after-trim / single-line) — a restatement of what P7 did **not** constrain, not a new constraint.
- §4.1 "not interpolated and not passed through the template engine … consistent with how `name` / `description` are handled today" is the direct consequence of P7's decision to mirror the `description` rule and P1/P3 treating the prefix as literal intent *text*; the discussions left no interpolation alternative open for it to silently pick.

### (b) Dropped — decisions the user made that the document failed to capture

None — each of P1–P8 is carried by the spec (see the §-by-§ cross-walk above). Spot-checks of sub-decisions: P4's three judgment calls (§4.2), P5(6) verbatim single-space join (§4.3 + AC-2.2), P6 "user chose B explicitly" per-variant override (§4.4), P7(4) `.trim()` before join (§4.1 + AC-2.2), and P7(3) variant-frontmatter reservation (§4.5/AC-4.2) are all present. P7's exact reserved-field message and the new prefix-validation wording are correctly handed to the implementer in §7 — a faithful carry of P7, not a drop. The seed's space-separated `--manifest <file>` sketch was deliberately overridden to `=` in P4, and the spec carries the `=` form with the divergence noted (§4.2) — the later decision, correctly.

## Next Actions

- The spec is a faithful, lossless carrier of P1–P8 and is **ready to be approved on the lossless-mapping axis** — no disposing discussion is required for this review. (`status.approved` is still unset in the spec frontmatter; this review clears the lossless-mapping gate, not the full tier-2 Definition of Done.)
