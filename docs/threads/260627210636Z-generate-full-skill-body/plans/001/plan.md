# Plan: `inline` rendered-skill mode for `jastr generate agent-skill`

Compiles `specs/001/spec.md` (approved 260628101300Z, tier 2) into an
implementable sequence. The feature adds `--mode <router|inline>` to `jastr
generate agent-skill`; `inline` writes a self-contained `SKILL.md` (existing
frontmatter + the fully-rendered template body) with no runtime `jastr`
dependency. The feature is **CLI-only**: `packages/engine` is not touched and no
new `JastrErrorCode` is introduced (spec Constraints; decision log P1/P4).

Settled decisions referenced below live in
`seed/discussions/260627214826Z-inline-agent-skill-mode-decision-log.md`
(cited as `P1`–`P4`).

## Architecture chosen within the spec's degrees of freedom

The spec's "Degrees of freedom" leave the reuse factoring, Commander wiring, and
validation ordering open. This plan commits to one concrete shape so the tasks
are prescriptive; each choice stays inside the pinned contract:

- **Input resolution** is extracted from `executeRun` into a shared
  `resolveTemplateInputs` helper (Task 2), reused verbatim by inline generate
  (Task 4). (`run`-identical precedence is pinned by behavior 4; the *extraction*
  is the open `how`.)
- **Frontmatter header** assembly is extracted from `buildAgentSkillContent`
  into `buildAgentSkillFrontmatterHeader`, reused by a new
  `buildInlineAgentSkillContent` (Task 3). Router output stays byte-identical.
- **Mode-aware `--check` messages** are produced by threading a `mode` argument
  into the existing `checkAgentSkillOutput` (Task 3); router message bytes are
  unchanged.
- **Commander wiring** declares `--mode <mode>` and captures template input-flag
  tokens for the inline path; argv-shape gating (router rejects input flags,
  `--mode` value validation) lives in `validateGenerateArgs`, which already runs
  on raw argv before Commander parses (Task 1, Task 4).

## Tasks

### Task 1: Gate `--mode` and template input flags in generate argv validation

**Objective:** Make `validateGenerateArgs` recognize and validate `--mode`, and
reject template input flags in router mode, so argv-shape errors surface as
`invalid_command` before Commander parses (spec behaviors 1 & 7; P1, P4 detail 4).

**Input / context:** `packages/cli/src/args.ts` — `validateCliArgv` already calls
`validateGenerateArgs(rest)` on the raw argv (`packages/cli/src/index.ts:9`)
*before* `program.parseAsync`, so this function is the authority on generate
argv shape. Pinned values: accepted `--mode` values are exactly `router` and
`inline`; omission means `router`; any other value and a value-less `--mode` are
`invalid_command` (spec AC-1.3, AC-1.4). Router + any template input flag is
`invalid_command` (spec AC-7.1); inline + input flags is accepted (spec AC-7.2).

**Steps:**
1. In `validateGenerateArgs` add recognition for both `--mode <value>` (value in
   the next argv slot) and `--mode=<value>` forms. For the spaced form, treat a
   missing next token or a next token starting with `--` as a missing value →
   `invalid_command` with message `Missing value for --mode.`; for the `--mode=`
   form, an empty value is the same error. Advance the loop index past a consumed
   spaced value exactly as the existing `--out` arm does.
2. Validate the resolved mode value against the set `{ "router", "inline" }`;
   on any other value throw `invalid_command` with message `Invalid generate mode
   <value>. Expected router or inline.` Record the resolved mode (default
   `router` when `--mode` is absent) in a local.
3. Reclassify the current catch-all arms: a token matching `--out`/`--out=`/
   `--check`/`--force`/`--mode`/`--mode=`/help stays a known generate option;
   every *other* `--name` or `--name=value` token is a **template input flag**
   candidate rather than an immediate `Unknown generate option` error. Collect
   these candidate tokens.
