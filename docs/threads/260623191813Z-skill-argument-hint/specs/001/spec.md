---
version: 1
status: {}
---

# Spec 001 — `argument-hint` in generated Agent Skill wrappers

> Decisions cited below as `(P<N>)` refer to the genesis decision log at
> `seed/discussions/260623193024Z-argument-hint-design-decision-log.md`. Each
> citation marks where a settled decision becomes operative; the log holds the
> full rationale.

## 1. Intended outcome

`jastr generate agent-skill` emits an `argument-hint` frontmatter field in the
generated Agent Skill wrapper. The field previews, during `/skill` autocomplete,
the parameters the skill maps a request onto: an author-supplied **intent**
prefix followed by an auto-derived **form** suffix listing the template's inputs
as flags (`--manifest=<value> [--mode=new|merge]`). `argument-hint` is a
recognized Claude Code Agent Skill frontmatter field (verified against the
official skills frontmatter reference), so the emitted field is consumed by the
host as the autocomplete hint.

## 2. Context

Generated wrappers already auto-derive their body (four shapes by input count)
and their runnable command (inline `--flag=<value>` for required inputs), but
carry no `argument-hint`. A template author can only convey *form* through the
schema; jastr can derive that form mechanically, but it cannot derive a
description of the template's *intent* — which is exactly what an autocomplete
hint most wants to show (P1). This spec adds intent (author prefix) + form
(derived flags) as the `argument-hint`. The feature was designed end-to-end in
the genesis discussion (P1–P8); this spec elaborates those decisions into a
buildable contract. Thread tier is 2 (feature carrying a design decision), so
machine-checkable acceptance criteria are mandatory.

A literal `argument-hint` declared inside `targets.agent-skill.frontmatter`
currently passes through verbatim (via `collectPassthroughFrontmatter` in
`packages/cli/src/targets/agent-skill.ts`). Because the field becomes
jastr-managed, that passthrough is now closed off (P2, P7).

## 3. Scope / Non-scope

**In scope** (all CLI-only, in `@jastr/cli`):

- A base directive key `targets.agent-skill.argument-hint-prefix` (P3).
- A per-variant directive key `agent-skill.argument-hint-prefix` in
  `.jastr/config.yml`, replacing the base when present (P6).
- Deriving the flag portion from the unlocked inputs (P4, P6).
- Assembling and emitting the `argument-hint` field (P5).
- Reserving `argument-hint` against author passthrough (P2, P7).
- Validation of the new directives, reusing existing error codes (P7).
- `jastr validate` coverage of the new directives (P8).
- Test/fixture/golden regeneration, new e2e cases, `BEHAVIOR.md` regeneration,
  `AGENTS.md` reconciliation (P8).

**Out of scope / non-goals:**

- **No engine change.** `@jastr/engine` is untouched: its input schema already
  carries name/type/required/default/description, which is everything the
  derivation needs (P8).
- **No full-literal `argument-hint` override** and **no concatenation of an
  author-written `argument-hint`** — there is exactly one author knob, the
  prefix; derived flags are always appended (P2).
- **No per-input semantic placeholders** (e.g. `<file>` instead of `<value>`).
  Derivation uses a uniform `<value>` placeholder; per-input placeholders are a
  deliberately deferred future extension that needs new schema metadata (P4).
- **No new `JastrErrorCode`** (P7).
- **No migration of committed product skills** (none are tracked; `playground/`
  is gitignored). Churn is confined to tests/fixtures/goldens (P8).

## 4. Expected behavior

References to "inputs" below mean **unlocked** inputs: for a bare template, all
declared inputs; for a `#<variant>` ref, the declared inputs minus the variant's
`locked-inputs` (P6), using the existing `listUnlockedTemplateInputs` helper.

### 4.1 Base prefix directive (P3, P7)

- `targets.agent-skill` accepts a new optional key `argument-hint-prefix`,
  declared as a **sibling** of `frontmatter` (not inside it).
- When present it must be a **string**, **non-empty after trimming**, and
  **single-line** (no `\n` / `\r`). It has no maximum length.
