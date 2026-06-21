# Generated Skill Command Inline Flags — Decision Log

Deciding whether (and how) the generated Agent Skill wrapper should carry the
template's input flags directly inside the `jastr run …` command block, rather
than leaving the command bare and relying on the `## Inputs` section plus
construct-flags prose — reopening P4 of the show-inputs spec
(`docs/threads/260531211938Z-generated-router-skill-show-inputs/discussions/260620172031Z-show-inputs-spec-design-decision-log.md`).

## P1: Do flags go into the command block at all?

Point: The gating decision — should the generated wrapper's `jastr run …` line carry the input flags (so the command reads as a fillable template), instead of staying bare with the flags only described in the `## Inputs` section?

What you need to know: This backlog item reopens P4 of the just-finished show-inputs spec, which considered exactly this — a "placeholder usage skeleton" like `jastr run demo --language=<...>` — and deliberately deferred it. The recorded rationale (`…/260620172031Z-show-inputs-spec-design-decision-log.md` P4): YAGNI — the placeholder skeleton is machinery to build only if agents are observed to make flag mistakes frequently, which the user doubts will happen given the `## Inputs` list already carries name/type/required/optional/default/description. The upgrade path from B to A is clean: it is a pure generator change with no schema or contract impact, so deferring A costs nothing.

Two things are already true and work in the change's favor: (a) P4 pre-authorized revisiting this, and (b) it's a pure generator change — no engine/schema/contract impact. The branch work isn't merged, but a new thread supersedes P4 by prose, same as every other thread here.

The motivation in the backlog is aesthetic/trust: `jastr run demo` with a required `--language` and nothing else "feels odd," especially when it's the sole required input. That's a real concern — a generated artifact that looks incomplete erodes confidence and (weakly) invites the agent to run it verbatim and trip validation. But it is not the trigger P4 named (observed agent flag-errors); we'd be revisiting on aesthetics, not measured failures.

The one substantive risk this introduces — and the reason "bare + prose" is genuinely safer today — is the placeholder-substitution problem. Once the command is `jastr run demo --language=<typescript|python>`, something has to fill that `<...>`. If the agent forgets to substitute: an enum placeholder (`--language=<typescript|python>`) fails validation loudly → safe-ish; a free string placeholder (`--name=<value>`) passes validation silently with the literal garbage `<value>` → a real correctness regression vs. today, where there's nothing to forget. That risk is manageable (it's the subject of later points: which inputs to inline, and what literal placeholder to use), but it's the price of admission, so it belongs in this decision.

Choice: A — Proceed: put flags in the command block, then settle scope + placeholder format in following points.

Rationale: The aesthetic/trust concern is legitimate and P4 explicitly invited this revisit; the cost is a pure generator change with a clean upgrade path. The value of the change hinges on getting the scope (P2) and placeholder format (P3) right — that is where the silent-string-failure risk lives or dies — not on P1 itself. The half-measure (a non-runnable example comment) was rejected as adding ambiguity without committing.

## P2: Which inputs get inlined, and do we special-case single-input templates?

Point: The backlog said "include the parameters directly in the CLI command — both required and optional." What inputs actually belong inside the `jastr run …` line, and does the wrapper's structure vary by input count? The user proposed a cardinality-driven design: 1 input → tailored instruction focused on that input, no `## Inputs` section, flag in the command (`jastr run x --flag=<value>` if required, `jastr run x [--flag=<value>]` if optional); 2+ inputs → all-optional behaves as today, all-required shows all flags, mixed shows only the required flags inline plus explicit prose that optionals can be added, with the `## Inputs` section split into "Required" and "Optional".

What you need to know: Two structural facts reshaped the proposal. (1) The 2+ trichotomy is not three rules but one: "inline the required inputs; if there are none, the command is bare" — which covers all-required (inline all), all-optional (inline none → bare), mixed (inline the required ones), and zero-input (bare). (2) That leaves three genuinely-new asks beyond P2-A's required-inlining: the singleton special-case (tailored prose + no section for exactly one input); brackets for a lone optional (`[--flag=<value>]`), which are usage notation the agent must strip, not a runnable command, and which only ever appear in the single-optional case since 2+ optionals are never inlined; and splitting `## Inputs` into Required/Optional subsections, which was judged YAGNI (each bullet already says required/optional; splitting adds a rendering shape, pinned bytes, and e2e cases for marginal scannability).

