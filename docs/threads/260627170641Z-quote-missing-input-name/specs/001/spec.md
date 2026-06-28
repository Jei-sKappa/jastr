---
version: 1
status:
  approved: 260627212538Z
  amended: 260628103921Z
---

# Spec — backtick-quoting convention for interpolated value tokens in CLI messages

> **Erratum — 260628103921Z (owner-authorized, record-backed).** The file-level
> framing in **AC-6.2**, the **§5 "Affected surface"** parenthetical, and the
> title of **FR-6** is **superseded**: the backtick convention now also applies
> to the **non-Markdown** `Error:`/stdout validation and info messages emitted by
> `packages/cli/src/targets/agent-skill.ts` (field names, the base
> `argument-hint-prefix` config-key label, output paths, and the
> generate/regenerate command suggestions). Only the **generated agent-skill
> Markdown body** stays excluded — so **§3 non-scope** and **AC-6.1** are
> unchanged and remain accurate. The original clauses below are retained and
> annotated inline as superseded, for audit. Authorized by the thread owner and
> backed by
> `implementation/discussions/260628100200Z-backtick-review-findings-decision-log.md`
> (P1); implemented in
> `implementation/260628103624Z-agent-skill-message-quoting-implementation-report.md`
> (commit `3ef1106`). Gap surfaced by
> `implementation/reviews/260628085952Z-backtick-quoting-convention-implementation-review.md`.

> **Decision provenance.** Every `P<N>` citation below refers to the genesis
> decision log at
> `seed/discussions/260627171749Z-quote-input-names-in-error-messages-decision-log.md`
> (thread-relative). Decisions are cited where they become operative rather than
> restated in a separate section.

## 1. Intended outcome

After this spec is implemented, every value that jastr interpolates into a
user-facing CLI message — input names, flags, refs, template ids, file paths,
URLs, config-key paths, type names, enum values, directive snippets — is
visually delimited by **backticks**, consistently, across both `@jastr/engine`
and `@jastr/cli`. A user who triggers two different errors (or sees an
error then a success line) in one session sees one uniform formatting style, and
the originally-reported eyesore disappears:

```text
# before
Error: Required input language is missing.

# after
Error: Required input `language` is missing.
```

The rule is uniform enough that a future contributor can apply it to any new
message without re-deriving it, and a reviewer can check adherence mechanically.

## 2. Context

The thread opened as a one-line patch: the missing-required-input message
(`packages/engine/src/inputs.ts`) renders the input name as bare prose
(`Required input language is missing.`), which reads ambiguously — `language`
looks like a word, not a value (see `seed/seed.md`).

During the genesis discussion the scope deliberately grew. The unquoted-name
pattern turned out to be widespread (~18 engine sites plus identifier-bearing
messages throughout the CLI), and quoting only the one message would relocate
the inconsistency rather than remove it. The user chose to fix it properly in
one pass as a project-wide convention (**P1**, decision **C**), which escalated
the work from tier 1 to **tier 2** (recorded in `ledger.md`). The discussion
then settled the convention's domain (**P2**), the quoting unit (**P3**), the
quote character (**P4**), the boundary (**P5**), and the in-code mechanism
(**P6**). This spec elaborates those six decisions into a buildable contract.

## 3. Scope / Non-scope

**In scope**

- Backtick-quoting **every interpolated value token** in **all user-facing CLI
  stdout/stderr messages** — both error messages (including `JastrError`
  messages thrown by `@jastr/engine` and surfaced by the CLI) and success/info
  messages (**P2**, **P5**).
- Introducing one tiny **internal** quoting helper **per package** (one in
  `@jastr/engine`, one in `@jastr/cli`), neither added to the engine's public
  exports (**P6**).
- Routing the few **pre-existing** backtick-quoted CLI messages through the new
  helper so the whole surface shares one mechanism (**P6** refinement).
- Updating all affected automated tests (engine unit, CLI unit, CLI e2e case
  expected outputs) and regenerating `packages/cli/docs/BEHAVIOR.md`.

**Out of scope (explicitly)**

- **Message wording.** Only the backtick delimiters are added; the surrounding
  prose, punctuation, and word order of every message are unchanged. (Derived
  from the discussion's intent — quoting, never rewording.)
- **The generated agent-skill Markdown** produced by
  `packages/cli/src/targets/agent-skill.ts`. It is Markdown written into skill
  files, governed by Markdown's own code-span rules (which already use
  backticks); it is a different surface and is left untouched (**P5**, item 4).
- **Bare numerics** — durations, counts, exit codes (e.g. `5000ms`,
  `(exit 128)`) — and **fixed vocabulary** (e.g. `required: true`, the literal
  `true, false` in a boolean message) stay unquoted (**P5** item 3, **P2**).
