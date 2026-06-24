# Plan 001 — `argument-hint` in generated Agent Skill wrappers

Compiles `specs/001/spec.md`. The feature is CLI-only: `@jastr/engine` is
untouched and no new `JastrErrorCode` is introduced. Decisions are cited as
`P<N>` against the genesis log
`seed/discussions/260623193024Z-argument-hint-design-decision-log.md`.

## Goal

Make `jastr generate agent-skill` (and `jastr validate`) derive, assemble, and
emit an `argument-hint` frontmatter field — an author-supplied **intent** prefix
followed by an auto-derived **form** suffix listing the template's unlocked
inputs as flags — while reserving a literal `argument-hint` against author
passthrough. End state: every spec FR/AC holds and all six project gates exit 0
with `BEHAVIOR.md` regenerated and `AGENTS.md` reconciled.

## Sequencing note

Derivation is on by default (P8), so the moment Task 1 lands, every committed
e2e golden for an input-bearing template gains a derived `argument-hint` line and
the **full e2e suite goes red** until Task 4 regenerates those goldens. This is
the accepted churn called out in spec §4.6. Tasks 1–2 therefore verify against
their **targeted unit tests** only; the full-suite gates (`test`,
`test:cli:e2e`, `docs:cli:living --check`, `build`) are the closing Task 4's job.
This intermediate red is expected, not a defect.

## Granted degrees of freedom (spec §7)

The implementer may choose: exact human-readable wording of the new
prefix-validation messages (only the `JastrErrorCode`, `Error:` prefix, and exit
1 are pinned); the code decomposition / helper names / how the prefix threads
into `buildAgentSkillContent`; the order of validation checks when several
defects coexist; the durable requirement IDs and e2e case slugs (the next-free
IDs at authoring are `GEN-FR-0023`, `VAR-FR-0011`, `VALIDATE-FR-0008`); and the
fixture/golden regeneration mechanics. The concrete function names and signatures
prescribed below are a known-good realization, not a constraint — any
decomposition that satisfies each task's acceptance criteria is acceptable.

## Tasks

### Task 1: Derive, assemble, and emit `argument-hint`; reserve the literal field

**Objective:** Make `buildAgentSkillContent` derive the flag portion from its
input list, assemble it with the (resolved) author prefix carried on the target,
and emit an `argument-hint` frontmatter line in the correct position — and reject
a literal `argument-hint` in passthrough frontmatter.

**Input / context:** Spec §4.2 (derived grammar, P4), §4.3 (assembly/emission,
P5), §4.5 reservation (P2/P7), §4.6 serialization (P8); FR-1, FR-3, FR-4, AC-6.1.
All edits are internal to `packages/cli/src/targets/agent-skill.ts`; the file's
current shape (`AgentSkillTarget` type, `RESERVED_FRONTMATTER_FIELDS`,
`collectPassthroughFrontmatter`, `buildAgentSkillContent`, `buildCommand`) is the
starting state. `buildAgentSkillContent` already receives `inputs` = the
**unlocked** inputs (callers pass `listUnlockedTemplateInputs(...)`), so locked
inputs are pre-excluded from derivation and need no handling here.

**Steps:**
1. Add an optional `argumentHintPrefix?: string` field to the `AgentSkillTarget`
   type. It is the already-trimmed, already-resolved prefix (Tasks 2 populate it;
   here it is consumed and defaults to absent).
2. Add `"argument-hint"` to the `RESERVED_FRONTMATTER_FIELDS` set. Because both
   the base target frontmatter and a selected variant's frontmatter flow through
   `collectPassthroughFrontmatter` (base directly, variant via the merged object
   in `commands.ts`), this single addition rejects a literal `argument-hint` in
   either location with `invalid_target_metadata` — covering FR-4 wholesale.
3. Add a derivation helper (e.g. `deriveArgumentHintForm(inputs)`) returning the
   space-joined flag portion. Per input, emit one token in declaration order,
   joined by single spaces, following exactly this grammar:

   | input type | required | optional |
   | --- | --- | --- |
   | string | `--name=<value>` | `[--name=<value>]` |
   | enum | `--name=v1\|v2\|v3` | `[--name=v1\|v2\|v3]` |
   | boolean | `--name` | `[--name]` |

   Rules (verbatim from §4.2): required → bare token, optional → the same token
   wrapped in `[ ]`; string → uniform `<value>`; enum → declared `values` joined
   by `|` in declared order in place of the placeholder, joined **verbatim with
   no escaping** (spec §8 — do not invent escaping for pathological enum values);
   boolean → flag name only, no placeholder; separator is always `=`. Return the
   empty string when `inputs` is empty.