Cost ledger: today there are 2 body shapes (Shape 1 / Shape 2). The full proposal is ~6 shapes; each needs pinned-verbatim strings for `--check`, functional requirements, e2e cases, and BEHAVIOR.md entries. The singleton path additionally needs the first parameterized pinned prose (today's sentences are fully static) and makes structure non-monotonic (adding a second input flips a template from "tailored, no section, optional-inlined-bracketed" to "section-based, optional-not-inlined").

The choice narrowed to: B — uniform required-inlining for every cardinality, `## Inputs` always shown as a flat annotated list when ≥1 input, no singleton path, no brackets (optionals never inlined); vs. C — B for 2+ inputs, but a dedicated single-input path that drops the `## Inputs` section and folds the lone input into a tailored sentence (with the lone optional shown bracketed). B and C are identical for 2+ inputs and differ only in the exactly-one-input case. Concrete renders of both shapes for the single-input case (required and optional) were shown.

Choice: C — uniform required-inlining for 2+ inputs (one flat `## Inputs` section, no Required/Optional split), plus a dedicated single-input path that drops the `## Inputs` section and tailors the instruction prose to that one input.

Rationale: The user judged a one-item `## Inputs` section plus the plural "the inputs above" sentence to read as boilerplate for the most common simple template, and accepted the extra single-input code path (parameterized pinned prose, non-monotonic structure) to get tailored output for it. Recommended B for simplicity (it already fixes the original "bare command" complaint and keeps every wrapper structurally identical), but the user values the singleton polish and chose C. The Required/Optional section split was dropped in all options and is not part of C. Open and carried to P3: how the command renders a lone optional under C (bracketed `[--flag=<value>]` vs. bare-inline `--flag=<value>` vs. not inlined at all), since "I like C more" did not by itself resolve the bracket sub-question.

## P3: What literal goes after `--flag=` in the command, across input types?

Point: Now that flags appear in the command block, each inlined flag needs a concrete placeholder — `--flag=<...>`. What's the rule across the three input types (string / enum / boolean)?

What you need to know: This is where P1's "price of admission" (the silent-substitution risk) gets priced. The flag grammar (`packages/cli/src/flags.ts`): strings/enums are `--name=value` (empty rejected); booleans are bare `--name` (= true) or `--name=true|false`. If the agent fails to replace the placeholder, jastr sees the literal placeholder as the value: enum → not a declared value → fails loudly (safe); boolean → not `true`/`false` → fails loudly (safe); string → accepts any non-empty value → accepted silently as garbage (dangerous, and inherent — no placeholder choice or engine check can catch it because "accept any string" is the type's definition; mitigation is the obvious `<...>` placeholder + substitution instruction, which LLMs follow reliably, so residual risk is low). This was accepted in P1 and is recorded here, not re-decided.

Two useful facts: (1) P4's boolean lossiness disappears for free — rendering booleans as `--flag=<value>` (with the `=`) lets the agent fill `true`/`false` explicitly rather than the bare `[--dry-run]` form that could only mean true. (2) Type info is already shown elsewhere — enum values appear in the `## Inputs` bullet (2+ case) and in the tailored prose (singleton case), so echoing them inside the command is redundant. Also noted: with placeholders the command block stops being copy-paste-runnable and becomes a fill-in template for the agent (inherent to the feature).

The options were A — uniform `--flag=<value>` for every type (including booleans), vs. B — type-aware placeholders (string→`<value>`, enum→`<dev|prod>`, boolean→`<true|false>`).

Choice: A — uniform `--flag=<value>` for every inlined input regardless of type.

Rationale: KISS — the `## Inputs` bullet and the tailored singleton prose already carry type/enum/default detail, so the command need not repeat it; the `=<value>` form fixes the boolean lossiness for free; and the only genuinely unsafe case (string) is inherent and identical under either option, so B's extra self-description buys little.

