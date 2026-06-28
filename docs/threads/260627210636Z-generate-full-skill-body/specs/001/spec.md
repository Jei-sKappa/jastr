---
version: 1
status:
  approved: 260628101300Z
---

# Spec: `inline` rendered-skill mode for `jastr generate agent-skill`

## Intended outcome

`jastr generate agent-skill <template-ref> --out <path> --mode=inline` writes a
**single, self-contained `SKILL.md`** to `--out`: the same YAML frontmatter the
existing wrapper carries, with the **fully-rendered template body inlined
underneath** (includes resolved, conditionals evaluated, interpolations
substituted) instead of the current "go run `jastr`" stub. The committed file
runs as a Claude Code Agent Skill on a machine with **no `jastr` installed** —
nothing is shelled out at invocation time.

This unblocks distributing jastr-authored skills through channels (e.g. `npx
skills add`) that install one standalone `SKILL.md` and nothing else, while the
authoring/CI side keeps using stock `jastr` to render and commit the file.

## Context

A skills repo (~32 standalone `SKILL.md` files) is being migrated onto jastr
templates to kill copy-paste drift (shared boilerplate into `include` partials;
families like `review-*` collapsed into one template routed by a `target`
input). The blocker: consumers receive one self-contained `SKILL.md` with no
jastr downstream, so the existing wrapper — which shells out to `jastr run` at
invocation — cannot ship.

Today the two halves needed for a self-contained file come from two commands by
design: `jastr run <ref>` produces the rendered body but no frontmatter, and
`jastr generate agent-skill <ref> --out` produces frontmatter
(`name`/`description`/`argument-hint`) but a wrapper-stub body. No single command
emits frontmatter + inlined rendered body. This spec adds that third output as a
**mode of the existing target** rather than a new target or command.

The genesis design discussion that settled the shape is
`seed/discussions/260627214826Z-inline-agent-skill-mode-decision-log.md`
(decisions P1–P4); this spec elaborates those decisions and cites each where it
becomes operative.

## Scope

### In scope

- A new `--mode <router|inline>` option on `jastr generate agent-skill`,
  defaulting to `router` (per P1).
- `inline` mode: resolve every template input at generate time, render the
  template body once, and write `frontmatter + body` to `--out`.
- Reuse of the existing input-resolution pipeline, render pipeline, frontmatter
  assembly, `argument-hint-prefix` resolution, and `--check` byte-comparison.
- Threading `--mode=inline` into the inline-mode `--check`/`output_missing`/
  `output_stale` suggested-fix messages (per P4).
- Functional-requirement and e2e coverage following the repo's existing test
  conventions, and regeneration of `packages/cli/docs/BEHAVIOR.md`.
- Documentation updates (`AGENTS.md`, `README.md`) reconciling the now-stale
  "`generate agent-skill` is hardwired to the wrapper-body shape" claims.

### Out of scope (non-scope)

- **No new `targets.skill` and no new `generate skill` / `generate
  agent-skill-*` command** (rejected in P1; this is a *mode*, not a new target or
  command).
- **No engine change**: no new `targets` key, no schema change, and **no new
  `JastrErrorCode` literal** (per P1 and P4). The feature is CLI-only.
- **No dedicated per-mode `argument-hint` field** (Option B, deferred in P3) and
  **no first-class runtime-`$ARGUMENTS` template concept** (Option C, parked in
  P3).
- **No `mode` directive in template frontmatter** (`targets.agent-skill.mode`
  rejected in P1 — mode is a generate-time output concern).
- **No change to `router` mode's output** — existing wrappers stay byte-identical.
- **No `validate --mode` flag** — `validate` stays mode-agnostic (per P4).
- **No stdout/streaming variant** — `inline` writes to `--out` like the rest of
  `generate` (a stdout mode was never requested; `jastr run` already streams the
  body without frontmatter).
- **No reconstruction of input flags** into `--check` suggested-fix messages
  (per P4).

## Constraints

- **CLI-only, engine untouched.** All logic lives in `@jastr/cli`. The engine is
  not modified — no new `targets` key, no schema change, no new `JastrErrorCode`
  (P1, P4). The unresolved-required-input path reuses the engine's existing
  `missing_required_input`; argv-shape rejections reuse the existing
  `invalid_command` (the documented argv-shape code).
