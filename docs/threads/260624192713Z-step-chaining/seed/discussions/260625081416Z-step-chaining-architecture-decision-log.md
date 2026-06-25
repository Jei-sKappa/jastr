# Decision log — step-chaining seed (the seed)

Thread: docs/threads/260624192713Z-step-chaining/
Target: the seed (seed/260624192713Z-step-chaining-seed.md)
Subject: shaping the "steps" concept — what jastr learns to do so an author can split a long instruction into one-step-at-a-time renders, with human-in-the-loop branching and cross-template composition, without turning jastr into an executor.

## P1: Stepping primitive architecture

Point: decide the core shape of the feature before any spec — what jastr learns to do.

What you need to know: jastr is a stateless pure renderer today; includes splice *fragments* into the parent schema (they can't run an independent input-bearing template). The author's drivers are context economy on big files (existing 10K-line skills), avoiding premature-execution bias (an agent that sees the next phase starts acting on it early), and avoiding mid-conversation forgetting (a full step list dumped in an early message is lost later). Interpolation already exists, so a rendered step can carry input-forwarded `jastr run` commands. The options weighed:

- A — Stepping spine + reference composition. Slice a single file into ordered steps; render one at a time with a next-pointer footer. Cross-template composition is done by referencing `jastr run X` (with interpolated inputs) inside a step. No new inline primitive. Subsumes B's composition.
- B — Whole-template sequencing only. No single-file slicing; a router template paced one child at a time. Forces shattering existing single-file skills into N files.
- C — A plus a true inline "render foreign template with its inputs" primitive. Most powerful, most machinery, and the inline part fights the context goal.

Decision: A. jastr gains a single-file stepping spine — an author marks step boundaries in one TEMPLATE; `jastr run T` (with a `--step=` selector) renders only the current step plus a footer pointing at the next step. jastr stays stateless: it derives "what's next" from the file's markers and emits the pointer, and the agent carries the pointer by running the next command. Cross-template composition is reference-only (`jastr run X` inside a step, with optional interpolated input-forwarding), never inline. Physical organization across files uses the existing `include` (fragments). B and C are rejected.

Rationale: A solves all three drivers with the smallest new surface and keeps jastr a stateless pure renderer (no loop, no persisted state, no execution). B is redundant — its only real benefit (splitting content across files) is already available via `include`, and B would force shattering the author's existing coherent 10K-line skills. C (inline) was rejected by the owner directly: inlining a heavy child back into the parent re-bloats the very context the feature exists to shrink, and it forces hard questions (where the child's inputs come from at parent render time, how its includes resolve and against which root, whether frontmatter merges) that the goal does not require answering. Input-forwarding from parent to a referenced command is supported via existing interpolation but is explicitly *not* mandatory.

## P2: Step model — a step is a content region, not a template

Point: decide the step model — is a step an independent template with its own inputs, or a content region of the single template T?

What you need to know: Under A (P1), the stepped template T is one template with one schema. A step is a content region of T — it is not a template and has no input schema of its own. A step can be: pure prose with no inputs (the default, e.g. "Ask the user X."); prose that interpolates T's inputs (`{{found_errors}}`); or prose that carries a `jastr run X` reference (a cross-template jump). A step only "has inputs" in two senses: it uses some of T's inputs, or it points at a child template X whose inputs the agent supplies on the `jastr run X` command.

Decision: A step is a content region of the single template T, not an independent template, and has no input schema of its own. Plain-text / no-input steps are the default and first-class. Steps do not declare their own frontmatter or inputs. The only inputs in play at a step are T's own inputs (the running template's schema) or those of a referenced child template X (supplied by the agent on the `jastr run X` command).

Rationale: This follows directly from P1's single-file slicing — T owns the one schema and steps are slices of its body, so giving steps their own schemas would contradict the model and re-introduce the "steps are mini-templates" complexity the owner moved away from. Keeping a step as plain content makes the common case (a prose instruction like "ask the user") trivial and keeps the engine rendering one schema, as it does today.

## P3: Cross-template jumps are structured, not opaque prose

Point: decide whether a step's pointer to another template is free-text the author writes, or a structured reference jastr understands — which determines whether jastr can surface the child's inputs and validate the jump.

