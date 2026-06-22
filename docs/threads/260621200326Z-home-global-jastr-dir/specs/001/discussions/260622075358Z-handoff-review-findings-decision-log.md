# Decision log — home-global spec handoff review findings (specs/001/spec.md)

Thread: docs/threads/260621200326Z-home-global-jastr-dir/
Target: specs/001/spec.md
Subject: disposing the findings raised in the handoff + decision-log-consistency review of the home-global `.jastr` spec (specs/001/reviews/260622071807Z-home-global-spec-handoff-review.md).

## P1: Finding 1 — Lookup "hit" undefined for a partial/malformed local entry

Point: AC-2.4 says lookup "consults local before global and the first hit wins," but the spec never defines what counts as a *hit* when a local entry is **present but unresolvable** — a `.jastr/<id>/` directory with no `TEMPLATE.md`, or a grouped directory missing its `.jastrgroup` marker. Does that block fall-through (error), or count as "no hit" so a valid global template of the same ref resolves?

What you need to know: The current single-root resolver (`packages/cli/src/templates/template-ref.ts`) already has a clean predicate hiding in it:

- Standalone (`loadStandaloneNamedTemplate`, `:146–166`): the hit test is `isFile(<root>/.jastr/<id>/TEMPLATE.md)`. A directory with no `TEMPLATE.md` already returns false → today it throws `template_not_found`.
- Grouped (`loadGroupedNamedTemplate`, `:182–206`): the hit test is `isFile(markerPath) && isFile(declaredPath)` — marker **and** `TEMPLATE.md`. A group dir missing its marker already returns false → `template_not_found` today.

So the "malformed local entry" cases the review names are, in today's code, **already structural misses** — they are just not hits under the existing file-existence predicate. What single-root code lacks is any *fall-through*: a miss has only one outcome, `template_not_found`. The two-root model is what newly forces the question, because now a local miss *could* fall through to global.

There is a second, distinct sub-case the review folds in via "(`template_not_found` / a parse error)": a local `TEMPLATE.md` that **exists but is defective** — malformed frontmatter, schema-invalid, broken directive. Here `isFile` returns true; resolution commits to local; the engine surfaces a parse/schema error. That is a different animal from a structural miss.

Decision log P1 frames shadowing as a "template-id/group **collision**," which presupposes two resolvable templates — so it neither settles nor contradicts this; an added sentence *elaborates* P1 rather than reversing it.

Decision: Define the hit predicate as the existing structural existence check and state the fall-through rule explicitly in the spec:

- A local **hit** is the existing existence check — standalone: `<root>/.jastr/<id>/TEMPLATE.md` exists; grouped: both the `<group>/.jastrgroup` marker and `<group>/templates/<id>/TEMPLATE.md` exist.
- A local **structural miss** (directory present but `TEMPLATE.md` absent, or grouped marker absent) is **"no hit"** → resolution falls through to the global root. `run` and `generate` perform this fall-through **silently** (no warning on the success path).
- Once a local **hit** is found, resolution **commits to local**: a defect in the resolved template's *content* (parse/schema/render error) surfaces as today's error and does **not** fall through to global.

The diagnostic surfacing of the partial-local-footprint case (so an author is not silently bypassed) is **not** decided here: it was split into its own decision point (validate redesign — partial-footprint note, `--local`/`--global` scope flags + default, refless whole-`.jastr` scan, and a CI exit-1 flag) because it is a multi-point feature design entangled with `validate`'s contract and orthogonal to the hit predicate.

Rationale: The hit predicate is a faithful description of what the existing existence check already does, so it adds no new behavior or error code — only a one-paragraph spec elaboration of P1. Structural-miss → fall-through is least-astonishing (a half-built local scaffold should not turn a working global template into a `template_not_found`). Hit-then-defective → error is the fail-loud choice consistent with P3's stance on `unknown_input`: once the local file exists the namespace is claimed, and silently resolving a *different* (global) template would mask the defect. Trade-off accepted by the owner: with `run`/`generate` silent, the "edited a local copy, it is broken, ran it, silently got the global output" deception is **not** caught at run time — it is only discoverable by explicitly validating that ref. The owner accepted this in exchange for a clean hot path (in particular keeping `run`'s stdout — the rendered Markdown an agent consumes — free of warnings).

## P2: Finding 2 — Path display for *included files* within a global template is unspecified

Point: FR-8/AC-8.1 pins absolute (realpath) display for a globally-resolved **template's** path, and its catch-all is scoped to "any other present-day **template-path** output." An *included* file's path is a different file's path, so the catch-all doesn't reach it. How should an included file's displayed path render when the template was resolved from the global root?

What you need to know: The mechanism is one line. `createFileIncludeResolver` returns each included file's identifier as `id: path.relative(template.cwd, resolved)` (`includes.ts:26`) — always cwd-relative. That `id` is the engine-facing handle for the included file: it's reused as the `from` for nested includes (`sourceIdToAbsolutePath`, `includes.ts:65–67,105–107`) and it's what surfaces in every engine error *about that included file* (missing nested include, cycle, a directive/interpolation error inside the partial).

