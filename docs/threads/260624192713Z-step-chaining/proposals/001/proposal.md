---
version: 1
status:
  approved: 260625131246Z
---

# Proposal: template steps — a stateless single-file stepper with cross-template jumps

> This proposal is the direct output of the genesis decision log
> [`seed/discussions/260625081416Z-step-chaining-architecture-decision-log.md`](../../seed/discussions/260625081416Z-step-chaining-architecture-decision-log.md)
> (decisions **P1–P16**) and is linked to it. Every "Rough shape" claim below cites
> the decision that settled it; read the log for the reasoning, trade-offs, and the
> objections that were raised and resolved.

## Intent

Add a **steps** concept to jastr so a long instruction can be authored in one
template and delivered to an agent **one step at a time**, with an
auto-generated pointer to the next step, plus a structured way for any template
to **point the agent at another template**. Crucially, this is achieved **without
turning jastr into a workflow executor** — jastr stays a stateless, pure Markdown
renderer; the agent remains the executor (P1).

## Context

The thread's [seed](../../seed/260624192713Z-step-chaining-seed.md) sketched
"steps" as mini-templates batched into a bigger one, a "mini workflow executor,"
and human-in-the-loop branching that could invoke other templates. The genesis
discussion converged on something narrower and cleaner than "executor."

The three drivers that justify the feature (P1):

1. **Context economy** — existing 10K-line skills should not be dumped into an
   agent's context all at once.
2. **Premature-execution bias** — an agent that can see the next phase tends to
   start acting on it early; concealing it is a feature, not a bug.
3. **Mid-conversation forgetting** — a full step list shown in an early message
   degrades over a long conversation; re-rendering the current step keeps it
   salient.

An "executor" was explicitly rejected, as was inline cross-template rendering
(P1). What survived is a **rendering** feature, not an orchestration runtime.

## Rough shape

This is a sketch to react to, not a spec. P-numbers point at the decision log.

### What jastr becomes

A **stateless single-file stepper** (P1). An author marks step boundaries in one
`TEMPLATE`; `jastr run T --step=<name>` renders **only the current step**, plus an
auto-generated footer pointing at the next. jastr never loops, holds no state, and
never runs anything — the agent carries the step pointer by issuing the next
command. Physical organization across files keeps using the existing `include`
(fragments). Inline cross-template rendering is **not** built (P1).

### Steps

- A step is a **content region** of `T`, not a template; it has **no input schema
  of its own**. Plain-text / no-input steps are the default (P2).
- Steps are a **first-class `:::step{name="…"}` directive** — a container in the
  `if` family that internally reuses the existing conditional rendering machinery
  (`step == name`) but is also **enumerable**, so jastr derives step order from
  document position, validates the selector, and generates the footer. `step` is a
  **reserved native selector** authors cannot declare as an input (P7).
- **Rendering model (P6):** a step renders like a conditional — only the selected
  step's block emits; content **outside** any step (the **"frame"**) always emits.
  The author dials persistent-vs-per-phase context purely by placement. Pure
  isolation is just "an empty frame."
- Steps are **top-level only** (P10) — never nested inside `:::if` or another
  step — so the step set and order stay static and enumerable. Conditionals nest
  freely *inside* a step.

### `--step` selector grammar (P11)

| invocation | meaning |
|---|---|
| `jastr run T` (omit `--step`) | entry — the **first** step |
| `jastr run T --step=analyze` | that step |
| `jastr run T --step` (bare) | error: `--step requires --step=value` |
| `jastr run T --step=` (empty) | error: `--step cannot be empty` |

`step` is intercepted as a reserved selector before the normal input-flag path,
reusing the existing value-required / non-empty checks plus an unknown-step-name
error. A template with **zero** `:::step` blocks is just an ordinary template
(stepping is inert).

### Continuation footer

- **Linear by default (P13):** jastr auto-appends a "when you are done, run
  `jastr run T --step=<next>`" footer; the author writes nothing.
- **Last step (P14):** renders **no footer** — absence is the "complete" signal.
- **Jumps are content (P15):** a `::run` inside a step is ordinary content (the
  agent invokes that template as part of the step, then continues to the next
  step). jastr does **not** inspect a step for jumps and never suppresses the
  footer (except on the last step). Mid-sequence divergence is expressed by
  putting the jump in the last step; richer branching is deferred (see below).

