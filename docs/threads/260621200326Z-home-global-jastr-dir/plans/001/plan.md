# Plan: Home-directory (global) `.jastr` support

Compiles `specs/001/spec.md` (version 2, approved) into an implementable sequence.
All work is CLI-side in `@jastr/cli`; `@jastr/engine` is untouched. Tasks are
executed in order; each leaves the repo type-checking and the test suite green.

Load-bearing contracts (signatures that later tasks depend on and must not drift)
are pinned as code blocks; everything else is prose for the implementer to realize.
Internal structure beyond the pinned signatures is open per `specs/001/spec.md`
DoF-4.

## Tasks

### Task 1: Dual-root discovery (`resolveProjectRoots`)

**Objective:** Replace single-root discovery with a function that locates the local
root (upward walk) and the global root (`$JASTR_HOME`/`os.homedir()`), collapses
them when identical, and errors only when neither exists.

**Input / context:** `packages/cli/src/fs/project-root.ts` (current `findProjectRoot`
walks up and throws `missing_project_root` when absent). Spec `specs/001/spec.md`
FR-1, FR-3, FR-4 and the "Locating the roots" expected-behavior section; DoF-1
(malformed `JASTR_HOME`) and DoF-4 (internal structure) are open.

**Steps:**
1. In `packages/cli/src/fs/project-root.ts`, add the pinned discovery API:
   ```ts
   export type ResolvedRoot = { kind: "local" | "global"; projectRoot: string };
   export type ResolvedRoots = {
     ordered: ResolvedRoot[]; // local first (if any), then global (if any, uncollapsed)
     local?: string;          // projectRoot dir whose ./.jastr is the local root
     global?: string;         // projectRoot dir whose ./.jastr is the global root
   };
   export async function resolveProjectRoots(cwd: string): Promise<ResolvedRoots>;
   ```
   `projectRoot` is the directory that *contains* `.jastr` (so existing
   `path.join(projectRoot, ".jastr", …)` call sites keep working per root).
2. Factor the existing upward walk into a non-throwing helper returning
   `string | undefined` (the nearest ancestor containing a `.jastr/` directory, or
   `undefined` at the filesystem root). Keep `findProjectRoot` if other code still
   needs the throwing form, otherwise remove it as part of this task's own cleanup.
3. Compute the global base: read `process.env.JASTR_HOME`; if it is set, non-empty
   after trim, and absolute, use it; otherwise (unset, empty, whitespace-only, or
   relative) fall back to `os.homedir()` — pin this treat-as-unset normalization
   (exercises DoF-1). The global root exists when `<base>/.jastr` is a directory on
   disk; absence is not an error.
4. Build `ResolvedRoots`: set `local`/`global` to the discovered project-root dirs
   (omit either if its `.jastr` is absent). If both exist and
   `realpath(local) === realpath(global)`, collapse: `ordered` carries a single
   `{ kind: "local", projectRoot: local }` entry and `global` is left `undefined`
   (one root, applied once — no self-merge/self-shadow). Otherwise `ordered` lists
   local then global, each for the roots that exist.
5. If `ordered` is empty (neither root exists), throw the existing
   `missing_project_root` `JastrError` with a relaxed message naming both searched
   locations, e.g. `No .jastr directory found locally (searched from the current
   directory up) or globally (<global-base>/.jastr).` (pins AC-3.2 content; wording
   is DoF-2).
6. Add `packages/cli/test/roots.test.ts` covering: local-only, global-only,
   both-present ordering (local before global), collapse when realpaths match,
   neither-present throws `missing_project_root`, `JASTR_HOME` override (AC-1.2),
   and `JASTR_HOME` unset → `os.homedir()/.jastr` via `vi.spyOn(os, "homedir")`
   (AC-1.1, since the e2e harness never reads the real home — see Task 5).

**Files modified:** `packages/cli/src/fs/project-root.ts`, `packages/cli/test/roots.test.ts` (NEW)

**Verification:** `bunx vitest run packages/cli/test/roots.test.ts` exits 0;
`bun run typecheck` exits 0; `bun run check` exits 0.