What you need to know: A footer pointer to the next step within T is already structured (jastr knows the step order from the markers, emits `--step=next`). The question is only about cross-template jumps. Showing a child's inputs is a schema read — jastr reads X's frontmatter and renders its input view; it does not render X's body, so P1's no-inline rule still holds. jastr already owns the exact renderer that produces the generated-skill `## Inputs` view, and already analyzes which inputs a region references. The project also has a strong freshness ethos (`validate`, `--check`, the AGENTS.md update-rule) — hand-written duplicates that can drift are off-brand here. Options weighed: A (prose/minimal — author hand-writes the jump and input hints, jastr treats it as opaque text) vs B (structured — a step declares a jump to template X; jastr resolves X, validates it exists, and renders X's input view into the footer).

Decision: B. A cross-template jump is a structured reference jastr understands. When a step renders, jastr resolves the jump target, validates it exists, and renders the target's input view (reusing the generated-skill input renderer — a schema read, never a body render) into the footer so the agent sees which flags it can supply. Note: the agent-discovered value (e.g. `topic`) is normally an input of the *child*, supplied directly by the agent on `jastr run X`; T need not declare or defer it.

Rationale: B is the direct answer to the "show the agent the next step's available inputs" requirement, stays within P1's no-inline rule (schema read, not body render), reuses existing machinery, and — weighted most — lets `jastr validate` catch a broken chain at validation time rather than mid-run. It is the heaviest piece of the feature but cleanly stageable: the stepping spine (P1/P2) can ship first with prose jumps, with structured jumps added as a follow-on. The one caveat accepted by the owner: B starts jastr understanding the chain graph, but it never runs X (still pure rendering), so it does not cross into executor territory.

## P4: Jump directive syntax mirrors `include`

Point: decide the surface syntax for the cross-template jump directive.

What you need to know: the existing include directive is a remark-directive leaf with quoted attributes — `::include{path="fragment.md"}`, `::include{root="file", path="fragment.md"}`, `::include-raw{path="raw.md"}` (`packages/engine/test/render.test.ts:55,62,158`); conditionals are container directives (`:::::if{condition="..."}`). The owner wants the jump to read like the existing include.

Decision: the cross-template jump is a remark-directive leaf directive with quoted attributes in the same family as `::include{...}` — illustratively `::run{template="discussion-phase"}`. The final directive name and attribute set are a spec-level detail, but it is parsed and validated alongside the existing include / include-raw directives rather than via a parallel bespoke syntax.

Rationale: Principle of Least Astonishment and DRY — authors already know the `::name{attr="..."}` shape, and reusing the existing remark-directive scanning avoids inventing a second syntax for the same kind of "pull in another file/template" gesture.

## P5: Validation stance — static catch, no assumed cross-run validity

Point: decide how strongly jastr validates a jump target, and what happens when the chain drifts between validation and execution.

What you need to know: the owner requires that broken jumps be caught *before* the `jastr run X` command is rendered into a footer, but explicitly does not want jastr to assume a once-valid chain stays valid — a template can be removed by the user or agent between validation and execution. jastr is stateless and re-resolves on each render.

Decision: a jump target is checked statically — `jastr validate T` checks the chain ahead of time, and the target is also resolved live at the moment the containing step is rendered, so a missing or invalid target fails that render instead of emitting a pointer to a dead command. jastr does NOT persist or assume cross-invocation validity and adds no special drift-detection: if the target is removed after a successful render but before the agent runs it, the agent's subsequent `jastr run X` fails naturally with the CLI's existing error, which is sufficient signal for the agent.

Rationale: This matches jastr's stateless pure-renderer identity — because every render re-resolves live, there is no stale-validity assumption to defend, so the only real guarantee on offer ("valid at render time") is exactly the one given. Building drift-tracking would be redundant machinery (YAGNI) for a failure the CLI already surfaces clearly. (Deferred to spec: whether `run --step=N` resolves only the current step's jumps while `validate` checks the whole template's chain.)

## P6: Rendering model — a step is a conditional; frame content always renders

Point: define the core mental model — given `jastr run T --step=2`, what actually comes out.

What you need to know: a long skill has two kinds of content — per-phase instructions (relevant at exactly one step) and persistent context the agent needs throughout (ground rules, the artifact under review, "you are doing X"). The stepper must decide what happens to each. jastr already has a model where only the matching branch renders — the conditional. Pure isolation (emit only the selected step, nothing else) maximizes context economy but forces repeating/`include`-ing persistent context into every step. Options weighed: A (a step is a conditional keyed on the selector — jastr emits only the selected step's block, and content outside any step block, the "frame," always emits; author dials persistent-vs-per-phase context by placement); B (pure isolation — only the selected step ever renders, persistent context must be `include`d into each step); C (cumulative steps 1..N — rejected, defeats the purpose).

Decision: A. Rendering `--step=N` emits the frame (all content outside any step block, in document order) plus the selected step's block; all other step blocks are suppressed, exactly as a non-matching conditional branch renders nothing. The author decides how much persistent context rides along purely by where they place it.

Rationale: A subsumes B (pure isolation = an empty frame), reuses the conditional mental model and machinery already shipped, and serves the stated "give authors the flexibility they need" goal. The owner steelmanned B ("the agent runs steps in order, so step 1's common instructions are already in context — no need to repeat them"). Rejected because: (1) that relies on early-context persistence — the very assumption that motivates the whole feature (the forgetting driver); if early context reliably persisted, no stepping would be needed at all. (2) Execution is not guaranteed linear or single-session — branching, cold entry / resume via `--step=N`, and context compaction all break "step 1 is still in context," so steps must be self-contained. (3) B does not actually save context: when shared context is needed, B re-emits it via a per-step `include` (same bytes as A's frame); when it is not needed, A's empty frame equals B. So A can always match or beat B. Accepted guidance (not an engine rule): keep frames lean — durable rules/identity only — and let transient detail live inside steps; a careless author over-stuffing the frame is the one real cost of A.

## P7: Steps are a first-class enumerable directive, reusing conditional rendering

Point: decide how steps are implemented as a construct — raw conditionals keyed on a reserved selector, or a first-class enumerable directive.

What you need to know: the owner proposed treating `--step` as a jastr-native reserved input (authors cannot declare `step`), injected into the condition value-space, so a step block is effectively `:::if{step == "name"}`, reusing `evaluateCondition`. That covers the rendering half (only the selected block emits), but raw conditionals provide no step ordering, no continuation-pointer derivation, no validation that a `--step` value names a real step, and no "step N of M" awareness — independent `:::if` blocks have no sequence, and an unknown `--step` value would silently render just the frame.

Decision: steps are a first-class `:::step{name="..."}` directive — a container in the `if` family — that internally reuses the conditional rendering machinery (it emits when `step == name`, evaluated via the existing condition evaluator against a reserved native `step` selector authors cannot declare as an input), but is also enumerable, so jastr derives step order from document position, validates that a supplied `--step` value names a known step, and generates the continuation footer. The `step` selector is injected by jastr, not a user-declarable input.

Rationale: this keeps the owner's "reuse the conditional machinery" instinct (no second rendering model) while supplying the three things raw conditionals cannot — ordering, selector validation, and footer generation — which are the actual point of the feature. A dedicated directive jastr can enumerate is the minimal addition that yields those. Deferred to spec: exact directive name/attributes, branching (when "next" is not document-order-next), and the Model 1 vs Model 2 input-scoping question.

## P8: Statelessness boundary — jastr carries no data between steps

Point: decide whether jastr passes any state/data between steps, or whether cross-step continuity is entirely the agent's concern.

What you need to know: step N often depends on something discovered at an earlier step ("discuss the findings surfaced in the review"). The owner proposed that authors instruct the agent to persist relevant findings to the filesystem so steps survive a new chat / context compaction, but framed this explicitly as a convention, not something jastr enforces. jastr is stateless by design (P1); the only thing crossing a step boundary is the inputs the agent supplies on each `--step` invocation.

Decision: cross-step continuity is the agent's responsibility, not jastr's. jastr carries no data between steps, never captures or reads a prior step's output, and provides no state-passing or memory mechanism. A step referencing earlier findings is pure authoring (the author writes the prose), and persisting findings to the filesystem to survive a new chat or compaction is an author convention jastr neither provides nor enforces.

Rationale: jastr capturing a step's output and feeding it to the next would be precisely the executor ruled out in P1. Keeping the boundary explicit on the record prevents a future contributor from "helpfully" adding step-to-step state passing that would break the stateless pure-renderer identity. The only sanctioned cross-boundary channel is the inputs the agent supplies per `--step` invocation.

## P9: Model 2 — `run --step=N` requires only the rendered step's inputs

Point: decide the runtime input requirement for a stepped render — does `jastr run T --step=N` require all of T's inputs, or only the selected step's?

What you need to know: scope — this concerns only `jastr run T --step=N`; `jastr validate T` stays whole-template/comprehensive (it is the static check of the whole artifact, so it always sees every step's inputs). Model 1 (today's behavior) demands all of T's required inputs on every step regardless of which renders. Model 2 demands only the required inputs referenced (in a `{{…}}` interpolation or `${…}` condition) by the content that renders — frame + step N. Three factors weighed: (1) P8 coherence — the only channel crossing a step boundary is inputs supplied per `--step` invocation, and staged inputs (step 3 needs a value step 2 produced) are intrinsic to stepping, but Model 1 makes them impossible (it would demand the value at `--step=1` before it exists); (2) least astonishment — Model 1 errors demanding an input that never appears in what is rendered; (3) cost — under Model 2 a template's required-input set varies by step, which ripples into the generated wrapper (resolved by P12).

Decision: Model 2. `jastr run T --step=N` requires exactly the required inputs referenced by the rendered content (frame + step N). Required inputs referenced only by other steps are not demanded; optional inputs are never demanded. Nested conditionals inside a step use static scoping: any required input referenced anywhere in step N (all nested branches, plus the condition expressions themselves) is demanded regardless of which branch is taken — matching how jastr validates conditionals today, scoped to the rendered step. Mechanically this is "drop the non-selected step blocks, then validate/render as today," with one new engine behavior: input-presence validation becomes reference-aware (a required input is demanded only if referenced in the retained content). `jastr validate T` remains whole-template.

Rationale: staged inputs are the natural shape of stepping, and only Model 2 makes the P8 per-invocation channel usable for them; Model 1 quietly half-defeats the feature and is astonishing (asks for inputs absent from the output). Static (not dynamic) nested scoping is chosen for predictability — dynamic scoping would make the required set depend on other inputs' values. The variable-required-set cost is confined to generation and resolved cleanly by P12, where it actually inverts into further evidence for Model 2. The owner steelmanned Model 1's simplicity and its consistency with how conditionals validate today, but accepted that stepping's one-at-a-time execution justifies different validation behavior.

## P10: Steps are top-level only

Point: decide whether `:::step` blocks may be nested inside conditionals (or other steps), or must be top-level.

What you need to know: if `:::step` can hide inside `:::if`, then which steps exist and in what order becomes value-dependent, which breaks everything P7 needs — selector validation (is `--step=X` a known step?), the document-order sequence, and "step N of M". A conditional *inside* a step (content variation) is fine and fully supported; the question is only a step *inside* a conditional.

Decision: `:::step` blocks are top-level only — never nested inside `:::if` or inside another `:::step`. The step set and order are static and value-independent, so jastr can always enumerate them, order them, validate the selector, and derive the continuation footer. Conditionals nest freely *inside* a step for content variation. A "conditional phase" is modeled as an always-present step whose content adapts (`:::if{…} … :::else nothing here, continue :::`); actually *skipping* a step is a branching/continuation concern (the agent chooses the next `--step=`), not the step physically disappearing.

Rationale: the feature's value is a predictable, enumerable one-at-a-time spine; conditionally-present steps would make the step list, ordering, and front-door inputs (P12) all value-dependent, undermining P7 and the wrapper. No expressiveness is lost — conditional content lives inside steps, and conditional skipping is handled by the agent-driven next-pointer (consistent with P8).

## P11: `--step` selector grammar

Point: decide the CLI grammar for the `--step` selector.

What you need to know: `step` is a reserved native selector (P7), not a user-declarable input. jastr's flag grammar (`parseRunFlags`, `args.ts:104-108`) tags flags as `bare` (`--flag` ⇒ true, the boolean form) or `value` (`--flag=x`); non-boolean inputs already reject the bare form (`flags.ts:29-34`: `Input --<name> requires --<name>=value.`) and the empty form (`flags.ts:37-41`: `cannot be empty`). The owner noted bare `--step` collides with boolean syntax (like `--dry-run`) and should error.

Decision: omitting `--step` selects the first (entry) step, so `jastr run T` starts the workflow; `--step=<name>` selects that step; bare `--step` and empty `--step=` are errors, falling out of the existing value-flag grammar (`--step requires --step=value`, `--step cannot be empty`). There is no meaningful bare `--step`. `step` is intercepted as a reserved selector before the normal input-flag path (otherwise it would be rejected as an unknown input flag), reusing the same value-required / non-empty checks plus P7's unknown-step-name error.

Rationale: keying the entry default on *omission* (not a bare flag) gives a clean "start the workflow" entry that also matches non-stepped `jastr run T` and the generated wrapper's bare command. Erroring on bare/empty `--step` falls out of existing behavior — no new rule — and avoids silently misreading the selector as a boolean.

## P12: A stepped template presents its entry render's inputs to the outside

Point: decide what inputs a generated Agent Skill wrapper (and a P3 jump input-view) shows for a stepped template.

What you need to know: the generated wrapper inlines a template's rendered required inputs into a single `jastr run` command and chooses its body shape by rendered input count; under Model 2 a stepped template's required-input set varies by step. The wrapper bootstraps the first invocation, and steps 2..N self-propagate via jastr's rendered footers (P7 continuation, P3 jump input-views), which reveal each step's inputs just-in-time. Options: (W1) entry-step inputs only; (W2) all steps' inputs; (W3) no inputs / bare command.

Decision: a stepped template, as seen from outside (generated wrapper, and a P3 jump input-view pointing at it), presents its **entry render's** required inputs — frame + first step — i.e. the set `jastr run T` with no `--step` demands. The wrapper inlines exactly those into the bare entry command `jastr run T` and selects its body shape by that count. Inputs only later steps need are absent from the wrapper; they are surfaced just-in-time by the rendered footers as the agent reaches each step.

Rationale: the wrapper is the front door — it bootstraps step 1, and the render carries the rest. W2 front-loads exactly the premature-exposure / context-bloat the feature exists to kill and would demand later-step inputs the agent often cannot know at entry; W3 drops entry inputs the agent *can* supply. W1 also inverts Model 2's apparent cost into a benefit: under Model 1 the wrapper would have to inline every step's required inputs into the single entry command, producing a broken front door that demands unknowable values — so the wrapper interaction is itself further evidence for Model 2. Depends on P10 (top-level steps make "first step" statically determinable) and P11 (omission ⇒ first step).

## P13: Linear continuation footer is auto-generated

Point: when the agent finishes a plain (linear) step, should jastr auto-generate the "what's next" pointer, or must the author write it?

What you need to know: per P7 jastr knows the step order, so it can derive the next step in document position. A linear sequence is the common case; requiring the author to hand-write the continuation on every step would be pure boilerplate.

Decision: jastr auto-generates the continuation footer for a linear step — the author writes nothing. It points at the next step in document order, rendered as a "when you are done, run the next command" line. Owner's illustrative shape:

```
Analyze the code.

When you are done: run `jastr run T --step=review`
```

(Exact wording is spec-level.)

Rationale: linear is the overwhelmingly common case, so auto-generation makes it free and keeps footers consistent across steps; jastr already has the step order (P7) to derive the target.

## P14: The last step renders no footer

Point: when the agent finishes the last step (no next step exists), what does jastr render at the bottom?

What you need to know: the last step has no document-order successor, so there is no continuation target. The choices were a "workflow complete" line or nothing.

Decision: nothing at all — the last step renders no footer.

Rationale: there is nothing to point at, and a "complete" line would be noise; the absence of a continuation pointer is itself the signal that the workflow has ended.

## P15: A jump within a step is content; the linear footer always fires (no override this iteration)

Point: when a step body contains a cross-template jump (e.g. `run jastr run discuss`), should jastr suppress its automatic linear footer for that step?

What you need to know: a jump inside a step can mean two different things — (1) invoke another template as a subtask of step X, then continue to the next step; or (2) diverge — go to another template instead of continuing. Detecting jumps in order to suppress/override the footer would be needed only for case 2.

Decision: no suppression this iteration. A cross-template jump within a step is ordinary content: the agent performs it as part of that step and then proceeds to the next step via the normal auto-generated linear footer (P13). jastr does not inspect a step for jumps and never turns the footer off, except on the last step (P14). A divergence that should not continue to the next step is, for now, expressed by ordering — placing it in the last step, which renders no footer — or as author prose; mid-sequence footer suppression / structured branching is deferred to the proposal.

Rationale: the common, valid case is "do this template's work for step X, then move on," which the always-on linear footer handles with zero machinery (KISS). The seed's motivating divergence (review → optionally move to the large discussion template) still works, because that jump is naturally the final step and P14 already yields no spurious continuation. Building footer-override / termination detection now would add complexity for a case the last-step pattern already covers; richer mid-sequence branching is deferred rather than rejected.

## P16: `::run` is orthogonal to steps — usable in any template

Point: is the `::run` cross-template jump directive usable in a non-stepped template, or is it coupled to steps?

What you need to know: `::run` (P3/P4) is a structured cross-template reference — jastr resolves the target, validates it exists, and renders the target's entry-render input-view (P12). It was discussed in the context of a step's content, but nothing in its mechanism ties it to steps. The step-specific machinery is only the auto-footer (P13–P15); `::run` is content, not a footer.

Decision: yes — `::run` is orthogonal to steps and usable in any template, stepped or not. In a plain template it renders a validated pointer to the target plus the target's input-view; a non-stepped template composed of `::run` directives is a router. Steps and `::run` compose, but neither requires the other.

Rationale: there is no reason to couple them; restricting `::run` to stepped templates would be artificial and would forbid the useful router pattern — the original "Option 1" idea from the start of this discussion, now upgraded with structured validation and just-in-time input visibility. KISS / YAGNI: keep them independent.