- **Maximal reuse.** `inline` resolves inputs through the *same* path
  `run` uses (`executeRun`, `packages/cli/src/commands.ts:38-102`): composed
  config inputs + coerced CLI flags + variant locked-inputs, with the same
  locked-flag conflict check. It renders via the existing
  `renderTemplateSource`. It assembles frontmatter and resolves
  `argument-hint-prefix` (base + variant-shadow) exactly as the router path does
  (`packages/cli/src/commands.ts:147-167`, `buildAgentSkillContent`
  `packages/cli/src/targets/agent-skill.ts:239-252`). It byte-compares via the
  existing `checkAgentSkillOutput`
  (`packages/cli/src/targets/agent-skill.ts:421-454`). New code is the wiring
  between these, not reimplementations of them (P2, P3).
- **Determinism.** Inline output must be byte-deterministic so `--check`'s exact
  `Buffer` comparison never flaps (it already does no EOL/BOM normalization).
- **Error UX unchanged.** Every failure prints `Error: <message>` to stderr with
  exit code 1; the exit-0 informational paths are unchanged.
- **Backward compatibility.** With no `--mode` (or `--mode=router`), behavior and
  output are byte-identical to today (P1).
- **No Bun-specific runtime APIs** in `@jastr/cli` source (Node-compatibility
  rule).
- **Green gate.** `bun run check`, `bun run typecheck`, `bun run test`, `bun run
  test:cli:e2e`, `bun run docs:cli:living --check`, and `bun run build` must all
  exit 0.

## Expected behavior

Settled decisions are inlined below and cited to the decision log
(`seed/discussions/260627214826Z-inline-agent-skill-mode-decision-log.md`).

1. **Mode selection.** `generate agent-skill` accepts `--mode <value>`. Accepted
   values are exactly `router` and `inline`. Omitting `--mode` means `router`.
   Any other value, and `--mode` with no value, fails as `invalid_command` with a
   clear message (P1, P4).

2. **Router mode is unchanged.** `--mode=router` (and the no-flag default)
   produces exactly today's wrapper: sampled static render for validation, the
   A/B/C/D body shapes, derived `argument-hint` form, inlined `--name=<value>`
   placeholders. Output bytes are identical to the current implementation (P1).

3. **Inline body.** `--mode=inline` performs a **single real render** of the
   template with the fully-resolved effective inputs (the same render `run`
   performs — not the sampled render used by router/`validate`), and writes:

   ```text
   ---
   <frontmatter yaml>
   ---

   <rendered body>
   ```

   i.e. the existing frontmatter header (`---\n` + `YAML.stringify(frontmatter)`
   trimmed + `\n---`) followed by exactly one blank line, then the render output
   **verbatim** (no trimming, no added or stripped trailing newline). None of the
   router body scaffolding appears in inline output — no `## Inputs` section, no
   single-input sentence, no command block, no failure-line instruction (P4
   detail 3). On a successful (non-`--check`) write, stdout reports success in
   the same form the router path emits today (`Generated <path> from template
   <source>`) — reused, not reinvented.

4. **Inline input resolution.** Inline resolves inputs through the same pipeline
   as `run`, with the same precedence: **CLI flags > local config > global config
   > template-author defaults**, plus variant locked-inputs from a `<ref>#<variant>`
   ref. A CLI flag that collides with a locked input is rejected exactly as `run`
   rejects it (`locked_input_flag`). For a **named** ref, composed `config.yml`
   `inputs.<ref>` and `variants.<ref>.<variant>` participate; for a **direct
   `.md`** ref, neither config nor variants apply (only CLI flags + defaults),
   matching `run` (P2).

5. **Unresolved required input is a hard error.** If, after resolution, a
   required input has no value and no default, inline generation fails with the
   engine's existing `missing_required_input` (`Required input <name> is
   missing.`) and exit 1. No `<value>` placeholder is emitted (P2).

6. **Inline frontmatter and `argument-hint`.** Inline emits the **same**
   `targets.agent-skill` frontmatter the router carries: `name`, `description`,
   and validated passthrough fields, with variant `agent-skill.frontmatter`
   overlaid when a variant is selected. `targets.agent-skill` is **required** for
   inline just as for router; its absence fails with `missing_target_metadata`.
   The `argument-hint` field is populated by reusing `argument-hint-prefix`
   (base, replaced wholesale by a selected variant's
   `agent-skill.argument-hint-prefix`): because every input is resolved at
   generate time the derived **form is empty**, so `argument-hint` is the author
   prefix **verbatim** when a prefix exists, and is **omitted entirely** when no
   prefix exists. The derived flag-form is never emitted in inline output (P3).

7. **Input flags are mode-gated.** Template input flags (e.g. `--target=spec`)
   are accepted **only** in `inline` mode. In `router` mode, supplying any
   template input flag is an `invalid_command` argv-shape error (router emits
   placeholders and needs no values) (P1, P2).

8. **`--check` parity with mode-aware messages.** `--mode=inline --check` rebuilds
   the inline content in memory and byte-compares it against `--out`, writing
   nothing: exit 0 with the up-to-date message on an exact match, `output_stale`
   when bytes differ, `output_missing` when no file exists. The `output_missing`
   and `output_stale` messages' suggested-fix commands include `--mode=inline`
   (and `--force` for stale); they do **not** reconstruct input flags. Because
   the suggested-fix omits input flags, it reproduces the committed file exactly
   only when the inputs come from the ref (`#variant`) or `config.yml`; an inline
   skill generated with ad-hoc input flags should be pinned to a variant or
   config so its regen command stays self-contained. `--check`
   composes with `--force` exactly as today (their mutual exclusion is unchanged)
   (P4 details 2 & 4).