**Acceptance criteria:**
- `resolveProjectRoots` exported with the pinned signature.
- Returns local-then-global ordering; collapses identical realpaths to one root with `global` undefined.
- `JASTR_HOME` (absolute, existing) selects the global base; unset/empty/whitespace/relative falls back to `os.homedir()`.
- Throws `missing_project_root` (no new error code) only when neither root exists.
- New unit tests pass and cover AC-1.1, AC-1.2, AC-1.3, AC-4.1, AC-3.2.

### Task 2: Layered template resolution (hit predicate, fall-through, commit, both-root not-found)

**Objective:** Resolve a named/grouped ref local-first-then-global using the
existing existence predicate as the hit test, falling through structural misses
and committing to the first hit, and report `template_not_found` naming both roots.

**Input / context:** Output of Task 1 (`resolveProjectRoots`).
`packages/cli/src/templates/template-ref.ts` (`loadTemplateReference`,
`loadStandaloneNamedTemplate`, `loadGroupedNamedTemplate`, `isFile`). Spec
`specs/001/spec.md` "Resolving a template reference" + FR-2 (AC-2.1…AC-2.7) and
FR-9 (AC-9.1). Decision basis: `discussions/260622075358Z-handoff-review-findings-decision-log.md P1`.

**Steps:**
1. Extend the named branch of `LoadedTemplateReference` to carry resolution
   provenance, keeping the body otherwise identical:
   ```ts
   // named variant of LoadedTemplateReference gains:
   roots: { local?: string; global?: string }; // both discovered project roots
   resolvedRootKind: "local" | "global";        // which root supplied the body
   // retain `projectRoot: string` (= the resolved root's projectRoot) for now;
   // Task 4 migrates config off it and removes it.
   ```
2. Convert `loadStandaloneNamedTemplate` and `loadGroupedNamedTemplate` into
   try-loaders: on a **structural miss** (standalone: `TEMPLATE.md` absent;
   grouped: `.jastrgroup` marker OR `templates/<id>/TEMPLATE.md` absent — the
   existing `isFile` predicate fails) return `undefined` instead of throwing. When
   the predicate passes, proceed to `realpath` + `readFile` exactly as today; any
   error there propagates (commit-to-local; do **not** swallow into a miss).
3. In `loadTemplateReference`, for named/grouped refs: call
   `resolveProjectRoots(cwd)`, then iterate `roots.ordered` in order, calling the
   matching try-loader per root with that root's `projectRoot` and `kind`. Return
   the first non-`undefined` result, stamping `resolvedRootKind`, `roots`
   (`{ local, global }` from the resolved set), and `projectRoot`. This switch
   removes `findProjectRoot`'s only caller, so delete the now-unused throwing
   `findProjectRoot` from `packages/cli/src/fs/project-root.ts` (the non-throwing
   walk helper added in Task 1 stays); `missing_project_root` is now raised by
   `resolveProjectRoots` (Task 1) and per-root not-found by step 4 below.
4. If every root misses, throw `template_not_found` (existing code) with a message
   naming each searched root: the local candidate as a cwd-relative path and the
   global candidate as an absolute path, e.g. `Template <ref> was not found.
   Searched local <cwd-relative .jastr/...> and global <abs /.jastr/...>.` In the
   collapsed single-root case it names the one searched location. Wording is DoF-2;
   the both-roots content is AC-9.1.
5. Leave the direct `.md` branch unchanged (no roots, no config — AC-10.2).
6. Update `packages/cli/test/template-ref.test.ts`: global-only resolves from global
   (AC-2.1); both-present resolves from local (AC-2.2); local-only unchanged
   (AC-2.3); structural-miss local (dir without `TEMPLATE.md`; grouped without
   marker) falls through to a valid global (AC-2.6); a present-but-malformed local
   `TEMPLATE.md` over a valid global still surfaces the local parse/read error and
   does not fall through (AC-2.7); absent-from-both names both roots (AC-9.1).

**Files modified:** `packages/cli/src/templates/template-ref.ts`, `packages/cli/src/fs/project-root.ts`, `packages/cli/test/template-ref.test.ts`

**Verification:** `bunx vitest run packages/cli/test/template-ref.test.ts` exits 0;
`bun run typecheck` exits 0 (commands.ts still compiles via retained `projectRoot`);
`bun run check` exits 0.