- The value is **`.trim()`-ed** before use and is consumed verbatim otherwise —
  it is metadata, not a rendered template fragment (it is not interpolated and
  not passed through the template engine, consistent with how `name` /
  `description` are handled today).

### 4.2 Derived flag portion (P4)

Each input renders to one token; tokens are joined by single spaces in
**declaration order**:

| input type | required | optional |
| --- | --- | --- |
| string | `--name=<value>` | `[--name=<value>]` |
| enum | `--name=v1\|v2\|v3` | `[--name=v1\|v2\|v3]` |
| boolean | `--name` | `[--name]` |

Rules:

- Required → bare token; optional → the same token wrapped in `[ ]`.
- String → uniform `<value>` placeholder.
- Enum → the declared values joined by `|`, in declared order, in place of the
  placeholder.
- Boolean → flag name only, no placeholder (its absence signals "no value").
- Separator is `=` (matching jastr's real flag grammar, which rejects
  `--name value`, and the runnable body command).

### 4.3 Assembly and emission (P5)

Let `prefix` be the trimmed prefix (empty if undeclared) and `derived` be the
space-joined flag portion (empty if there are no unlocked inputs). The emitted
`argument-hint` value is:

- both present → `"<prefix> <derived>"` (exactly one joining space);
- prefix only (no unlocked inputs) → `"<prefix>"`;
- derived only (no prefix) → `"<derived>"`;
- neither → the `argument-hint` field is **omitted entirely**.

The field, when emitted, is inserted **immediately after `description`** and
before any author passthrough `frontmatter` fields, so emitted order is
`name`, `description`, `argument-hint`, `<passthrough…>`.

The four body shapes (A/B/C/D) are **unchanged** — `argument-hint` is purely a
frontmatter addition. A zero-input template with a prefix still renders body
Shape A and gains `argument-hint: <prefix>`.

### 4.4 Variants (P6)

- Locked inputs are excluded from the derived portion (they are fixed, not
  user-providable); unlocked inputs appear in declaration order.
- `.jastr/config.yml` variant entries accept an optional
  `agent-skill.argument-hint-prefix` (sibling of `agent-skill.frontmatter`),
  validated by the same rules as the base prefix.
- When a selected variant declares `argument-hint-prefix`, it **replaces** the
  base prefix wholesale; when it does not, the base prefix applies. (No
  cross-root or base/variant concatenation.) Variant resolution rides on the
  existing local-else-global composed-variant loading; no new resolution rule.

### 4.5 Validation and errors (P2, P7)

- Invalid base `argument-hint-prefix` (non-string / empty-after-trim /
  multi-line) → `JastrError("invalid_target_metadata", …)`.
- Invalid variant `argument-hint-prefix` → `JastrError("invalid_config", …)`.
- `argument-hint` declared in base `targets.agent-skill.frontmatter` **or** in a
  variant's `agent-skill.frontmatter` is **rejected** as a reserved field →
  `invalid_target_metadata` (it flows through the shared
  `collectPassthroughFrontmatter` path for both).
- All failures honor the existing CLI error UX: `Error: <message>` to stderr,
  exit code 1. No new `JastrErrorCode` is introduced.

### 4.6 Serialization, `--check`, and `validate` (P8)

- The `argument-hint` value (which may contain `<`, `>`, `[`, `]`, `|`, `=`, and
  a leading `-`) is serialized through the existing `YAML.stringify` path, never
  hand-built, so quoting is correct and output is deterministic.
- Generation stays deterministic, so `generate … --check` byte-compares the
  rebuilt content (including any `argument-hint` line) against the committed
  file: exact match → exit 0 (`agent-skill at <out> is up to date.`); difference
  → `output_stale`; missing file → `output_missing`. Because derivation is on by
  default, every committed wrapper for an input-bearing template that predates
  this feature reports stale until regenerated (accepted churn).
- `jastr validate <ref>` and `jastr validate <ref>#<variant>` surface the new
  prefix/reservation defects with the codes above, with no validate-specific
  special-casing (validate already validates declared agent-skill target
  metadata and resolves the selected variant).

## 5. Constraints

- **CLI-only.** All logic lives in `@jastr/cli`. `@jastr/engine`'s public API,
  exports, and types are unchanged; the engine imports no new dependencies (P8).
