# Plan: `jastr list --variants`

Compiles `specs/001/spec.md` (tier 2, per `ledger.md`). The spec is the contract;
this plan is disposable scaffolding for it.

> **Contract signed.** `specs/001/spec.md` frontmatter carries
> `status: { approved: 260627212527Z }` — the approval latch is set, so the spec
> is the signed contract this plan compiles. If the spec is amended after this,
> reconcile the affected tasks before implementing.

## Goal

Add an opt-in `--variants` flag to `jastr list` that renders config-defined
variants as a tree hanging under each present, runnable template row, byte-exact
to the spec's B4 contract, reusing the existing `invalid_config` parse path
row-scoped, with zero change to plain `jastr list`. CLI-only; `@jastr/engine` is
untouched (no new `JastrErrorCode`).

## Sequencing rationale

- **Task 1** lands all production code as one cohesive, end-to-end-observable
  unit (a config-helper-only task would be unwired and unobservable). The feature
  works after Task 1; Tasks 2–3 lock each behavior with requirements + e2e cases.
- **Tasks 2–3** add the new functional requirements together with the e2e
  case(s) covering their ACs in the *same* task. This is mandatory, not stylistic:
  `packages/cli/test/e2e/harness/traceability.ts` fails the suite if any active
  AC has no covering case, so a requirement and its cases must land together to
  keep `bun run test:cli:e2e` green at every task boundary. `LIST-FR-0006` and
  `LIST-FR-0007` share their group-tree covering case
  (`list-variants-group-members` proves both `LIST-FR-0006.AC-0003` and
  `LIST-FR-0007.AC-0001` — they are the same observable tree), so both
  requirements land in the *same* task (Task 2); splitting them would leave
  `LIST-FR-0006.AC-0003` active but uncovered at the Task-2 boundary and redden
  the suite.
- **Task 4** runs the deferred whole-change gates once: the FR-0005 prose tweak,
  README/AGENTS prose, the `BEHAVIOR.md` regeneration, the full `bun run test`,
  the full `bun run build`, and `docs:cli:living --check`. These are the
  churn-heavy gates the skill says to defer; the cheap standing gates
  (`bun run check`, `bun run typecheck`, focused e2e) run inside every task.

## Standing gates (run inside every code/case task unless noted)

- `bun run check` (Biome) — cheap, every task.
- `bun run typecheck` — cheap, every task.
- `bun run test:cli:e2e` — focused CLI e2e incl. traceability; every task from
  Task 2 on (Task 1 adds no cases, so it verifies via a live CLI run instead).

Deferred to Task 4 (expensive / churn-heavy whole-change): full `bun run test`,
full `bun run build`, `bun run docs:cli:living` regeneration, and
`bun run docs:cli:living --check`. `BEHAVIOR.md` is intentionally stale between
Tasks 2–3; only Task 4 regenerates and checks it.

---

### Task 1: Implement `--variants` (config read path, flag wiring, tree rendering)

**Objective:** Make `jastr list --variants` read each in-scope root's own
`config.yml`, enumerate variant ids for present runnable refs row-scoped, and
render them as the byte-exact B4 tree — while plain `jastr list` stays
byte-identical and reads no config.

**Input / context:** `specs/001/spec.md` B1–B6, the Degrees of freedom section,
and the byte-exact examples in B4. Settled decisions:
`seed/discussions/260627172443Z-list-variants-design-decision-log.md` P1
(strict per-root, row-driven), P2 (bare-ref line, sort by id), P3 (reuse
`invalid_config`, row-scoped), P4 (attach only to standalone + on-disk
group-member refs); `specs/001/discussions/260627195921Z-spec-review-clarifications-decision-log.md`
P2 (a zero present-runnable-row root is never consulted). Existing code:
`packages/cli/src/config.ts` (the `invalid_config` messages and the private
`loadProjectConfig`), `packages/cli/src/install/list.ts` (`executeList`,
`inventoryRoot`, `formatMemberTree`), `packages/cli/src/commands/list.ts`
(Commander wiring). The e2e harness runs the CLI from source via
`bun packages/cli/src/index.ts` (no build needed for the live check below).

