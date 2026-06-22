---
status:
  disposed: 260622115850Z
  disposition: accepted
  rationale: specs/001/discussions/260622075358Z-handoff-review-findings-decision-log.md
---

# Review — handoff-grade + decision-log consistency: home-global `.jastr` spec

## References

- Spec under review: `specs/001/spec.md`
- Genesis decision log (consistency check; P1 = lookup/shadowing, P4 = path display): `seed/discussions/260621201338Z-home-global-jastr-coexistence-decision-log.md`
- Upstream seed (intended outcome / scope origin): `seed/260621200326Z-home-global-jastr-dir-seed.md`
- Prior review on this spec (lossless-mapping, disposed `accepted`): `specs/001/reviews/260622070734Z-spec-lossless-mapping-review.md`
- Lifecycle ledger (tier 2): `ledger.md`
- Existing CLI contract the spec relies on, checked against the spec's display/lookup claims (repo-relative — codebase, not thread artifacts): `packages/cli/src/commands.ts` (template-path render/message sites :93, :154, :186, :214; wrapper ref string :160, :175), `packages/cli/src/templates/includes.ts` (included-file `id` rendered cwd-relative :26)

## Verdict

**Partially ready.** All eight semantic-contract elements are present and coherent, and the spec is consistent with the decision log — no settled decision (P1–P4) is contradicted or silently reversed. Three expected-behavior edges should be pinned before implementation because each produces divergent observable behavior. Highest-impact: the lookup rule "first hit wins" does not define what counts as a *hit* when a local entry is present but unresolvable, so an implementer must guess between erroring and falling through to a valid global template (Finding 1).

## Findings

### Finding 1 — Lookup "hit" is undefined for a partial/malformed local entry shadowing a valid global template `issue`

- **Element:** Expected behavior (#4) — the layered-resolution / shadowing rule.
- **What is wrong:** Partial coverage. AC-2.4 says lookup "consults local before global and the first hit wins," and the grouped *hit* is precisely defined (full `<group>/templates/<id>/TEMPLATE.md` layout + `.jastrgroup` marker). But the spec never defines what a *hit* is for the in-between case the two-root model newly introduces: a local entry that is **present but unresolvable** — e.g. a `.jastr/<id>/` directory with no `TEMPLATE.md`, or a grouped directory whose marker is missing. Decision log P1 frames shadowing as a "template-id/group **collision**," which presupposes two resolvable templates and so does not settle this either. AC-2.3's "behavior unchanged from today" describes the local path *in isolation* and does not address whether, given a global fallback now exists, a local miss/defect should fall through.
- **Why it matters:** Two implementers diverge with different *observable* behavior: one treats the malformed local entry as a claimed namespace and errors (`template_not_found` / a parse error); the other treats it as "no hit" and resolves the valid global template successfully. Whether a command errors or renders is exactly the contract a downstream executor cannot guess at.

### Finding 2 — Path display for *included files* within a global template is unspecified `issue`

- **Element:** Expected behavior (#4) — path display; boundary with the Includes section.
- **What is wrong:** Silent gap. FR-8/AC-8.1 pins absolute (realpath) display for "a globally-resolved **template's** path," and its catch-all is scoped to "any other present-day **template-path** output." An *included* file's path is a different file's path, so the catch-all does not reach it. The CLI renders every included file's `id` cwd-relative (`includes.ts:26`, `id: path.relative(template.cwd, resolved)`), and that `id` is what surfaces in render/include error messaging. The spec's Includes section (FR-7) covers containment per root but says nothing about how an included file's path is *displayed* for a globally-resolved template.
- **Why it matters:** A global template that hits an include error (missing nested include, cycle, or a path issue surfaced via the `id`) would report the included file as a fragile depth-dependent `../../../.jastr/<group>/.../partial.md` — the exact dishonest, depth-leaking display P4 set out to eliminate for the template path, reintroduced one level down. The implementer must invent a policy (absolute for global, matching the template-path rule, vs. left cwd-relative) with no guidance.

### Finding 3 — The path-display sink enumeration undercounts the render `sourceId` sites `nit`

- **Element:** Expected behavior (#4) / Acceptance (#8) — FR-8.
- **What is wrong:** False precision. AC-8.1 and the Expected-behavior prose name "**the** render `sourceId`" (singular) plus "the `generate` success message." There are in fact three render-`sourceId` construction sites — `executeRun` (commands.ts:93), `executeGenerate`'s static render (:154), and `executeValidate`'s static render (:214) — plus the `generate` success message (:186). The decision log's situational note (P4, "commands.ts:93,186") undercounts identically. AC-8.1's "and any other present-day template-path output" catch-all keeps the spec *correct*, so this is soft rather than wrong.
- **Why it matters:** An implementer reading "the render sourceId" as the single `run` site, and stopping at the two named examples, would leave global templates rendering cwd-relative `../../../...` in the `generate` and `validate` static-render error surfaces (:154, :214). The fix is cheap — enumerate the sites — and removes reliance on the reader noticing the catch-all.

## Evidence

- Finding 1: spec §"Expected behavior" → "Resolving a template reference" and AC-2.4 ("the first hit wins"); grouped hit defined in the same subsection; decision log P1 ("local shadows global on a template-id/group **collision**"). The unresolvable-local case appears in neither.
- Finding 2: spec §"Expected behavior" → FR-8/AC-8.1 ("a globally-resolved **template's** path … and any other present-day **template-path** output") vs. §"Includes"/FR-7 (containment only); code `packages/cli/src/templates/includes.ts:26`.
- Finding 3: spec FR-8/AC-8.1 ("the render `sourceId`, the `generate` success message") and decision log P4 ("commands.ts:93,186"); code `packages/cli/src/commands.ts:93, 154, 186, 214`.

## Next Actions

- **Finding 1:** Add one sentence to the "Resolving a template reference" subsection (or FR-2) defining the hit predicate for an unresolvable local entry — i.e. whether a present-but-defective local `<id>` blocks fall-through (errors) or is treated as "no hit" and resolves the global template. If the answer isn't obvious to the author, open a short discussion to settle it before implementation.
- **Finding 2:** Extend FR-8 (or the Includes section) to state how an included file's path renders for a globally-resolved template; the consistent choice is absolute, matching the template-path rule, but the spec must say so.
- **Finding 3:** Optionally tighten AC-8.1 to name all three render-`sourceId` sites (`run`/`generate`/`validate`) alongside the `generate` success message, so the implementer enumerates commands.ts:93/154/186/214 rather than relying on the catch-all.
- **Adversarial pass:** This was the standard handoff + decision-log-consistency review only; no adversarial pre-mortem was run. Given this is a private, single-owner tool and a contained CLI-only change, an adversarial pass is available if wanted but is not warranted by the stakes.