For a **local** template that's fine — the include resolves under the local root, near cwd, so a short relative path is honest. For a **global** template, includes resolve under the *global* root (FR-7), which sits outside cwd — so the `id` renders as a fragile, depth-dependent `../../../.jastr/<group>/.../partial.md`, and the number of `../` grows with how deep cwd is. That is exactly the dishonest, depth-leaking display P4 set out to kill for the template path, reintroduced one level down. The spec's Includes section (FR-7) covers per-root *containment* but says nothing about *display*, and FR-8's catch-all explicitly doesn't reach it, so an implementer has to invent a policy.

Worked example presented to the owner: with template `report`, run from `/Users/jacopo/projectX` against local `/Users/jacopo/projectX/.jastr/report/TEMPLATE.md`, the included `partials/footer.md` prints as `.jastr/report/partials/footer.md` (short, stable). Run the *globally* installed `report` from `/Users/jacopo/clients/acme/backend` (resolves from `/Users/jacopo/.jastr/report/TEMPLATE.md`), and the same partial prints as `../../../.jastr/report/partials/footer.md` — longer the deeper cwd is. P4 already fixed this for the template's own path (clean absolute `/Users/jacopo/.jastr/report/TEMPLATE.md`); Finding 2 is that the fix stopped at the template file and forgot the partials it includes.

Two compatibility checks confirmed before pinning: (1) nested resolution still works if global `id`s become absolute — `sourceIdToAbsolutePath` passes absolute paths through unchanged; (2) tests stay deterministic — included files under the global root share the global-root prefix, so the existing FR-11 global-root substitute token already covers them and no new token is needed.

Decision: State the path-display rule **by resolved root**, covering the template's own path *and* the paths of the files it includes (not by enumerating individual sinks). For a globally-resolved template, both the template's own path and every included file's displayed path (`id`) render as real absolute (realpath-resolved) paths; for a locally-resolved template, both render cwd-relative, unchanged. Concretely: a sentence in the Expected-behavior "Path display" bullet plus a new AC-8.3 ("An included file's path within a globally-resolved template renders as its real absolute path; within a locally-resolved template, cwd-relative — P4 extended"). CLI-side only (`includes.ts:26` chooses the `id`); no engine change.

Rationale: Absolute is the only choice consistent with P4 — an included file of a global template lives "over there" under the global root just like the template itself, so a depth-independent absolute path is the honest display and matches FR-8's existing rule for the template path. Leaving it relative would reintroduce the depth-leaking `../../../…` path P4 set out to eliminate, one level down. Framing the rule by *resolved root* rather than by sink-list makes it self-extending: any future path output for a global template inherits "absolute," so the gap does not reopen the next time a new path surfaces. No engine change is required, and the existing FR-11 token keeps e2e output machine-independent.

## P3: Finding 3 — Path-display sink enumeration undercounts the render `sourceId` sites

Point: AC-8.1 and the Expected-behavior prose name "**the** render `sourceId`" (singular) plus "the `generate` success message," but there are three render-`sourceId` construction sites, not one. The catch-all ("any other present-day template-path output") keeps the spec correct, so this is soft (graded `nit`) — the question is whether to enumerate the sites or let the catch-all carry them.

What you need to know: All three commands build the `sourceId` the same way, `path.relative(template.cwd, template.templatePath)` — `executeRun` (`commands.ts:93`), `executeGenerate`'s static render (`commands.ts:154`), and `executeValidate`'s static render (`commands.ts:214`) — plus the `generate` success message (`commands.ts:186`, which uses `path.relative` twice, for the output path and the template path). The decision log's P4 situational note ("commands.ts:93,186") undercounts identically, naming only the `run` site and the success message.

Because AC-8.1 ends with "and any other present-day template-path output," the spec is not wrong — the two unnamed sites (`:154`, `:214`) are swept up by the catch-all. The risk is purely that an implementer reads "the render `sourceId`" as the single `run` site, implements that plus the success message, and stops — leaving global templates rendering cwd-relative `../../../…` in the `generate` and `validate` static-render error surfaces. After P2, the rule is already root-scoped-and-total (it subsumes every sink), so enumerating the sites is no longer load-bearing for correctness — it is purely implementer-guidance polish.

Decision: Accept the fix in **named-sites** form. Tighten AC-8.1 to enumerate the render-`sourceId` sites by name — the `sourceId` in `run`, `generate`, and `validate`, plus the `generate` success message — and keep the catch-all as the safety net. Do **not** hardcode `file.ts:line` numbers in the spec; the precise lines (`commands.ts:93/154/186/214`) belong in the implementation/PR, not the AC.

Rationale: Naming the sites captures the reviewer's intent (don't let the reader stop at the single `run` site and leave `generate`/`validate` rendering depth-leaking paths) at zero cost. Named sites rather than line numbers because line numbers rot the moment anyone edits `commands.ts`, and a spec citing stale lines is worse than one that doesn't — names are stable, numbers are not. This is optional polish given P2 already made the rule total, but it is a free clarity win, so it is taken.