**Acceptance criteria:**
- Named/grouped refs resolve local-first, first hit wins; structural miss falls through; first hit commits.
- A defective local hit errors with its existing error and never falls through to global.
- `template_not_found` names both searched roots (local relative, global absolute); collapsed case names one.
- `LoadedTemplateReference` (named) exposes `roots` and `resolvedRootKind`; direct `.md` unchanged.
- Unit tests cover AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-2.5, AC-2.6, AC-2.7, AC-9.1.

### Task 3: Path display by resolved root (template path + included files)

**Objective:** Render a globally-resolved template's own path and its included
files' paths as absolute realpaths, while locally-resolved templates stay
cwd-relative — at every present-day path-output site.

**Input / context:** Output of Task 2 (`resolvedRootKind` on the loaded template).
`packages/cli/src/commands.ts` (render `sourceId` in `executeRun` ~:93,
`executeGenerate` ~:154, `executeValidate` ~:214; `generate` success message ~:186)
and `packages/cli/src/templates/includes.ts` (included file `id` at
`path.relative(template.cwd, resolved)` ~:26). Spec `specs/001/spec.md` "Path
display and errors" + FR-8 (AC-8.1, AC-8.2, AC-8.3). Decision basis:
`discussions/260622075358Z-handoff-review-findings-decision-log.md P2, P3`.

**Steps:**
1. Add one shared display helper (e.g. `displayPath(template, absolutePath)` in a
   small `packages/cli/src/templates/display.ts`, or co-located): return
   `absolutePath` when `template.resolvedRootKind === "global"`, else
   `path.relative(template.cwd, absolutePath)`. Direct-mode templates keep
   today's cwd-relative behavior (treat as non-global).
2. In `packages/cli/src/commands.ts`, replace each
   `path.relative(template.cwd, template.templatePath)` `sourceId` (the three
   render sites in `executeRun`, `executeGenerate`, `executeValidate`) with the
   helper. In the `generate` success message, render the template path via the
   helper; leave the *output* path (`outputPath`) cwd-relative — it is a write
   destination under cwd, not a resolved-root path.
3. In `packages/cli/src/templates/includes.ts`, compute the returned `id` via the
   same rule: absolute `resolved` when the template resolved globally, else
   `path.relative(template.cwd, resolved)`. Confirm nested resolution still works:
   `sourceIdToAbsolutePath` already passes absolute `from` values through unchanged.
4. Extend `packages/cli/test/includes.test.ts` (or add cases) to assert that a
   globally-resolved template yields absolute included-file `id`s and a local one
   yields cwd-relative `id`s.

**Files modified:** `packages/cli/src/commands.ts`, `packages/cli/src/templates/includes.ts`, `packages/cli/src/templates/display.ts` (NEW), `packages/cli/test/includes.test.ts`

**Verification:** `bunx vitest run packages/cli/test/includes.test.ts` exits 0;
`grep -n "displayPath" packages/cli/src/commands.ts` shows all three render sites
plus the success message use the helper; `bun run typecheck` and `bun run check` exit 0.

**Acceptance criteria:**
- Global template's own path renders absolute at the `run`/`generate`/`validate` `sourceId` sites and the `generate` success message (AC-8.1).
- Local template's own path renders cwd-relative, unchanged (AC-8.2).
- Included-file paths render absolute for a global template and cwd-relative for a local one (AC-8.3).
- The `generate` output (write-destination) path remains cwd-relative.

### Task 4: Two-layer config + variant unit-shadowing composition

**Objective:** Consult both the local and global `config.yml` for every ref —
inputs merged per key (local over global), variants shadowed as whole units (local
entry else global) — independent of which root supplied the body.

**Input / context:** Output of Task 2 (`template.roots` exposes `{ local, global }`).
`packages/cli/src/config.ts` (`loadProjectConfigInputs`, `loadProjectConfigVariant`)
and `packages/cli/src/commands.ts` (the three execute functions wire config in).
Spec `specs/001/spec.md` "Config composition" + "Variant composition", FR-5
(AC-5.1…AC-5.4) and FR-6 (AC-6.1, AC-6.2). Decision basis: genesis decision log P3.