9. **`validate` is mode-agnostic.** `jastr validate <ref>` is unchanged: no
   `--mode` flag, sampled static render plus `targets.agent-skill` metadata
   validation when declared. It does not check whether inline inputs are
   resolvable — that is a `generate --mode=inline` / `--check` concern (P4 detail 1).

## Acceptance criteria

Tier 2 → machine-checkable. Each FR cites the decision(s) it enforces; every
expected behavior above maps to at least one AC below.

**FR-1 — `--mode` option and validation** (enforces P1, P4 detail 4; covers behavior 1)
- AC-1.1 `generate agent-skill <ref> --out <p>` with no `--mode` produces the
  router wrapper (exit 0).
- AC-1.2 `--mode=router` and `--mode=inline` are both accepted (exit 0 on an
  otherwise valid invocation).
- AC-1.3 `--mode=<anything-else>` exits 1 with `Error: <message>` and
  `JastrErrorCode` `invalid_command`.
- AC-1.4 `--mode` with no value exits 1 with `invalid_command`.

**FR-2 — Router mode unchanged** (enforces P1; covers behavior 2)
- AC-2.1 For a fixture exercising each router body shape (A/B/C/D), the bytes of
  `--mode=router` output equal the bytes of the pre-change `generate agent-skill`
  output for the same ref.
- AC-2.2 The pre-existing `generate agent-skill` e2e suite passes unmodified.

**FR-3 — Inline body composition** (enforces P2, P4 detail 3; covers behavior 3)
- AC-3.1 Inline output for a template with an `include` partial contains the
  included content inlined (not an `include` directive).
- AC-3.2 Inline output for a template with an `if`/`else` branch on a resolved
  input contains only the selected branch's text.
- AC-3.3 The file is exactly `---\n<yaml>\n---\n\n<body>`: a single blank line
  separates the closing `---` from the body, and the body equals
  `renderTemplateSource`'s markdown verbatim.
- AC-3.4 Inline output contains none of: a `## Inputs` section, the
  construct-flags instruction sentence, a ```` ```bash jastr run ```` block, or
  the "If the command exits non-zero…" failure line.
- AC-3.5 A successful inline write prints the same `Generated <path> from
  template <source>` success message the router path prints (exit 0).

**FR-4 — Inline input resolution reuses run's pipeline** (enforces P2; covers behavior 4)
- AC-4.1 An input set via `config.yml inputs.<ref>` is reflected in inline output
  with no CLI flag passed.
- AC-4.2 A CLI flag overrides a `config.yml` value for the same input in inline
  output (flags > config).
- AC-4.3 `generate agent-skill <ref>#<variant> --out <p> --mode=inline` bakes the
  variant's locked-input values into the body.
- AC-4.4 A CLI flag naming a locked input (with a `<ref>#<variant>` ref) exits 1
  with `locked_input_flag`.
- AC-4.5 For a direct `.md` ref, `config.yml` and variants are ignored;
  resolution uses CLI flags + author defaults only (consistent with `run`).

**FR-5 — Unresolved required input is a hard error** (enforces P2; covers behavior 5)
- AC-5.1 Inline generation of a template with an unresolved required input exits
  1 with `missing_required_input` and the message `Required input <name> is
  missing.`; no file is written and no `<value>` placeholder appears.

**FR-6 — Inline frontmatter and `argument-hint`** (enforces P1, P3; covers behavior 6)
- AC-6.1 Inline frontmatter contains `name` and `description` from
  `targets.agent-skill.frontmatter` and all validated passthrough fields.
- AC-6.2 With a `targets.agent-skill.argument-hint-prefix` declared, inline
  frontmatter's `argument-hint` equals that prefix verbatim (no `--flag` form
  appended).