## P4: How does a lone optional input render in the command (under C)?

Point: The bracket sub-question carried from P2. Under C, a single required input is settled (`jastr run demo --language=<value>`), but a single optional input is the one spot where "show it in the command" collides with "it's optional." How should its command block read?

What you need to know: Everywhere else in the design, optionals are never put in the command block — the 2+ rule inlines required inputs only and leaves optionals to the `## Inputs` section. So whatever is picked here is the single exception to that. Reframing the original instinct: for an optional input, `jastr run demo` is not an incomplete command — it's the minimal valid, runnable invocation (the default kicks in). The "feels incomplete" problem is real for required inputs (the command won't run) but not for an optional, where the flag is an add-on, not a missing piece.

Options were A — bracketed `jastr run demo [--language=<value>]` (the user's original proposal), which introduces bracket notation for this one sub-case only (`[`/`]` aren't runnable; the agent must strip them; it is the sole non-runnable-as-shown construct anywhere in the output); B — bare-inline `--language=<value>`, rejected because it reads as required and pressures the agent to always pass a value, overriding the author default; C — not in the command, named in the tailored prose (command stays `jastr run demo`; prose says "run for the default, or add `--language=<value>` if the request calls for it").

Choice: C — the lone optional is not inlined; the command stays `jastr run demo` and the optional flag is surfaced in the tailored prose. No bracket notation anywhere in the design.

Rationale: C keeps the command block honest and runnable, surfaces the flag in prose where optionality reads cleanly, and — the deciding factor — keeps brackets out of the entire design. This reverses the user's original bracket proposal, justified by the reframe that the "incomplete command" worry does not apply to optionals the way it does to required inputs; the user agreed.

## P5: The exact pinned prose strings

Point: Because `--check` byte-compares, every word of the instruction prose is part of the contract. We need exact strings for (a) the singleton-required sentence, (b) the singleton-optional sentence, and (c) whether the existing 2+ sentence stays verbatim.

What you need to know: The frontmatter block and the trailing `If the command exits non-zero, report the exact error output to the user and stop.` line are unchanged in every shape; only the instruction sentence(s) and the bash block vary. The singleton sentences reuse the same per-input formatter as the 2+ bullet — `({type-token}{default-seg}) — {description}` — but without the `required`/`optional` token (the sentence phrasing carries that) and with the `— {description}` segment dropped when no description is declared (one formatter feeds both bullet and singleton sentence, DRY).

Approved exact strings:

- Singleton required: `This skill takes one input, `--language` (enum: typescript|python) — target language. Fill in `--language=<value>` from the user's request. Then run this command and follow its output exactly:` — command `jastr run demo --language=<value>`. With no description the `— target language` segment drops.
- Singleton optional: `This skill takes one optional input, `--language` (enum: typescript|python, default: typescript) — target language. Add `--language=<value>` if the user's request calls for it; otherwise leave it out. Then run this command and follow its output exactly:` — command stays bare `jastr run demo` (per P4). For an optional without a default the `, default: …` segment drops; "otherwise leave it out" works whether the result is the author default or absence.
- 2+ sentence: kept verbatim — `Map the user's request to the inputs above and append them as `--flag=value` arguments, including every required input. Then run this command and follow its output exactly:`.

All three share the closing clause "Then run this command and follow its output exactly:" so the shapes read consistently.

Choice: Approved as proposed — the two singleton strings above, and the 2+ sentence kept verbatim.