4. Add an assembly helper (e.g. `assembleArgumentHint(prefix, form)`) returning
   `string | undefined` per §4.3: both present → `"<prefix> <form>"` (exactly one
   joining space); prefix only → `"<prefix>"`; form only → `"<form>"`; neither →
   `undefined`. Treat an absent/empty prefix and an empty form symmetrically.
5. In `buildAgentSkillContent`, compute `form` from `options.inputs`, then
   `hint = assembleArgumentHint(options.target.argumentHintPrefix, form)`. Build
   the frontmatter object so `argument-hint` lands **immediately after
   `description` and before passthrough fields** — i.e. spread order
   `{ name, description, ...(hint ? { "argument-hint": hint } : {}), ...options.target.frontmatter }`.
   When `hint` is `undefined`, emit no `argument-hint` key at all. Keep using the
   existing `YAML.stringify(frontmatter)` path — never hand-build the line — so
   the value's `<`, `>`, `[`, `]`, `|`, `=`, and leading `-` are quoted correctly
   and deterministically (§4.6, AC-6.1).
6. Do **not** alter any of the four body shapes (A/B/C/D) or `buildCommand`;
   `argument-hint` is a frontmatter-only addition (§4.3, AC-3.6).
7. Add unit tests to `packages/cli/test/agent-skill-target.test.ts` covering: each
   grammar row (AC-1.1–1.6); multi-input declaration-order join (AC-1.7); the four
   assembly cases including omission when neither part exists (AC-3.1–3.4);
   `argument-hint` positioned after `description` and before a passthrough field
   (AC-3.5); a body-shape snapshot unchanged except for the added frontmatter line
   (AC-3.6); a YAML round-trip of a value containing `[`, `<`, `|`, `=`, and a
   leading `-` (AC-6.1); and a literal `argument-hint` in passthrough frontmatter
   rejected with `invalid_target_metadata` (AC-4.1). Construct targets with
   `argumentHintPrefix` set directly to exercise prefix-bearing assembly without
   depending on Tasks 2.

**Files modified:** `packages/cli/src/targets/agent-skill.ts`,
`packages/cli/test/agent-skill-target.test.ts`

**Verification:** `bun run test packages/cli/test/agent-skill-target.test.ts`
exits 0. `bun run typecheck` exits 0. `grep -n 'argument-hint' packages/cli/src/targets/agent-skill.ts`
shows the field added to the reserved set and emitted in `buildAgentSkillContent`.
(Full e2e suite is expected red here — see the Sequencing note.)

**Acceptance criteria:**
- `AgentSkillTarget` carries an optional `argumentHintPrefix: string`.
- The derived form follows the grammar table exactly for string/enum/boolean ×
  required/optional, joined by single spaces in declaration order (FR-1).
- Assembly produces `"<prefix> <form>"` / `"<prefix>"` / `"<form>"` / omitted per
  §4.3 (AC-3.1–3.4).
- The emitted `argument-hint` appears immediately after `description` and before
  any passthrough field (AC-3.5); body shapes A/B/C/D are byte-identical to
  pre-feature output except for the added field (AC-3.6).
- The value is serialized via `YAML.stringify` and round-trips (AC-6.1).
- A literal `argument-hint` in base passthrough frontmatter fails with
  `invalid_target_metadata` (AC-4.1).
- Targeted unit tests pass; `typecheck` passes.

### Task 2: Read, validate, and resolve the author prefix (base + variant)

**Objective:** Accept `argument-hint-prefix` as a base directive (sibling of
`targets.agent-skill.frontmatter`) and as a per-variant directive (sibling of
`agent-skill.frontmatter` in `.jastr/config.yml`), validate each with its
specified error code, and resolve variant-else-base into the target's
`argumentHintPrefix` on both the `generate` and `validate` paths.

