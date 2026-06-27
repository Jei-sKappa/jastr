# Implementation Report — remote template install (`add`/`list`/`remove`/`update`)

Plan executed: `plans/001/plan.md` (compiles `specs/001/spec.md`, v4 approved).
Run mode: orchestrated, plan-driven, multi-subagent (implementer + plan-compliance
reviewer + code-quality reviewer per task), all subagents on Opus per request.
Feature base commit: `c7d3bd4`. All 14 tasks executed in plan order.

## Per-task verified verdicts

| Task | Verified verdict | Implementer dispatches | PC reviewer | CQ reviewer | Fix iterations | Commit |
|---|---|---|---|---|---|---|
| 1 — engine error codes | DONE | 1 | PASS | PASS | 0 | `15b2a2a` |
| 2 — git seam | DONE_WITH_CONCERNS | 1 | PASS | PASS | 0 | `882d710` |
| 3 — source acquisition | DONE_WITH_CONCERNS | 2 | PASS | ISSUES→PASS | 1 (code-quality) | `b08fffd` |
| 4 — content hash | DONE | 1 | PASS | PASS | 0 | `8e89990` |
| 5 — provenance lock | DONE | 1 | PASS | PASS | 0 | `cfe9abf` |
| 6 — unit install | DONE | 1 | PASS | PASS | 0 | `3321b23` |
| 7 — validation gate | DONE | 1 | PASS | PASS | 0 | `2460e79` |
| 8 — e2e harness | DONE_WITH_CONCERNS | 1 | PASS | PASS | 0 | `af1d901` |
| 9 — `add` command | DONE_WITH_CONCERNS | 1 | PASS | PASS | 0 | `7c30b6e` |
| 10 — `list` command | DONE_WITH_CONCERNS | 1 | PASS | PASS | 0 | `a91ed6b` |
| 11 — `remove` command | DONE | 1 | PASS | PASS | 0 | `86d0342` |
| 12 — `update` command | DONE_WITH_CONCERNS | 1 | PASS | PASS | 0 | `490632a` |
| 13 — documentation | DONE | 1 | PASS | PASS | 0 | `73e2f2c` |
| 14 — finalize sweep | DONE | 1 | n/a (empty diff) | n/a (empty diff) | 0 | none (empty) |

No task reached `BLOCKED` or `NEEDS_CONTEXT`. Every implementer claim was verified;
no claim↔verdict divergence occurred (every claimed `DONE`/`DONE_WITH_CONCERNS`
held under review). Exactly one fix loop ran (Task 3, code-quality), and it
converged in a single iteration. Task 14 produced an empty diff (all gates already
green from per-task maintenance); per the empty-diff path the orchestrator
confirmed the outcome by running the full sweep itself rather than routing the
empty diff to the diff-centric reviewers.

Final whole-change sweep (orchestrator-run, all exit 0): `bun run check`,
`bun run typecheck`, `bun run test` (584), `bun run test:cli:e2e` (300),
`bun run docs:cli:living --check`, `bun run build`. Engine boundary re-asserted:
`packages/engine/src` diff vs `c7d3bd4` is `errors.ts` only (+11/-1); no
`node:fs`/`child_process`/`net`/`https`/`dns` import in the engine; no new runtime
dependency in any `package.json`.

## 1. Deviations from the plan, with justification

- **Task 3 — `acquireSource` signature extended beyond the plan's literal step-1
  shape.** Added a `path?` parameter, a `baseDir` return, and an injectable
  `isGitClean` option. Justified: step 5 places `--path` validation and base-dir
  computation in this module, and the local-git cleanliness probe needs to be
  injectable for the "no clone for a local dir" test invariant to hold. The lock's
  normalized `path` field was deliberately deferred from here to Task 9 (and
  Task 9 closed it — `path.relative(sourceRoot, baseDir)`, POSIX-normalized,
  omitted when base == source root).
- **Task 6 — additive exports from `templates/template-ref.ts`.** Exported the
  three layout constants (`const`→`export const`, value-identical) and a new
  `classifyUnitDir` predicate reusing the existing private `isFile`. The plan
  explicitly permitted additive exports to avoid duplicating marker knowledge
  (DRY / Law of Demeter); existing classification behavior and tests unchanged.
- **Task 8 — two files beyond the named list touched.** `traceability.test.ts`
  (+2 lines) and a new `living-docs.test.ts` (+22 lines) were forced because the
  new required `env`/`setup`/`setupSteps` fields appear in `CaseManifest`/
  `RenderCase` literals those tests construct. Necessary, in-scope consequence of
  the schema change.
