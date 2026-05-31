# Proposal: `skillrouter validate <skill>` command

## Intent

Add a third top-level command, `skillrouter validate <skill>`, that runs the
existing static-validation pipeline against a template and reports pass/fail
without writing any file or requiring an output destination. It answers one
question for a template author: *"is this template well-formed enough to be used
at all?"*

## Context

Skillrouter already owns the entire static-validation pipeline — frontmatter
parsing, schema validation, input-name grammar, directive scanning, condition
parsing, condition/interpolation reference checks, include-path resolution,
missing-include detection, and include-cycle detection (`validateSkillTemplate`
in `src/compiler/render.ts`, fronting the `src/compiler/` modules). But that
logic is only reachable as a side effect of two operations:

- `run` validates, then renders to stdout — so it needs invocation inputs and
  produces a full render.
- `generate` validates, then writes a router skill — so it needs an `--out`
  path and produces a committed artifact.

There is no way to ask "is this template valid?" on its own. An author iterating
on a template must either invoke `run` with a plausible set of flags (which also
exercises branch selection and interpolation, mixing authoring errors with
input errors) or `generate` to a throwaway path. Both are indirect. The
validation capability exists; only the front door is missing.

This came directly out of a comparison against the vendored gstack reference,
which exposes its template health via standalone `skill:check` and `dev:skill`
(watch) commands. The transferable lesson is the standalone surface, not
gstack's resolver/host machinery.

## Rough shape

- A new command factory under `src/cli/commands/` (alongside `run.ts` and
  `generate.ts`), thin over a new `executeValidate` helper in
  `src/cli/commands.ts` — same shape as the existing `executeRun` /
  `executeGenerate` split.
- `executeValidate` discovers the project root, resolves the skill slug to
  `.skillrouter/<skill>/SKILL.template.md`, and calls the *shared*
  `validateSkillTemplate` pipeline. No new compiler logic — pure reuse, which
  keeps validate, run, and generate from drifting.
- Takes no input flags and no `--out`. It does not evaluate branch truth (no
  invocation inputs exist), matching how `generate` validates statically today.
- Output on success: a single concise human-facing line (e.g.
  `Template <skill> is valid.`). On failure: the existing `Error: <message>`
  to stderr with exit 1, reusing each compiler error's specific code so the
  diagnostics match what `run`/`generate` would emit for the same defect.
- Pairs naturally with a future `--watch` (re-validate on save) — the path-free,
  output-free nature of `validate` is what makes a watch loop clean.

## Relationship to `generate --check`

These are complementary, not redundant, and the distinction is worth stating so
a reader does not collapse them:

- `validate` guards the **input**: is the template authorable? No `--out`, reads
  nothing back, writes nothing. Destination-independent.
- `generate --check` guards the **output**: does a committed router file at a
  specific path still match what the template would produce? Path-specific,
  compares against an existing artifact.

A template can pass `validate` but fail `generate --check` (valid source, stale
committed copy). A template that fails `validate` fails everything downstream.
`validate` is the cheaper, earlier, path-free gate an author runs constantly.

## Open questions

- **Scope of checks.** Minimally `validate` runs the run-side static pipeline.
  Should it *also* run the generate-specific router-frontmatter checks (name ==
  slug, description ≤ 1024, kebab-case passthrough fields in
  `src/generate/router-skill.ts`)? Those are static properties of the template
  too, but they only matter if the skill is ever `generate`d. Leaning toward
  including them so `validate` is a true superset of "everything checkable
  without invocation inputs," possibly behind a flag if we want a narrower
  "run-only" mode.
- **Command name.** `validate` vs `check` vs `lint`. `check` risks confusion
  with the proposed `generate --check`; `validate` reads clearest. Flagging so
  it is a deliberate choice, not a default.
- **Spec scope.** The v1 spec enumerates only `run` / `generate` / `--help` /
  `help` / `--version`. Adding `validate` is a spec change, not a silent
  addition — it should land as a spec delta. The spec already lists "lifecycle
  commands" as an open question, so this is in-bounds to decide now while the
  project is pre-release.
- **Exit-code vocabulary.** Confirm `validate` reuses the existing uniform
  `Error: <message>` + exit 1 contract rather than introducing validate-specific
  exit codes.
- **Multiple-skill / all-skills mode.** Out of scope for a first cut, but worth
  noting someone will eventually want `validate` across every skill under
  `.skillrouter/` for a CI sweep. Not assuming it is settled either way.