**Steps:**
1. In `packages/cli/src/config.ts`, add an exported async helper
   `loadProjectConfigVariantIds(options: { projectRoot: string; refs: readonly string[] }): Promise<Map<string, string[]>>`.
   Pin this signature (a Degree of freedom grants alternative factorings, but
   pin one). Implement it by reusing the existing private `loadProjectConfig`:
   - `const parsed = await loadProjectConfig(options.projectRoot);` — this reuses
     the existing parse path, so an unparseable file already throws
     `invalid_config` `.jastr/config.yml could not be parsed.` and a non-mapping
     whole file throws `.jastr/config.yml must be a mapping.` with no new code.
   - Read `const variants = parsed.variants;`. If `undefined`, return an empty
     `Map`. If present but not a record (use the existing `isRecord` predicate),
     throw `new JastrError("invalid_config", ".jastr/config.yml variants must be a mapping.")`.
   - For each `ref` in `options.refs`: read `variants[ref]`. If `undefined`,
     skip (orphan-agnostic). If present but not a record, throw
     `new JastrError("invalid_config", \`.jastr/config.yml variants.${ref} must be a mapping.\`)`.
     Otherwise set `map.set(ref, Object.keys(variants[ref]).sort())`.
   - Return the map. **Row-scoped is load-bearing:** the helper inspects
     `variants.<ref>` only for refs the caller passed; it never iterates
     `variants`' own keys, so orphan entries are never shape-checked (P3, P1
     guard rail). Never read a variant's inner `locked-inputs` body.
2. In `packages/cli/src/install/list.ts`, extend `ListRow` with two optional
   fields, both populated only under `--variants` so the default render path is
   provably untouched:
   - `variants?: string[]` — a standalone row's sorted variant ids.
   - `memberVariants?: Map<string, string[]>` — for a group row, member id →
     sorted variant ids (only members that have ≥1 variant).
3. In `list.ts`, add `variants: boolean` to `ExecuteListOptions` and import the
   new `loadProjectConfigVariantIds` from `../config`.
4. In `list.ts`, change `inventoryRoot` to accept the flag —
   `inventoryRoot(projectRoot: string, includeVariants: boolean)` — and, after
   the existing `rows.sort(...)`, call `if (includeVariants) await attachVariants(projectRoot, rows);`
   before returning. Update the call site in `executeList` to pass `opts.variants`.
5. In `list.ts`, add `async function attachVariants(projectRoot: string, rows: ListRow[]): Promise<void>`:
   - Build `const refs: string[] = []` by iterating rows: skip `row.status === "missing"`;
     for `kind === "standalone"` push `row.id`; for `kind === "group"` push
     `\`${row.id}/${member}\`` for each `member` in `row.members ?? []`.
   - `if (refs.length === 0) return;` — **this early return is the P2 guarantee**:
     a root with no present runnable rows (empty inventory or all-missing) never
     calls the config reader, so its `config.yml` is never parsed and a malformed
     config there never throws. Do not gate on `rows.length > 0` instead; the
     empty-`refs` return is the single source of truth for "never consulted".
   - `const variantIds = await loadProjectConfigVariantIds({ projectRoot, refs });`
   - Attach: for each non-missing row, for a standalone row set
     `row.variants = variantIds.get(row.id)` when that is a non-empty array; for a
     group row build a `Map` of member → its non-empty `variantIds.get(\`${row.id}/${member}\`)`
     and assign it to `row.memberVariants` when non-empty.
6. In `list.ts`, add `formatStandaloneVariants(row: ListRow): string[]`: return
   `[]` when `row.variants` is absent/empty; otherwise map each `variantId` to
   `\`  ${connector}${row.id}#${variantId}\`` where `connector` is `"└── "` for
   the last and `"├── "` otherwise (2-space base indent, payload at column 6).