**Input / context:** Builds on Task 1's `AgentSkillTarget.argumentHintPrefix`
field. Spec §4.1 (base directive, P3), §4.4 (variants, P6), §4.5 (error codes,
P2/P7), §4.6 validate (P8); FR-2, FR-5 (AC-5.2–5.5), FR-7. Current threading:
`commands.ts:145-151` builds the target for `generate` (base path via
`validateAgentSkillTarget`, variant path via `validateAgentSkillFrontmatter` over
a merged frontmatter object); `commands.ts:228-249`
(`validateDeclaredAgentSkillTarget`) mirrors this for `validate`;
`config.ts:207-238` (`readVariantAgentSkillFrontmatter`) reads the variant
`agent-skill` mapping and `config.ts:9-12` defines `ProjectConfigVariant`. The
variant `agent-skill` mapping is gated by `SELECTED_AGENT_SKILL_FIELDS`
(`config.ts:7`), and the base `targets.agent-skill` mapping by
`AGENT_SKILL_TARGET_FIELDS` (`agent-skill.ts:9`) — both currently allow only
`frontmatter`, so both must be widened.

**Steps:**
1. In `agent-skill.ts`, add `"argument-hint-prefix"` to
   `AGENT_SKILL_TARGET_FIELDS` so it is accepted as a sibling of `frontmatter`
   rather than rejected as an unknown target field.
2. Add a shared prefix-validation helper (e.g.
   `validateArgumentHintPrefix(value, errorCode, message)`) that enforces §4.1:
   value must be a string, non-empty after `.trim()`, and single-line (contains
   no `\n` or `\r`), throwing `JastrError(errorCode, …)`; on success it returns
   the `.trim()`-ed string. Parameterize the `JastrErrorCode` so the same logic
   serves base (`invalid_target_metadata`) and variant (`invalid_config`) callers.
3. In `agent-skill.ts`, read the base prefix from the target mapping (a sibling
   of `frontmatter`) and run it through the helper with
   `invalid_target_metadata`. Have `validateAgentSkillTarget` attach the trimmed
   result (or leave absent when undeclared) as `argumentHintPrefix` on its
   returned `AgentSkillTarget`. Expose a way to read+validate just the base prefix
   from a raw `targets.agent-skill` value (e.g. `readBaseArgumentHintPrefix(value)`
   returning `string | undefined`) for the variant `generate` path and the
   `validate` paths, which do not go through `validateAgentSkillTarget`.
4. In `config.ts`, add `"argument-hint-prefix"` to `SELECTED_AGENT_SKILL_FIELDS`;
   add `agentSkillArgumentHintPrefix?: string` to `ProjectConfigVariant`; and in
   `readVariantAgentSkillFrontmatter` (or a sibling reader called from the same
   site, `config.ts:159-163`) read the variant `agent-skill.argument-hint-prefix`,
   validate it via the shared helper with `invalid_config`, and surface the
   trimmed value on the composed variant. Variant resolution rides the existing
   local-else-global composed-variant load — add no new resolution rule (§4.4).
5. In `commands.ts` `executeGenerate`: on the **base** path the target already
   carries `argumentHintPrefix` from `validateAgentSkillTarget`. On the **variant**
   path, after building the target with `validateAgentSkillFrontmatter`, set its
   `argumentHintPrefix` to the resolved prefix = variant prefix
   (`selectedVariant.agentSkillArgumentHintPrefix`) **if present, else** the base
   prefix read via `readBaseArgumentHintPrefix(schema.targets["agent-skill"])`.
   Variant-present replaces base wholesale; no concatenation (§4.4). The base
   prefix is read+validated on the variant path too, so an invalid base prefix
   still surfaces `invalid_target_metadata` even when a variant overrides it.
6. In `commands.ts` `validateDeclaredAgentSkillTarget`: ensure the base prefix is
   read+validated (base path already does via `validateAgentSkillTarget`; the
   variant path must additionally call `readBaseArgumentHintPrefix` so an invalid
   base prefix fails validate with `invalid_target_metadata`). The variant prefix
   is already validated at config-load time, so a `#<variant>` ref surfaces an
   invalid variant prefix as `invalid_config`. No validate-specific special-casing
   (§4.6).
7. Add unit tests: `packages/cli/test/agent-skill-target.test.ts` for base prefix
   accept/trim and the three base-invalid cases (non-string, empty-after-trim,
   multi-line) → `invalid_target_metadata`; `packages/cli/test/config.test.ts`
   (or the existing config/variant unit test file) for variant prefix accept and
   an invalid variant prefix → `invalid_config`, plus that a variant `agent-skill`
   mapping with `argument-hint-prefix` is no longer "field not supported".

**Files modified:** `packages/cli/src/targets/agent-skill.ts`,
`packages/cli/src/config.ts`, `packages/cli/src/commands.ts`,
`packages/cli/test/agent-skill-target.test.ts`,
`packages/cli/test/config.test.ts` (path per the repo's existing config unit
test; adjust if named differently)

