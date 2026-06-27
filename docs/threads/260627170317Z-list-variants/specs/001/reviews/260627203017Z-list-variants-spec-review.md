---
status:
  disposed: 260627210801Z
  disposition: accepted
---

# Review — `jastr list --variants` spec: handoff-grade bar

## References

- Spec under review: `specs/001/spec.md`
- Genesis decision log (P1–P5, feature shape): `seed/discussions/260627172443Z-list-variants-design-decision-log.md`
- Spec-review clarifications decision log (P1 FR-0005 handling; P2 zero-row no-throw): `specs/001/discussions/260627195921Z-spec-review-clarifications-decision-log.md`
- Seed (genesis framing + the five downstream open questions): `seed/seed.md`
- Prior review on this spec (lossless-mapping axis): `specs/001/reviews/260627201652Z-spec-lossless-mapping-review.md`
- Codebase ground-truth consulted read-only to test the spec's "matches existing behavior" claims (repo-relative): `packages/cli/src/install/list.ts`, the existing fixture `packages/cli/test/e2e/cases/list-group-members/expected/stdout.txt`, and `packages/cli/requirements/functional/16-list.yml` (`LIST-FR-0001`–`LIST-FR-0005`).

## Verdict

**Ready.** All eight semantic-contract elements are present and coherent, the spec is internally consistent, and it is consistent with both decision logs — including naming the one settled reversal (genesis "carve-out from FR-0005" → spec-review P1) explicitly rather than applying it silently. No `blocker` or `issue` findings; no `nit` findings clear the downstream-impact bar. The single item worth confirming is a rationale nuance, not a defect — see Open Questions.

## Findings

No `blocker`, `issue`, or `nit` findings. Each of the eight elements was checked against the handoff-grade bar and passes:

- **Intended outcome** — PASS. `## Intended outcome` states exactly what ships: `jastr list --variants` surfaces config-defined variants beneath each runnable template as copy-pasteable `<ref>#<variant-id>` lines, plain `list` unchanged. Grounds the rest of the document.
- **Context** — PASS. `## Context` explains today's folder-first-with-lock-overlay model, that variants live only in `config.yml` and are invisible today, and why the per-root row-driven shape was chosen (forward-compatibility with the future co-location constraint). A reader needs no prior context to understand the motivation.
- **Scope / non-scope** — PASS. `## Scope` and a dedicated `## Non-scope` both present; non-scope explicitly excludes richer line content, a composed/effective command (Option B), variant provenance, any engine change, any change to plain `list`, and the co-location constraint itself. The boundary is closed, not left to interpretation.
- **Expected behavior** — PASS. `## Expected behavior` (B1–B6) covers the happy path, the byte-exact tree rendering (standalone and grouped, with both continuation prefixes), the read-only/exit-0 contract, and the error surface (B6: three reused `invalid_config` messages, exit 1, row-scoped). State changes, return surface, and error surface are all specified.
- **Constraints** — PASS. `## Constraints` binds the implementation: CLI-only / no engine change / no new `JastrErrorCode`, reuse the existing `config.ts` parse and byte-identical messages, keep `LIST-FR-0005` verbatim plus one cross-reference sentence, read-only, no forward-reference scaffolding, determinism, and `--variants` as a real Commander `.option()` alongside `--local`/`--global`.
- **Explicit decisions** — PASS. Every operative behavior is inlined with its governing decision cited (`P1`–`P5` from the genesis log; spec-review `P1`/`P2` for the FR-0005 and zero-row calls). Decisions are resolved in place, not merely referenced.
- **Unresolved questions** — PASS. `## Unresolved questions` states "None block implementation" and names the one forward-looking item (the co-location constraint) as an out-of-scope future thread — a clear fully-closed signal, not silence.
- **Acceptance guidance** — PASS. `## Acceptance criteria` exceeds the bar: pass/fail ACs under `LIST-FR-0006`/`0007`/`0008`, each tethered to a B-behavior and `P#`, plus an explicit B1–B6 → AC coverage map and an explicit, justified statement of which emergent edges are deliberately left un-pinned.

Decision-log consistency: no settled decision is contradicted and no settled point is silently reversed. The genesis log's "carve-out from FR-0005" framing is overturned by spec-review P1, and the spec states that supersession outright in `## Constraints` ("The genesis log's 'carve-out from FR-0005' phrasing is superseded by this clarification"). The deliberately-emergent orphan/`missing`-row/zero-row behaviors match the genesis P1 guard rail and spec-review P2.

## Open Questions

- **Is the zero-row-no-throw behavior's stated rationale the right one — and does it warrant a regression test after all?** B6 and the `Degrees of freedom` "Config read timing" bullet justify leaving the zero-row-root + malformed-config no-throw outcome un-pinned by an AC on the grounds that "its fixture would resemble the orphan/empty case the P1 guard rail leaves emergent." This faithfully reflects spec-review P2's decision, so it is not a defect. But the justification leans on the guard rail, whose actual purpose (genesis P1) is to avoid enshrining behavior that *changes when co-location lands*. Unlike the orphan/`missing` edges, a zero-row root with a broken `config.yml` is **not** destabilized by co-location (co-location governs where variants may be authored, not whether a unit-less root's config is parsed), so a "broken config + no units → `No templates installed.`, exit 0" e2e case appears safe to pin without violating the guard rail. Worth confirming with the author: is leaving this path with no automated coverage intended, or would a co-location-safe regression case be welcome? This is an author/planning call, not a blocker.

## Next Actions

- **Proceed toward approval / planning on the handoff-grade axis.** The spec is actionable by a downstream implementer as written; combined with the prior lossless-mapping review (clean pass), it is ready to be approved.
- **Settle the one Open Question** (zero-row no-throw coverage) with a one-line confirmation — either accept "left emergent" as-is, or add a single co-location-safe e2e case during planning/implementation. Either way, no spec-body change is forced; an accept-as-is disposes this review directly in its frontmatter.
- **Optional adversarial pass on the forward-compatibility claim.** This standard review did not pressure-test the spec adversarially. The one genuinely non-trivial risk surface is the central bet that the row-driven, present-runnable-ref model needs *zero* rework when the co-location constraint lands. If that bet is high-stakes for the owner, run a separate adversarial/pre-mortem pass focused narrowly on "what authoring or rendering shape would force a `list --variants` change once co-location ships?" Otherwise this is skippable for a contained, CLI-only, no-engine-change feature.