7. In `list.ts`, rewrite `formatMemberTree(row)` to also emit member variants.
   For each `member` at `index` (let `isLastMember = index === members.length - 1`):
   - push the existing member line `\`  ${memberConnector}${row.id}/${member}\``
     unchanged (`memberConnector` = `"└── "` if last else `"├── "`);
   - then for `member`'s variants (`row.memberVariants?.get(member) ?? []`) push,
     per variant, `\`${continuation}${variantConnector}${row.id}/${member}#${variantId}\``
     where `continuation = isLastMember ? "      " : "  │   "` (six spaces vs.
     2-space base + `│` + three spaces) and `variantConnector` = `"└── "` for the
     last variant else `"├── "` (payload at column 10). A member with no variants
     emits only its member line — byte-identical to today.
8. In `executeList`'s section loop, insert `lines.push(...formatStandaloneVariants(row));`
   between the `formatRow` push and the existing `formatMemberTree` push. Both
   helpers no-op for the row kind they do not apply to.
9. In `packages/cli/src/commands/list.ts`, add `.option("--variants", "Show config-defined variants as a tree under each runnable template")`
   alongside `--local`/`--global`, and pass `variants: Boolean(options.variants)`
   into the `executeList({...})` call.

**Files modified:** `packages/cli/src/config.ts`,
`packages/cli/src/install/list.ts`, `packages/cli/src/commands/list.ts`

**Verification:**
- `bun run check` and `bun run typecheck` exit 0.
- Live byte check (no build needed): create a temp fixture and run the CLI from
  source against it, e.g. in a scratch dir
  `<tmp>/.jastr/notes/TEMPLATE.md` plus
  `<tmp>/.jastr/config.yml` containing `variants:\n  notes:\n    full: {}\n    brief: {}`,
  then `JASTR_HOME=<empty-tmp> bun packages/cli/src/index.ts list --variants`
  (run with cwd = `<tmp>`). Confirm stdout is exactly:
  ```text
  Local:
    notes (standalone) (local)
    ├── notes#brief
    └── notes#full
  ```
  (variants sorted `brief` < `full`; every leading space literal).
- Re-run the same command without `--variants`; confirm stdout omits both `├──`
  lines (default unchanged).
- Replace the temp `config.yml` body with `variants: true` and run
  `... list --variants`: confirm exit 1 and stderr
  `Error: .jastr/config.yml variants must be a mapping.`; then run `... list`
  (no flag): confirm exit 0 and the plain row (config not read).