- **No new `JastrErrorCode`.** Reuse `invalid_target_metadata` (base /
  reservation) and `invalid_config` (variant) (P7).
- **Single author knob.** The prefix is the only author input to the hint; a
  literal `argument-hint` is reserved, never an override or a concatenation
  source (P2).
- **Deterministic, byte-stable output** via `YAML.stringify`; `--check` remains
  exact-UTF-8-byte comparison with no normalization (P8).
- **Uniform error UX:** `Error: <message>` on stderr, exit 1 for every failure.
- **Node-compatible source** in both packages (no Bun-specific runtime APIs).
- **Living docs stay current:** `packages/cli/docs/BEHAVIOR.md` regenerated and
  `AGENTS.md` claims about agent-skill generation reconciled before done (P8).

## 6. Acceptance criteria

Spec-local functional requirements (`FR-<n>`) and acceptance criteria
(`AC-<n>.<m>`). Every AC is a pass/fail assertion checkable by an e2e case or
unit test. The **Traceability** line ties each FR to its source decision and to
the project requirement area where the implementer adds the durable
`<AREA>-FR-<NNNN>` requirement(s) and e2e `covers:` refs.

### FR-1 — Derived flag grammar

- AC-1.1 A required `string` input renders `--name=<value>`.
- AC-1.2 An optional `string` input renders `[--name=<value>]`.
- AC-1.3 A required `enum` input renders `--name=` followed by its values joined
  by `|` in declared order.
- AC-1.4 An optional `enum` input renders the same wrapped in `[ ]`.
- AC-1.5 A required `boolean` input renders `--name` (no placeholder).
- AC-1.6 An optional `boolean` input renders `[--name]`.
- AC-1.7 Multiple inputs render in declaration order, joined by single spaces.

Traceability: P4. Area `06-generate.yml` (GEN-FR).

### FR-2 — Base prefix directive

- AC-2.1 `targets.agent-skill.argument-hint-prefix` is accepted as a sibling of
  `frontmatter` and a valid template generates successfully (exit 0).
- AC-2.2 The trimmed prefix is prepended to the derived portion with exactly one
  space (no leading/trailing/double space in the emitted value).
- AC-2.3 A non-string prefix fails with `invalid_target_metadata`, exit 1,
  `Error:`-prefixed stderr.
- AC-2.4 An empty / whitespace-only prefix fails the same way.
- AC-2.5 A multi-line prefix (containing `\n` or `\r`) fails the same way.

Traceability: P3, P7. Area `06-generate.yml` (GEN-FR).

### FR-3 — Assembly and emission

- AC-3.1 Prefix + inputs → `argument-hint: "<prefix> <derived>"`.
- AC-3.2 Prefix + zero unlocked inputs → `argument-hint: "<prefix>"`.
- AC-3.3 No prefix + inputs → `argument-hint: "<derived>"`.
- AC-3.4 No prefix + zero unlocked inputs → **no** `argument-hint` field in the
  output.
- AC-3.5 The emitted `argument-hint` appears immediately after `description` and
  before any passthrough frontmatter field.
- AC-3.6 Body shapes A/B/C/D are byte-identical to pre-feature output except for
  the added frontmatter field (no body change).

Traceability: P5. Area `06-generate.yml` (GEN-FR).

### FR-4 — Reservation of `argument-hint`

- AC-4.1 `argument-hint` in base `targets.agent-skill.frontmatter` fails with
  `invalid_target_metadata`, exit 1.
- AC-4.2 `argument-hint` in a selected variant's `agent-skill.frontmatter` fails
  the same way.

Traceability: P2, P7. Areas `06-generate.yml` (GEN-FR), `12-variants.yml`
(VAR-FR).

### FR-5 — Variant interaction

- AC-5.1 For a `#<variant>` ref, locked inputs do not appear in the derived
  portion; unlocked inputs do, in declaration order.
- AC-5.2 A variant `agent-skill.argument-hint-prefix` replaces the base prefix
  in the emitted hint.