**Steps:**
1. In `packages/cli/src/config.ts`, add a per-root non-throwing variant reader
   `tryLoadProjectConfigVariant(...)` returning `ProjectConfigVariant | undefined`
   when the ref/variant is simply absent (still throwing `invalid_config` on a
   malformed entry). Keep `loadProjectConfigInputs` (already returns `{}` when
   absent) as the per-root inputs primitive.
2. Add composition helpers keyed on the discovered roots:
   ```ts
   export async function loadComposedConfigInputs(options: {
     roots: { local?: string; global?: string };
     templateRef: string;
   }): Promise<Record<string, unknown>>; // { ...global, ...local } per key
   export async function loadComposedConfigVariant(options: {
     roots: { local?: string; global?: string };
     templateRef: string;
     variantId: string;
   }): Promise<ProjectConfigVariant>; // local whole entry else global; else variant_not_found
   ```
   Inputs: read global then local per-root inputs, spread global first then local
   (CLI flags are layered later in `commands.ts`, preserving
   flags > local > global > defaults). Variants: try local, else global, else
   throw the existing `variant_not_found`; never merge `locked-inputs` across roots.
3. In `packages/cli/src/commands.ts`, replace the three
   `loadProjectConfigInputs({ projectRoot: template.projectRoot, … })` and
   `loadProjectConfigVariant({ projectRoot: template.projectRoot, … })` calls with
   the composed helpers passing `template.roots`. The existing flag/lock merge
   (`{ ...configInputs, ...flagInputs }` / `mergeVariantInputs`) is unchanged, so
   the `unknown_input` engine behavior on an undeclared composed key is preserved
   (AC-5.4).
4. Remove the now-unused `projectRoot` field from the named
   `LoadedTemplateReference` (retained temporarily in Task 2) and delete any now-dead
   single-root config call paths this change orphaned.
5. Update `packages/cli/test/config.test.ts`: both configs consulted regardless of
   body root (AC-5.1); per-key precedence local>global>default (AC-5.2, AC-5.3);
   undeclared composed key → `unknown_input` (AC-5.4); variant taken wholesale from
   local when present else global, no cross-root lock merge (AC-6.1); locked inputs
   still win and a locked-input flag is rejected (AC-6.2).

**Files modified:** `packages/cli/src/config.ts`, `packages/cli/src/commands.ts`, `packages/cli/src/templates/template-ref.ts`, `packages/cli/test/config.test.ts`

**Verification:** `bunx vitest run packages/cli/test/config.test.ts` exits 0;
`grep -n "projectRoot" packages/cli/src/commands.ts` returns nothing (migrated to
`roots`); `bun run typecheck` and `bun run check` exit 0.

**Acceptance criteria:**
- Both root configs consulted for any ref regardless of body root (AC-5.1).
- Effective inputs follow flags > local config > global config > template defaults (AC-5.2, AC-5.3).
- Undeclared composed input key fails with `unknown_input` (AC-5.4).
- Variant entry taken wholesale from local else global, no cross-root `locked-inputs` merge (AC-6.1).
- Locked inputs apply over everything and a flag naming a locked input is rejected (AC-6.2).
- `LoadedTemplateReference` no longer carries `projectRoot`.

### Task 5: E2E harness — hermetic `JASTR_HOME`, global fixture, `globalRoot` token

**Objective:** Let e2e cases set up a global root deterministically and assert
global absolute paths machine-independently, without ever reading the real
`~/.jastr`.

**Input / context:** `packages/cli/test/e2e/harness/case-runner.ts` (creates one
temp project root, runs the CLI via `execa`, applies `SUBSTITUTIONS`) and
`packages/cli/test/e2e/harness/case-manifest.ts` (`SUBSTITUTION_VALUES`). Spec
`specs/001/spec.md` FR-11 (AC-11.1) and DoF-3 (token name/value open).

**Steps:**
1. In `case-manifest.ts`, add `"globalRoot"` to `SUBSTITUTION_VALUES` (closed set
   stays validated by `validateSubstitute`).