**Acceptance criteria:**
- `loadProjectConfigVariantIds` exists in `config.ts` with the pinned signature,
  reuses `loadProjectConfig`, validates only `refs`' own `variants.<ref>` shapes
  (never iterates `variants`' keys), and never reads `locked-inputs`.
- `attachVariants` returns early on empty `refs`, so a root with no present
  runnable rows never triggers a config read.
- `list.ts` renders standalone variants at column 6 and group-member variants at
  column 10 with the exact `├── `/`└── ` connectors and the `  │   ` / six-space
  continuations from B4; a ref with no variants emits no variant lines.
- The `--variants` flag exists on the `list` command and threads through to
  `executeList`; without it, `config.yml` is not read and output is unchanged.
- All four verification observations above hold.

---

### Task 2: Functional requirements `LIST-FR-0006` + `LIST-FR-0007` + rendering e2e cases (default-unchanged, standalone, per-root, group-member variants)

**Objective:** Pin B1, B2 (standalone + grouped), B3, B4 (standalone + grouped
nesting), and B5 with the new `LIST-FR-0006` and `LIST-FR-0007` requirements and
the four e2e cases covering `LIST-FR-0006.AC-0001..AC-0005` and
`LIST-FR-0007.AC-0001`. `LIST-FR-0006.AC-0003` (group-member nesting) and
`LIST-FR-0007.AC-0001` (variants attach to the member, not the aggregate) are the
*same* observable tree, so the single `list-variants-group-members` case covers
both; both requirements therefore land in this one task so no AC is
active-but-uncovered at the task boundary (traceability would otherwise redden).

**Input / context:** Implemented feature from Task 1. `specs/001/spec.md`
acceptance section `LIST-FR-0006` (AC-0001..AC-0005), `LIST-FR-0007` (AC-0001),
and B4's standalone + grouped examples. The AC-fixture rule (spec): **all
fixtures use co-located variants** (the variant's template present in the same
root). Case structure mirrors
`packages/cli/test/e2e/cases/list-group-members/` (a `case.yml` with `covers`,
`command`, `expect`; a `fixture/` copied to the project root; an optional
`global-fixture/` copied to `$JASTR_HOME`; `expected/stdout.txt`). Settled
decision P4
(`seed/discussions/260627172443Z-list-variants-design-decision-log.md`): variants
attach only to on-disk group-member refs; the aggregate id is not runnable.
**P1 guard rail:** do not author a `variants.<bare-group>` entry or any orphan
entry in the group fixture — the "aggregate has no direct children" outcome must
fall out of the member-ref iteration, not from testing orphan suppression. The
existing `list-group-members` case is the structural model. Traceability
(`packages/cli/test/e2e/harness/traceability.ts`) requires every new active AC to
have a covering case in this same task.

**Steps:**
1. Append `LIST-FR-0006` to `packages/cli/requirements/functional/16-list.yml`
   with `status: active`, the title "`list --variants` renders config-defined
   variants; default is unchanged", a description summarizing B1–B5, and five
   acceptance entries AC-0001..AC-0005 transcribed from the spec's
   `LIST-FR-0006` statements.
2. Append `LIST-FR-0007` to `16-list.yml` (`status: active`), title "variants
   attach only to present, runnable refs", description transcribing B2/P4, and one
   acceptance entry AC-0001 from the spec. Include the spec's parenthetical that
   missing-row/orphan suppression is deliberately *not* pinned by an AC
   (emergent), so a future reader does not add such a case.
3. Add case `list-variants-default-unchanged` (covers `LIST-FR-0006.AC-0001`):
   `command: ["list"]`; `fixture/.jastr/notes/TEMPLATE.md` (a standalone,
   authored/local), `fixture/.jastr/config.yml` with a well-formed
   `variants.notes` mapping; `expected/stdout.txt`:
   ```text
   Local:
     notes (standalone) (local)
   ```
   exit 0, `stderr: ""`. This proves the default path ignores `config.yml`: a
   `config.yml` with variants is present, yet no variant lines appear.
4. Add case `list-variants-standalone` (covers `LIST-FR-0006.AC-0002` and
   `LIST-FR-0006.AC-0004`): `command: ["list", "--variants"]`; two standalone
   units — `notes` (with `config.yml` `variants.notes` = `{ full: {}, brief: {} }`)
   and `plain` (no variants entry). `expected/stdout.txt`:
   ```text
   Local:
     notes (standalone) (local)
     ├── notes#brief
     └── notes#full
     plain (standalone) (local)
   ```
   This pins the standalone tree + connectors + `<id>#<variant>` line (AC-0002),
   ascending sort `brief` < `full`, and `plain` contributing no variant lines
   (AC-0004).
5. Add case `list-variants-per-root` (covers `LIST-FR-0006.AC-0005`):
   `command: ["list", "--variants"]`; a standalone `notes` present in **both**
   roots — `fixture/.jastr/notes/TEMPLATE.md` + `fixture/.jastr/config.yml` with
   `variants.notes` = `{ localvar: {} }`, and
   `global-fixture/.jastr/notes/TEMPLATE.md` + `global-fixture/.jastr/config.yml`
   with `variants.notes` = `{ globalvar: {} }`. `expected/stdout.txt`:
   ```text
   Local:
     notes (standalone) (local)
     └── notes#localvar

   Global:
     notes (standalone) (local)
     └── notes#globalvar
   ```
   This proves each section reads only its own root's `config.yml` and a variant
   authored in one root never leaks into the other (no `globalRoot`/`projectRoot`
   substitution needed — `list` prints ids + provenance, not paths).
6. Add case `list-variants-group-members` (covers `LIST-FR-0006.AC-0003` and
   `LIST-FR-0007.AC-0001`): `command: ["list", "--variants"]`. Fixture (model on
   `list-group-members/`):
   - group `team` with members `api` and `demo`
     (`fixture/.jastr/team/.jastrgroup`,
     `fixture/.jastr/team/templates/api/TEMPLATE.md`,
     `fixture/.jastr/team/templates/demo/TEMPLATE.md`), tracked via a hand-written
     `fixture/.jastr/lock.json` recording the `team` group with
     `source: acme/lib`, `ref: main`, and a `commit` whose 12-char prefix is
     `0a1b2c3d4e5f` (copy the lock shape from `list-group-members`);
   - group `tools` with member `fmt` (authored/local, no lock entry);
   - `fixture/.jastr/config.yml` with `variants` defining only member refs:
     `team/api` = `{ strict: {}, v2: {} }` and `team/demo` = `{ draft: {} }`
     (no `variants.team`, no `variants.tools`, no `variants.tools/fmt`).
   - `expected/stdout.txt` (byte-exact B4):
     ```text
     Local:
       team (group) acme/lib@main @ 0a1b2c3d4e5f
       ├── team/api
       │   ├── team/api#strict
       │   └── team/api#v2
       └── team/demo
           └── team/demo#draft
       tools (group) (local)
       └── tools/fmt
     ```
   This pins: nested grandchild variants under members; the `  │   ` continuation
   for non-last `team/api` and six-space continuation for last `team/demo`;
   `tools/fmt` with no grandchildren (the nesting bytes are `LIST-FR-0006.AC-0003`);
   and no direct variant child under the `team (group)` aggregate line
   (`LIST-FR-0007.AC-0001`).
7. Run the focused gates below; do **not** regenerate `BEHAVIOR.md` yet.

**Files modified:** `packages/cli/requirements/functional/16-list.yml`,
`packages/cli/test/e2e/cases/list-variants-default-unchanged/case.yml` (NEW),
`packages/cli/test/e2e/cases/list-variants-default-unchanged/fixture/.jastr/notes/TEMPLATE.md` (NEW),
`packages/cli/test/e2e/cases/list-variants-default-unchanged/fixture/.jastr/config.yml` (NEW),
`packages/cli/test/e2e/cases/list-variants-default-unchanged/expected/stdout.txt` (NEW),
`packages/cli/test/e2e/cases/list-variants-standalone/case.yml` (NEW),
`packages/cli/test/e2e/cases/list-variants-standalone/fixture/.jastr/notes/TEMPLATE.md` (NEW),
`packages/cli/test/e2e/cases/list-variants-standalone/fixture/.jastr/plain/TEMPLATE.md` (NEW),
`packages/cli/test/e2e/cases/list-variants-standalone/fixture/.jastr/config.yml` (NEW),
`packages/cli/test/e2e/cases/list-variants-standalone/expected/stdout.txt` (NEW),
`packages/cli/test/e2e/cases/list-variants-per-root/case.yml` (NEW),
`packages/cli/test/e2e/cases/list-variants-per-root/fixture/.jastr/notes/TEMPLATE.md` (NEW),
`packages/cli/test/e2e/cases/list-variants-per-root/fixture/.jastr/config.yml` (NEW),
`packages/cli/test/e2e/cases/list-variants-per-root/global-fixture/.jastr/notes/TEMPLATE.md` (NEW),
`packages/cli/test/e2e/cases/list-variants-per-root/global-fixture/.jastr/config.yml` (NEW),
`packages/cli/test/e2e/cases/list-variants-per-root/expected/stdout.txt` (NEW),
`packages/cli/test/e2e/cases/list-variants-group-members/case.yml` (NEW),
`packages/cli/test/e2e/cases/list-variants-group-members/fixture/.jastr/lock.json` (NEW),
`packages/cli/test/e2e/cases/list-variants-group-members/fixture/.jastr/team/.jastrgroup` (NEW),
`packages/cli/test/e2e/cases/list-variants-group-members/fixture/.jastr/team/templates/api/TEMPLATE.md` (NEW),
`packages/cli/test/e2e/cases/list-variants-group-members/fixture/.jastr/team/templates/demo/TEMPLATE.md` (NEW),
`packages/cli/test/e2e/cases/list-variants-group-members/fixture/.jastr/tools/.jastrgroup` (NEW),
`packages/cli/test/e2e/cases/list-variants-group-members/fixture/.jastr/tools/templates/fmt/TEMPLATE.md` (NEW),
`packages/cli/test/e2e/cases/list-variants-group-members/fixture/.jastr/config.yml` (NEW),
`packages/cli/test/e2e/cases/list-variants-group-members/expected/stdout.txt` (NEW)

**Verification:**
- `bun run check` and `bun run typecheck` exit 0.
- `bun run test:cli:e2e` exits 0: traceability passes — every active AC of
  `LIST-FR-0006` (AC-0001..AC-0005) and `LIST-FR-0007` (AC-0001) is now covered,
  with `list-variants-group-members` covering both `LIST-FR-0006.AC-0003` and
  `LIST-FR-0007.AC-0001` — and the four new cases pass byte-for-byte.
- `grep -c "AC-000" packages/cli/requirements/functional/16-list.yml` reflects
  the six added entries (five for `LIST-FR-0006`, one for `LIST-FR-0007`).
- `grep -n "variants.team\b" packages/cli/test/e2e/cases/list-variants-group-members/fixture/.jastr/config.yml`
  returns nothing (no orphan/aggregate entry authored — guard rail honored).

**Acceptance criteria:**
- `LIST-FR-0006` with AC-0001..AC-0005 and `LIST-FR-0007` with AC-0001 exist in
  `16-list.yml`, both `status: active`; `LIST-FR-0007`'s description records that
  orphan/missing-row suppression is intentionally not an AC.
- The four cases exist and pass; `list-variants-default-unchanged` runs `list`
  (no flag) over a fixture that *has* a `config.yml` and shows no variant lines.
- `list-variants-standalone` output matches the standalone tree byte-for-byte
  with `brief` before `full` and no lines under `plain`.
- `list-variants-per-root` shows `notes#localvar` only under Local and
  `notes#globalvar` only under Global.
- `list-variants-group-members` matches the B4 grouped example byte-for-byte
  (the `│` continuation for non-last `team/api`, six-space for last `team/demo`,
  `tools/fmt` with no grandchildren, no direct child under the `team (group)`
  aggregate); its fixture authors variants only for member refs (`team/api`,
  `team/demo`) with no `variants.team` or other orphan entry.
- `bun run test:cli:e2e` is green.

---

### Task 3: Functional requirement `LIST-FR-0008` + e2e cases (malformed config fails loudly)

**Objective:** Pin B6 with `LIST-FR-0008` and three e2e cases covering the three
row-scoped `invalid_config` failures (AC-0001 unparseable, AC-0002 non-mapping
`variants`, AC-0003 non-mapping `variants.<ref>` for a present runnable ref).

**Input / context:** Implemented feature from Task 1; requirement format from
Task 2. `specs/001/spec.md` B6 + `LIST-FR-0008` (AC-0001..AC-0003). Settled
decision P3 (reuse exact existing messages, row-scoped) and
`specs/001/discussions/260627195921Z-spec-review-clarifications-decision-log.md`
P2 (a root with ≥1 present runnable row is required for any throw; every fixture
here therefore includes a present standalone unit). Error UX is uniform:
`Error: <message>\n` on stderr, exit 1, empty stdout. Existing
`invalid_config` e2e cases (`config-invalid-yaml`,
`variant-invalid-config-variants`) are the models for `stderr` assertions.

**Steps:**
1. Append `LIST-FR-0008` to `packages/cli/requirements/functional/16-list.yml`
   (`status: active`), title "`list --variants` validates consumed config and
   fails loudly", description transcribing B6 (reuse existing `invalid_config`
   code/messages; row-scoped; only roots with ≥1 present runnable row are
   consulted), and three acceptance entries AC-0001..AC-0003 from the spec.
