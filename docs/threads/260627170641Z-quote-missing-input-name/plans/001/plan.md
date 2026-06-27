# Plan — backtick-quoting convention for interpolated value tokens in CLI messages

Compiles `specs/001/spec.md` (tier 2, per `ledger.md`). The spec is the contract;
this plan is disposable scaffolding. Where the spec leaves a *how* open it cites
`spec.md §8` (degrees of freedom); the implementer may resolve those per the
pinned principle.

> **Spec status.** `specs/001/spec.md` is **approved**
> (`status.approved: 260627212538Z`). If the spec is amended after this plan was
> compiled, reconcile this plan before/while implementing.

## Goal

Backtick-quote **every interpolated value token** in every user-facing CLI
stdout/stderr message across `@jastr/engine` and `@jastr/cli`, via one tiny
internal `quote` helper per package, leaving wording, numerics, fixed
vocabulary, error codes, `details` payloads, the engine public API, and the
generated agent-skill Markdown untouched. Finish with all automated tests
updated, `BEHAVIOR.md` regenerated, and the full local gate green.

## Shared context (read once; every task relies on this)

These facts are constant across all tasks and are the per-task `Input / context`
backbone. Each task additionally starts from the previous numbered task's output
(the implicit sequential dependency).

- **The convention** is fixed by `spec.md §4`:
  - §4.1 — quote every *interpolated* value token (names, flags, refs, ids,
    paths, URLs, config-key paths, type names, enum values, directive snippets);
    the rule is stateless ("if it's an interpolated value token, quote it").
  - §4.2 — quote the **complete logical token** a reader recognizes as one
    value, not the raw `${…}` span: each list item separately
    (`` `en`, `fr`, `de` `` never `` `en, fr, de` ``); the whole `--name` flag
    including the `--`; the whole composite ref including joiners
    (`` `docs/spec#v1` ``); the whole dotted config key including its literal
    prefix (`` `inputs.myTemplate` ``).
  - §4.3 — the delimiter is the **backtick**, everywhere, no `"`/`'` for value
    tokens (AC-2.8).
  - §4.4 — all quoting goes through the per-package helper; never hand-escape
    `` \` `` at a call site.
- **Stays bare** (`spec.md §3 non-scope`, §4.5, FR-3, §9 Unresolved Q1):
  bare numerics + units (`5000ms`, `(exit 128)`), fixed vocabulary
  (`required: true`, the literal `true, false`), and *fully-literal*
  non-interpolated tokens (e.g. a standalone literal `.jastr/config.yml`
  filename, the `expectedCommandShape` usage blob).
- **Untouched** (`spec.md §3`, §6, FR-6): message wording/word-order;
  `JastrErrorCode` union; all `JastrError` `details` payloads (e.g.
  `details.inputName`, `details.values`, `details.chain` keep the **raw**
  unquoted value); the engine pinned public API; and
  `packages/cli/src/targets/agent-skill.ts` (Markdown surface).
- **Per-site tokenization judgments** (bracketed scopes like `[local]`,
  filename+dotted-key compounds, multi-part install sources, the cycle chain) are
  the implementer's per `spec.md §8 DoF-2`; any reading faithful to §4.2 is
  acceptable.
- **Standing per-task gate** (cheap; must stay green on every task): `bun run
  check` (Biome) and `bun run typecheck`. The e2e suite, full `bun run test`,
  `docs:cli:living --check`, and `bun run build` are the expensive whole-change
  gates and are deliberately deferred to Task 9 (the e2e suite is expected red
  from Task 2 onward — by design).
- **Test-update locality**: each source task updates its **co-located unit
  tests** (engine `packages/engine/test/`, CLI `packages/cli/test/`) in the same
  task. The 248-case e2e `case.yml` expected-output sweep and `BEHAVIOR.md`
  regeneration are batched into Task 9.

---

## Tasks

### Task 1: Add the internal `quote` helper to `@jastr/engine`

**Objective:** Provide one tiny internal, non-exported string helper that wraps a
value in backticks, so every engine message quotes through it rather than
hand-escaping (`spec.md §4.4`, FR-1; decision P6).

**Input / context:** `spec.md §4.4`, AC-1.1/1.3/1.4, §8 DoF-1 (name/signature/
location are the implementer's; `quote` is a fine but non-mandated name). Engine
purity constraint (`spec.md §6`; `AGENTS.md`): the helper imports nothing.

**Steps:**
1. Create `packages/engine/src/quote.ts` exporting a single function that takes a
   `string` and returns it wrapped in backticks (suggested signature
   `quote(value: string): string` → `` `${value}` `` built as a template
   literal). It imports nothing.
2. Add a unit test at `packages/engine/test/quote.test.ts` importing `quote` from
   `../src/quote` and asserting `quote("language") === "\`language\`"` and that an
   empty string yields `` `` `` (two backticks). The test import is what keeps
   Biome from flagging the new module as unused.
3. Confirm the helper is **not** re-exported: do not add it to
   `packages/engine/src/index.ts`.

**Files modified:** `packages/engine/src/quote.ts` (NEW),
`packages/engine/test/quote.test.ts` (NEW)

**Verification:**
- `bunx vitest run packages/engine/test/quote.test.ts` exits 0.
- `grep -q "quote" packages/engine/src/index.ts` returns **non-zero** (helper not
  in public exports); `bunx vitest run packages/engine/test/public-api.test.ts
  packages/engine/test/package-contract.test.ts` exits 0 (public surface
  unchanged).
- `bun run check` and `bun run typecheck` exit 0.

**Acceptance criteria:**
- An internal helper exists in `@jastr/engine` that wraps a `string` in backticks
  (AC-1.1, AC-1.4).
- `packages/engine/src/index.ts` exports exactly the pinned public API and does
  not include the helper (AC-1.3).
- The helper's parameter type is `string`.

---

### Task 2: Quote engine input/schema messages (`inputs.ts`, `schema.ts`)

**Objective:** Apply `quote` to every interpolated value token in the
input-validation and schema-validation messages — the spec's core named ACs
(AC-2.1–2.4) live here.

**Input / context:** Output of Task 1 (`quote` from `../quote`). `spec.md §4.1–
§4.3`, §4.5 (engine before/after table), AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-3.2.
Sites enumerated from `packages/engine/src/inputs.ts` and `schema.ts`.

**Steps:**
1. Import `quote` from `./quote` in both files.
2. In `inputs.ts`, wrap the interpolated `inputName` in every message and each
   enum value in the list message: `Input ${inputName} is not declared.`,
   `Required input ${inputName} is missing.`, `Input ${inputName} must be a
   boolean.`, `Input ${inputName} must be a string.`, `Input ${inputName} cannot
   be empty.`, and `Input ${inputName} must be one of: ${values.join(", ")}.` →
   build the list as `definition.values.map(quote).join(", ")` for the **message
   only**; leave `details.values` the raw array.
3. In `schema.ts`, wrap the interpolated value token in every message:
   `Invalid input name ${name}.`; the `Input ${inputName} …` family (`must be a
   mapping.`, `must explicitly declare required: true or required: false.`,
   `cannot declare default when required is true.`, `uses unsupported type
   ${String(rawDefinition.type)}.` — quote **both** `inputName` **and** the type
   token); `Enum input ${inputName} …`; the `Default for input ${inputName} …`
   family (`must be a boolean.`, `must be a string.`, `cannot be empty.`, `must be
   one of: ${values.join(", ")}.` — list via `values.map(quote).join(", ")`); the
   `Description for input ${inputName} …` family; and `Unsupported target
   metadata ${target}.`.
4. Leave bare (do **not** quote): the non-interpolated literal messages
   (`Template frontmatter must be a mapping.`, `Template inputs must be a
   mapping.`, `Target metadata must be a mapping.`) and the fixed-vocabulary
   `required: true` / `required: false` substrings (AC-3.2). The stateless rule
   means only `${…}` value tokens are wrapped.
5. Update `packages/engine/test/inputs.test.ts` and
   `packages/engine/test/template-schema.test.ts` expected strings to the
   backticked forms. Leave any `details`/error-code assertions unchanged.

**Files modified:** `packages/engine/src/inputs.ts`,
`packages/engine/src/schema.ts`, `packages/engine/test/inputs.test.ts`,
`packages/engine/test/template-schema.test.ts`

**Verification:**
- `bunx vitest run packages/engine/test/inputs.test.ts
  packages/engine/test/template-schema.test.ts` exits 0.
- `grep -nE 'Input \$\{inputName\}|Required input \$\{inputName\}' packages/engine/src/inputs.ts`
  returns no **un-quoted** occurrences (every interpolation is inside a
  `quote(...)` call).
- `bun run check` and `bun run typecheck` exit 0.

**Acceptance criteria:**
- `` Required input `language` is missing. `` renders exactly (AC-2.1).
- Each `inputs.ts`/`schema.ts` message family quotes its input name, e.g.
  `` Input `language` is not declared. ``, `` Input `language` must be a boolean.
  `` (AC-2.2).
- Enum/value lists quote **each** item:
  `` Input `language` must be one of: `en`, `fr`, `de`. `` (AC-2.3).
- Interpolated type names are quoted:
  `` Input `language` uses unsupported type `frobnicate`. `` (AC-2.4).
- `required: true` / `required: false` stay bare (AC-3.2); `details` payloads
  unchanged.

---

### Task 3: Quote engine directive/render messages (`directives.ts`, `conditions.ts`, `interpolation.ts`, `render.ts`)

**Objective:** Apply `quote` to the interpolated value tokens in the remaining
engine messages (directive snippets, condition tokens, interpolation references,
include paths, and the cycle chain), completing the engine surface under FR-2/
FR-7. The cycle-chain and escape tokenizations are load-bearing.

**Input / context:** Output of Task 1 (`quote`). `spec.md §4.1–§4.2` (directive
snippets are in-domain; lists quote each item), FR-7 (AC-7.1 completeness — these
files have no individually-named AC). Constraint: `details.chain` keeps the raw
joined string (`spec.md §6`).

**Steps:**
1. Import `quote` from `./quote` in each of the four files.
2. `directives.ts` — quote the interpolated directive-name / snippet token in:
   `${opening.name} directive accepts path and optional root.`, `${opening.name}
   directive requires condition.` (both `opening.name` and `container.name`
   sites), `${name} directive must immediately follow an if or else-if branch.`,
   `Invalid directive syntax ${line.trim()}.`, `Invalid directive attributes
   ${rest}.` / `${source}.` (both sites), and the leaf/container colon messages
   `${name} is a leaf directive … (::${name}).` and `${name} is a container
   directive … (:::${name}).` — per §4.2 DoF-2, quote the `::name`/`:::name`
   snippet as one token (e.g. `` (`::include`) ``). Leave the non-interpolated
   literals bare (the two "Nested conditional containers…" messages, `else
   directive does not accept attributes.`, `Unclosed conditional directive.`,
   `Markdown directive syntax is invalid.`).
3. `conditions.ts` — quote: `Condition references undeclared input ${name}.`;
   `Unexpected token ${tokenValue(token)}.` (both sites); and `Unsupported escape
   \\${escaped ?? ""}.` → quote the `\<char>` snippet as one token. Leave bare:
   `Unclosed input reference.`, `Unclosed string literal.`, `Expected closing
   parenthesis.`, and `Expected ${input-name} reference.` (the `${input-name}`
   here is **literal message text**, not a JS interpolation — fully-literal, Q1).
4. `interpolation.ts` — quote the reference token in: `Interpolation references
   undeclared input ${reference}.`, `Input ${reference} is optional and was not
   provided for interpolation.`, `Invalid interpolation reference ${reference}.`.
   Leave `Invalid interpolation syntax.` bare.
5. `render.ts` — quote the path in `Include file ${request.path} was not found.`.
   For `Include cycle detected: ${chain}.`: build a **separate** quoted display
   string for the message — `[...stack.slice(existingIndex), nextId].map(quote)
   .join(" -> ")` → `` Include cycle detected: `a` -> `b` -> `c`. `` — while
   keeping the existing raw `chain` for `details.chain`.
6. Update `packages/engine/test/render.test.ts` expected strings to the
   backticked forms (it is the engine test asserting directive/condition/
   interpolation/include/cycle messages). Leave error-code/`details` assertions
   unchanged.

**Files modified:** `packages/engine/src/directives.ts`,
`packages/engine/src/conditions.ts`, `packages/engine/src/interpolation.ts`,
`packages/engine/src/render.ts`, `packages/engine/test/render.test.ts`

**Verification:**
- `bunx vitest run packages/engine/test/render.test.ts` exits 0.
- `grep -nE 'detail.*chain|chain[^`]*join' packages/engine/src/render.ts` confirms
  `details.chain` still receives the raw (unquoted) join, with the quoted
  `.map(quote).join` used only in the message.
- `bun run check` and `bun run typecheck` exit 0.

**Acceptance criteria:**
- Directive-snippet, condition-token, interpolation-reference, and include-path
  value tokens are backtick-quoted (FR-2 / AC-7.1 for the engine surface).
- The cycle message reads `` Include cycle detected: `a` -> `b` -> `c`. ``;
  `details.chain` remains the raw `a -> b -> c`.
- No engine message delimits a value token with `"` or `'` (AC-2.8 for engine);
  non-interpolated literals stay bare.