### Cross-template jumps (`::run`)

- A **structured** reference (P3) in the `::include` directive family (P4), e.g.
  `::run{template="discuss"}`. When it renders, jastr resolves the target,
  **validates it exists**, and renders the target's **input-view** (a schema
  read — never a body render, so the no-inline rule holds), so the agent sees
  which flags it can supply.
- **Validation stance (P5):** broken jumps are caught statically (`jastr validate`
  checks the chain; the target is also resolved live when the containing step
  renders). jastr makes **no** cross-run validity guarantee and adds no
  drift-tracking — a target deleted later simply makes the agent's `jastr run X`
  fail naturally.
- `::run` is **orthogonal to steps** (P16): usable in any template. A non-stepped
  template that is nothing but `::run` directives is a **router** — the original
  "Option 1" idea, upgraded with validation and just-in-time input visibility.

### Input model

- **Model 2 (P9):** `jastr run T --step=N` requires only the required inputs
  **referenced** by the rendered content (frame + step N); inputs referenced only
  by other steps are not demanded. Nested conditionals use **static** scoping.
  Mechanically: "drop the non-selected step blocks, then validate/render as
  today," with one new engine behavior — input-presence validation becomes
  **reference-aware**. `jastr validate T` stays whole-template.
- **Outside view (P12):** a stepped template, as seen by a generated Agent Skill
  wrapper or by a `::run` input-view pointing at it, presents its **entry
  render's** inputs (frame + first step). Later steps' inputs are surfaced
  just-in-time by the footers, never front-loaded. (This is also why Model 2 is
  required: Model 1 would force the wrapper to demand unknowable later-step inputs
  at the front door.)

### Engine vs CLI (consistent with the v2 package split)

The engine gains the `:::step` and `::run` directive concepts, conditional-reuse
rendering for steps, step enumeration, and reference-aware input validation. The
`::run` input-view needs the **target template's schema**, which the engine must
obtain through an **injected resolver** paralleling the existing `includeResolver`
(the engine stays free of filesystem and `.jastr` lookup). The CLI owns the
`--step` selector grammar, the resolver that reads jump targets across the
dual-root layout, the `generate agent-skill` entry-render wrapper, and `validate`.

## Open questions (deferred here on purpose)

These were explicitly punted from the discussion to the spec; do not assume any
are settled.

1. **`:::step` marker syntax** — container (`:::step{name} … :::`) vs a lighter
   delimiter (`::step{name}` sprinkled between sections of an existing file).
   Retrofitting 10K-line skills favors low-friction markers; semantics favor a
   container. (P6/P7)
2. **Exact directive names & attributes** for `:::step` and the jump directive
   (`::run` is a placeholder), and the exact rendered **footer wording**.
   (P4/P7/P13)
3. **Jump validation scope** — does `run --step=N` resolve only the current step's
   jumps while `validate` checks the whole template's chain? (P5)
4. **Reference-aware input validation** — precise rule for "referenced by the
   rendered content," including references inside conditions and inside `::run`
   commands; how `validateTemplateInputs` changes. (P9)
5. **Mid-sequence branching / footer suppression / early termination /
   structured multi-target continuation** — not built this iteration; the
   last-step pattern covers the seed's case. Worth a design pass when a real
   non-terminal branch appears. (P13/P15)
6. **Static vs dynamic nested-conditional input scoping** — static is chosen;
   dynamic (scope to the taken branch) is a possible later refinement if a real
   need surfaces. (P9)
7. **`generate agent-skill` mechanics** for stepped templates — deriving the
   entry render (default `--step`), body-shape selection by entry-input count,
   and `argument-hint` from the entry render. Interaction with variants and with
   a stepped template used as a `::run` target. (P12)
8. **Reserved-name collision** — `step` becomes reserved; confirm no migration
   concern (private pre-release tool, breaking changes acceptable). (P7/P11)

## Scope note

CLI- and engine-level feature; no change to jastr's identity as a deterministic,
stateless pure renderer (P1, P8). It composes with — and must be reconciled
against — the existing include-containment, named-group-location, generated-skill
(inline-flags, show-inputs, argument-hint), dual-root discovery, and
`validate`/`--check` contracts already recorded in `AGENTS.md`.