- **Task 9 — `__FAKE_GIT_BIN__` harness sentinel added to `case-runner.ts`.**
  Task 8 added the fake-git shim and per-case `env` but left no hermetic way for a
  `case.yml` to reference the machine-dependent absolute shim path. Task 9 added a
  minimal additive sentinel resolver (`env` value `__FAKE_GIT_BIN__` → the
  checked-in shim's absolute path) so clone-path e2e cases are hermetic. Additive,
  test-only; harness self-tests stayed green. (This is the harness gap noted as a
  follow-up below — it worked but ideally belonged in Task 8.)
- **Task 9 — special-file message rendered source-relative.** `executeAdd`
  rethrows `unsupported_source_entry` with the offending path relative to the
  as-typed source rather than the absolute realpath `assertRegularUnit` emits,
  required for hermetic e2e matching and consistent with the project's
  path-display convention. The engine code is unchanged; `unit.ts` is unchanged.
- **Task 9/10/11/12 — cascading help/shape goldens.** Each command addition
  updated `expectedCommandShape` in `args.ts`, the `cli-shell.test.ts`
  command-shape assertion, `e2e/cases/unknown-command/case.yml`, and
  `e2e/cases/help-root/expected/stdout.txt`. Necessary because the new command
  appears in `--help` and the command-shape error.
- **Task 12 — two open `update` DoF pinned per the plan's recommendations.**
  `--check` + `--force` is rejected (`--check cannot be combined with --force.`,
  mirroring `generate`); a missing unit dir is a non-destructive report
  (`update_available`, never re-installed). Both are tested. `install/update.ts`
  also became the first `install/*` module to import `../errors` (`formatCliError`)
  so per-id best-effort failures render with the uniform `Error:` prefix —
  CLI-internal, no engine coupling, no import cycle.
- **Requirements naming.** Spec-level `AC-ERR.*`/`AC-LOCK.*` criteria were
  re-expressed under each command's per-area FR file (`ADD-FR-*`, `LIST-FR-*`,
  `REMOVE-FR-*`, `UPDATE-FR-*`) per the repo's `<AREA>-FR-NNNN` convention; the
  traceability gate is green across all of them.

## 2. Surprises

- **Task 2 — process-group kill required for the clone timeout.** A naive
  `child.kill()` left the `sleep` grandchild holding the inherited stdio pipes, so
  `close` never fired and the timeout test hung to Vitest's cap. Resolved with
  `detached: true` + process-group `SIGKILL` and a lone-pid fallback. POSIX-
  oriented; on Windows it falls through to single-pid kill (see follow-ups).
- **Task 5 — early `mkdtemp` atomic-write strategy leaked an empty staging dir.**
  Self-caught: the final design renames a flat sibling temp *file* rather than
  staging in a temp *directory*.
- **Task 8 — the fake-git shim had to be ESM.** The package is `type: module`, so
  a `require`-based extensionless shim throws under Node; rewritten as an ESM
  script.
- **Task 9 — the harness could not name the shim path hermetically.** Surfaced the
  `__FAKE_GIT_BIN__` gap (see Deviations / Follow-ups).
- **Task 12 — a floating `writeReconciledLock` promise raced the `finally`
  cleanup.** Self-caught during integration testing; the reconcile/replace
  branches now `await` the lock write so a follow-up read never sees the stale
  pre-bump lock.

## 3. Problems hit

- **Task 3 — one code-quality fix loop (the run's only fix iteration).** The first
  `--path` containment implementation was lexical-only (`path.resolve` +
  `path.relative`), which let a `--path` through an in-source symlink escape the
  source root — contradicting spec §5.1/P27 ("resolved realpath stays within the
  source root") and the project's own realpath containment in
  `templates/includes.ts`. A fresh implementer fixed it (realpath the resolved
  base / deepest existing ancestor before the boundary test, mirroring
  `includes.ts`), added a covering symlink-escape test, and the code-quality
  re-review PASSED. No other task required a fix loop.
- No `BLOCKED`/`NEEDS_CONTEXT` outcomes, no non-converging loops, no failed
  commits, no history rewriting. The plan compiled cleanly into 13 commits (Task 14
  was a no-op finalization).

## 4. Follow-ups (discovered, intentionally not done — candidate seeds)

This is tier-2 (not tier-3 phased) work, so each follow-up is surfaced here as a
candidate seed for the user to open as a future thread if desired. None was acted
on in this run.

- **Move the `__FAKE_GIT_BIN__` sentinel into the harness proper (Task 8 territory).**
  It currently lives in `case-runner.ts` as a Task 9 add. A cleaner home would be
  the documented harness `substitute:`/env mechanism, with the gap noted in the
  harness self-tests. Low risk; purely test-infra tidiness.
- **Shared `provenance-display` helper.** `source@ref` rendering and the
  `[local]`/`[global]` scope label are now duplicated as small private copies
  across `list.ts`, `add.ts`, `remove.ts`, and `update.ts` (4 copies). Each cycle
  judged a shared helper out of scope under KISS/YAGNI; consolidating is a
  reasonable future DRY refactor.
- **Windows process-group kill.** The clone-timeout kill (`process.kill(-pid, …)`)
  is POSIX-oriented and falls back to a single-pid kill on Windows, which would
  not reap a grandchild. Acceptable for the current darwin/linux dev target; worth
  addressing if Windows support is ever required.
- **`update` clone-batching.** `update` acquires per id (one clone per target).
  Batching one clone per shared source is a pinned DoF deferred as a future
  optimization with no current evidence it matters.
- **`list` `invalid_lock` surfacing.** `list` does not catch `invalid_lock` from
  `readLock` and has no e2e for that path (it was not in Task 10's AC set). A
  list-specific `invalid_lock` case could be added for completeness.
- **Concurrency lock.** `lock.ts` carries a deliberate `// TODO` (per AC-LOCK.5):
  locking for concurrent `jastr` invocations is a deferred future consideration.

## References

- Plan: `plans/001/plan.md`
- Spec: `specs/001/spec.md` (v4, approved)
- Decision log: `seed/discussions/260626124608Z-remote-template-install-decision-log.md`
- Reviewer review files (gitignored scratch): `.wip/` (Task 3 code-quality
  ISSUES/re-review, plus the per-task PASS-with-concerns notes)
- Feature commits: `15b2a2a`, `882d710`, `b08fffd`, `8e89990`, `cfe9abf`,
  `3321b23`, `2460e79`, `af1d901`, `7c30b6e`, `a91ed6b`, `86d0342`, `490632a`,
  `73e2f2c`
