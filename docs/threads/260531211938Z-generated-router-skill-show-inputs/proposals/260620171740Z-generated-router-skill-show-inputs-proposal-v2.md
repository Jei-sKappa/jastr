# Generated Agent Skill: show available template inputs

> v2 of this proposal. The original
> (`260531211938Z-generated-router-skill-show-inputs-proposal.md`) was written
> against the pre-rename codebase and is preserved for history. This revision
> updates every concrete reference to the current world: the `skillrouter →
> jastr` rename, the `Skill Router → Agent Skill` artifact rename, the
> single-`src/` → `@jastr/engine` + `@jastr/cli` workspace split, and the
> features that have since shipped (freshness `--check`, the `validate`
> command, config-defined variants with locked inputs, and template input
> defaults).

## Intent

Give the agent reading a generated Agent Skill visibility into the inputs
(flags) the underlying template declares, so it can translate the user's request
into a correct `jastr run <template-ref> …` invocation on the first try —
instead of forwarding raw `$ARGUMENTS` and discovering the valid flag set only
by tripping `run`'s validation errors.

This is worth shipping if agents stop guessing flags: they should know the
available flag names, types, required/optional status (and any author default),
enum value sets, and a short human description for each input before they invoke
the CLI.

## Context

Today the generated Agent Skill is a lean wrapper: `name`/`description`
frontmatter (plus any passed-through kebab-case fields) and a body that says
"run `jastr run <template-ref> $ARGUMENTS`, follow the output, and report a
non-zero exit." The template's declared `inputs` are **deliberately kept out of
the generated artifact**.

That omission is enforced in the CLI generator, not the engine. The body is
built by `buildAgentSkillContent` in `packages/cli/src/targets/agent-skill.ts`
(the `jastr run <template-ref> $ARGUMENTS` line lives there, gated on whether
the template declares inputs). Frontmatter pass-through in the same file
excludes template-owned keys via `RESERVED_FRONTMATTER_FIELDS = new
Set(["inputs"])`, so `inputs` can never leak into generated frontmatter. The
original rationale holds: generated *frontmatter* should carry only fields the
agent harness understands as Agent Skills metadata.

The `$ARGUMENTS` forwarding rule is itself a current contract, not an informal
habit. Bare-template wrappers forward `$ARGUMENTS` whenever the template
declares one or more inputs; argument-less templates get the bare `jastr run
<template-ref>` line. Variant wrappers (`<template-ref>#<variant-id>`) forward
`$ARGUMENTS` only when at least one base-template input is **not** locked by the
selected variant.

The consequence is unchanged from when this was first written: the agent has
zero signal about what flags exist. It forwards whatever the user typed and
relies on the CLI's runtime validation errors to learn the contract. This
proposal reacts to that blind spot — and so it intentionally revisits (does not
blindly overturn) the "omit inputs from the artifact" decision.

## Rough shape

A first sketch, not a spec:

- **Surface inputs in the Agent Skill *body*, not frontmatter.** Frontmatter
  stays metadata-only, preserving the original rationale (and avoiding the risk
  of the agent harness rejecting non-metadata fields). The body gains a derived,
  human-readable `## Inputs` section.

- **Per-input detail rendered:** flag name, type (with the enum value set when
  `type: enum`), required vs. optional, the author default when one is declared,
  and an optional one-line description.

- **Respect variants and locked inputs.** For a `<template-ref>#<variant-id>`
  wrapper, inputs the variant locks must not be rendered as flags the agent can
  set — only the still-open inputs belong in the `## Inputs` section. This keeps
  the body consistent with the existing variant `$ARGUMENTS` rule (a variant
  with all inputs locked already drops `$ARGUMENTS` entirely).