- AC-5.3 When a variant omits `argument-hint-prefix`, the base prefix is used.
- AC-5.4 A variant that locks every declared input and declares a prefix emits
  `argument-hint: "<variant-prefix>"` (prefix-only).
- AC-5.5 An invalid variant `argument-hint-prefix` fails with `invalid_config`,
  exit 1.

Traceability: P6, P7. Area `12-variants.yml` (VAR-FR).

### FR-6 — Serialization and `--check`

- AC-6.1 An `argument-hint` value containing `[`, `<`, `|`, `=`, and a leading
  `-` is emitted as valid YAML that round-trips to the intended string.
- AC-6.2 `generate … --check` against a committed file that matches the rebuilt
  content (including the `argument-hint` line) exits 0 with the up-to-date
  message.
- AC-6.3 `generate … --check` against a committed file missing the now-derived
  `argument-hint` line exits 1 with `output_stale`.

Traceability: P8. Area `06-generate.yml` (GEN-FR).

### FR-7 — `validate` coverage

- AC-7.1 `jastr validate <ref>` reports an invalid base `argument-hint-prefix`
  with `invalid_target_metadata`, exit 1.
- AC-7.2 `jastr validate <ref>#<variant>` reports an invalid variant
  `argument-hint-prefix` with `invalid_config`, exit 1.
- AC-7.3 `jastr validate <ref>` on a template with a valid prefix prints
  `Template <ref> is valid.` and exits 0.

Traceability: P8. Area `13-validate.yml` (VALIDATE-FR).

### FR-8 — Engine and error-code invariants

- AC-8.1 `@jastr/engine`'s exported API surface and types are unchanged by this
  feature (no diff to `packages/engine/src/index.ts` exports).
- AC-8.2 No new value is added to `JastrErrorCode`.

Traceability: P7, P8. Areas `06-generate.yml` (GEN-FR), `12-variants.yml`
(VAR-FR).

**Coverage note:** every behavior in §4 maps to at least one AC — grammar
(FR-1), base prefix + trim + validation (FR-2), assembly/empty-cases/position/
body-unchanged (FR-3), reservation (FR-4), variant locked-exclusion + override
(FR-5), serialization + `--check` churn (FR-6), validate (FR-7), engine/code
invariants (FR-8). Done also requires the gates in §5: `bun run check`,
`typecheck`, `test`, `test:cli:e2e`, `docs:cli:living --check`, `build` all exit
0, with `BEHAVIOR.md` regenerated and `AGENTS.md` reconciled.

## 7. Degrees of freedom

The *what* above is pinned. The following *hows* are explicitly granted to the
implementer:

- **Exact error-message wording.** Only the `JastrErrorCode`, the `Error:`
  prefix, and exit 1 are pinned; the human-readable message text for the new
  prefix-validation failures is the implementer's choice (the existing
  reserved-field message is reused as-is for the `argument-hint` reservation).
- **Code decomposition.** Whether the derivation/assembly lives inline in
  `targets/agent-skill.ts` or in a new helper, function names, and how the
  prefix threads from base/variant into `buildAgentSkillContent`.
- **Order of validation checks** when a template/config carries multiple defects
  at once — any order is fine provided each individual defect surfaces its
  specified code.
- **Durable requirement IDs and e2e case slugs.** Assign the next free
  sequential IDs at implementation time (at authoring: `06-generate.yml` is at
  `GEN-FR-0022`, `12-variants.yml` at `VAR-FR-0010`, plus `VALIDATE-FR`); the
  exact numbers and the kebab case-id slugs are the implementer's, as is how ACs
  here map onto those durable requirements' `acceptance` entries and `covers:`
  refs.
- **Fixture/golden mechanics.** How affected goldens are regenerated and which
  representative templates the new fixtures use.

## 8. Unresolved questions

These do **not** block emission or implementation:

- **Pathological enum values.** Per P4 the derived portion joins enum values
  with `|` verbatim. An enum whose value itself contains `|`, a space, or `=`
  would render a visually ambiguous hint. No escaping was decided; the
  implementer should ship the plain verbatim join (exactly P4) and **not**
  invent escaping. If ambiguous enum values ever matter in practice, escaping is
  a future decision to take back to discussion — not to bake in here.