2. Add case `list-variants-config-unparseable` (covers `LIST-FR-0008.AC-0001`):
   `command: ["list", "--variants"]`; `fixture/.jastr/notes/TEMPLATE.md` (present
   runnable row) + an unparseable `fixture/.jastr/config.yml` (e.g. the malformed
   YAML used by `config-invalid-yaml`); `expect` exit 1, `stdout: ""`,
   `stderr: "Error: .jastr/config.yml could not be parsed.\n"`.
3. Add case `list-variants-variants-not-mapping` (covers `LIST-FR-0008.AC-0002`):
   same present unit; `fixture/.jastr/config.yml` = `variants: true`; `expect`
   exit 1, `stdout: ""`,
   `stderr: "Error: .jastr/config.yml variants must be a mapping.\n"`.
4. Add case `list-variants-ref-not-mapping` (covers `LIST-FR-0008.AC-0003`):
   standalone `notes` present; `fixture/.jastr/config.yml` =
   `variants:\n  notes: true` (the non-mapping ref `notes` **matches** the
   present row, so it is looked up and rejected); `expect` exit 1, `stdout: ""`,
   `stderr: "Error: .jastr/config.yml variants.notes must be a mapping.\n"`.
5. Run the focused gates; do not regenerate `BEHAVIOR.md` yet.