**Verification:** `bun run test packages/cli/test/agent-skill-target.test.ts packages/cli/test/config.test.ts`
exits 0. `bun run typecheck` exits 0. `grep -n 'argument-hint-prefix' packages/cli/src/targets/agent-skill.ts packages/cli/src/config.ts`
shows the directive accepted in both the base and variant field sets.
(Full e2e suite still expected red — closed in Task 4.)

**Acceptance criteria:**
- `targets.agent-skill.argument-hint-prefix` is accepted as a sibling of
  `frontmatter`; a valid template/target carries the trimmed prefix on the target
  (AC-2.1, AC-2.2 via Task 1 assembly).
- A non-string, empty/whitespace-only, or multi-line base prefix fails with
  `invalid_target_metadata`, exit 1 (AC-2.3–2.5).
- A selected variant's `agent-skill.argument-hint-prefix` replaces the base
  prefix; an omitted variant prefix falls back to the base; a fully-locked variant
  with a prefix yields prefix-only assembly (AC-5.2, AC-5.3, AC-5.4 — the last via
  Task 1 assembly over an empty form).
- An invalid variant prefix fails with `invalid_config`, exit 1 (AC-5.5).
- `validate <ref>` surfaces an invalid base prefix as `invalid_target_metadata`;
  `validate <ref>#<variant>` surfaces an invalid variant prefix as
  `invalid_config`; a valid prefix validates successfully (AC-7.1–7.3).
- Targeted unit tests pass; `typecheck` passes.

### Task 3: Author durable requirements and new e2e cases

**Objective:** Add the durable functional-requirement entries and the e2e cases
(fixtures + fresh expected goldens) that cover every new spec AC, so the feature
has permanent regression coverage and requirement traceability.

**Input / context:** Builds on Tasks 1–2 (the CLI now emits/validates the field).
Spec §6 acceptance criteria and their Traceability lines; the case/requirement
conventions in `AGENTS.md` (Test Layout). Next-free durable IDs at authoring:
`06-generate.yml` → `GEN-FR-0023`, `12-variants.yml` → `VAR-FR-0011`,
`13-validate.yml` → `VALIDATE-FR-0008` (degree of freedom — confirm/advance if
intervening commits consumed them). Existing case shape is
`test/e2e/cases/<id>/{case.yml,fixture/,expected/files/...}` (see
`generate-all-required` as a template); cases run from the project root and set
`covers: [<FR-ID>.AC-NNNN, ...]`. The e2e harness makes each case its own test
titled `runs e2e case <id> through the real CLI`, filterable with `vitest -t`.