2. In `case-runner.ts`, create a second temp directory per case to serve as the
   global base. If the case directory contains a `global-fixture/` folder, copy its
   contents into that base (so `global-fixture/.jastr/…` becomes
   `<base>/.jastr/…`, mirroring how `fixture/` populates the project root); reuse
   the existing `copyCaseFixture` ENOENT-tolerant pattern so an absent
   `global-fixture/` yields an empty base.
3. **Always** set `JASTR_HOME=<globalBase>` in the `execa` env for the CLI
   subprocess, for every case. This guarantees hermeticity: cases without a
   `global-fixture/` point `JASTR_HOME` at an empty dir (no `.jastr` → no global
   root), so existing cases keep seeing "no global root" and never read the
   developer's real home.
4. Register the `globalRoot` substitution as **expected-side** (like
   `jastrCliVersion`), resolving to `realpath(globalBase)`; expected output authors
   the global base token then `/.jastr/…`, mirroring `projectRoot` usage. Apply the
   global-base placeholder expansion to `global-fixture/` files too (fixture-side)
   if a case needs an absolute path baked into a global fixture.
5. Clean up the second temp dir in the same `finally` block as the project root.
6. Extend the harness unit tests: in
   `packages/cli/test/e2e/harness.test/case-manifest.test.ts` assert `globalRoot`
   is an accepted `substitute` value (and that an unknown value still fails); in
   `packages/cli/test/e2e/harness.test/case-runner.test.ts` assert a case with a
   `global-fixture/` exposes a populated global root to the CLI and that an absent
   `global-fixture/` yields an empty global base.

**Files modified:** `packages/cli/test/e2e/harness/case-manifest.ts`, `packages/cli/test/e2e/harness/case-runner.ts`, `packages/cli/test/e2e/harness.test/case-manifest.test.ts`, `packages/cli/test/e2e/harness.test/case-runner.test.ts`

**Verification:** `bun run test:cli:e2e` exits 0 (all existing cases still pass with
`JASTR_HOME` now always set to an empty base); `bun run typecheck` and `bun run
check` exit 0.

**Acceptance criteria:**
- `globalRoot` is a valid closed-set substitution token resolving to the global root used by the case (AC-11.1).
- The runner always sets `JASTR_HOME` to a controlled per-case base; absent `global-fixture/` ⇒ no global root.
- A `global-fixture/` directory populates the case's global root.
- All pre-existing e2e cases still pass unchanged.

### Task 6: Functional requirements area file

**Objective:** Capture the new global-support behavior as functional requirements
the e2e cases trace against.

**Input / context:** Spec `specs/001/spec.md` FR-1…FR-11 and their ACs.
`packages/cli/requirements/functional/` (area files `NN-*.yml`, auto-discovered;
requirement IDs `<AREA>-FR-<NNNN>`, acceptance `AC-<NNNN>`; see existing
`13-validate.yml` for shape).

**Steps:**
1. Create `packages/cli/requirements/functional/14-global.yml` as a YAML list of
   requirements under a new `GLOBAL` area prefix (`GLOBAL-FR-0001`, …), each with
   `id`, `title`, `status` (`active` for all but the FR-4 carve-out in step 3),
   `description`, and an `acceptance` list of `{ id: AC-000N, statement }`.
2. Author one requirement per spec FR, transcribing the spec's ACs into acceptance
   statements: global root location + `JASTR_HOME` + absence (spec FR-1);
   layered resolution incl. hit predicate / structural-miss fall-through /
   commit-on-hit (spec FR-2); global-only context + `missing_project_root`
   relaxation (FR-3); same-realpath collapse (FR-4); two-layer config inputs (FR-5);
   variant unit shadowing (FR-6); per-root include containment (FR-7); path display
   incl. included files (FR-8); `template_not_found` names both roots (FR-9); uniform
   application across `run`/`generate`/`validate` (FR-10); and a requirement for the
   `globalRoot` test token (FR-11).