**Files modified:** `packages/cli/requirements/functional/16-list.yml`,
`packages/cli/test/e2e/cases/list-variants-config-unparseable/case.yml` (NEW),
`packages/cli/test/e2e/cases/list-variants-config-unparseable/fixture/.jastr/notes/TEMPLATE.md` (NEW),
`packages/cli/test/e2e/cases/list-variants-config-unparseable/fixture/.jastr/config.yml` (NEW),
`packages/cli/test/e2e/cases/list-variants-variants-not-mapping/case.yml` (NEW),
`packages/cli/test/e2e/cases/list-variants-variants-not-mapping/fixture/.jastr/notes/TEMPLATE.md` (NEW),
`packages/cli/test/e2e/cases/list-variants-variants-not-mapping/fixture/.jastr/config.yml` (NEW),
`packages/cli/test/e2e/cases/list-variants-ref-not-mapping/case.yml` (NEW),
`packages/cli/test/e2e/cases/list-variants-ref-not-mapping/fixture/.jastr/notes/TEMPLATE.md` (NEW),
`packages/cli/test/e2e/cases/list-variants-ref-not-mapping/fixture/.jastr/config.yml` (NEW)

**Verification:**
- `bun run check` and `bun run typecheck` exit 0.
- `bun run test:cli:e2e` exits 0 (AC-0001/0002/0003 covered; all three cases
  assert exit 1 with the exact stderr strings and empty stdout).