- **Fully-literal, non-interpolated tokens** that are currently bare (e.g. a
  standalone literal `.jastr/config.yml` filename with no adjacent
  interpolation) — see `## Unresolved questions`.
- **No new error codes**, no `JastrErrorCode` changes, no engine schema changes,
  and **no change to the engine's pinned public API** (`parseTemplateSource`,
  `validateTemplateSchema`, `validateTemplateInputs`, `renderTemplateSource`,
  `JastrError`, and the public types).
- Double-quote or single-quote delimiters anywhere — superseded by **P4**.

## 4. Expected behavior — the convention

The convention is four rules. They are the observable contract a future executor
must reproduce exactly.

### 4.1 What gets quoted (domain) — **P2**, **P5**

Quote **every interpolated value token** in a user-facing CLI message: the
variable parts a user or author supplied or that name a thing — input names,
flags, template/variant refs, template ids, file paths, URLs, config-key paths,
type names, enum values, and directive snippets. Do **not** quote bare numerics
or fixed vocabulary. The rule is intentionally stateless ("if it is an
interpolated value token, quote it"), so no per-site judgment about *whether* to
quote is required.

### 4.2 What the quoted unit is — **P3**

Quote the **complete logical token a reader recognizes as one value**, not the
raw `${…}` span:

- **Lists** → quote each item, not the joined blob:
  `` must be one of: `en`, `fr`, `de`. `` (never `` `en, fr, de` ``).
- **Flags** → quote the whole token *including* the literal `--`:
  `` `--language` `` (never `` --`language` ``).
- **Refs / composite tokens** → quote the whole token *including* literal
  joiners: `` `docs/spec#v1` `` (never `` `docs/spec`#`v1` ``).
- **Config keys** → quote the whole dotted key token including its literal
  prefix: `` `inputs.myTemplate` `` / `` `variants.myTemplate.myVariant` ``
  (same principle as flags — the literal prefix rides inside the quotes).
- **Usage hints** → quote each hint token as one unit:
  `` Input `--language` requires `--language=value`. ``

### 4.3 Which character (style) — **P4**

The quote character is the **backtick** (`` ` ``), everywhere, with no
exceptions. This supersedes the originally-stated double-quote preference. It
matches the backtick style already present in a few CLI messages and in the
generated agent-skill Markdown, so the whole project converges on one quoting
character. No message may delimit a value token with double or single quotes.

### 4.4 How it is applied in code — **P6**

Each package defines **one tiny internal helper** that wraps a string value in
backtick delimiters (conceptually `quote(value: string): string` returning
`` `<value>` ``). All quoting goes through the helper rather than hand-escaped
backticks at call sites. The helper:

- exists once in `@jastr/engine` and once in `@jastr/cli` (a duplicated
  one-liner is accepted to keep the packages decoupled and the engine pure);
- is **not** added to the engine's public exports;
- accepts a `string` (numerics are never quoted, so the helper never receives
  one);
- composes with §4.2 by being passed the complete logical token
  (e.g. `` quote(`--${flag.name}`) ``, `values.map(quote).join(", ")`).

### 4.5 Representative before → after

Sample input named `language` with enum values `en`, `fr`, `de`. The "after"
column is the exact intended output (wording unchanged, backticks added per
§4.1–§4.3).

```text
ENGINE (inputs.ts / schema.ts)
  Required input language is missing.                 →  Required input `language` is missing.
  Input language is not declared.                     →  Input `language` is not declared.
  Input language must be a boolean.                   →  Input `language` must be a boolean.
  Input language must be one of: en, fr, de.          →  Input `language` must be one of: `en`, `fr`, `de`.
  Input language uses unsupported type frobnicate.    →  Input `language` uses unsupported type `frobnicate`.

CLI — input flags (flags.ts / variants.ts)
  Unknown input flag --language.                      →  Unknown input flag `--language`.
  Input --language cannot be empty.                   →  Input `--language` cannot be empty.
  Input --language requires --language=value.         →  Input `--language` requires `--language=value`.
  Input --language is locked by variant docs/spec#v1. →  Input `--language` is locked by variant `docs/spec#v1`.

CLI — command parse (args.ts)
  Duplicate flag --verbose.                           →  Duplicate flag `--verbose`.
  Unknown add option --xyz.                           →  Unknown add option `--xyz`.
  Missing value for --ref.                            →  Missing value for `--ref`.
  Invalid add argument extra.                         →  Invalid add argument `extra`.

CLI — success / info (commands.ts / install/*)
  Template myTemplate is valid.                        →  Template `myTemplate` is valid.
  Generated `out.md` from template `T.md`              →  (already backticked) Generated `out.md` from template `T.md`

OUT OF SCOPE — stays bare
  git clone timed out after 5000ms and was terminated. →  (unchanged) 5000ms stays bare
  git clone failed for <url> (exit 128).               →  git clone failed for `<url>` (exit 128).   (url quoted, exit code bare)
  ... cannot declare default when required is true.     →  (unchanged) `required: true` is fixed vocabulary, stays bare
```

## 5. Affected surface

The convention touches every file that interpolates a value token into a
user-facing message. The implementer enumerates these exhaustively; the
completeness criterion (AC-7.1) is the backstop. Known families (approximate
counts from the discussion survey: ~42 interpolated message lines in the engine,
~150 in the CLI, ~154 `JastrError` throw sites total):

- **Engine:** `inputs.ts`, `schema.ts` (incl. type names, enum defaults, target
  metadata), `directives.ts`, `conditions.ts`, `interpolation.ts`, `render.ts`.
- **CLI:** `args.ts`, `flags.ts`, `variants.ts`, `config.ts` (config-key paths),
  `commands.ts` (generate target + success lines), `install/*.ts`
  (`add`/`remove`/`update`/`source`/`git`/`unit`/`validate-unit`/`list` — ids,
  sources, URLs, paths, refs), `templates/includes.ts`.
- **Pre-existing backtick sites to unify through the helper:**
  `commands.ts:203`, `install/add.ts:183`, `install/update.ts:190`.
  (`targets/agent-skill.ts` backticks are **excluded** — Markdown surface.)
  **[Erratum 260628103921Z — superseded]** Only the *generated-Markdown body* of
  `targets/agent-skill.ts` is excluded; the file's non-Markdown validation/info
  messages are in scope and were backtick-quoted (decision log P1, commit
  `3ef1106`).

## 6. Constraints

- **Engine purity is preserved.** The engine helper is a pure string function;
  it imports nothing. `@jastr/engine` must still not import fs / child_process /
  network / CLI code (per `AGENTS.md`).
- **The engine's public API is unchanged** — the helper is internal and not
  re-exported from `packages/engine/src/index.ts` (**P6**; AC-1.3).
- **No engine error-code/schema change** — this is message-text only; the
  `JastrErrorCode` union and all error `details` payloads (e.g.
  `details.inputName` stays the raw, unquoted name) are untouched.
- **Wording is frozen** — only backtick delimiters are added (§3 non-scope).
- **Backticks must be produced safely** — message template literals are
  themselves backtick-delimited, so quoting must go through the helper rather
  than error-prone inline `` \` `` escaping (**P6**).
- **Living docs must stay green** — because CLI message outputs change,
  `packages/cli/docs/BEHAVIOR.md` must be regenerated, and
  `bun run docs:cli:living --check` must pass.
- **The full local gate must pass** at exit: `bun run check`,
  `bun run typecheck`, `bun run test`, `bun run test:cli:e2e`,
  `bun run docs:cli:living --check`, and `bun run build` all exit 0.

## 7. Acceptance criteria

Tier 2 → machine-checkable. Each AC is a pass/fail assertion. Sample tokens
(`language`, `en`/`fr`/`de`, `frobnicate`, `--verbose`, `docs/spec#v1`) stand in
for the real interpolated values; the assertion is the exact rendered shape.

### FR-1 — A per-package internal quoting helper exists (**P6**)

- **AC-1.1** `@jastr/engine` contains an internal helper that, given a string
  `v`, returns `v` wrapped in backticks (`` `v` ``).
- **AC-1.2** `@jastr/cli` contains its own internal equivalent helper.
- **AC-1.3** `packages/engine/src/index.ts` exports exactly the pinned public
  API and nothing more — the helper is **not** among the exports.
- **AC-1.4** The helper's parameter type is `string` (it is never called with a
  numeric).

### FR-2 — Interpolated value tokens are backtick-quoted (**P2**, **P3**, **P4**)

- **AC-2.1** The missing-required-input error renders exactly
  `` Required input `language` is missing. ``
- **AC-2.2** Engine input-name messages quote the input name — e.g.
  `` Input `language` is not declared. ``,
  `` Input `language` must be a boolean. `` (at least one assertion per message
  family in `inputs.ts`/`schema.ts`).
- **AC-2.3** Enum/value lists quote **each** item:
  `` Input `language` must be one of: `en`, `fr`, `de`. ``
- **AC-2.4** Interpolated type names are quoted:
  `` Input `language` uses unsupported type `frobnicate`. ``
- **AC-2.5** CLI flag-form input messages quote the whole `--name` token:
  `` Unknown input flag `--language`. ``, `` Input `--language` cannot be empty. ``
- **AC-2.6** Composite tokens are quoted as one unit including literal affixes:
  `` Input `--language` is locked by variant `docs/spec#v1`. `` — never
  `` --`language` `` or `` `docs/spec`#`v1` ``.
- **AC-2.7** Command-parse tokens are quoted: `` Duplicate flag `--verbose`. ``,
  `` Unknown add option `--xyz`. ``, `` Invalid add argument `extra`. ``,
  `` Missing value for `--ref`. ``
- **AC-2.8** Every value-token delimiter introduced is a backtick; no message
  delimits a value token with `"` or `'`.

### FR-3 — Out-of-scope tokens stay bare (**P5**, **P2**)

- **AC-3.1** Bare numerics remain unquoted: the clone-timeout message keeps
  `5000ms` bare and `(exit <code>)` keeps the code bare; in a message that mixes
  both, only the value token is quoted, e.g.
  `` git clone failed for `<url>` (exit 128). ``
- **AC-3.2** Fixed vocabulary stays bare (`required: true`, the literal
  `true, false` in the boolean-input message).

### FR-4 — Success/info messages follow the convention (**P5** item 1)

- **AC-4.1** `` Template `myTemplate` is valid. ``
- **AC-4.2** Install success/info lines quote their value tokens (ids, sources,
  paths) — e.g. the `remove` success line quotes the removed id and source.

### FR-5 — Pre-existing backtick sites are unified (**P6** refinement)

- **AC-5.1** The messages at `commands.ts:203`, `install/add.ts:183`, and
  `install/update.ts:190` route their quoting through the helper and their
  rendered output remains backtick-quoted (output unchanged for these sites).

### FR-6 — The agent-skill Markdown surface is untouched (**P5** item 4)

- **AC-6.1** `jastr generate agent-skill … --check` still passes byte-for-byte
  against the committed wrappers (no change to generated Markdown).
- **AC-6.2** No edit to `targets/agent-skill.ts` is made under this convention.
  **[Erratum 260628103921Z — superseded]** This file-level assertion no longer
  holds: the file's non-Markdown `Error:`/stdout messages were backtick-quoted as
  a deliberate later extension (decision log P1, commit `3ef1106`). AC-6.1 (no
  change to the generated Markdown; `--check` byte-for-byte) still holds, and the
  generated-Markdown body remains unedited.

### FR-7 — Completeness, coverage, and the green gate

- **AC-7.1** No user-facing CLI message interpolates a value token with a bare
  (un-backticked) interpolation; every such token is wrapped via the helper.
  (Verified by exhaustive review across the §5 surface; an optional grep/lint may
  assist.)
- **AC-7.2** All affected automated tests are updated to the new expected
  strings and pass, `BEHAVIOR.md` is regenerated, and the full gate (AC in §6)
  exits 0.

### Traceability

| FR | Enforces | Source decision(s) |
|----|----------|--------------------|
| FR-1 | per-package internal helper, engine API untouched | P6 |
| FR-2 | quote interpolated value tokens; logical-token unit; backticks | P2, P3, P4 |
| FR-3 | numerics & fixed vocabulary stay bare | P5, P2 |
| FR-4 | success/info messages included | P5 (item 1, judgment call a) |
| FR-5 | unify pre-existing backtick sites | P6 refinement |
| FR-6 | exclude agent-skill Markdown | P5 (item 4) |
| FR-7 | completeness + living docs + green gate | P1 (consistency goal), P5 |

Coverage: every behavior in §4 maps to an AC in FR-2/FR-3/FR-4; every §3 / §6
constraint maps to FR-1, FR-6, or FR-7.

## 8. Degrees of freedom

The *what* above is pinned. The following *hows* are explicitly left to the
implementer:

1. **The helper's exact name, signature spelling, and file location** in each
   package (the contract is only: internal, not exported, wraps a `string` in
   backticks). `quote` is a fine name but not mandated.
2. **Per-site application of the §4.2 logical-token rule to compound or unusual
   references** — e.g. how to tokenize a bracketed scope (`[local]`), a
   filename-plus-dotted-key compound, or a multi-part install source. The
   principle ("quote the complete logical token a reader recognizes") is pinned;
   the per-message tokenization that follows it is the implementer's, and any
   reading faithful to the principle is acceptable.
3. **Edit sequencing and chunking** — order of files, whether engine or CLI
   first, one commit or several.
4. **Enforcement mechanism for AC-7.1** — exhaustive manual review, a one-off
   grep, or a reusable lint check are all acceptable as long as completeness
   holds.
5. **Which additional representative messages** beyond the AC-named ones get
   explicit test assertions (the named ACs are the floor, not the ceiling).

## 9. Unresolved questions

These do **not** block emission or implementation:

1. **Fully-literal value tokens.** This convention targets *interpolated* values
   (**P2**), so a standalone literal token baked into a message with no adjacent
   interpolation (e.g. a bare literal `.jastr/config.yml` filename) is left
   **bare**. Pre-existing backtick-quoted literals (e.g. the literal `jastr add`
   command at `install/update.ts:190`) are **preserved** (**P6**). Whether to
   later extend backticking to currently-bare fully-literal tokens for extra
   visual consistency is deferred to a future discussion; it is intentionally
   not decided here.