3. Keep statements observable and command-level (they are the targets `covers` refs
   point at), matching the prose style of existing area files. Author every active
   acceptance statement so a Task 7 e2e case can cover it: `validateTraceability`
   requires a covering case for every *active* `GLOBAL-FR-*` AC, and the loader
   allows only an active or `removed` state per AC (no per-AC deferral). Two spec
   behaviors the hermetic e2e harness cannot exercise are unit-covered in Task 1 and
   must therefore not be left as uncovered active ACs:
   - FR-1's `JASTR_HOME`-unset `os.homedir()` default (spec AC-1.1): fold it into a
     command-observable FR-1 AC (e.g. "the global root is `$JASTR_HOME/.jastr`,
     defaulting to the home directory when `JASTR_HOME` is unset", demonstrated by a
     `JASTR_HOME`-set global-resolve case) rather than a standalone AC.
   - FR-4's same-realpath collapse (spec AC-4.1): author FR-4 with `status: deferred`
     plus a `coverage` note pointing at the Task 1 unit test — the loader requires
     `coverage` for a deferred requirement, and `validateTraceability` skips
     non-active requirements, so its AC needs no e2e case.
   Either way, no *active* GLOBAL AC is left without a covering e2e case.

**Files modified:** `packages/cli/requirements/functional/14-global.yml` (NEW)

**Verification:** `bunx vitest run packages/cli/test/living-docs.test.ts` exits 0
(requirements parse and load); `grep -c "GLOBAL-FR-" packages/cli/requirements/functional/14-global.yml`
returns ≥ 11.

**Acceptance criteria:**
- `14-global.yml` parses under the requirements loader with no duplicate/invalid IDs.
- Every spec FR-1…FR-11 maps to at least one `GLOBAL-FR-<NNNN>` with acceptance criteria mirroring the spec's ACs.
- Every active `GLOBAL-FR-*` acceptance criterion is command-observable and coverable by a Task 7 e2e case; the `JASTR_HOME`-unset default (AC-1.1) and same-realpath collapse (AC-4.1) are not authored as standalone active ACs (they are unit-covered in Task 1).

### Task 7: E2E cases for global support

**Objective:** Add e2e cases that exercise the new behavior end-to-end and trace to
the Task 6 requirements.

**Input / context:** Tasks 1–5 (implementation + harness) and Task 6 (requirements).
`packages/cli/test/e2e/cases/<id>/case.yml` (+ `fixture/`, new `global-fixture/`);
`covers` refs use `GLOBAL-FR-<NNNN>.AC-<NNNN>`; see existing
`cases/config-grouped-template-key/` for the case+fixture shape and
`case-manifest.ts` for the `expect` schema.

**Steps:**
1. Add cases (each a `cases/<kebab-id>/case.yml` with `covers`, `command`, `expect`,
   and `fixture/` and/or `global-fixture/`):
   - global-only standalone resolve (no local `.jastr`, global has the template) — render succeeds (AC for FR-3/FR-2);
   - local shadows global when the ref exists in both — local body renders;
   - structural-miss fall-through: local `.jastr/<id>/` dir with no `TEMPLATE.md`, valid global → global renders, **stderr empty** (silent);
   - commit-on-defective: local `<id>/TEMPLATE.md` malformed, valid global → exits 1 with the local parse/schema error;
   - `missing_project_root` only when neither root exists (empty workspace + empty global base);
   - two-layer config precedence (global config default overridden by local config, then by a CLI flag);
   - variant unit shadowing (variant entry from global, then a local entry wins wholesale);
   - global path display: a global template's render/error names its **absolute** path via the `globalRoot` token; an included-file error in a global template names the included file **absolute**;
   - `template_not_found` names both roots (local relative + global absolute) using the `globalRoot` token;
   - uniform application: `generate --check` and `validate` against a global ref behave like `run`;
   - per-root include containment: a globally-resolved template whose include escapes its own root (or targets the other root) fails with the existing boundary error, and no include crosses between roots (AC-7.1, AC-7.2);
   - preserved behavior under the GLOBAL area (each needs its own covering case so the matching Task 6 requirement is not left uncovered): local-only resolve unchanged (AC-2.3); an undeclared composed-config key fails with `unknown_input` (AC-5.4); a locally-resolved template renders its own path and its included files' paths cwd-relative (AC-8.2); a direct `.md` run reads no config and supports no variants, unchanged (AC-10.2).