---

### Task 4: Add the internal `quote` helper to `@jastr/cli`

**Objective:** Provide the CLI's own internal, non-exported `quote` helper (a
deliberately duplicated one-liner, keeping the packages decoupled), so all CLI
quoting routes through it (`spec.md §4.4`, FR-1; P6).

**Input / context:** `spec.md §4.4`, AC-1.2, AC-1.4, §8 DoF-1. Mirrors Task 1 but
in the CLI package; the engine helper is internal and not importable, so the CLI
gets its own.

**Steps:**
1. Create `packages/cli/src/quote.ts` exporting a function that wraps a `string`
   in backticks (suggested `quote(value: string): string`). It imports nothing.
2. Add a unit test at `packages/cli/test/quote.test.ts` importing `quote` from
   `../src/quote` and asserting the backtick-wrapped result for a sample token.
3. Do not import the engine helper; do not export this from any package barrel.

**Files modified:** `packages/cli/src/quote.ts` (NEW),
`packages/cli/test/quote.test.ts` (NEW)

**Verification:**
- `bunx vitest run packages/cli/test/quote.test.ts` exits 0.
- `bun run check` and `bun run typecheck` exit 0.

**Acceptance criteria:**
- `@jastr/cli` contains its own internal equivalent helper wrapping a `string` in
  backticks (AC-1.2, AC-1.4).