- The three `stderr` strings match those produced by `config.ts` verbatim (same
  messages as `config-invalid-yaml` / `variant-invalid-config-variants`).

**Acceptance criteria:**
- `LIST-FR-0008` with AC-0001..AC-0003 exists in `16-list.yml`, `status: active`.
- Each of the three cases fails with exit 1, empty stdout, and the exact
  `Error: <message>\n` stderr quoted in B6, with `variants.notes` interpolated in
  AC-0003.
- Every malformed-config fixture also contains a present runnable unit (so the
  throw is in scope per P2).
- `bun run test:cli:e2e` is green.

---

### Task 4: Documentation reconciliation, `BEHAVIOR.md` regeneration, and full gate suite

**Objective:** Reconcile all narrative docs the feature makes stale, regenerate
the living CLI behavior doc, and prove the whole change passes every standing
gate.

**Input / context:** Output of Tasks 1–3 (working feature + `LIST-FR-0006/0007/0008`
+ all e2e cases). `specs/001/spec.md` Constraints (the `LIST-FR-0005`
cross-reference sentence, verbatim assertion/AC kept) and Scope (the doc surfaces
to update). Settled decision
`specs/001/discussions/260627195921Z-spec-review-clarifications-decision-log.md`
P1 (FR-0005: keep assertion + AC verbatim, append one cross-reference sentence).
The living-doc generator is `bun run docs:cli:living`
(`packages/cli/scripts/generate-living-docs.ts`), checked by
`bun run docs:cli:living --check`. The `AGENTS.md` update rule requires
reconciling the `list` command-surface claims; `CLAUDE.md` is a symlink to
`AGENTS.md`.