2. The cases here must cover **every active `GLOBAL-FR-*` acceptance criterion
   authored in Task 6** — `validateTraceability` (run by the focused e2e suite)
   throws `uncovered acceptance criterion` for any active AC with no covering case.
   The two behaviors the hermetic harness cannot exercise — FR-1's `JASTR_HOME`-unset
   `os.homedir()` default and FR-4's same-realpath collapse — are unit-covered in
   Task 1 and, per Task 6, are not authored as standalone active GLOBAL ACs, so they
   need no case here.
3. Use `substitute:` with a `globalRoot`-bound token for every case asserting a
   global absolute path; keep `fixture/`-less empty-workspace cases directory-free
   per repo convention.
4. Run the focused e2e suite and iterate until green.

**Files modified:** `packages/cli/test/e2e/cases/<multiple new case dirs>/…` (NEW)

**Verification:** `bun run test:cli:e2e` exits 0 with the new cases present;
`bunx vitest run packages/cli/test/e2e` reports the new case ids; traceability has
no dangling `covers` refs.

**Acceptance criteria:**
- Each listed scenario has a passing e2e case tracing to a `GLOBAL-FR-*.AC-*` ref.
- Every active `GLOBAL-FR-*` acceptance criterion has a covering case (`validateTraceability` reports no uncovered criterion).
- The structural-miss case asserts empty stderr (silent fall-through); the commit-on-defective case asserts a code-1 local error.
- The include-containment case asserts the existing boundary error and that no include crosses into the other root (AC-7.1, AC-7.2).
- Global-path cases assert absolute paths via the `globalRoot` substitution and pass on any machine.

### Task 8: Regenerate living docs, reconcile `AGENTS.md`, full clean bar

**Objective:** Bring the committed behavior reference and agent guide current and
prove the whole clean bar passes.

**Input / context:** Tasks 1–7. `packages/cli/docs/BEHAVIOR.md` (generated by
`bun run docs:cli:living`), `AGENTS.md`/`CLAUDE.md` (symlinked; its discovery
claims go stale on this change — its own update rule requires reconciliation).
Spec `specs/001/spec.md` Constraints (the clean-bar list).

**Steps:**
1. Run `bun run docs:cli:living` to regenerate `packages/cli/docs/BEHAVIOR.md` from
   the new requirements + cases; commit the regenerated file.
2. Update `AGENTS.md`: correct the now-stale single-root claims (the authoring
   surface / discovery description — `.jastr` is no longer discovered only locally;
   a global `~/.jastr` (or `$JASTR_HOME/.jastr`) layers under the local root), and
   add the implemented spec link for this thread under the Architecture Decisions /
   active-threads listing per the AGENTS.md update rule.
3. Run the full clean bar and fix any failures: `bun run check`, `bun run
   typecheck`, `bun run test`, `bun run test:cli:e2e`, `bun run docs:cli:living
   --check`, `bun run build`.

**Files modified:** `packages/cli/docs/BEHAVIOR.md`, `AGENTS.md`

**Verification:** each of `bun run check`, `bun run typecheck`, `bun run test`,
`bun run test:cli:e2e`, `bun run docs:cli:living --check`, `bun run build` exits 0.

**Acceptance criteria:**
- `bun run docs:cli:living --check` exits 0 (BEHAVIOR.md is current).
- `AGENTS.md` no longer asserts local-only discovery and links this thread's spec.
- All six clean-bar commands exit 0.

## Notes

- No new `JastrErrorCode`: `missing_project_root` (relaxed trigger) and
  `template_not_found` (both-root message) are reused; `unknown_input` is existing
  engine behavior, unmodified.
- `@jastr/engine` is not touched in any task; the `sourceId` and include `id` are
  CLI-chosen, which is why path display and per-root containment are entirely
  CLI-side.
- Per-root include containment (spec FR-7) needs no dedicated code task: a resolved
  template already carries its own `includeContext.boundary` derived from the
  resolved root, so once Task 2 resolves the body from a given root, includes are
  bounded to that root automatically. The per-root containment e2e case asserting an
  include cannot escape into the other root (AC-7.1, AC-7.2) is enumerated in Task 7
  step 1.