- The helper is not added to any public export.

---

### Task 5: Quote CLI command-parse and input-flag messages (`args.ts`, `flags.ts`, `variants.ts`)

**Objective:** Apply `quote` to the argv-shape, input-flag, and locked-flag
messages — the CLI flag/ref/arg value tokens (AC-2.5, AC-2.6, AC-2.7).

**Input / context:** Output of Task 4 (`quote` from `./quote`). `spec.md §4.2`
(flags quote the whole `--name`; composite refs quote the whole token),
AC-2.5/2.6/2.7, AC-3.2 (the boolean message's literal `true, false` stays bare).
Sites in `packages/cli/src/args.ts`, `flags.ts`, `variants.ts`.

**Steps:**
1. Import `quote` from `./quote` in each file.
2. `args.ts` — quote the interpolated flag/option/arg/ref token (including the
   literal `--`/`-` it carries) in: `Invalid flag syntax ${arg}.`, `Boolean
   negation form ${arg} is not supported.`, `Duplicate flag --${name}.` (quote
   `--${name}` as one token), `Missing template reference for generate ${first}.`,
   `Missing value for ${arg}.` / `${option}.`, `Unknown add option ${arg}.`,
   `Invalid add argument ${positionals[2]}.`, `Unknown list option ${arg}.`,
   `Invalid list argument ${arg}.`, `Unknown remove option ${arg}.`, `Unknown
   update option ${arg}.`, `Unknown validate option ${arg}.`, `Invalid validate
   argument ${arg}.`, `Unknown generate option ${arg}.`, `Invalid generate
   argument ${arg}.`. Leave the `expectedCommandShape` usage blob and other
   non-interpolated literal messages (`Missing required --out <path>.`, `Missing
   value for --out.`, `Missing repo source for add.`, etc.) **bare** (fully-
   literal, Q1). Note `requireOptionValue`'s `${option}=` is a path computation,
   not a message — leave it.
3. `flags.ts` — quote `--${flag.name}` (whole flag token) in: `Unknown input flag
   --${flag.name}.`, `Input --${flag.name} requires --${flag.name}=value.` (quote
   both `--name` and the `--name=value` hint token per §4.2 usage-hints), `Input
   --${flag.name} cannot be empty.`, and `Boolean input --${flag.name} must be
   true, false, or a bare flag.` — quote `--name` only; **`true, false` stays
   bare** (AC-3.2).
4. `variants.ts` — in `Input --${flag.name} is locked by variant
   ${templateRef}#${variantId}.`, quote `--${flag.name}` as one token and the
   composite `${templateRef}#${variantId}` as one token (never
   `` `ref`#`variant` ``) (AC-2.6).
5. Update co-located CLI unit tests asserting these strings:
   `packages/cli/test/run-command.test.ts` and
   `packages/cli/test/cli-shell.test.ts` (and `template-ref.test.ts` if it
   asserts any of these). Leave error-code/`details` assertions unchanged.

**Files modified:** `packages/cli/src/args.ts`, `packages/cli/src/flags.ts`,
`packages/cli/src/variants.ts`, `packages/cli/test/run-command.test.ts`,
`packages/cli/test/cli-shell.test.ts`

**Verification:**
- `bunx vitest run packages/cli/test/run-command.test.ts
  packages/cli/test/cli-shell.test.ts` exits 0.
- `bun run check` and `bun run typecheck` exit 0.

**Acceptance criteria:**
- `` Unknown input flag `--language`. `` and `` Input `--language` cannot be
  empty. `` render (AC-2.5).
- `` Input `--language` is locked by variant `docs/spec#v1`. `` renders — never
  `` --`language` `` or `` `docs/spec`#`v1` `` (AC-2.6).
- `` Duplicate flag `--verbose`. ``, `` Unknown add option `--xyz`. ``,
  `` Invalid add argument `extra`. ``, `` Missing value for `--ref`. `` render
  (AC-2.7).
- The boolean message keeps `true, false` bare (AC-3.2); the `expectedCommandShape`
  blob is unchanged.

---

### Task 6: Quote CLI core run-path messages (`config.ts`, `commands.ts`, `templates/includes.ts`, `templates/template-ref.ts`, `fs/project-root.ts`)

**Objective:** Apply `quote` to config-key, generate/validate, include-resolver,
template-resolution, and project-root-discovery messages — including the
`validate` success line (AC-4.1) and the pre-existing backtick site at
`commands.ts:203` routed through the helper (AC-5.1).

**Input / context:** Output of Task 4 (`quote`). `spec.md §4.2` (config keys
quote the whole dotted key including its literal prefix; the `.jastr/config.yml`
filename is a fully-literal prefix and stays bare — Q1), §4.1 (template refs and
file paths are value tokens), AC-4.1, AC-5.1, FR-2, AC-7.1. Note:
`templates/template-ref.ts` and `fs/project-root.ts` are **not** named in
`spec.md §5`'s approximate family list, but they carry user-facing interpolated
value tokens (`template_not_found`, `invalid_template_reference`,
`missing_project_root`), so AC-7.1's completeness criterion puts them in scope.
Sites in `packages/cli/src/config.ts`, `commands.ts`, `templates/includes.ts`,
`templates/template-ref.ts`, `fs/project-root.ts`.

**Steps:**
1. Import `quote` from the correct relative path in each file (`config.ts` and
   `commands.ts` use `./quote`; `templates/includes.ts`,
   `templates/template-ref.ts`, and `fs/project-root.ts` use `../quote`).
2. `config.ts` — quote the dotted config-key token (including its literal
   `inputs.`/`variants.` prefix, **excluding** the bare `.jastr/config.yml`
   filename) and any `field`/`variantRef` token in: `.jastr/config.yml
   inputs.${ref} must be a mapping.` → `` …config.yml `inputs.${ref}` must… ``;
   the `variants.${ref}` / `variants.${ref}.${variantId}` mapping messages; `…
   field ${field} is not supported.` (quote the dotted key **and** `${field}`);
   the `.agent-skill` / `.agent-skill.frontmatter` / `.locked-inputs` /
   `.agent-skill.argument-hint-prefix` key messages; and `Variant ${variantRef}
   was not found in .jastr/config.yml.` (quote the composite `ref#variant`). Build
   the quoted dotted key as a nested template literal passed to `quote(...)` (no
   manual `` \` `` escaping). Leave the fully-literal `.jastr/config.yml …` lines
   that have no interpolation (`… inputs must be a mapping.`, `… variants must be
   a mapping.`, `… could not be parsed.`, `… must be a mapping.`) **bare** (Q1).
3. `commands.ts` — quote `${opts.target}` in `Unsupported generate target
   ${opts.target}.`; quote `${opts.templateRef}` in the `validate` success line
   `Template ${opts.templateRef} is valid.` → `` Template `myTemplate` is valid.
   `` (AC-4.1); and route the **already-backticked** generate success line at
   `commands.ts:203` through `quote(...)` so its two backticked tokens come from
   the helper instead of inline `` \` `` — rendered output unchanged (AC-5.1).
4. `templates/includes.ts` — quote the interpolated token in: `Include root
   ${root} must be template, group, or file.` (quote `${root}`; the literal
   `template, group, or file` is fixed vocabulary, bare), `Include path
   ${includePath} escapes the allowed include boundary.`, `Include file
   ${includePath} was not found.`, and `Include file ${includePath} could not be
   read: ${code ?? "unknown"}.` (quote the path; the cause code — quote per §4.2
   as a value token, implementer's DoF-2 call). Leave `Include root group requires
   the template to be inside a .jastrgroup.` (non-interpolated literal) bare.
5. `templates/template-ref.ts` — quote `${templateRef}` (the composite template
   ref, as one token per §4.2) in `Template ${templateRef} was not found. Searched
   ${searched}.` and `Template reference ${templateRef} must be a template id,
   ….`. In the `searched` display built by `templateNotFound` (the `local
   ${path.relative(cwd, declaredPath)}` / `global ${declaredPath}` arms joined by
   ` and `), quote each interpolated path as a file-path value token (§4.1); the
   leading bare `local`/`global` scope words and the ` and ` joiner are the
   implementer's tokenization per §8 DoF-2. `details.templateRef` keeps the raw
   value (§6).
6. `fs/project-root.ts` — quote the interpolated global `.jastr` path (a file-path
   value token, §4.1) in the `missing_project_root` message `No .jastr directory
   found locally (searched from the current directory up) or globally
   (${path.join(globalBase(), ".jastr")}).` → `` … or globally (`<path>/.jastr`).
   ``. The literal `.jastr` filenames in the surrounding fixed prose stay bare
   (Q1).
7. Update co-located CLI unit tests: `packages/cli/test/config.test.ts`,
   `packages/cli/test/generate-command.test.ts`,
   `packages/cli/test/validate-command.test.ts`,
   `packages/cli/test/includes.test.ts`, `packages/cli/test/template-ref.test.ts`,
   `packages/cli/test/roots.test.ts`.

**Files modified:** `packages/cli/src/config.ts`, `packages/cli/src/commands.ts`,
`packages/cli/src/templates/includes.ts`,
`packages/cli/src/templates/template-ref.ts`,
`packages/cli/src/fs/project-root.ts`,
`packages/cli/test/config.test.ts`, `packages/cli/test/generate-command.test.ts`,
`packages/cli/test/validate-command.test.ts`,
`packages/cli/test/includes.test.ts`, `packages/cli/test/template-ref.test.ts`,
`packages/cli/test/roots.test.ts`

**Verification:**
- `bunx vitest run packages/cli/test/config.test.ts
  packages/cli/test/generate-command.test.ts
  packages/cli/test/validate-command.test.ts packages/cli/test/includes.test.ts
  packages/cli/test/template-ref.test.ts packages/cli/test/roots.test.ts`
  exits 0.
- `grep -n "\\\\\`" packages/cli/src/commands.ts` shows the `commands.ts:203`
  line now builds its backticks via `quote(...)` (no remaining inline `` \` ``
  there).
- `grep -nE 'Template \$\{templateRef\}|reference \$\{templateRef\}' packages/cli/src/templates/template-ref.ts`
  returns no **un-quoted** occurrences (each `${templateRef}` is inside a
  `quote(...)` call).
- `bun run check` and `bun run typecheck` exit 0.

**Acceptance criteria:**
- `` Template `myTemplate` is valid. `` renders (AC-4.1).
- Config-key messages quote the dotted key including its `inputs.`/`variants.`
  prefix; the bare `.jastr/config.yml` filename stays bare (§4.2 + Q1).
- `commands.ts:203` routes its quoting through the helper with rendered output
  unchanged (AC-5.1, partial — generate site).
- `` Template `team/demo` was not found. … `` and
  `` Template reference `INVALID` must be a template id, …. `` render with the
  ref and the searched paths quoted (AC-7.1; §4.1/§4.2).
- The `missing_project_root` message quotes its interpolated global `.jastr` path
  value token (AC-7.1; §4.1).

---

### Task 7: Quote CLI install command-surface messages (`add.ts`, `remove.ts`, `update.ts`, `lock.ts`)

**Objective:** Apply `quote` to the four-command install error and success/info
messages (ids, sources, URLs, refs, paths) and the lock-validation messages,
including the pre-existing backtick sites at `add.ts:183` and `update.ts:190`
routed through the helper (AC-4.2, AC-5.1).

**Input / context:** Output of Task 4 (`quote`). `spec.md §4.1–§4.2`, AC-4.2,
AC-5.1, AC-2.8 (lock.ts currently uses `"`-quoted ids/keys — must become
backticks). DoF-2 governs bracketed scope tokens (`[local]`/`[global]`) and the
multi-part install source. Sites in `packages/cli/src/install/add.ts`,
`remove.ts`, `update.ts`, `lock.ts`.

**Steps:**
1. Import `quote` from `../quote` in each file.
2. `add.ts` — quote `${id}`, `${where}`, `${unit.id}`, `${provenance.source}`,
   the ref/path tokens, and the bracketed `[${rootLabel}]` scope (DoF-2) in the
   `destination_exists` error and the two `Installed …` success lines; route the
   pre-existing `` \`jastr update ${id}\` `` command snippet through `quote(...)`
   as one composite token (output for that token unchanged) while quoting the
   leading bare `${id}`/`${where}` (AC-4.2 + AC-5.1). The `${count}` is numeric
   (bare); `${plural}` is fixed vocabulary (bare).
3. `remove.ts` — quote `${id}`, the `[${scope}]` token (DoF-2), and the
   `${sourceRef(entry)}` source token in `Cleaned stale entry ${id} [${scope}].`,
   `Removed ${id} (was ${sourceRef(entry)}) [${scope}].`, and the
   `not_installed`/`not_jastr_installed` error messages.
4. `update.ts` — quote `${id}`, the scope token, and commit/source tokens in
   `Nothing to update in the ${scope} root.`, the `Updated ${id} … [${scope}]`
   line, the `commitTransition` display (the `(${before} -> ${after})` versions —
   DoF-2; `UNVERSIONED` is fixed vocabulary), and the `update_available`/`local_
   modifications` errors; route the pre-existing `` \`jastr add\` `` snippet at
   `update.ts:190` through `quote(...)` (output unchanged) while quoting the bare
   `${id}`/`${displayDestDir(id)}` (AC-4.2 + AC-5.1).
5. `lock.ts` — replace `"`-delimited value tokens with backticks via `quote(...)`
   (AC-2.8): `${file} must be a JSON object.` (quote `${file}`), `has an unknown
   field "${key}"` → `` has an unknown field `${key}` ``, and `lock entry "${id}"
   is invalid: it ${reason}.` → `` lock entry `${id}` is invalid: it ${reason}. ``
   (the `${reason}` is a prose clause — leave as prose unless it itself names a
   value token).
6. Update co-located install unit tests: `packages/cli/test/install/add.test.ts`,
   `packages/cli/test/install/update.test.ts`,
   `packages/cli/test/install/lock.test.ts`. (`remove` has no unit test file — its
   messages are covered by e2e in Task 9.)

**Files modified:** `packages/cli/src/install/add.ts`,
`packages/cli/src/install/remove.ts`, `packages/cli/src/install/update.ts`,
`packages/cli/src/install/lock.ts`, `packages/cli/test/install/add.test.ts`,
`packages/cli/test/install/update.test.ts`,
`packages/cli/test/install/lock.test.ts`

**Verification:**
- `bunx vitest run packages/cli/test/install/add.test.ts
  packages/cli/test/install/update.test.ts
  packages/cli/test/install/lock.test.ts` exits 0.
- `grep -nE '"\$\{|\$\{[a-zA-Z]+\}"' packages/cli/src/install/lock.ts` returns no
  double-quoted value tokens (all converted to backticks).
- `bun run check` and `bun run typecheck` exit 0.

**Acceptance criteria:**
- Install success/info lines quote their value tokens (ids, sources, paths);
  e.g. the `remove` success line quotes the removed id and source (AC-4.2).
- The pre-existing backtick sites at `add.ts:183` and `update.ts:190` route
  through the helper with their backticked snippet output unchanged (AC-5.1,
  partial — install sites).
- No install command-surface message delimits a value token with `"`/`'`
  (AC-2.8).

---

### Task 8: Quote CLI install acquisition/support messages (`source.ts`, `git.ts`, `unit.ts`, `validate-unit.ts`, `list.ts`)

**Objective:** Apply `quote` to the source-resolution, git-subprocess, unit-
fetch, validate-wrap, and list-inventory messages — quoting value tokens while
keeping numerics/units and exit codes bare (AC-3.1, AC-4.2, AC-2.8).

**Input / context:** Output of Task 4 (`quote`). `spec.md §4.5` (the clone-
timeout/exit-code example), FR-3 (AC-3.1 numerics bare), AC-4.2 (list inventory is
success/info), AC-2.8 (git.ts uses `"`-quoted binary — must become backticks).
Sites in `packages/cli/src/install/source.ts`, `git.ts`, `unit.ts`,
`validate-unit.ts`, `list.ts`.

**Steps:**
1. Import `quote` from `../quote` in each file.
2. `source.ts` — quote the `${source}` token (and any url/path token) in `git is
   not available; install git to add a remote source (${source}).` and the other
   source-resolution errors. The `https://github.com/${source}.git` return value
   is a constructed URL, not a message — leave it.
3. `git.ts` — quote value tokens, keep numerics/codes bare: `git is not available
   (could not run "${gitBin()}").` → backtick the binary (AC-2.8); `git could not
   be run: ${error.message}` (the message is prose — leave unless it names a
   token); `git clone timed out after ${timeoutMs}ms and was terminated.` →
   **`${timeoutMs}ms` stays bare** (AC-3.1); `git clone failed for ${opts.url}
   (exit ${result.code}).` → quote `${opts.url}`, leave `(exit ${result.code})`
   bare (AC-3.1).
4. `unit.ts` — quote `${name}` and `${source}` in `Template ${name} was not found
   in ${source}.` and the other unit-fetch errors.
5. `validate-unit.ts` — quote `${options.id}` in `Unable to ${options.operation}
   ${options.id}: ${subject}. ${error.message}` (the `operation`/`subject`/
   `error.message` are prose/fixed; quote the id token).
6. `list.ts` — quote value tokens in the inventory rows and section output: ids,
   sources, the `@ ${row.shortCommit}` token, and the `${row.id}/${member}`
   tree refs (DoF-2 for the tree connector layout). Keep purely structural
   punctuation bare.
7. Update co-located install unit tests:
   `packages/cli/test/install/source.test.ts`,
   `packages/cli/test/install/git.test.ts`,
   `packages/cli/test/install/unit.test.ts`,
   `packages/cli/test/install/validate-unit.test.ts`. (`list` has no unit test
   file — covered by e2e in Task 9.)

**Files modified:** `packages/cli/src/install/source.ts`,
`packages/cli/src/install/git.ts`, `packages/cli/src/install/unit.ts`,
`packages/cli/src/install/validate-unit.ts`, `packages/cli/src/install/list.ts`,
`packages/cli/test/install/source.test.ts`,
`packages/cli/test/install/git.test.ts`,
`packages/cli/test/install/unit.test.ts`,
`packages/cli/test/install/validate-unit.test.ts`

**Verification:**
- `bunx vitest run packages/cli/test/install/source.test.ts
  packages/cli/test/install/git.test.ts packages/cli/test/install/unit.test.ts
  packages/cli/test/install/validate-unit.test.ts` exits 0.
- `grep -n "could not run \\\\\"" packages/cli/src/install/git.ts` returns
  non-zero (the double-quoted binary is gone, replaced by a backticked token).
- `bun run check` and `bun run typecheck` exit 0.

**Acceptance criteria:**
- `` git clone failed for `<url>` (exit 128). `` renders — url quoted, exit code
  bare; the clone-timeout keeps `5000ms` bare (AC-3.1).
- List inventory and other install support lines quote their value tokens
  (AC-4.2).
- No install support message delimits a value token with `"`/`'` (AC-2.8).

---

### Task 9: Sweep e2e expected outputs, regenerate BEHAVIOR.md, and pass the full gate

**Objective:** Bring the deferred whole-change gates green — update every affected
e2e `case.yml` expected string to the backticked forms, regenerate
`packages/cli/docs/BEHAVIOR.md`, confirm the agent-skill Markdown is untouched,
and run the entire local gate to 0 (FR-6, FR-7).

**Input / context:** Output of Tasks 1–8 (all source messages now quoted, all
co-located unit tests green; the e2e suite has been red since Task 2 by design).
`spec.md §6` (full gate list), FR-6 (AC-6.1, AC-6.2), FR-7 (AC-7.1, AC-7.2). The
248 e2e cases live under `packages/cli/test/e2e/cases/<case-id>/case.yml`; their
`expect.stdout`/`expect.stderr` carry the literal message strings.

**Steps:**
1. Run `bun run test:cli:e2e` and capture the failures. Each failing case prints
   an expected-vs-actual diff; the **actual** output is the new backticked
   message produced by Tasks 1–8.
2. For each failing case, update its `case.yml` `expect.stdout`/`expect.stderr`
   to the new backticked string **only after confirming** the new string adds
   only backtick delimiters (no wording change) — i.e. the diff is purely added
   `` ` `` characters around value tokens. Re-run and repeat until
   `bun run test:cli:e2e` exits 0. Do not edit `fixture/` inputs or `covers`
   refs; only expected outputs change.
3. Run the full unit suite `bun run test` and fix any remaining co-located
   assertion drift missed in Tasks 2–8.
4. Regenerate the living doc: `bun run docs:cli:living`, then confirm
   `bun run docs:cli:living --check` exits 0.
5. Confirm the agent-skill Markdown surface is untouched: `git diff --name-only`
   does **not** list `packages/cli/src/targets/agent-skill.ts` (AC-6.2), and the
   generate `--check` e2e cases pass byte-for-byte (covered by step 1; AC-6.1).
6. Run the remaining gate commands: `bun run check`, `bun run typecheck`,
   `bun run build`.
7. Completeness pass for AC-7.1: confirm no user-facing message across the full
   message-bearing surface still interpolates a bare value token. The anchored
   scan `grep -rnE
   '(input|flag|argument|option|target|Template|Variant|Include|entry) [^\`]*\$\{'
   packages/engine/src packages/cli/src` is a **heuristic aid, not the gate** — it
   only catches interpolations preceded by one of those anchor words and will
   **miss** value tokens introduced by other prose (e.g. the `missing_project_root`
   message's `… globally (${…})` path, which no anchor word precedes). The actual
   backstop is an exhaustive file-by-file confirmation over the complete set of
   files that throw a user-facing `JastrError` or emit a stdout/stderr line — the
   Task 2/3/5/6/7/8 files **plus** `templates/template-ref.ts` and
   `fs/project-root.ts` (which `spec.md §5`'s approximate family list omits;
   `targets/agent-skill.ts` is excluded by FR-6, and `frontmatter.ts` carries only
   non-interpolated literals). For each file confirm every interpolated value
   token is wrapped via the helper and every remaining bare `${…}` is a non-message
   computation, a numeric/fixed-vocabulary token, or a fully-literal token (Q1). A
   second, anchor-free sweep (`grep -rnE '\$\{' packages/engine/src
   packages/cli/src`, triaged by hand — DoF-4 accepts exhaustive manual review)
   catches anything the anchored heuristic skips. Fix any genuine miss (looping
   back to the owning file's task pattern).

**Files modified:** affected `packages/cli/test/e2e/cases/*/case.yml` (expected
outputs only), `packages/cli/docs/BEHAVIOR.md`, plus any unit test files needing
residual fixes.

**Verification:** all of the following exit 0 —
- `bun run check`
- `bun run typecheck`
- `bun run test`
- `bun run test:cli:e2e`
- `bun run docs:cli:living --check`
- `bun run build`

and `git diff --name-only` does not include
`packages/cli/src/targets/agent-skill.ts`.

**Acceptance criteria:**
- No user-facing CLI message interpolates a bare value token; every such token is
  wrapped via the helper (AC-7.1).
- All affected automated tests are updated and pass; `BEHAVIOR.md` is regenerated
  and `--check`-clean; the full gate exits 0 (AC-7.2, `spec.md §6`).
- `jastr generate agent-skill … --check` passes byte-for-byte and
  `targets/agent-skill.ts` is unedited (AC-6.1, AC-6.2).

## Notes

- **Engine-first ordering** is chosen deliberately (`spec.md §8 DoF-3` leaves
  sequencing open): the engine helper + messages (Tasks 1–3) underpin engine unit
  tests independently of the CLI, and the CLI work (Tasks 4–8) then layers on top.
- **Apparent "(unchanged)" in `spec.md §4.5`** for the `cannot declare default
  when required is true.` line refers only to the `required:`-vocabulary token
  staying bare; the interpolated `${inputName}` on that line **is** quoted, per
  the stateless §4.1 rule (handled in Task 2).
- **`details` payloads and error codes never change** — only message text gains
  backticks. The cycle chain (Task 3) and enum lists (Task 2) keep raw `details`
  while presenting quoted message strings; this is the one place message and
  `details` intentionally diverge.
- **Per-site tokenization** for bracketed scopes (`[local]`), the
  `::name`/`:::name` directive snippets, the cycle chain, compound config keys,
  and multi-part install sources is the implementer's call under `spec.md §8
  DoF-2`; any reading faithful to §4.2 passes review.
