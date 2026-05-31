# Generated router skill: show available template inputs

## Intent

Give the agent reading a generated router skill visibility into the inputs
(flags) the underlying template declares, so it can translate the user's request
into a correct `skillrouter run <skill> …` invocation on the first try — instead
of forwarding raw `$ARGUMENTS` and discovering the valid flag set only by
tripping `run`'s validation errors.

This is worth shipping if agents stop guessing flags: they should know the
available flag names, types, required/optional status, enum value sets, and a
short human description for each input before they invoke the CLI.

## Context

Today the generated router skill is a four-line stub: official-only frontmatter
plus a body that says "run `skillrouter run <skill> $ARGUMENTS`." The template's
declared `inputs` are **deliberately stripped** from the generated artifact —
this is a current v1 spec decision (`specs/.../260526140146Z-v1-spec.md` lines
~113/354/400-405) enforced in `src/generate/router-skill.ts` (`inputs` is in
`SKILLROUTER_OWNED_FIELDS` and skipped at lines 17, 68-70). The rationale was
that generated *frontmatter* should carry only official Agent Skills fields the
agent harness understands.

The consequence: the agent has zero signal about what flags exist. It forwards
whatever the user typed and relies on the CLI's runtime validation errors to
learn the contract. This proposal reacts to that blind spot — and so it
intentionally revisits (does not blindly overturn) the spec's "omit inputs"
decision.

## Rough shape

A first sketch, not a spec:

- **Surface inputs in the router skill *body*, not frontmatter.** Frontmatter
  stays official-only, preserving the original spec rationale (and avoiding the
  risk of the agent harness rejecting non-official fields). The body gains a
  derived, human-readable `## Inputs` section.

- **Per-input detail rendered:** flag name, type (with the enum value set when
  `type: enum`), required vs optional, and an optional one-line description.

- **New optional `description` field on input definitions.** Sourced from a new
  optional `description` key under each input in `SKILL.template.md` frontmatter.
  This is an additive, backward-compatible schema extension — existing templates
  without it keep working. It touches `src/compiler/schema.ts`
  (`InputDefinition`), the v1 spec's input-schema section, and input validation.
  So this proposal carries a small schema change, not just a generator change.

  Rough body sketch:

  ```markdown
  ## Inputs

  - `--env` (enum: dev|prod, required) — target environment
  - `--region` (string, optional) — deployment region
  - `--dry-run` (boolean, optional) — preview without applying

  Map the user's request to the flags above, then run:

  ```bash
  skillrouter run deploy --env=<...> [--region=<...>] [--dry-run]
  ```
  ```

- **No declared inputs → omit the section entirely.** Argument-less skills stay
  the lean stub they are today; the `## Inputs` section only appears when there
  is something to show.

- **Contract shift: instruct the agent to construct flags.** Rather than
  forwarding raw `$ARGUMENTS`, the body tells the agent to build the
  `--flag=value` invocation from the documented inputs based on the user's
  request. (How this coexists with the existing `$ARGUMENTS` passthrough path is
  deferred — see Open questions.)

## Open questions

- **`$ARGUMENTS` passthrough + determinism tension (deferred decision).**
  "Construct flags" moves an interpretation step onto the agent, which brushes
  against the project's "deterministic AI-agent skill specialization" thesis.
  It is strictly better for natural-language invocation (the agent knows valid
  flags + enum values instead of guessing) but raises what happens to the
  slash-command `$ARGUMENTS` passthrough path. Recommended a **hybrid** —
  construct flags from the request *and* honor explicit flags the user already
  typed — but the user chose to defer the exact wording (hybrid vs. pure
  construct) to the spec phase. Flagged here for spec to resolve.

- **Staleness / drift.** The generated router skill is a static artifact.
  Embedding the inputs view widens the drift surface: when a template's inputs
  change, the generated skill goes stale until regenerated. This interacts
  directly with the `260531193119Z-generate-check-freshness` thread; the
  freshness/`--check` mechanism becomes more valuable (and arguably more
  necessary) once the generated body mirrors template inputs.

- **`description` field constraints.** Should the new per-input `description` be
  single-line only, length-capped, and non-empty when present (mirroring the
  existing template `description` validation)? Needs a decision so frontmatter
  stays clean and the rendered body stays compact.

- **Spec supersession.** This revisits the v1 spec clauses that strip `inputs`
  from generated content and that fix the generated body wording (~lines
  113/354/400-405). The "omit Skillrouter-owned fields from frontmatter"
  rationale still holds for frontmatter; the body now carries a *derived* view.
  A new or updated spec is needed rather than a silent generator change.

- **Exact section format.** `## Inputs` heading, bullet list vs. table, and the
  precise phrasing of the construct-flags instruction — left to spec/impl.

- **Possible future reuse (out of scope now).** The new `description` could also
  feed `run`'s validation-error output or a future per-skill help listing.
  Noted so it is not assumed settled; not in scope for this proposal.
