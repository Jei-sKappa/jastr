---
status:
  disposed: 260627210801Z
  disposition: accepted
---

# Review — `jastr list --variants` spec: lossless-mapping

## References

- Document under review (spec): `specs/001/spec.md`
- Genesis decision log (P1–P5, feature shape): `seed/discussions/260627172443Z-list-variants-design-decision-log.md`
- Spec-review clarifications decision log (P1–P2): `specs/001/discussions/260627195921Z-spec-review-clarifications-decision-log.md`
- Seed (genesis framing + open questions): `seed/seed.md`
- Thread ledger (tier-2, design-decision-bearing): `ledger.md`
- Codebase ground-truth consulted to classify the spec's byte-exact rendering claim (B4) as faithful derivation vs. a fresh choice (read-only, repo-relative): `packages/cli/src/install/list.ts` (2-space row indent at line 83; `├── `/`└── ` member connectors at the 2-space indent at lines 239–248), the existing group-member fixture `packages/cli/test/e2e/cases/list-group-members/expected/stdout.txt`, and the current requirements `packages/cli/requirements/functional/16-list.yml` (`LIST-FR-0001`–`LIST-FR-0005`).

## Verdict

**Lossless — the review passes.** Both Findings sections below are empty: every decision and assumption the spec commits to traces to a decision the user saw-and-accepted in the genesis log (P1–P5) or the spec-review log (P1–P2), or is explicitly marked a Degree of freedom; and every decision the user made in those discussions is carried by the spec. The spec is unusually disciplined — nearly every assertion cites its governing `P#` — and the one substantial elaboration that the discussions did *not* spell out byte-for-byte (B4's exact tree rendering) was checked against the live `list` code and the committed group-member fixture and found to be a faithful extension of existing output, not a smuggled rendering decision.

## Findings

### (a) Smuggled-in — decisions/assumptions the user never accepted

None — every committed choice and presupposition in the spec maps to an accepted discussion decision or a declared Degree of freedom. Specifically:

- **B4 byte-exact rendering** (2-space base indent, `├── `/`└── ` connectors, the `  │   ` non-last-member continuation, the six-space last-member continuation, and the column-6/column-10 alignment) is *not* a fresh choice. P2 accepted the tree structure ("variants are children of their template's row; for grouped members they are grandchildren under the member line, using the `│` continuation for non-last members; sorted by id; no `(variant)` tag"). The remaining specificity is mechanically derived from existing `list` output — `list.ts:83` already indents rows two spaces and `list.ts:239–248` already renders member connectors at that indent — and the spec's B4 group example reuses the exact rows of the committed `list-group-members` fixture (`team` / `team/api` / `team/demo` / `tools` / `tools/fmt`), adding only the P2-accepted variant grandchildren. Faithful elaboration, not addition.
- **`--variants` as a Commander `.option()` auto-surfaced in `--help`** (Scope; Constraints "Match surrounding style") is a least-astonishing implementation consequence of the seed-and-P5 "new boolean opt-in flag" decision, matching the existing `--local`/`--global` options on `list`; it commits to no alternative the discussions left open.
- **The `LIST-FR-0005` "keep verbatim + one cross-reference sentence" constraint** and its supersession of the genesis "carve-out from FR-0005" phrasing trace directly to spec-review P1 (Option B). The illustrative sentence is offered as an example ("such as:"), not pinned.
- **The zero-row-root "never consulted / no-throw" entailment** in B6 and the corresponding DoF narrowing trace directly to spec-review P2 (Option A pin).
- The FR split into `LIST-FR-0006`/`0007`/`0008`, the derived ACs, the coverage map, and the documentation/traceability scope are organization and derived acceptance criteria — non-items by the unit-is-a-decision rule, not flaggable.

### (b) Dropped — decisions the user made that the document failed to capture

None — every decision in the in-scope discussions is carried by the spec:

- **Genesis P1** (strict per-root, row-driven, no cross-root reads, the no-forward-scaffolding guard rail) → Context, B2/B5, the Expected-behavior preamble, the "No forward-reference scaffolding" constraint, the "Orphan and `missing`-row suppression left emergent" DoF, and the "All AC fixtures use co-located variants" note.
- **Genesis P2** (bare runnable ref, placement, ascending-id sort, no `(variant)` tag, grouped-member grandchildren) → B3, B4, the "No richer variant line content" non-scope.
- **Genesis P3** (throw `invalid_config`, row-scoped, exact reused messages, no new code) → B6, the CLI-only / reuse-messages constraints, the "No engine change" non-scope.
- **Genesis P4** (variants attach only to standalone units and on-disk group members; aggregate and missing rows get none, emergently) → B2, `LIST-FR-0007`, the suppression DoF.
- **Genesis P5** (`list --variants` IS the complete runnable inventory; Option B dropped-not-deferred; cross-root orphan closed by co-location) → the "No separate composed command (the discarded Option B)" non-scope, Context, Unresolved questions.
- **Spec-review P1 and P2** → the `LIST-FR-0005` constraint and the B6 zero-row paragraph + DoF narrowing, as noted above.
- The seed's five downstream open questions (flag semantics, nesting, sorting/labeling, dual-root composition, variant provenance) are each resolved and carried (B1/Scope, B4, B4/B3, B5, the provenance non-scope).

## Open Questions

- **P5's "same template installed in both roots, same variant id in both configs" residual.** P5 observed this case is "handled acceptably by A (both refs shown; runtime shadowing is documented at `run`, not `list`)." The spec's per-root model (B5: "each section reads only its own root's `config.yml`") *entails* that such a ref appears under both sections, so the behavior is carried by the model — but the spec never calls this dual-presence case out explicitly, leaving it emergent like the orphan/missing edges. Is the B5 entailment sufficient (consistent with the spec's deliberate emergent-edge style and P5 treating shadowing as a `run` concern), or should the spec add one explicit sentence noting both-sections display for a co-installed same-id variant? This is a judgment call about whether P5's rationale-level observation rose to a decision the document must state outright; it is not, on the current reading, a dropped decision.

## Next Actions

- The spec is **ready to carry the user's decisions forward** on the lossless-mapping axis — i.e. ready to be approved on this axis. No revision is required to fix a smuggled-in or dropped decision.
- Optionally settle the single Open Question above in a brief follow-on note before approval; if the answer is "the B5 entailment suffices," no document change is needed and this review can be disposed `accepted` (or `rejected`) directly in its frontmatter. If an explicit dual-presence sentence is wanted, that is a one-line additive clarification to B5, after which this review is disposed and need not be re-run for any other reason.