4. Because `--mode` may appear after an input flag, determine the effective mode
   across the whole argv first (a pre-scan for `--mode`/`--mode=`), then apply
   the gate: if mode is `router` and any input-flag candidate was collected,
   throw `invalid_command` (e.g. `Template input flags are only valid with
   --mode=inline.`); if mode is `inline`, accept them. Preserve the existing
   `Invalid generate argument <arg>` error for bare (non-`--`) positionals and
   the existing `--check`/`--force` mutual-exclusion check unchanged.
5. Update the `expectedCommandShape` string to include the `[--mode
   <router|inline>]` option in the `generate agent-skill` usage segment.

**Files modified:** `packages/cli/src/args.ts`

**Verification:**
- `bun run check` and `bun run typecheck` exit 0 (standing gates).
- `bunx vitest run packages/cli/test/generate-command.test.ts` passes (add, in
  this task, focused `runCli` assertions: `--mode=bogus` → exit 1 stderr matching
  `Invalid generate mode`; `--mode` with no value → exit 1
  `Missing value for --mode.`; `generate agent-skill demo --out x --target=spec`
  with no `--mode` → exit 1 stderr matching `only valid with --mode=inline`).
- These router-rejection / mode-value paths are observable now because
  `validateGenerateArgs` runs before Commander; inline-with-flags acceptance is
  verified in Task 4.

**Acceptance criteria:**
- `--mode=router` and `--mode=inline` pass argv validation; absence defaults to
  router (no error).
- `--mode=<other>` and value-less `--mode` both throw `invalid_command` with a
  clear message.
- A template input flag with router mode (explicit or default) throws
  `invalid_command`; with `--mode=inline` it passes argv validation.