Rationale: The singleton strings give the tailored single-input output C calls for while reusing the bullet formatter. Keeping the 2+ sentence verbatim preserves an all-optional 2+ wrapper as byte-identical to today (a free regression anchor) and already implies optionals are addable ("append them … including every required input") alongside the required/optional-labeled `## Inputs` list; the explicit-optionals rewording (the user's earlier mixed-case wish) was judged not worth losing that anchor for a marginal wording gain. User approved.

## P6: For a variant ref, what counts as the "input count" that picks the shape?

Point: The B/C structure keys off how many inputs there are: 0 → bare/no-section, 1 → singleton tailored path, 2+ → `## Inputs` section. For a variant ref (`<ref>#<variant>`), locked inputs are invisible (per the show-inputs spec). So which count drives the shape — declared inputs, or unlocked inputs?

What you need to know: The show-inputs spec already establishes that a variant wrapper lists only unlocked inputs; locked inputs appear nowhere. So the agent's controllable surface for a variant is exactly its unlocked inputs, making "unlocked count" the natural basis. Consequence: a template with four inputs whose variant locks three leaves one unlocked → that variant renders the singleton path ("This skill takes one input, `--region` …"), which is accurate from the agent's perspective even though the underlying template has four inputs. Option A keys the shape off the unlocked (rendered) count; option B restricts the singleton tailored path to non-variant refs and keeps variants on the `## Inputs` section path for any ≥1 unlocked input, which would render an identical single-input contract differently depending on whether it came from a bare template or a one-unlocked-input variant.

Choice: A — the shape (no-input / singleton / 2+) is chosen by the rendered input count: all declared inputs for non-variant refs, the unlocked inputs for variant refs. A one-unlocked-input variant uses the singleton path.

Rationale: Locked inputs are an invisible curation layer (show-inputs P5); the wrapper should reflect the agent's actual surface, so a one-unlocked-input variant is genuinely a single-input skill from where the agent sits. B's "technically has more inputs" objection does not hold because those inputs are deliberately hidden, and B introduces an inconsistency between identical single-input contracts.

## P7: How do we package this — spec form, sequencing, and deliverables?

Point: Turning these decisions into a handoff. Three things: the spec form/supersession, how this sequences against the unmerged show-inputs work, and the deliverable list.

What you need to know: Spec form (conventional): per the repo's append-only pattern, this thread gets a new v1 spec that supersedes by prose the relevant rules of the show-inputs v2 spec (`docs/threads/260531211938Z-generated-router-skill-show-inputs/specs/260620203922Z-v2-spec.md`) without editing it — specifically Shape 2's "command is always bare `jastr run <ref>`" rule (required inputs are now inlined as `--flag=<value>`), the "two body shapes" model (now four: no-input, singleton-required, singleton-optional, 2+), and it formally closes that spec's deferred P4 (the placeholder skeleton) by adopting required-inlining + the singleton path; then AGENTS.md gets this spec linked and its stale "always bare" / "two shapes" claims rewritten. This is a pure CLI-generator change — the engine is untouched (`description`/`required`/`default`/`type`/unlocked-input list all already exist), no new error codes, consistent with P1.

Deliverables: `packages/cli/src/targets/agent-skill.ts` (four body shapes; inline required flags as `--flag=<value>`; a shared per-input formatter feeding both the 2+ bullet and the singleton sentence; the pinned strings from P5); `packages/cli/src/commands.ts` / `variants.ts` (pass the generator the rendered/unlocked-for-variants input list partitioned into required/optional; pick the shape by rendered count per P6); tests + functional requirements + e2e cases covering singleton-required, singleton-optional (with/without default, with/without description), 2+ all-required, 2+ mixed, one-unlocked-input variant → singleton, and `$ARGUMENTS`-already-gone; regenerate BEHAVIOR.md; reconcile README.md and AGENTS.md. Regression anchors that must stay byte-identical: no-input templates and fully-locked variants (Shape 1) and all-optional 2+ wrappers (bare command + verbatim 2+ sentence, per P5); everything with ≥1 required input churns and every single-input wrapper changes to the singleton shape — regenerate, don't hand-edit.

Sequencing: the show-inputs feature this revises lives on the current unmerged branch (`feat/generated-router-skill-show-inputs`). Option A — land show-inputs first, then do this off `main` (cleanest history). Option B — create a new branch starting from the current show-inputs branch, accepting the dependency.

Choice: B for sequencing — create a new branch starting from the current branch; the user will handle branching later. Spec form and deliverables approved as listed.

Rationale: The user is fine taking on the branch dependency and will manage it. Recommended A for cleaner history, but B is acceptable and avoids blocking on the show-inputs merge; the user accepted the trade-off.
