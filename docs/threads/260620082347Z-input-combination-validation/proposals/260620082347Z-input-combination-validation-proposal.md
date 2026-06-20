# Input combination validation: author-defined constraints across inputs

## Intent

Let a TEMPLATE.md author declare constraints over input *combinations*, so an
invalid combination (e.g. `library=axios` together with `framework=django`)
fails with a clear, author-written message instead of silently producing
nonsense output. Worth shipping when an author can express "these inputs
conflict" or "this input only makes sense alongside that one" and have jastr
reject the bad combination — at the author's discretion.

## Context

From the backlog. Today jastr validates each input in isolation — type,
`required`, enum membership, and defaults — in `validateTemplateInputs`
(`packages/engine/src/inputs.ts`). There is no way for an author to say that two
individually-valid inputs are invalid *together*, or that one input is only
meaningful when another is present or has a certain value. The judgment of which
combinations are valid is per-template and author-specific.

## Rough shape

Still open in its essentials — captured as the backlog framed it, not as a
settled design. The core capability: a way for the author to declare a condition
over multiple inputs that, when violated, aborts the run with an author-supplied
message.

Two candidate syntaxes (the central open question below):

- **Declarative** — constraints expressed in the TEMPLATE.md frontmatter.
- **Imperative** — constraints expressed in the TEMPLATE.md body, using an
  `if`-style condition plus a new directive that aborts with a validation error
  (conceptually `raise ValidationError`) when the combination is invalid.

Neutral observation relevant to both: jastr already has a complete boolean
condition language (`${input} == '...'`, `&&`, `||`, `!`, `!=`, parens —
`packages/engine/src/conditions.ts`) backing `if`/`else-if`/`else`. Either
syntax could reuse it, so the open choice is about *where rules live and when
they run*, not about inventing an expression language.

## Open questions

1. **Declarative vs imperative (primary, unresolved).** The decision this
   proposal exists to tee up. No preference recorded.
   - *Declarative:* rules in frontmatter (open: exact shape).
   - *Imperative:* rules in the body via an `if`-condition + a new "fail"
     directive (open: directive name and semantics).
2. **Evaluation timing.** Against which values do constraints run — the raw CLI
   flags, or the effective values after defaults, project config, and variant
   `locked-inputs` are applied? This also interacts with the
   `validate → render` phase split: a body-level imperative check necessarily
   runs during rendering, while a frontmatter declarative check could run in a
   validation phase before rendering.
3. **Variant interaction.** A variant's `locked-inputs` could force a
   combination that violates a constraint. Is that caught at `generate
   agent-skill` time, at `run` time, or both?
4. **Error reporting.** Report the first violated constraint only (jastr's
   current throw-on-first-error style) or collect and report all violations at
   once?