**Steps:**
1. Add new requirement entries to `packages/cli/requirements/functional/06-generate.yml`
   (`GEN-FR-0023`, "Generate emits an argument-hint frontmatter field"),
   `12-variants.yml` (`VAR-FR-0011`, "Variant argument-hint prefix and locked
   exclusion"), and `13-validate.yml` (`VALIDATE-FR-0008`, "Validate covers
   argument-hint prefix defects"). Each entry follows the existing `id/title/
   status/description/acceptance` shape with `acceptance: AC-NNNN` statements that
   map onto the spec ACs they cover (the mapping of spec AC → durable AC is the
   implementer's, per §7).
2. Add e2e cases covering the grammar (FR-1): at minimum a case whose fixture
   template mixes a required string, an optional string, a required enum, an
   optional enum, a required boolean, and an optional boolean, with an expected
   golden whose `argument-hint` line shows every grammar row in declaration order
   (AC-1.1–1.7). `covers:` the `GEN-FR-0023` ACs.
3. Add cases for assembly/emission (FR-3): prefix + inputs (AC-3.1), prefix +
   zero inputs → prefix-only (AC-3.2), no prefix + inputs → form-only (AC-3.3), no
   prefix + zero inputs → **no** `argument-hint` field (AC-3.4), and field
   position after `description`/before passthrough (AC-3.5). Reuse one fixture
   across several where practical.
4. Add reservation cases (FR-4): `argument-hint` in base
   `targets.agent-skill.frontmatter` → `invalid_target_metadata`, exit 1
   (AC-4.1); `argument-hint` in a selected variant's `agent-skill.frontmatter` →
   same (AC-4.2, `covers:` a `VAR-FR` AC).
5. Add variant cases (FR-5): a `#<variant>` ref where locked inputs are absent
   from the form and unlocked inputs appear in declaration order (AC-5.1); a
   variant prefix replacing the base (AC-5.2); a variant omitting its prefix
   falling back to base (AC-5.3); a fully-locked variant with a prefix emitting
   prefix-only (AC-5.4); and an invalid variant prefix → `invalid_config`, exit 1
   (AC-5.5). `covers:` the `VAR-FR-0011` ACs (plus `GEN-FR` where a generate AC).
6. Add base-prefix validation cases (FR-2): valid prefix generates exit 0
   (AC-2.1), prefix prepended with exactly one space and no stray
   leading/trailing/double space (AC-2.2), and non-string / empty-after-trim /
   multi-line prefix → `invalid_target_metadata`, exit 1 (AC-2.3–2.5).
7. Add `--check` and serialization cases (FR-6): a case whose committed golden
   carries the `argument-hint` line and `generate … --check` exits 0 with the
   up-to-date message (AC-6.2); a case whose committed golden **omits** the
   now-derived `argument-hint` line and `--check` exits 1 with `output_stale`
   (AC-6.3); an AC-6.1 serialization assertion is covered by the Task 1 unit test,
   but include a golden whose hint contains `[`, `<`, `|`, `=`, and a leading `-`
   to exercise it end-to-end.
8. Add validate cases (FR-7): `validate <ref>` on an invalid base prefix →
   `invalid_target_metadata` exit 1 (AC-7.1); `validate <ref>#<variant>` on an
   invalid variant prefix → `invalid_config` exit 1 (AC-7.2); `validate <ref>` on
   a valid-prefix template prints `Template <ref> is valid.` exit 0 (AC-7.3).
   `covers:` the `VALIDATE-FR-0008` ACs.
9. Generate each new case's expected golden by running the **built** CLI
   (`bun run build`, then run `node packages/cli/dist/index.js generate
   agent-skill <ref> --out <tmp>` against a copy of the case fixture, or via the
   project's dev binary) and copying the produced bytes into the case's
   `expected/files/.../SKILL.md`. For stderr/exit cases, capture the exact
   `Error: <message>` text into `case.yml`'s `expect.stderr`.

**Files modified:** `packages/cli/requirements/functional/06-generate.yml`,
`packages/cli/requirements/functional/12-variants.yml`,
`packages/cli/requirements/functional/13-validate.yml`, plus new directories
`packages/cli/test/e2e/cases/<new-case-id>/...` (NEW) for each case above
(`case.yml`, `fixture/`, and `expected/files/...` as needed).

**Verification:** For each new case id,
`bun run test:cli:e2e -t "<case-id>"` exits 0. The traceability test
(`vitest run packages/cli/test/e2e -t "traceability"`) exits 0, proving every new
`<AREA>-FR` AC has a covering case and every `covers:` ref resolves. `bun run check`
exits 0 over the new YAML/markdown.

**Acceptance criteria:**
- `GEN-FR-0023`, `VAR-FR-0011`, and `VALIDATE-FR-0008` (or the confirmed next-free
  IDs) exist with `acceptance` entries and `status: active`.
- New e2e cases exist and pass for every spec AC in FR-1 through FR-7, each with
  resolving `covers:` refs.
- The traceability test passes (no uncovered new requirement, no dangling
  `covers:`).
- Each new case's golden was produced by the real CLI, not hand-written.

### Task 4: Regenerate stale goldens and docs; reconcile `AGENTS.md`; run all gates

**Objective:** Bring the whole repository green and current — regenerate every
pre-existing e2e golden made stale by on-by-default derivation, regenerate
`BEHAVIOR.md`, reconcile `AGENTS.md`'s agent-skill claims, and confirm all six
project gates plus the engine/error-code invariants hold.

**Input / context:** Final task; depends on Tasks 1–3 being complete. Spec §4.6
(accepted golden churn, P8), §5 (constraints and done-gates), FR-6 (AC-6.2/6.3),
FR-8 (engine + error-code invariants). The input-bearing existing generate/
variant goldens that now gain a derived `argument-hint` line include (non-
exhaustive; the implementer regenerates **all** stale goldens, not just these):
`generate-all-optional`, `generate-all-required`, `generate-inputs-section`,
`generate-single-optional`, `generate-single-required`, `generate-passthrough`,
`generate-variant-unlocked`, `generate-variant-single-optional`,
`generate-variant-static-locked-value`, `generate-variant-inputs-hidden`, plus
the `generate-check-*`, `global-generate-*`, and `global-path-display-generate`
cases whose committed skills embed inputs. Zero-input cases (`generate-router`,
`generate-long-description`, `generate-force`) only change if their template
declares an `argument-hint-prefix`. `bun run docs:cli:living` regenerates
`packages/cli/docs/BEHAVIOR.md`; there is no automated golden-update script, so
goldens are regenerated by running the built CLI.

**Steps:**
1. `bun run build` to produce a current CLI bundle.
2. Run the full e2e suite (`bun run test:cli:e2e`) once to enumerate every case
   whose committed `expected/files/.../SKILL.md` now mismatches. For each failing
   generate/variant case, regenerate its golden by running the built CLI against
   the case fixture and overwriting the committed `SKILL.md` with the produced
   bytes (the same procedure as Task 3 step 9). Re-run until the suite is green.
3. Confirm the `--check` cases reflect §4.6: `generate-check-up-to-date` (or the
   equivalent) carries the new `argument-hint` line and passes (AC-6.2); a stale
   case (Task 3's AC-6.3 case, or `generate-check-stale`) keeps a golden missing
   the line and still reports `output_stale`.
4. `bun run docs:cli:living` to regenerate `packages/cli/docs/BEHAVIOR.md` from
   the updated requirements and cases; verify `bun run docs:cli:living --check`
   then exits 0.
5. Reconcile `AGENTS.md`: update the prose describing generated Agent Skill
   wrappers to state that wrappers now emit an `argument-hint` frontmatter field
   (author `argument-hint-prefix` intent + derived flag form over unlocked
   inputs), that a literal `argument-hint` is reserved against passthrough in both
   base `targets.agent-skill.frontmatter` and variant `agent-skill.frontmatter`,
   and that the base `targets.agent-skill.argument-hint-prefix` and per-variant
   `agent-skill.argument-hint-prefix` directives exist. Add the spec link to the
   relevant Architecture-Decisions area, per the `AGENTS.md` update rule. Touch
   no claims unrelated to this feature.
6. Verify the FR-8 invariants: `git diff --stat packages/engine` reports no
   changes to engine source/exports/types (AC-8.1); the `JastrErrorCode` union
   gained no new member (AC-8.2).
7. Run every gate to green: `bun run check`, `bun run typecheck`, `bun run test`,
   `bun run test:cli:e2e`, `bun run docs:cli:living --check`, `bun run build`.

**Files modified:** the stale `packages/cli/test/e2e/cases/*/expected/files/**/SKILL.md`
goldens (regenerated), `packages/cli/docs/BEHAVIOR.md` (regenerated), `AGENTS.md`
(and `CLAUDE.md` only if it is a real file rather than the symlink — it is a
symlink, so editing `AGENTS.md` suffices)

**Verification:** All of the following exit 0, captured in order:
`bun run check`; `bun run typecheck`; `bun run test`; `bun run test:cli:e2e`;
`bun run docs:cli:living --check`; `bun run build`. Additionally
`git diff --stat packages/engine` is empty and `git grep -n` over the
`JastrErrorCode` definition shows no added member.

**Acceptance criteria:**
- Every pre-existing stale golden is regenerated; the full e2e suite passes.
- `generate … --check` exits 0 against a matching committed file (AC-6.2) and
  exits 1 with `output_stale` against one missing the derived line (AC-6.3).
- `packages/cli/docs/BEHAVIOR.md` is regenerated and `docs:cli:living --check`
  exits 0.
- `AGENTS.md` describes the `argument-hint` emission, the prefix directives, and
  the reservation, and links the spec; no unrelated claim is changed.
- `@jastr/engine` source/exports/types are unchanged (AC-8.1) and no new
  `JastrErrorCode` member exists (AC-8.2).
- All six gates exit 0.

## Notes

- **No parallelization.** Tasks run in plan order; the only dependency is "the
  previous task ran first."
- **Intermediate red is expected.** Per the Sequencing note, the full e2e suite
  is red between the end of Task 1 and the end of Task 4. This is the on-by-
  default golden churn the spec accepts (§4.6), not a regression to fix early.
- **No engine edits.** If any task tempts an edit under `packages/engine/`, stop —
  the spec constrains the feature to `@jastr/cli` (§5, FR-8). The engine already
  exposes name/type/required/default/description, which is everything derivation
  needs.