- AC-6.3 With no prefix declared, inline frontmatter omits `argument-hint`
  entirely.
- AC-6.4 With a selected variant declaring `agent-skill.argument-hint-prefix`,
  the variant prefix replaces the base prefix wholesale in `argument-hint`.
- AC-6.5 A template lacking `targets.agent-skill` exits 1 with
  `missing_target_metadata` in inline mode.

**FR-7 — Input flags mode-gated** (enforces P1, P2; covers behavior 7)
- AC-7.1 `--mode=router` with any template input flag exits 1 with
  `invalid_command`.
- AC-7.2 `--mode=inline` with a declared input flag is accepted and resolves that
  input.

**FR-8 — `--check` parity and mode-aware messages** (enforces P4 details 2 & 4; covers behavior 8)
- AC-8.1 `--mode=inline --check` against a byte-matching file exits 0 with the
  up-to-date message and writes nothing.
- AC-8.2 `--mode=inline --check` against a differing file exits 1 with
  `output_stale`, and the message's suggested-fix command contains `--mode=inline`
  and `--force`.
- AC-8.3 `--mode=inline --check` against a missing file exits 1 with
  `output_missing`, and the message's suggested-fix command contains
  `--mode=inline`.
- AC-8.4 `--mode=inline --check --force` is rejected exactly as the existing
  `--check`/`--force` combination is (unchanged behavior).

**FR-9 — `validate` unchanged** (enforces P4 detail 1; covers behavior 9)
- AC-9.1 `validate <ref>` accepts no `--mode` flag and its output/exit behavior
  is byte-identical to today for the same ref.

**FR-10 — Engine untouched / no new error code** (enforces P1, P4)
- AC-10.1 The `JastrErrorCode` union literal set is unchanged by this feature
  (diff adds no member).
- AC-10.2 `packages/engine` source is unchanged by this feature (no schema,
  render, or error-module edits required to ship it).

**FR-11 — Test and documentation currency** (enforces the repo update rule)
- AC-11.1 New functional requirements and e2e cases cover the inline behaviors
  above, following the repo's `<AREA>-FR-<NNNN>` / `AC-NNNN` and
  `test/e2e/cases/<case-id>/` conventions, traced via `covers:`.
- AC-11.2 `bun run docs:cli:living --check` exits 0 (BEHAVIOR.md regenerated).
- AC-11.3 `AGENTS.md` and `README.md` no longer assert that `generate
  agent-skill` only emits the wrapper-body shape; they document `--mode` and the
  inline output.
- AC-11.4 The full gate (`check`, `typecheck`, `test`, `test:cli:e2e`,
  `docs:cli:living --check`, `build`) exits 0.

## Degrees of freedom

The *what* above is pinned. These *hows* are deliberately the implementer's
choice:

- **Internal structure of the reuse.** How the shared input-resolution is
  factored out of `executeRun` (extract a helper vs. parameterize), where the
  inline content builder lives (a sibling of `buildAgentSkillContent` vs. a
  `mode` parameter that swaps only the body while sharing the frontmatter-header
  assembly), and how the resolved `AgentSkillTarget` is shared between modes.
- **Commander wiring for mode-gated flags.** How `--mode` is declared and how
  template input flags are passed through to the run-flag parser only for inline
  (e.g. always collect passthrough flags and reject any in router mode vs. a
  mode-conditional parse) — as long as behavior 7 holds.
- **Validation ordering when multiple defects coexist.** Which error surfaces
  first if, say, both `targets.agent-skill` is missing and a required input is
  unresolved — any order is acceptable provided each defect is caught on its own.
- **Exact wording** of new/edited error and status messages, provided the
  `JastrErrorCode`s are the reused ones above and the inline `--check` messages
  name `--mode=inline` per AC-8.2/8.3.
- **Test fixture and case specifics** — case ids/slugs, FR-area file, the
  template fixtures used to exercise includes/conditionals/variants — provided
  coverage and traceability (FR-11) hold.

There are no degrees of freedom in the **output byte format** (behavior 3),
the **resolution precedence** (behavior 4), the **`argument-hint` rule**
(behavior 6), or the **no-new-error-code / CLI-only** constraint — these are
pinned.

## Unresolved questions

These do **not** block implementation:

- **Body beginning with `---`.** If a rendered body's first line is `---`, the
  file becomes `---\n<yaml>\n---\n\n---\n…`. This is expected to be benign
  (YAML frontmatter parsers stop at the first closing `---`), and no guarding is
  specified. Flagged only so the implementer adds a fixture confirming it and
  raises it back if a real consumer mis-parses it; it is not a pinned requirement
  to handle specially.