**Steps:**
1. In `packages/cli/requirements/functional/16-list.yml`, append the cross-
   reference sentence to `LIST-FR-0005`'s *description* (assertion and AC-0001
   unchanged), e.g.: "Reading `config.yml` content for variant data under
   `--variants` is a separate concern (see `LIST-FR-0006`); `config.yml` is still
   never a unit row." (per the spec Constraint and P1).
2. In `AGENTS.md`, update the two `list` command-surface mentions to include
   `--variants`: the canonical-commands line currently reading
   `jastr list [--local] [--global]` → `jastr list [--variants] [--local] [--global]`,
   and the install-family prose describing `jastr list` to note that
   `--variants` additionally renders config-defined variants as a sorted tree of
   `<ref>#<variant>` lines beneath each present runnable template/group-member
   ref, read per-root from that root's `config.yml`, opt-in (plain `list`
   unchanged), reusing `invalid_config` on a malformed consumed config. Keep
   claims accurate and concise; no `version`/status churn. (`CLAUDE.md` updates
   automatically via the symlink.)
3. In `README.md`, update the `jastr list [--local] [--global]` usage line to
   `jastr list [--variants] [--local] [--global]` and extend the `jastr list`
   bullet to mention that `--variants` shows config-defined variants as a sorted
   `<ref>#<variant>` tree under each runnable template/group-member, read from
   each root's own `config.yml`, opt-in.
4. Regenerate the living doc: `bun run docs:cli:living` (rewrites
   `packages/cli/docs/BEHAVIOR.md` from the updated requirements + new cases).
5. Run the full standing gate suite (the project's "no known local issues" bar).

**Files modified:** `packages/cli/requirements/functional/16-list.yml`,
`AGENTS.md`, `README.md`, `packages/cli/docs/BEHAVIOR.md` (regenerated)
(`CLAUDE.md` is a symlink to `AGENTS.md`; no separate edit)

**Verification:**
- `bun run check` exits 0.
- `bun run typecheck` exits 0.
- `bun run test` exits 0 (full suite: engine + CLI + traceability).
- `bun run test:cli:e2e` exits 0.
- `bun run docs:cli:living --check` exits 0 (BEHAVIOR.md is current).
- `bun run build` exits 0 (both workspace packages bundle).
- `grep -n "LIST-FR-0006" packages/cli/requirements/functional/16-list.yml`
  shows the cross-reference inside `LIST-FR-0005`'s description; `grep -n -- "--variants" README.md AGENTS.md`
  shows both surfaces updated.

**Acceptance criteria:**
- `LIST-FR-0005`'s assertion and AC-0001 are byte-unchanged; only its description
  gained the one cross-reference sentence pointing at `LIST-FR-0006`.
- `AGENTS.md` (and thus `CLAUDE.md`) and `README.md` describe `--variants` on the
  `list` command accurately, with the usage lines updated.
- `packages/cli/docs/BEHAVIOR.md` is regenerated and `docs:cli:living --check`
  passes.
- All six gate commands above exit 0.

## Notes

- **No engine change.** No task touches `packages/engine/`; no new
  `JastrErrorCode`. If any task seems to need one, stop — the design forbids it
  (spec Constraints, P3).
- **P1 guard rail (forward-compatibility).** No task may add code comments,
  branches, or e2e cases encoding the transitional orphan-hiding / missing-row
  suppression behavior. Those outcomes stay emergent from the present-runnable-ref
  iteration so the future co-location constraint needs no edit here.
- **Byte-exactness.** Every `expected/stdout.txt` and every `stderr` string is a
  literal contract; leading spaces and box-drawing characters are significant.
  When in doubt, copy connector/indent strings from the implementation rather
  than retyping them.