- **New optional `description` field on input definitions.** Sourced from a new
  optional `description` key under each input in `TEMPLATE.md` frontmatter. This
  is an additive, backward-compatible schema extension — existing templates
  without it keep working. Because the engine owns the schema, it touches
  `TemplateInputDefinition` in `packages/engine/src/schema.ts` and the engine's
  input-schema validation, while the rendering touches the CLI generator in
  `packages/cli/src/targets/agent-skill.ts`. So this proposal spans both
  workspace packages: a small engine schema change plus a CLI generator change.

  Rough body sketch:

  ````markdown
  ## Inputs

  - `--env` (enum: dev|prod, required) — target environment
  - `--region` (string, optional, default: us-east-1) — deployment region
  - `--dry-run` (boolean, optional) — preview without applying

  Map the user's request to the flags above, then run:

  ```bash
  jastr run deploy --env=<...> [--region=<...>] [--dry-run]
  ```
  ````

- **No declared (open) inputs → omit the section entirely.** Argument-less
  templates — and fully-locked variants — stay the lean wrapper they are today;
  the `## Inputs` section only appears when there is something to show.

- **Contract shift: instruct the agent to construct flags.** Rather than
  forwarding raw `$ARGUMENTS`, the body tells the agent to build the
  `--flag=value` invocation from the documented inputs based on the user's
  request. (How this coexists with the existing `$ARGUMENTS` passthrough
  contract is deferred — see Open questions.)

## Open questions

- **`$ARGUMENTS` passthrough + determinism tension (deferred decision).**
  "Construct flags" moves an interpretation step onto the agent, which brushes
  against the project's deterministic-rendering thesis. It is strictly better
  for natural-language invocation (the agent knows valid flags + enum values
  instead of guessing) but raises what happens to the slash-command
  `$ARGUMENTS` passthrough path — which is now a written contract in the
  package-split v2 spec and the generated-skill-variants v2 spec, not an
  informal habit. Recommended a **hybrid** — construct flags from the request
  *and* honor explicit flags the user already typed — but the exact wording
  (hybrid vs. pure construct) is left to the spec phase. Any change here must
  also state how it interacts with locked-input variants.

- **Staleness / drift — mitigation already exists.** The generated Agent Skill
  is a static artifact. Embedding the inputs view widens the drift surface: when
  a template's inputs change, the generated skill goes stale until regenerated.
  Unlike when this was first written, the mitigation has **shipped**: `jastr
  generate agent-skill <template-ref> --out <path> --check` byte-compares the
  committed wrapper against a fresh in-memory build (`output_stale` /
  `output_missing`). Mirroring template inputs into the body makes `--check`
  more valuable, but it is no longer a future dependency — only a reason the
  freshness gate matters more.

- **`description` field constraints.** Should the new per-input `description` be
  single-line only, length-capped, and non-empty when present? Needs a decision
  so frontmatter stays clean and the rendered body stays compact. Validation
  lands in `@jastr/engine` alongside the rest of the input-schema checks.

- **Interaction with input defaults.** Inputs can now declare `default:` (only
  when `required: false`), and `run`'s effective-value precedence is CLI flags
  over project-config values over author defaults. The `## Inputs` rendering
  should show the author default and reflect that an input with a default need
  not be supplied — decide the exact phrasing so "optional" vs. "optional,
  default: X" reads unambiguously.

- **Spec supersession.** This revisits the active rule that the generated body
  forwards `$ARGUMENTS` and carries no input view. The "omit template-owned
  fields from frontmatter" rationale still holds for frontmatter; the body now
  carries a *derived* view. The active contracts to amend are the package-split
  v2 spec (generated wrapper body and `$ARGUMENTS` rule) and the
  generated-skill-variants v2 spec (variant forwarding and locked inputs), plus
  the engine input-schema spec for the new `description` field. A new or updated
  spec is needed rather than a silent generator change.

- **Exact section format.** `## Inputs` heading, bullet list vs. table, and the
  precise phrasing of the construct-flags instruction — left to spec/impl.

- **Possible future reuse (out of scope now).** The new `description` could also
  feed `run`'s validation-error output, the `jastr validate` report, or a future
  per-template help listing. Noted so it is not assumed settled; not in scope for
  this proposal.
