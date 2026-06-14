# Locked-input skill variants from one base template

## Intent

Let `jastr generate agent-skill` produce specialized Agent Skill variants that
pre-bind selected template inputs, so agents can expose narrower,
purpose-specific skills without duplicating the source template.

A variant is worth shipping if locked inputs are always supplied by the
generated variant and user-supplied duplicates fail instead of silently
overriding or relying on incidental duplicate-flag behavior.

## Context

This proposal comes after template input defaults and project config made
repeated inputs less noisy, but those values remain overridable and
user-facing. The new need is stronger: generate several purpose-specific skills
from one `TEMPLATE.md`, where some inputs are pre-bound, hidden from the
variant's public surface, and treated as an error if supplied again during
variant invocation.

For example, a project may keep `review/TEMPLATE.md` as the single source of
truth and generate both:

- `review/SKILL.md`, the normal wrapper exposing all template inputs.
- `my-custom-review/SKILL.md`, another wrapper over `review/TEMPLATE.md` that
  forces `language=typescript` and exposes only the remaining inputs.

The example input domains discussed during proposal drafting included
`file | file[] | directory | directory[]`, but those were illustrative. The
current Jastr input model is still `string`, `boolean`, and `enum`; this
proposal does not by itself reopen richer input typing.

## Rough shape

The base template remains the source of truth. A generated skill variant is not
a copied template and does not create a new `.jastr/<variant>/TEMPLATE.md`.
Instead, it is a generated Agent Skill wrapper with its own output path and
Agent Skill identity, backed by the original template.

The important contract is that locked inputs are first-class enough to be
validated as locked, not merely prefilled by convention. A wrapper-only command
such as:

```bash
jastr run review --language=typescript $ARGUMENTS
```

is not a sufficient end state if duplicate locked inputs only fail because of
today's generic duplicate-flag parsing. The CLI should understand that
`language` is locked for this generated artifact and should produce a deliberate
stable error when the user supplies `--language` again.

A later spec should decide where variant definitions live. Plausible options
include:

- Generate-time options, for example
  `jastr generate agent-skill review --out my-custom-review/SKILL.md --lock language=typescript`.
- Template-declared variants or flavors inside `review/TEMPLATE.md`, generated
  by variant name.
- External project config defining named variants over base templates.

This proposal intentionally keeps that choice open. It does, however, reject
two weaker shapes as non-goals:

- Duplicating the base template just to specialize a few inputs.
- Treating locking as generated-wrapper convention without CLI/runtime
  enforcement.

## Open questions

- Where should variant definitions live: generate-time flags, template
  frontmatter, project config, or another artifact?
- Should variants be addressable as virtual template refs by `jastr run`, or
  only materialized as generated Agent Skill wrappers?
- How should generated variant skills get their own `name` and `description`
  when the base template currently has only one `targets.agent-skill.frontmatter`
  block?
- What exact stable error should appear when a user supplies a locked input
  again?
- How should locked inputs interact with existing precedence? They likely need
  to sit above CLI flags, project config values, and template-author defaults,
  but the spec must make that explicit.
- Should generated variant wrappers list only the remaining unlocked inputs in
  their body?
- Can the existing template defaults and project config implementation provide
  reusable mechanics for supplying values, while acknowledging that neither
  feature enforces locking because both are designed to be overridable?