- `expectedCommandShape` documents `--mode`.
- Existing generate argv behaviors (`--out`, `--check`, `--force`,
  check/force conflict, bare-positional) are unchanged. An unrecognized
  `--name`/`--name=value` token is no longer an immediate `Unknown generate
  option` error: it is reclassified as a template-input-flag candidate —
  rejected in router mode as `invalid_command` and accepted in inline mode (the
  exact rejection message is within the spec's degrees of freedom).

---

### Task 2: Extract a shared `resolveTemplateInputs` helper from `executeRun`

**Objective:** Factor `run`'s input-resolution pipeline into a reusable helper so
inline generate can resolve inputs through the exact same path, with `run`'s
behavior left byte-identical (spec behavior 4, Constraint "Maximal reuse"; P2).

**Input / context:** `packages/cli/src/commands.ts` — `executeRun`
(`commands.ts:38-102`) currently inlines: load composed config inputs (named
only), load the selected variant (named + `#variant` only), run the locked-flag
conflict check, `coerceRunFlags`, and merge with the pinned precedence (CLI flags
> local config > global config > author defaults, plus variant locked-inputs).
The loaded-template object is `LoadedTemplateReference`
(`packages/cli/src/templates/template-ref.ts`), carrying `mode`, `roots`,
`templateRef`, `variantId`. `ProjectConfigVariant` is from
`packages/cli/src/config.ts`. This task is a pure refactor — no behavior change.

**Steps:**
1. Add an exported async helper to `commands.ts` that owns the resolution. Pin
   the signature so Task 4 can depend on it:
   ```ts
   export async function resolveTemplateInputs(opts: {
     template: LoadedTemplateReference;
     schema: TemplateSchema;
     flags: RawFlag[];
   }): Promise<{
     inputs: Record<string, unknown>;
     selectedVariant: ProjectConfigVariant | undefined;
   }>
   ```
2. Move into the helper, verbatim, the existing `executeRun` logic for:
   `loadComposedConfigInputs` (named only, else `{}`), `loadComposedConfigVariant`
   (named + `variantId` defined, else `undefined`), the `assertNoLockedInputFlags`
   call (guarded on `selectedVariant !== undefined && template.variantId !==
   undefined`, before `coerceRunFlags`), `coerceRunFlags`, and the
   `mergeVariantInputs` / spread merge that produces `inputs`. Return both the
   merged `inputs` and the `selectedVariant` (so a caller that also needs the
   variant — Task 4 — does not re-load it).
3. Rewrite `executeRun` to call `resolveTemplateInputs` for `inputs` and then
   render via `renderTemplateSource` exactly as today (same `sourceId`,
   `includeResolver`, return of `result.markdown`). Remove the now-duplicated
   resolution code from `executeRun`.
4. Keep all imports/exports consistent; remove any import left unused in
   `commands.ts` *only if* this refactor orphaned it.

**Files modified:** `packages/cli/src/commands.ts`

**Verification:**
- `bun run check` and `bun run typecheck` exit 0.
- `bunx vitest run packages/cli/test/run-command.test.ts` passes unchanged (the
  byte-for-byte evidence that `run` resolution is preserved).
- `bunx vitest run packages/cli/test/config.test.ts` passes (config precedence
  unaffected).

**Acceptance criteria:**
- `resolveTemplateInputs` is exported from `commands.ts` with the signature
  above and encapsulates config-load + variant-load + locked-flag check +
  flag-coerce + precedence merge.
- `executeRun` produces byte-identical output to before for every existing
  `run-command` / `config` test (no behavior change).
- No resolution logic remains duplicated between `executeRun` and the helper.

---

### Task 3: Add inline content builders and mode-aware `--check` messages

**Objective:** Provide the agent-skill module pieces inline mode needs — a shared
frontmatter-header builder, an inline content builder (header + rendered body in
the pinned byte format), and a mode parameter on `checkAgentSkillOutput` — while
keeping all router output and messages byte-identical (spec behaviors 3, 6, 8;
P3, P4 details 2 & 3).

**Input / context:** `packages/cli/src/targets/agent-skill.ts` —
`buildAgentSkillContent` (`agent-skill.ts:239-304`) already computes the
frontmatter `header` as `` `---\n${YAML.stringify(frontmatter).trimEnd()}\n---` ``
from `name` + `description` + assembled `argument-hint` + passthrough
`frontmatter`, where `argument-hint` comes from
`assembleArgumentHint(prefix, deriveArgumentHintForm(inputs))` and is omitted
when both are empty. `checkAgentSkillOutput` (`agent-skill.ts:421-454`) hardcodes
suggested-fix commands without `--mode`. Pinned inline format (spec AC-3.3, P4
detail 3): `---\n<yaml>\n---\n\n<body>` — exactly one blank line, body verbatim
from `renderTemplateSource` (no trim, no added/stripped trailing newline). Pinned
`argument-hint` rule (spec behavior 6, P3): inline passes an **empty** input list
so the derived form is `""`, yielding the prefix verbatim or an omitted field.

**Steps:**
1. Extract the header assembly into an exported helper, e.g.
   `buildAgentSkillFrontmatterHeader(target: AgentSkillTarget, inputs:
   ReadonlyArray<{ name: string; definition: TemplateInputDefinition }>):
   string` that returns the existing `` `---\n${YAML.stringify(frontmatter)
   .trimEnd()}\n---` `` string (frontmatter object built exactly as today,
   including the `argument-hint` assembly and passthrough spread). Refactor
   `buildAgentSkillContent` to call this helper for its `header` local so router
   output stays byte-identical.
2. Add an exported `buildInlineAgentSkillContent(options: { target:
   AgentSkillTarget; body: string }): string` that returns the inline file. Pin
   the join exactly:
   ```ts
   const header = buildAgentSkillFrontmatterHeader(options.target, []);
   return `${header}\n\n${options.body}`;
   ```
   Passing `[]` makes the derived form empty, so `argument-hint` is the author
   prefix verbatim (when present) or omitted (when absent) — no `--flag` form,
   per spec AC-6.2/6.3/6.4. `options.body` is appended verbatim (no trim).
3. Add a `mode: "router" | "inline"` parameter to `checkAgentSkillOutput`
   (default `"router"` to keep existing call sites byte-identical). When
   `mode === "inline"`, include `--mode=inline` in the `output_missing`
   suggested-fix command and `--mode=inline` (alongside the existing `--force`)
   in the `output_stale` suggested-fix command; when `"router"`, emit today's
   exact messages unchanged (spec AC-8.2/8.3; router unchanged per AC-2.x).

**Files modified:** `packages/cli/src/targets/agent-skill.ts`

**Verification:**
- `bun run check` and `bun run typecheck` exit 0.
- `bunx vitest run packages/cli/test/agent-skill-target.test.ts` passes (add, in
  this task, unit assertions: `buildInlineAgentSkillContent` yields
  `---\n…\n---\n\n<body>` with a single blank line and verbatim body; with a
  prefix-bearing target the `argument-hint` equals the prefix verbatim and no
  `--flag` form appears; with no prefix the field is absent;
  `checkAgentSkillOutput({ mode: "inline", … })` messages contain `--mode=inline`).
- `bunx vitest run packages/cli/test/generate-command.test.ts` still passes
  (router path byte-identical).

**Acceptance criteria:**
- `buildAgentSkillFrontmatterHeader` exists and is the single source of the
  `---\n<yaml>\n---` header for both router and inline; router output is
  byte-identical to before.
- `buildInlineAgentSkillContent` returns `---\n<yaml>\n---\n\n<body>` with the
  body verbatim and the `argument-hint` rule above.
- `checkAgentSkillOutput` accepts `mode`; inline messages name `--mode=inline`,
  router messages are unchanged bytes.

---

### Task 4: Wire `--mode`/inline through `executeGenerate` and the Commander command

**Objective:** Thread `mode` and template input flags from the CLI into
`executeGenerate`, branching to the inline path (resolve inputs → real render →
inline content) while leaving the router path unchanged (spec behaviors 1–6;
P1, P2, P3, P4 details 2 & 3).

**Input / context:** Depends on Tasks 1–3. `packages/cli/src/commands.ts`
`executeGenerate` (`commands.ts:104-204`) today: validates target, resolves
`out`, guards availability (skipped under `--check`), loads template + schema,
builds the `AgentSkillTarget` (base or variant-overlaid, including
`argument-hint-prefix` resolution at `commands.ts:147-167`), does a **sampled**
static render, builds router content, then `--check`-or-write. The Commander
`generate` command (`packages/cli/src/commands/generate.ts`) currently exposes
only `--out`/`--check`/`--force` and no input-flag passthrough. Inline must
resolve inputs via `resolveTemplateInputs` (Task 2) and render with the **real**
effective inputs (spec behavior 3 — not the sampled render). The success message
(`Generated <path> from template <source>`) is shared (spec AC-3.5). Validation
ordering among coexisting defects is free (spec DoF).

**Steps:**
1. Extend `executeGenerate`'s options with `mode: "router" | "inline"` and
   `flags: RawFlag[]`. Keep the target-validation, `out` resolution, the
   `--check` availability-guard skip, template/schema load, and the
   `AgentSkillTarget` construction block (base vs variant overlay + prefix
   resolution) as shared code that runs for both modes.
2. After the shared `target` is built, branch on `mode`:
   - **router** (default): keep today's flow exactly — `sampleInputsForStaticRender`
     render + `buildAgentSkillContent({ templateRef, target, inputs:
     listUnlockedTemplateInputs(...) })`.
   - **inline**: call `resolveTemplateInputs({ template, schema, flags })` to get
     the effective `inputs`, render once via `renderTemplateSource` with those
     `inputs` (same `sourceId`/`includeResolver` as `executeRun`), and build
     content via `buildInlineAgentSkillContent({ target, body: result.markdown })`.
     The real render naturally raises the engine's existing
     `missing_required_input` for an unresolved required input (spec behavior 5),
     and `resolveTemplateInputs` raises `locked_input_flag` for a flag colliding
     with a locked input (spec AC-4.4) — no new code for either.
3. Pass `mode` into `checkAgentSkillOutput` when `opts.check`, so inline check
   messages name `--mode=inline` (Task 3). The write path and shared success
   message are unchanged.
4. In `packages/cli/src/commands/generate.ts`: add a `--mode <mode>` option
   (Commander default `"router"`), and capture template input-flag tokens for the
   inline path. Capture approach (within spec DoF — "as long as behavior 7
   holds"): declare a trailing `[inputs...]` variadic and `allowUnknownOption()`
   so unrecognized `--name[=value]` tokens collect as operands, then parse them
   with `parseRunFlags` and pass the result as `flags` to `executeGenerate`.
   (Router-mode rejection of input flags is already enforced upstream by Task 1's
   `validateGenerateArgs`, so the Commander layer only needs to *deliver* the
   tokens.) Pass `mode: options.mode` through. If `allowUnknownOption` does not
   route unknown tokens to the variadic in the installed Commander, fall back to
   parsing the input-flag tokens out of `process.argv` after the known generate
   options — still within DoF.
5. Confirm the engine remains untouched: no edits under `packages/engine`
   (spec FR-10 / Constraints).

**Files modified:** `packages/cli/src/commands.ts`,
`packages/cli/src/commands/generate.ts`

**Verification:**
- `bun run check` and `bun run typecheck` exit 0.
- `bunx vitest run packages/cli/test/generate-command.test.ts` passes (add, in
  this task, focused `runCli` assertions covering the inline happy path end to
  end: `generate agent-skill <ref> --out <p> --mode=inline` writes a file whose
  first line is `---`, whose body is the rendered template (an `include` appears
  inlined, an `if`/`else` shows only the selected branch), and prints `Generated
  … from template …`; an inline ref with an unresolved required input exits 1
  with `Required input <name> is missing.` and writes no file; `--mode=inline`
  with a declared input flag resolves that input).
- `git status --porcelain packages/engine` is empty (engine untouched).

**Acceptance criteria:**
- `executeGenerate` accepts `mode` + `flags`; router branch output is
  byte-identical to before; inline branch writes `---\n<yaml>\n---\n\n<body>`
  with the real rendered body.
- Inline resolves inputs with `run`'s precedence (flags > local > global >
  defaults + variant locks); unresolved required input → `missing_required_input`
  (no file written); locked-input flag → `locked_input_flag`.
- Inline `--check` routes through `checkAgentSkillOutput` with `mode: "inline"`.
- `targets.agent-skill` absence in inline still fails with
  `missing_target_metadata` (shared target-build block).
- No file under `packages/engine` is modified.

---

### Task 5: Add functional requirements and e2e cases for inline mode

**Objective:** Cover every inline behavior with new `GEN-FR` requirements and
traceable e2e cases following repo conventions, so the contract's machine-checkable
ACs are exercised by the real CLI (spec FR-11 / AC-11.1).

**Input / context:** Depends on Tasks 1–4 (feature behavior must exist). Repo
conventions: requirements live in
`packages/cli/requirements/functional/06-generate.yml` (highest existing id is
`GEN-FR-0023`; new ids start at `GEN-FR-0024`). E2e cases live in
`packages/cli/test/e2e/cases/<case-id>/case.yml` with a `fixture/` workspace, an
`expected/` tree, and `covers: [<FR-ID>.AC-NNNN, …]` traceability validated by
`packages/cli/test/e2e/e2e.test.ts`. Exact case ids/slugs, the FR-area split, and
fixture specifics are spec DoF; the coverage and traceability below are pinned.

**Steps:**
1. Append new `GEN-FR` entries to `06-generate.yml` covering the inline surface.
   Suggested grouping (ids/AC wording are DoF, the behaviors are not):
   - mode selection & validation (no-mode → router; router/inline accepted; bad
     value → `invalid_command`; value-less `--mode` → `invalid_command`) — spec
     FR-1.
   - inline body composition (include inlined; `if`/`else` selected branch only;
     `---\n<yaml>\n---\n\n<body>` byte format; none of the router scaffolding;
     `Generated …` success message) — spec FR-3.
   - inline input resolution (config reflected; flag overrides config; variant
     locked baked; locked-input flag → `locked_input_flag`; direct `.md` ignores
     config/variants) — spec FR-4.
   - inline unresolved required input → `missing_required_input`, no file — spec
     FR-5.
   - inline frontmatter & `argument-hint` (name/description/passthrough; prefix
     verbatim; omitted when no prefix; variant prefix wholesale; missing
     `targets.agent-skill` → `missing_target_metadata`) — spec FR-6.
   - input flags mode-gated (router + input flag → `invalid_command`; inline +
     input flag accepted) — spec FR-7.
   - inline `--check` parity & mode-aware messages (up-to-date exit 0; stale →
     `output_stale` whose suggested fix names `--mode=inline` and `--force`;
     missing → `output_missing` whose suggested fix names `--mode=inline`;
     `--check --force` rejected as today) — spec FR-8.
2. Create one e2e case per acceptance criterion under
   `packages/cli/test/e2e/cases/<case-id>/`, each with a minimal `fixture/.jastr/`
   template (or a direct `.md` fixture for AC-4.5), a `command:` array, an
   `expect:` block (exitCode/stdout/stderr and, for write cases, an
   `expected/files/...` comparison), and a `covers:` list referencing the new
   `GEN-FR.AC` ids. Mirror the structure of existing `generate-router` /
   `generate-check-stale` cases. Include a fixture whose rendered body’s first
   line is `---` (spec "Unresolved questions") to confirm the benign
   double-`---` outcome.
3. Map spec ACs → cases so every spec AC-1.x … AC-8.x and AC-6.x has at least one
   covering case. Add a case asserting `validate <ref> --mode=inline` is rejected
   as an unknown validate option (spec AC-9.1 — `validate` stays mode-agnostic).
4. Do **not** modify existing router/validate cases (spec AC-2.2 / AC-9.1 require
   them to keep passing unchanged); their continued green run is the regression
   evidence for router byte-identity.

**Files modified:** `packages/cli/requirements/functional/06-generate.yml`,
`packages/cli/test/e2e/cases/<new-case-id>/case.yml` (NEW, several),
`packages/cli/test/e2e/cases/<new-case-id>/fixture/**` (NEW),
`packages/cli/test/e2e/cases/<new-case-id>/expected/**` (NEW)

**Verification:**
- `bun run test:cli:e2e` exits 0 (all cases pass, traceability validates,
  including the new `covers:` refs resolving to the new `GEN-FR` ids).
- `bun run check` and `bun run typecheck` exit 0.
- `grep -R "GEN-FR-0024" packages/cli/requirements/functional/06-generate.yml`
  returns a match (new requirements present).

**Acceptance criteria:**
- New `GEN-FR` entries exist in `06-generate.yml` covering mode selection, inline
  body, inline resolution, unresolved-required, inline frontmatter/`argument-hint`,
  mode-gated flags, and inline `--check`.
- Each new e2e case carries valid `covers:` traceability and passes through the
  real CLI; every spec AC-1.x–AC-9.x maps to at least one case (engine-static
  AC-10.x are verified in Task 6).
- Existing router and validate cases are untouched and still pass.

---

### Task 6: Reconcile docs and run the full green gate

**Objective:** Update `AGENTS.md` and `README.md` so they no longer assert
`generate agent-skill` only emits the wrapper-body shape, regenerate
`BEHAVIOR.md`, and confirm the whole project gate is green (spec FR-11 /
AC-11.2/11.3/11.4, and the static engine-untouched AC-10.x).

**Input / context:** Depends on Tasks 1–5 (behavior, tests, and cases complete).
`AGENTS.md` currently describes generated skills only as wrapper files that shell
out to `jastr run` (e.g. the "Agent-facing skills should be minimal wrapper
files…" paragraph and the canonical-commands / generate bullets). `CLAUDE.md` is
a symlink to `AGENTS.md`. `README.md` carries the public description.
`packages/cli/docs/BEHAVIOR.md` is generated by `bun run docs:cli:living` from
requirements + cases. The repo "Update rule" requires reconciling stale "only",
"always", "hardwired" claims in the area touched.

**Steps:**
1. In `AGENTS.md`: add a description of `--mode <router|inline>` on `jastr
   generate agent-skill` — router is today's wrapper (default, unchanged), inline
   writes a self-contained `SKILL.md` (frontmatter + fully-rendered body, no
   runtime `jastr`), with inline resolving inputs via `run`'s pipeline, an empty
   derived `argument-hint` form (prefix verbatim or omitted), template input
   flags valid only in inline mode, and mode-aware `--check` suggested-fix
   messages. Update the canonical-commands list and the `generate agent-skill`
   bullet(s) accordingly; add the spec link for this thread to an Architecture
   Decisions bullet per the Update rule. Reconcile any "wrapper-only" /
   "hardwired to the wrapper-body shape" phrasing.
2. In `README.md`: reflect the new `--mode` capability and inline output in the
   public usage/feature description and current-status text.
3. Regenerate the living doc: `bun run docs:cli:living` (writes
   `packages/cli/docs/BEHAVIOR.md` from the new requirements + cases).
4. Run the full standing gate and fix any fallout.

**Files modified:** `AGENTS.md`, `README.md`,
`packages/cli/docs/BEHAVIOR.md` (regenerated)

**Verification:**
- `bun run check` exits 0.
- `bun run typecheck` exits 0.
- `bun run test` exits 0.
- `bun run test:cli:e2e` exits 0.
- `bun run docs:cli:living --check` exits 0 (BEHAVIOR.md current — spec AC-11.2).
- `bun run build` exits 0.
- `git status --porcelain packages/engine` is empty — the engine source being
  untouched proves AC-10.2 (no engine edit) and, because the `JastrErrorCode`
  union is defined only under `packages/engine/src`, also proves AC-10.1 (the
  union gains no member when that tree is unchanged).
- `grep -niE "wrapper|hardwired" AGENTS.md` no longer asserts generate is
  wrapper-only (claims reconciled — spec AC-11.3).

**Acceptance criteria:**
- `AGENTS.md` and `README.md` document `--mode`/inline and no longer claim
  `generate agent-skill` only emits the wrapper body; the thread spec is linked
  per the Update rule.
- `packages/cli/docs/BEHAVIOR.md` is regenerated and `--check`-clean.
- All six gate commands (`check`, `typecheck`, `test`, `test:cli:e2e`,
  `docs:cli:living --check`, `build`) exit 0.
- `packages/engine` is unmodified and the `JastrErrorCode` union gains no member.

## Notes

- **Engine boundary.** Every task is CLI-only by construction; Task 4 and Task 6
  explicitly verify `packages/engine` is untouched (spec FR-10). If any task
  appears to need an engine edit, stop — that contradicts the pinned contract.
- **Router byte-identity** is the load-bearing backward-compat guarantee
  (spec FR-2). Tasks 2, 3, and 4 each keep the router path on its existing code
  paths and rely on the unmodified existing router/check e2e cases as the
  regression oracle.
- **`--check` reproducibility under ad-hoc flags** is a documented, non-novel
  trade-off (spec behavior 8; P2/P4): the inline `--check` suggested-fix omits
  input flags, so an inline skill generated with ad-hoc flags should be pinned to
  a `#variant` or `config.yml` for a self-contained regen command. No code guards
  this; it is a usage note only.
