# Plan — remote template install: `jastr add` / `list` / `remove` / `update`

Compiles `specs/001/spec.md` (v4, approved) into a sequential, strict-granularity
implementation. Tasks are executed in order; the only dependency edge is "the
previous numbered task ran first" plus the explicit inputs each task names.

All `P<N>` citations refer to the genesis decision log at
`seed/discussions/260626124608Z-remote-template-install-decision-log.md` (same
thread), matching the spec's own citation convention.

## Standing gates (project bar — apply to every task on top of its own verification)

From `AGENTS.md` "Notes", the project requires all of these to exit 0 before the
codebase is clean:

- `bun run check` (Biome) and `bun run typecheck` — **cheap**; every task runs both.
- `bun run test` (full Vitest: engine + CLI unit + e2e) — every task runs it (or
  a named subset plus the full run at task end if iterating).
- `bun run test:cli:e2e`, `bun run docs:cli:living --check`, `bun run build` —
  the **churn-heavy whole-change gates**. `--check` and `build` are deferred to
  the closing task (Task 14); command tasks that add e2e cases regenerate
  `BEHAVIOR.md` in *write* mode (`bun run docs:cli:living`) as a substep so the
  per-task tree stays internally consistent, and Task 14 runs the `--check` gate.

A task's **Verification** block lists only the checks specific to that task; the
standing gates above are implied for every task and re-run wholesale in Task 14.

## Test architecture (shared context — every command task reads this)

This is the CLI's first network / subprocess / fs-mutation surface, and two
existing harness facts force deliberate test design (both verified in the current
code, not assumed):

1. **Traceability is e2e-only.** `packages/cli/test/e2e/harness/traceability.ts`
   fails the suite unless **every active acceptance criterion of every active
   requirement** is referenced by some e2e case's `covers:`. There is no
   unit-test escape hatch for a requirement's coverage. Therefore every
   `requirements/functional/*.yml` AC this feature adds **must** have a hermetic
   covering e2e case.
2. **The e2e harness is hermetic and offline.**
   `packages/cli/test/e2e/harness/case-runner.ts` runs the CLI via
   `execa("bun", [cliPath, ...command], { cwd, env: { JASTR_HOME } })` with no
   network. Real `git clone` over the network is therefore untestable in e2e.

The resulting strategy, pinned here so the command tasks are consistent:

- **Local-path sources** (`add ./relpath name`) are read in place with no clone
  (spec §5.2 step 2, P6/P18). They cover the *majority* of observable behavior
  hermetically with **no harness change**: install standalone/group, copy-verbatim,
  conflict, validation gate, special-file rejection, `--path` containment, dual
  root, lock written/determinism, `list`, `remove` (all flavors), `update` (all
  flavors incl. local-path re-read and interrupted-update reconcile),
  `invalid_lock`, argv errors, no-prompt.
- **Git-dependent behavior is reached through a single seam** (Task 2) that
  resolves the git binary from `process.env.JASTR_GIT_BIN ?? "git"`. This is a
  minimal, documented test seam (and a reasonable real-world escape hatch for a
  non-PATH git). e2e then exercises git paths hermetically:
  - **clone success / `commit` capture / `--branch` ref / `owner/repo` URL
    expansion / `--` placement / non-interactive env**: via a **checked-in fake
    `git` shim** the case points `JASTR_GIT_BIN` at (Task 8). The shim records its
    argv and simulates a clone by copying a bundled source tree; assertions read
    the recorded argv and the installed result.
  - **`clone_failed`**: via a bogus `file://`/URL-form source the real git (or the
    shim) rejects — deterministic, offline.
  - **`git_unavailable`**: via `JASTR_GIT_BIN` pointing at a nonexistent path
    (spawn `ENOENT`).
- **Real-git fidelity** (actual `--depth 1 --branch` semantics, real
  `rev-parse HEAD`) is covered by **integration tests** (plain Vitest specs under
  `packages/cli/test/`) that build a real local git repo in a temp dir. These are
  not subject to the traceability gate; they exist for confidence that the real
  git path works, complementing the shim-based e2e.
- **Stateful flows** (`add`→`update`, `add`→`remove`) need a real lock with a
  correct content hash, which cannot be hand-written into a fixture. Task 8 adds a
  harness `setup:` primitive (an ordered list of pre-`command` steps: a `cli:`
  step that runs the jastr CLI, and a `cp:` step that copies fixture files into
  the temp tree to mutate a recorded source between `add` and `update`). This is
  the enabling primitive for `remove`'s clean/modified flavors and `update`'s
  hash-transition matrix.

The harness growth in Task 8 is a direct, unavoidable consequence of fact (1)
applied to a stateful, git-dependent feature — call it out in review.

## Tasks

### Task 1: Add the ten new error codes to the engine union

**Objective:** Extend `JastrErrorCode` with the feature's new codes — the single
permitted engine change (spec §4, §5.6, P17) — so all CLI code can reference them.

**Input / context:** Spec §5.6 error table and `AC-ERR.1`/`AC-ERR.3`. The engine
must stay pure: no `node:fs` / `node:child_process` / network imports
(`AC-ERR.3`). Current union is in `packages/engine/src/errors.ts`.

**Steps:**
1. Add these string literals to the `JastrErrorCode` union in
   `packages/engine/src/errors.ts`, alphabetically grouped near related codes or
   appended (placement is cosmetic): `git_unavailable`, `clone_failed`,
   `destination_exists`, `not_installed`, `not_jastr_installed`,
   `local_modifications`, `update_available`, `grouped_template_not_addable`,
   `invalid_lock`, `unsupported_source_entry`.
2. Do not add any import, helper, or other symbol to the engine for this feature.
3. If `packages/engine/test/` has an exhaustive-union or exported-codes test, add
   the ten new literals to its expected set.

**Files modified:** `packages/engine/src/errors.ts`, and any engine test that
enumerates the code union (e.g. `packages/engine/test/errors.test.ts`) if present.

**Verification:**
- `bun run typecheck` passes.
- `grep -E "git_unavailable|clone_failed|destination_exists|not_installed|not_jastr_installed|local_modifications|update_available|grouped_template_not_addable|invalid_lock|unsupported_source_entry" packages/engine/src/errors.ts` returns all ten.
- `grep -rE "node:fs|node:child_process|node:net|node:https?" packages/engine/src` returns nothing (engine purity, `AC-ERR.3`).
- `bun run test` passes (engine suite unaffected except the union test).

**Acceptance criteria:**
- All ten codes exist in `JastrErrorCode` (`AC-ERR.1`).
- No new non-`JastrErrorCode` symbol or import added to `@jastr/engine`
  (`AC-ERR.3`).

---

### Task 2: Build the git invocation seam (`install/git.ts`)

**Objective:** Provide the one place all `git` runs through — non-interactive,
bounded, option-injection-guarded — exposing clone, HEAD capture, and an
availability check, with `git_unavailable` / `clone_failed` mapping.

**Input / context:** Spec §4 (raw `node:child_process`, zero npm deps, `--depth 1`,
`--branch`, `rev-parse HEAD`, non-interactive, bounded single-attempt, LFS-smudge
disabled), §5.2 step 2, §5.6, §7 (non-interactive mechanism + timeout default are
DoF; LFS-disable is pinned). Decisions P2, P26, P28. `AC-ERR.4`, `AC-ERR.7`,
`AC-ERR.8`, `AC-ADD.7`.

**Steps:**
1. Create `packages/cli/src/install/git.ts`. Resolve the binary as
   `process.env.JASTR_GIT_BIN ?? "git"` (the documented test seam from the Test
   architecture note). Use `node:child_process` `spawn` directly (no `execa` in
   product code — it is a dev/test-only dep).
2. Export an injectable interface so command logic stays testable, e.g.
   `type GitRunner = { clone(opts): Promise<void>; revParseHead(dir): Promise<string>; isAvailable(): Promise<boolean> }`
   and a default `createGitRunner()`. Command modules accept a `GitRunner`
   (default to the real one) so integration tests can inject a fake.
3. Implement `clone`: build argv as below — **`--` precedes every positional**
   (URL, dir) so a hostile value cannot be read as an option (`AC-ERR.7`, P28):
   ```
   ["clone", "--depth", "1", ...(ref ? ["--branch", ref] : []), "--", url, dir]
   ```
   A commit-SHA passed as `ref` is sent verbatim to `--branch`; git rejects it,
   surfacing as `clone_failed` — never a silent default-branch fallback
   (`AC-ADD.8`, DoF "Commit-SHA detection").
4. Run the clone non-interactively and bounded (P26): set an environment that
   suppresses all terminal/credential/SSH prompting (e.g. `GIT_TERMINAL_PROMPT=0`,
   a no-op `GIT_ASKPASS`/`SSH_ASKPASS`, `GCM_INTERACTIVE=Never`; exact mechanism
   is DoF) and disable LFS smudge (pinned — e.g. `GIT_LFS_SKIP_SMUDGE=1`). Apply a
   bounded timeout (default DoF, e.g. 120s, with an optional env override); on
   expiry **kill the child** and raise `clone_failed` with a deterministic timeout
   message (`AC-ERR.8`).
5. Map failures: spawn `ENOENT` (or `isAvailable()` false) → `JastrError("git_unavailable", …)`;
   any non-zero exit or timeout → `JastrError("clone_failed", …)` whose message
   carries git's stderr verbatim or lightly wrapped (DoF; preserve git's text).
6. Implement `revParseHead(dir)` → `["-C", dir, "rev-parse", "HEAD"]`, returning
   the trimmed full SHA; used for clone and clean-local-git-repo commit capture.
7. Implement `isAvailable()` (e.g. `git --version` spawn succeeds) for the
   `git_unavailable` precheck on remote operations.
8. Add integration tests `packages/cli/test/install/git.test.ts`: create a **real**
   local git repo in a temp dir (init, commit with pinned identity/date), then
   assert `clone` from its `file://` URL into a fresh dir reproduces the tree and
   `revParseHead` returns the commit; assert a bogus `file://` path → `clone_failed`
   with stderr; assert `JASTR_GIT_BIN=/nonexistent` → `git_unavailable`; assert the
   built argv places `--` before positionals (unit-test the argv builder directly);
   assert the **timeout-kill** path deterministically (`AC-ERR.8`): point
   `JASTR_GIT_BIN` at a script that sleeps past a **tiny timeout override** (the
   step-4 env override), and assert the clone is killed and surfaces `clone_failed`
   within a bound rather than hanging. This integration test (like the real-git
   fidelity tests) is for confidence and is not traceability-bound.

**Files modified:** `packages/cli/src/install/git.ts` (NEW),
`packages/cli/test/install/git.test.ts` (NEW).

**Verification:**
- `bun run test packages/cli/test/install/git.test.ts` exits 0.
- The timeout-kill test asserts a slow clone is killed and mapped to `clone_failed`
  within a bound (no hang), exercising the step-4 timeout override (`AC-ERR.8`).
- `grep -n '"--"' packages/cli/src/install/git.ts` shows the `--` guard in argv.
- `grep -rn "execa\|simple-git" packages/cli/src` returns nothing (no runtime dep;
  `AC-ERR.4`). `git -C "$PWD" status` is irrelevant — confirm `package.json`
  dependencies are unchanged.
- `bun run typecheck`, `bun run check`.

**Acceptance criteria:**
- Clone argv is `clone --depth 1 [--branch <ref>] -- <url> <dir>` with `--` before
  positionals (`AC-ERR.7`).
- Missing git → `git_unavailable`; clone/fetch failure or timeout → `clone_failed`
  carrying git's stderr; neither hangs (`AC-ADD.7`, `AC-ERR.8`).
- A commit-SHA `--ref` fails via clone rather than silent fallback (`AC-ADD.8`).
- Git is invoked via `node:child_process` with no new npm runtime dependency
  (`AC-ERR.4`).

---

### Task 3: Source acquisition & classification (`install/source.ts`)

**Objective:** Turn a `<repo-source>` (+ optional `--ref`, `--path`) into a
resolved base `.jastr/` directory on disk plus the provenance facts the lock
needs, cloning only for remote sources and guaranteeing temp cleanup.

**Input / context:** Spec §5.2 steps 2–3, §5.1 ("Roots", local-path `url`
realpath rule), §4 (`--path` containment), §7 (clone batching, temp location are
DoF). Decisions P6, P7, P18, P27. `AC-ADD.5`, `AC-ADD.6`, `AC-ADD.9`, `AC-ADD.15`,
`AC-ADD.20`, `AC-UPDATE.12`. Depends on Task 2's `GitRunner`.

**Steps:**
1. Create `packages/cli/src/install/source.ts`. Export an `acquireSource({ source, ref?, git })`
   returning `{ sourceRoot, cleanup, provenance }` where `provenance` carries
   `{ source, url, ref?, commit? }` and `cleanup()` removes any temp clone (a
   no-op for local paths).
2. **Classify** the source string:
   - If it resolves to an existing local **directory**, it is a **local path**:
     read in place, no clone, no temp (`AC-ADD.6`, P6/P18). Record `url` as the
     source's **absolute realpath** (P27, so `update` re-reads it regardless of
     cwd — `AC-UPDATE.12`); `source` keeps the as-typed string for display.
   - Else if it matches the `owner/repo` shorthand, expand to
     `https://github.com/owner/repo.git` (`AC-ADD.5`, P6).
   - Else pass the string through to `git clone` unchanged (arbitrary URL,
     `git@…`, `ssh://`) (`AC-ADD.5`).
3. For remote sources: require `git.isAvailable()` first (else `git_unavailable`),
   then `git.clone` into an OS-temp dir (clone temp may live in OS temp, DoF). Set
   `cleanup()` to remove it; ensure cleanup runs on **both** success and failure
   so a failed clone leaves no temp dir (`AC-ADD.15`).
4. **Commit capture** for provenance: for a clone, `revParseHead(tempDir)`. For a
   **local git repo**, capture `rev-parse HEAD` only if the working tree is
   **clean**; omit `commit` for a non-git local path or a **dirty** local git repo
   (no commit represents the copied bytes) (P18, P23, `AC-ADD.13`). (Cleanliness
   check: e.g. `git -C <src> status --porcelain` empty; mechanism is DoF.)
5. **Base directory** = `<sourceRoot>/<--path>` (default `<sourceRoot>`). Validate
   `--path` as a **relative subpath** whose resolved realpath stays within
   `<sourceRoot>`; reject an absolute path or a `..`-escape with
   `invalid_command` (P27, `AC-ADD.20`). Record the (normalized) `path` for the
   lock; omit it when the base is the source root (`AC-ADD.9`).
6. Add unit/integration tests `packages/cli/test/install/source.test.ts`:
   `owner/repo` → github URL; arbitrary URL passthrough; existing dir → local path
   (no clone invoked — assert via a fake `GitRunner` whose `clone` throws if
   called); absolute/`..` `--path` → `invalid_command`; a valid subpath resolves;
   local-git clean vs dirty commit presence; failed clone triggers `cleanup`.

**Files modified:** `packages/cli/src/install/source.ts` (NEW),
`packages/cli/test/install/source.test.ts` (NEW).

**Verification:**
- `bun run test packages/cli/test/install/source.test.ts` exits 0.
- Tests assert no clone for a local-dir source (injected `GitRunner.clone` is
  never called) and `cleanup` runs after a thrown clone.
- `bun run typecheck`, `bun run check`.

**Acceptance criteria:**
- `owner/repo` expands to the github URL; arbitrary URLs pass through (`AC-ADD.5`).
- A local directory source performs no clone and records `url` as its absolute
  realpath (`AC-ADD.6`, `AC-UPDATE.12`).
- `--path` resolves the base and rejects absolute/`..` with `invalid_command`
  (`AC-ADD.9`, `AC-ADD.20`).
- `commit` present for clone / clean local git repo, omitted for non-git or dirty
  local repo (`AC-ADD.13`); a failed acquire leaves no temp dir (`AC-ADD.15`).

---

### Task 4: Canonical content hash (`install/hash.ts`)

**Objective:** Compute the cross-machine-stable sha256 the lock stores in `hash`,
so identical content hashes identically on any OS and any file rename changes it.

**Input / context:** Spec §5.1 "The lock" `hash` paragraph and `AC-LOCK.3`.
Decision P9. No dependency on other tasks (pure + a thin fs walker).

**Steps:**
1. Create `packages/cli/src/install/hash.ts` with a **pure** core
   `hashUnitFiles(files: { relPath: string; content: Buffer }[]): string` and a
   thin `hashUnitDir(dir): Promise<string>` that walks the dir and calls the core.
2. Canonical, mode-independent serialization (pin the properties; exact framing is
   the implementer's, but it must be unambiguous and binary-safe):
   - Normalize each `relPath` to **POSIX** separators (`/`), independent of OS.
   - **Sort** entries by `relPath` (stable byte/UTF-8 order).
   - Feed a single sha256 stream; for each entry include **both** the path and the
     content with **length-prefixed framing** so neither path nor content can be
     confused with a boundary and a rename always changes the digest, e.g.:
     ```
     for (const { relPath, content } of sorted) {
       const p = Buffer.from(relPath, "utf8");
       hash.update(uint32be(p.length)); hash.update(p);
       hash.update(uint32be(content.length)); hash.update(content);
     }
     ```
   - File **mode / permissions / symlink-ness do not participate** (symlinks are
     already rejected upstream in Task 6).
3. Add unit tests `packages/cli/test/install/hash.test.ts`: identical content →
   identical hash; a renamed file (same bytes, different path) → different hash;
   `\\`-vs-`/` path inputs normalize to the same hash; order-independence (input
   order does not change the digest); a byte change → different hash.

**Files modified:** `packages/cli/src/install/hash.ts` (NEW),
`packages/cli/test/install/hash.test.ts` (NEW).

**Verification:**
- `bun run test packages/cli/test/install/hash.test.ts` exits 0, including the
  rename-sensitivity and path-normalization cases.
- `bun run typecheck`, `bun run check`.

**Acceptance criteria:**
- `hash` is sha256 over the unit's files sorted by relative path with the path in
  the digest, POSIX-normalized, UTF-8 content bytes, deterministic framing,
  mode-independent; identical content → identical hash, any rename → different
  hash (`AC-LOCK.3`).

---

### Task 5: Provenance lock module (`install/lock.ts`)

**Objective:** Own `lock.json`: its types, deterministic serialization, atomic
write, lenient read, and strict per-entry validation — the substrate every
command reads and mutates.

**Input / context:** Spec §5.1 "The lock" and "Crash safety" (lock half), §4
(determinism), §5.6 (`invalid_lock`). Decisions P9, P21, P22, P24, P28.
`AC-LOCK.1`, `AC-LOCK.2`, `AC-LOCK.5`, `AC-LOCK.6`, `AC-LOCK.7`, `AC-LOCK.8`.
Depends on nothing structurally (pure core + fs IO).

**Steps:**
1. Create `packages/cli/src/install/lock.ts` with the pinned types (field names
   per §5.1; the top-level container key spelling is DoF — `templates` used here):
   ```ts
   export type LockEntry = {
     source: string;                  // as-typed source (display)
     url: string;                     // clone URL, or local-source absolute realpath
     ref?: string;                    // omitted ⇒ default branch
     name: string;                    // resolved name under the base
     path?: string;                   // --path base; omitted ⇒ source root
     kind: "standalone" | "group";
     commit?: string;                 // omitted ⇒ non-git local path or dirty local repo
     hash: string;                    // canonical sha256 hex (Task 4)
   };
   export type LockFile = { version: 1; templates: Record<string, LockEntry> };
   ```
2. `lockPath(projectRoot)` → `path.join(projectRoot, ".jastr", "lock.json")`.
3. `readLock(projectRoot): Promise<LockFile>`: a missing or empty file → an empty
   `{ version: 1, templates: {} }` (no tracked installs); a present file that is
   unparseable (incl. unresolved git conflict markers) or carries an unknown
   `version` → `JastrError("invalid_lock", …)`, mutating nothing (`AC-LOCK.6`, P22).
4. `validateLockEntry(id, entry)`: **strict** check before any command acts on an
   entry (P28, `AC-LOCK.8`): required fields present and correctly typed; `kind` ∈
   {`standalone`,`group`}; `path` (if present) a safe relative subpath; `url`
   present and non-empty; **no unknown extra fields**; any violation →
   `invalid_lock`.
5. `serializeLock(lock): string`: entries **sorted by key**, `JSON.stringify(…, 2)`,
   **trailing newline**, **no timestamps** (`AC-LOCK.2`, P9). Deterministic so
   committed locks diff cleanly and git auto-merges non-overlapping keys.
6. `writeLock(projectRoot, lock)`: **atomic** — write `serializeLock` to a
   same-filesystem temp file under `<root>/.jastr/` then `rename` into place, so a
   crash/disk-full never truncates the lock (`AC-LOCK.7`, P24). Place a
   `// TODO:` comment beside this mutation noting that locking for concurrent
   invocations is a deliberately deferred future consideration (`AC-LOCK.5`, P21).
7. Add unit tests `packages/cli/test/install/lock.test.ts`: round-trip
   serialize→parse; deterministic key sort + trailing newline + no timestamps;
   missing/empty → empty lock; unparseable / unknown-version → `invalid_lock`;
   each strict-entry violation (missing field, wrong type, bad `kind`, absolute/`..`
   `path`, missing `url`, unknown extra field) → `invalid_lock`; atomic write leaves
   a valid file (and no leftover temp).

**Files modified:** `packages/cli/src/install/lock.ts` (NEW),
`packages/cli/test/install/lock.test.ts` (NEW).

**Verification:**
- `bun run test packages/cli/test/install/lock.test.ts` exits 0 across all the
  strict-validation and determinism cases.
- `grep -n "TODO" packages/cli/src/install/lock.ts` shows the concurrency note
  beside the write (`AC-LOCK.5`).
- `bun run typecheck`, `bun run check`.

**Acceptance criteria:**
- Lock lives at `<root>/.jastr/lock.json`, JSON, keyed by id, identical shape both
  roots, top-level `version` (`AC-LOCK.1`).
- Deterministic write: sorted keys, 2-space indent, trailing newline, no timestamps
  (`AC-LOCK.2`).
- Missing/empty → no installs; unparseable/unknown-version → `invalid_lock`,
  mutating nothing (`AC-LOCK.6`).
- Atomic write never truncates (`AC-LOCK.7`); strict per-entry validation →
  `invalid_lock` (`AC-LOCK.8`); concurrency `// TODO` present (`AC-LOCK.5`).

---

### Task 6: Unit classification, special-file rejection, staging & atomic install (`install/unit.ts`)

**Objective:** Resolve `<name>` to an installable unit at a base `.jastr/`, reject
hostile entries, and copy it into place atomically on the destination filesystem.

**Input / context:** Spec §5.1 "Installable unit", "Source-unit file types",
"Named resolution", "Crash safety" (unit half); §5.2 steps 4–7. Decisions P5, P7,
P12, P16, P24, P25. `AC-ADD.1`, `AC-ADD.2`, `AC-ADD.3`, `AC-ADD.4`, `AC-ADD.18`,
`AC-ADD.19`, `AC-REMOVE.6`. Reuses the standalone/grouped classification logic in
`packages/cli/src/templates/template-ref.ts` (`.jastrgroup` marker, `templates/`
layout, `TEMPLATE.md`).

**Steps:**
1. Create `packages/cli/src/install/unit.ts`. Export `resolveNamedUnit({ base, name })`
   that mirrors the existing classification against `<base>/.jastr/<name>/`:
   - two-segment `group/template` → `JastrError("grouped_template_not_addable", …)`
     (groups install whole; `AC-ADD.3`, P7);
   - single segment with `TEMPLATE.md` → `{ kind: "standalone", id, dir }`;
   - single segment with `.jastrgroup` → `{ kind: "group", id, dir }` (record its
     template count for output, `AC-ADD.2`);
   - neither → `JastrError("template_not_found", …)` whose message **names the
     source** (`AC-ADD.4`, P7). Factor or reuse the classification helpers rather
     than duplicating them (Law of Demeter / DRY); export shared predicates from
     `template-ref.ts` if needed.
2. `assertRegularUnit(dir)`: walk the unit recursively with `lstat` (**never**
   following symlinks); the first symlink / FIFO / device / socket / non-regular,
   non-directory entry → `JastrError("unsupported_source_entry", …)`. This runs
   **before** any validation, copy, or hash (`AC-ADD.19`, P25).
3. `stageUnit({ unitDir, destRoot })`: copy the unit recursively into a temp
   staging dir **on the destination filesystem** (e.g. `<destRoot>/.jastr/.jastr-stage-*`),
   so the final move is an intra-filesystem `rename` (atomic), never a
   cross-filesystem copy (`AC-ADD.18`, P12/P16/P24, DoF "Temp-dir location").
4. `commitUnit({ stageDir, destDir })`: atomic `rename(stageDir, destDir)` into
   `<destRoot>/.jastr/<id>/`. `removeUnit(destDir)` for `remove`/`update` swaps.
5. Ensure staging temp dirs are always cleaned on failure.
6. Add integration tests `packages/cli/test/install/unit.test.ts`: standalone vs
   group classification; two-segment → `grouped_template_not_addable`; absent →
   `template_not_found` naming source; a symlink/FIFO in the unit →
   `unsupported_source_entry` before any copy; staged copy then atomic move
   reproduces the tree; group copies the marker + all templates; failed stage
   leaves no partial dest.

**Files modified:** `packages/cli/src/install/unit.ts` (NEW),
`packages/cli/test/install/unit.test.ts` (NEW), possibly
`packages/cli/src/templates/template-ref.ts` (export shared classification
predicates — additive only).

**Verification:**
- `bun run test packages/cli/test/install/unit.test.ts` exits 0, including the
  special-file rejection and atomic-move cases.
- If `template-ref.ts` is touched, `bun run test packages/cli/test/template-ref.test.ts`
  still passes (no behavior change to existing classification).
- `bun run typecheck`, `bun run check`.

**Acceptance criteria:**
- `<name>` classifies to standalone/group; two-segment → `grouped_template_not_addable`;
  absent → `template_not_found` naming the source (`AC-ADD.3`, `AC-ADD.4`).
- A symlink/special file anywhere in the unit → `unsupported_source_entry` before
  copy/hash/validate (`AC-ADD.19`).
- Install stages on the destination filesystem and commits by atomic rename
  (`AC-ADD.18`); a group copies its marker + every template (`AC-ADD.2`,
  `AC-REMOVE.6`).

---

### Task 7: Validation gate over a staged unit (`install/validate-unit.ts`)

**Objective:** Reuse the engine's static-validation pipeline against a *staged*
unit so nothing broken is ever moved into place; for a group, validate every
template atomically.

**Input / context:** Spec §5.1 "Validation gate", §5.2 step 7, §5.5 (pre-replace
validation). Decision P20. `AC-ADD.17`, `AC-UPDATE.9`. Builds on Task 6's staged
dir. Reuses `loadTemplateReference` (direct `.md` mode classifies grouped vs
standalone via the `.jastrgroup` marker), `parseTemplateSource`,
`validateTemplateSchema`, `renderTemplateSource`, `createFileIncludeResolver`, and
`sampleInputsForStaticRender` — the exact sequence `executeValidate` uses in
`packages/cli/src/commands.ts`.

**Steps:**
1. Create `packages/cli/src/install/validate-unit.ts` exporting
   `validateStagedUnit({ stageDir, kind })`.
2. Enumerate the `TEMPLATE.md` file(s) in the staged unit: one for a standalone;
   for a group, every `templates/<id>/TEMPLATE.md`.
3. For each, run the static pipeline against the **staged copy** (which carries the
   unit's included files) by loading it through the existing **direct-`.md` path**:
   `loadTemplateReference({ cwd: <stageParent>, templateRef: <relative path to the staged TEMPLATE.md> })`
   then `parseTemplateSource` → `validateTemplateSchema` → `renderTemplateSource`
   with `sampleInputsForStaticRender(schema)` and `createFileIncludeResolver`. This
   reuses the engine and adds no new error code; a defect surfaces with its
   existing engine code (`invalid_frontmatter`, `malformed_schema`,
   `invalid_directive`, `include_not_found`, `include_cycle`, …).
4. Any template's failure aborts the whole unit (atomic for a group) — surface the
   first defect (`AC-ADD.17`, `AC-UPDATE.9`).
5. Add integration tests `packages/cli/test/install/validate-unit.test.ts`: a clean
   standalone passes; a standalone with bad frontmatter / a missing include / a
   cycle fails with the existing engine code; a group with one bad template fails
   the whole unit; a group with all-good templates passes.

**Files modified:** `packages/cli/src/install/validate-unit.ts` (NEW),
`packages/cli/test/install/validate-unit.test.ts` (NEW).

**Verification:**
- `bun run test packages/cli/test/install/validate-unit.test.ts` exits 0,
  asserting each defect surfaces with the engine's existing code (not a new one).
- `bun run typecheck`, `bun run check`.

**Acceptance criteria:**
- A staged unit failing the static pipeline is rejected with the defect's existing
  engine code; for a group any one bad template fails the whole unit (`AC-ADD.17`).
- The same gate is callable on a fetched upstream unit before a replace
  (`AC-UPDATE.9`).

---

### Task 8: Extend the e2e harness for stateful, git-dependent cases

**Objective:** Add the minimal harness primitives the command e2e cases need —
per-case `env`, a `setup:` pre-step list (`cli`/`cp`), and a fake-`git` shim — and
keep the living-docs generator and harness self-tests green.

**Input / context:** The "Test architecture" note above. The harness is
`packages/cli/test/e2e/harness/case-manifest.ts` (manifest schema) and
`case-runner.ts` (execution); the generator is
`packages/cli/scripts/generate-living-docs.ts` + `living-docs.ts`; self-tests are
under `packages/cli/test/e2e/harness.test/`. `AC-DOC.2`, `AC-DOC.3`, `AC-ERR.8`,
`AC-ADD.7`. This task adds no `requirements/*.yml` (it is infra), so the
traceability gate is unaffected; it is validated by harness self-tests.

**Steps:**
1. **Per-case `env`**: add `env` to `CASE_FIELDS` and to `CaseManifest`, validated
   as a `Record<string,string>` (string→string map). In `case-runner.ts` merge it
   into the execa `env` after `JASTR_HOME` (`{ JASTR_HOME, ...manifest.env }`) so a
   case can set `JASTR_GIT_BIN`.
2. **`setup:` pre-steps**: add an optional ordered `setup` list to the manifest.
   Each step is exactly one of:
   - `cli: [argv...]` — run the jastr CLI (same `execa("bun", [cliPath, ...])`,
     same cwd/env/`JASTR_HOME`) before the main `command`; a non-zero setup exit
     fails the case loudly (setup must succeed).
   - `cp: { from: <case-relative path>, to: <root-relative path> }` — copy fixture
     files into the temp tree (used to mutate a recorded source between `add` and
     `update`). Validate both paths as safe relative paths (reuse `validateSafePath`).
   Run all setup steps in order, after fixture/global-fixture copy and placeholder
   expansion, before the main `command`.
3. **Fake-`git` shim**: add a checked-in shim under the harness (e.g.
   `packages/cli/test/e2e/harness/fake-git/git` — an executable Node/sh script, or
   a per-case fixture file) that: records its argv to a file in cwd
   (`.fake-git-argv`), simulates `clone` by copying a designated bundled source
   tree into the target dir, answers `rev-parse HEAD` with a fixed SHA, and can be
   told to fail (non-zero + stderr) to exercise `clone_failed`. Document how a case
   wires it via `env: { JASTR_GIT_BIN: <path> }`. (If a shared shim is awkward to
   make portable, the simpler route is a per-case shim fixture file — pick one and
   keep it consistent.)
4. **Living-docs generator**: update `living-docs.ts` so it tolerates and (for
   fidelity) renders the new `env` and `setup` fields without crashing — at minimum
   `loadRenderCases` must not break, and the rendered "input project" section
   should note setup steps so `BEHAVIOR.md` stays faithful. Do **not** regenerate
   `BEHAVIOR.md` here (no cases added yet); just keep the generator correct.
5. **Self-tests**: extend `packages/cli/test/e2e/harness.test/case-manifest.test.ts`
   and `case-runner.test.ts` to cover: `env` validation + merge; `setup` `cli`/`cp`
   step validation + execution ordering; rejection of an unknown `setup` step shape
   and of unsafe `cp` paths.

**Files modified:** `packages/cli/test/e2e/harness/case-manifest.ts`,
`packages/cli/test/e2e/harness/case-runner.ts`,
`packages/cli/test/e2e/harness/fake-git/git` (NEW, executable),
`packages/cli/scripts/living-docs.ts`,
`packages/cli/test/e2e/harness.test/case-manifest.test.ts`,
`packages/cli/test/e2e/harness.test/case-runner.test.ts`.

**Verification:**
- `bun run test packages/cli/test/e2e/harness.test` exits 0 (all self-tests,
  including the new `env`/`setup` cases).
- `bun run test:cli:e2e` still exits 0 (existing cases unaffected — traceability
  unchanged; no new requirements/cases yet).
- `bun run docs:cli:living --check` still passes (no case added, generator change
  is behavior-preserving for existing cases).
- `bun run typecheck`, `bun run check`.

**Acceptance criteria:**
- A case may set `env` (e.g. `JASTR_GIT_BIN`), declare `setup` `cli`/`cp` steps,
  and use the fake-`git` shim; manifest validation accepts the new fields and
  rejects malformed ones.
- Existing e2e suite and living-docs `--check` remain green (enabling-only change).

---

### Task 9: `add` command — wiring, logic, requirements, e2e

**Objective:** Implement `jastr add <repo-source> <name>` end-to-end: acquire,
resolve, conflict-guard, validate, atomically install, record provenance, print
one deterministic line.

**Input / context:** Spec §5.2 (all steps), §5.1, §5.6, §7. Decisions P2, P4, P5,
P6, P7, P9, P11, P12, P13, P18, P20, P23, P24, P25, P27. `AC-ADD.1`–`AC-ADD.20`,
`AC-ERR.5`/`.6`. Depends on Tasks 1–8 (errors, git, source, hash, lock, unit,
validation gate, harness). Reuses dual-root discovery in
`packages/cli/src/fs/project-root.ts` (note: `resolveProjectRoots` *throws*
`missing_project_root` when neither root exists — `add` must **not** propagate
that; see step 2).

**Steps:**
1. **Argv wiring**: add `add` to the known-command set in
   `packages/cli/src/args.ts` and write `validateAddArgs(rest)` raising
   `invalid_command` for a missing `<repo-source>` or `<name>` and for unrecognized
   flags (recognized: `--ref <v>`, `--path <v>`, `-g`/`--global`); ensure no
   `--yes`/prompt path exists (`AC-ERR.5`, `AC-ERR.6`, P13/P19). Register
   `makeAddCommand()` in `packages/cli/src/program.ts` and create
   `packages/cli/src/commands/add.ts` (Commander factory mirroring `generate.ts`,
   with `.option("--ref <ref>")`, `.option("--path <path>")`,
   `.option("-g, --global")`).
2. **Destination root** (P11): create `executeAdd` (in `packages/cli/src/install/add.ts`).
   With `-g/--global`, target the global root (create `<JASTR_HOME or ~>/.jastr`
   if absent). Otherwise the local root: reuse the upward `.jastr/` walk, but when
   none exists up-tree, **create `.jastr/` in cwd** and install there — `add` never
   raises `missing_project_root` (`AC-ADD.10`, `AC-ADD.11`). (Call the local/global
   finders directly or add a non-throwing destination resolver beside
   `resolveProjectRoots`; do not let the throwing path leak.)
3. **Acquire** the source via Task 3 (`acquireSource`), compute the base dir from
   `--path`. Ensure `cleanup()` runs in a `finally` (`AC-ADD.15`).
4. **Resolve `<name>`** at the base via Task 6 (`resolveNamedUnit`) →
   standalone/group, or `grouped_template_not_addable` / `template_not_found`
   (`AC-ADD.3`, `AC-ADD.4`).
5. **Conflict (create-only, P12)**: if `<destRoot>/.jastr/<id>/` already exists,
   write nothing and raise `destination_exists`; read the dest lock (Task 5) to
   pick the message flavor — a **tracked** id (has a lock entry) routes the user to
   `jastr update <id>`; an **untracked** id says it was not jastr-installed and must
   be deleted by hand. No `--force` on `add` (`AC-ADD.12`).
6. **Reject special files** (`assertRegularUnit`, Task 6) → `unsupported_source_entry`
   before any copy/validate/hash (`AC-ADD.19`).
7. **Stage on the destination filesystem** (Task 6), run the **validation gate**
   (Task 7) against the staged copy; on a defect, clean the stage and fail with the
   defect's existing code, dest unchanged (`AC-ADD.17`). On success, atomic
   `rename` into place (`AC-ADD.18`).
8. **Record provenance**: compute `hash` (Task 4) over the installed unit; write
   the lock entry **atomically after** the unit is in place (Task 5, `AC-ADD.13`,
   §5.1 crash order, P24). `config.yml` is never read or written (`AC-ADD.14`, P4).
9. **Output**: one deterministic success line naming unit, source+ref, destination,
   and root (a group also reports its template count); no prompt, no `--yes`
   (`AC-ADD.16`, `AC-ERR.6`). Exact wording is DoF; include the AC-named facts.
10. **Requirements**: add `packages/cli/requirements/functional/15-add.yml`
    (`ADD-FR-NNNN` with `AC-NNNN`) capturing the §5.2 behaviors. Phrase the
    git-clone-observable ACs so they are coverable hermetically (fake-git shim /
    `file://` failure / `JASTR_GIT_BIN`), per the Test architecture note.
11. **e2e cases** under `packages/cli/test/e2e/cases/<id>/` with `covers:`:
    - local-path install of a standalone (copy verbatim) — `AC-ADD.1`;
    - local-path install of a group (marker + count) — `AC-ADD.2`;
    - two-segment ref → `grouped_template_not_addable` — `AC-ADD.3`;
    - missing name → `template_not_found` naming source — `AC-ADD.4`;
    - `--path` subdir resolution + absolute/`..` rejection — `AC-ADD.9`, `AC-ADD.20`;
    - default-local vs `-g` global + bootstrap-creates-`.jastr` — `AC-ADD.10`,
      `AC-ADD.11`;
    - `destination_exists` tracked (setup `add` first) vs untracked (fixture dir) —
      `AC-ADD.12`;
    - lock entry written with the §5.1 fields — `AC-ADD.13` (assert via
      `fileContains` on `lock.json`);
    - never writes `config.yml` — `AC-ADD.14` (assert `fileNotContains`/absence);
    - validation-gate rejection (bad template) leaves dest unchanged — `AC-ADD.17`;
    - special-file rejection (`unsupported_source_entry`) — `AC-ADD.19`;
    - fake-git clone success → installed + `commit` present — `AC-ADD.1`/`AC-ADD.13`
      (clone branch);
    - `owner/repo` URL expansion + `--` placement via fake-git recorded argv —
      `AC-ADD.5`, `AC-ERR.7`;
    - `--ref` → `--branch` (and SHA → failure) via fake-git — `AC-ADD.8`;
    - bogus `file://` → `clone_failed`, leaves no temp/partial — `AC-ADD.7`,
      `AC-ADD.15`;
    - `JASTR_GIT_BIN=/nonexistent` → `git_unavailable` — `AC-ADD.7`;
    - missing-arg / unknown-flag → `invalid_command` — `AC-ERR.5`;
    - a present `lock.json` does not break `run` (discovery ignores it) — `AC-LOCK.4`.
12. Regenerate `BEHAVIOR.md`: `bun run docs:cli:living` (write mode).

**Files modified:** `packages/cli/src/args.ts`, `packages/cli/src/program.ts`,
`packages/cli/src/commands/add.ts` (NEW), `packages/cli/src/install/add.ts` (NEW),
possibly `packages/cli/src/fs/project-root.ts` (additive non-throwing destination
resolver), `packages/cli/requirements/functional/15-add.yml` (NEW),
`packages/cli/test/e2e/cases/<add-cases>/…` (NEW),
`packages/cli/docs/BEHAVIOR.md` (regenerated),
`packages/cli/test/install/add.test.ts` (NEW, integration with injected `GitRunner`).

**Verification:**
- `bun run test packages/cli/test/install/add.test.ts` exits 0.
- `bun run test:cli:e2e` exits 0, including the new `add` cases and the
  traceability test (every new `ADD-FR-*.AC-*` is covered).
- `bun run docs:cli:living --check` passes after regeneration.
- `grep -rn "config.yml\|config\.yml" packages/cli/src/install/add.ts` returns
  nothing (`AC-ADD.14`).
- `bun run typecheck`, `bun run check`.

**Acceptance criteria:**
- `add` satisfies `AC-ADD.1`–`AC-ADD.20` as enumerated above, plus `AC-ERR.5`/`.6`
  for argv/no-prompt and `AC-LOCK.4` (lock present does not perturb `run`).
- Every new `ADD-FR-*` AC has a covering e2e case (traceability green);
  `BEHAVIOR.md` is current.

---

### Task 10: `list` command — wiring, logic, requirements, e2e

**Objective:** Implement `jastr list`: folder-first inventory with a lock overlay
across one or both roots, labeled sections, sorted, with an empty-state line.

**Input / context:** Spec §5.3, §5.1. Decision P14, P17. `AC-LIST.1`–`AC-LIST.4`,
`AC-LOCK.4`. Depends on Task 5 (lock read) and the existing standalone/group
classification (Task 6 / `template-ref.ts`). Default scope is **both** roots.

**Steps:**
1. **Argv wiring**: add `list` to the known-command set + `validateListArgs`
   (recognized flags only: `--local`, `--global`; any other → `invalid_command`);
   register `makeListCommand()` in `program.ts`; create
   `packages/cli/src/commands/list.ts`.
2. Create `executeList` (in `packages/cli/src/install/list.ts`). For each in-scope
   root that exists: enumerate the actual unit directories under `.jastr/`
   (reuse classification; **skip non-directories and `config.yml` / `lock.json`** —
   `AC-LOCK.4`), `readLock` that root, and join:
   - unit present + lock entry → **tracked**: id, `source@ref`, kind, short commit
     (short length is DoF);
   - unit present + no entry → **local** (authored), marked `local`;
   - lock entry whose unit dir is gone → **missing** (drift), flagged.
3. Render roots as labeled **Local / Global** sections, each shown only if it has
   rows; `--local`/`--global` restrict scope. Sort entries by id.
4. If nothing in scope, print `No templates installed.`. `list` is read-only —
   mutate nothing, exit 0 (`AC-LIST.4`).
5. **Requirements**: `packages/cli/requirements/functional/16-list.yml`.
6. **e2e cases** (fixtures may hand-write a `lock.json` since `list` does not hash):
   - mixed tracked + local rows (`source@ref`, kind, short commit; `local` marker)
     — `AC-LIST.1`;
   - a lock entry with no dir → `missing`; a deleted unit never shows as a tracked
     ghost — `AC-LIST.2`;
   - both-roots default sections vs `--local`/`--global` (use `global-fixture/`) —
     `AC-LIST.3`;
   - sorted ids + empty-inventory `No templates installed.` + writes nothing —
     `AC-LIST.4`.
7. Regenerate `BEHAVIOR.md` (`bun run docs:cli:living`).

**Files modified:** `packages/cli/src/args.ts`, `packages/cli/src/program.ts`,
`packages/cli/src/commands/list.ts` (NEW),
`packages/cli/src/install/list.ts` (NEW),
`packages/cli/requirements/functional/16-list.yml` (NEW),
`packages/cli/test/e2e/cases/<list-cases>/…` (NEW),
`packages/cli/docs/BEHAVIOR.md` (regenerated).

**Verification:**
- `bun run test:cli:e2e` exits 0, including new `list` cases + traceability.
- `bun run docs:cli:living --check` passes.
- `bun run typecheck`, `bun run check`, `bun run test`.

**Acceptance criteria:**
- `list` satisfies `AC-LIST.1`–`AC-LIST.4`; enumeration skips `lock.json` so it
  never appears as a unit (`AC-LOCK.4`).
- Every new `LIST-FR-*` AC has a covering e2e case; `BEHAVIOR.md` current.

---

### Task 11: `remove` command — wiring, logic, requirements, e2e

**Objective:** Implement `jastr remove <id>...`: delete tracked installs from one
root by flavor (clean / locally-modified / drift / untracked / unknown),
processing ids in order with no pre-validation.

**Input / context:** Spec §5.4, §5.1. Decisions P5, P15, P19. `AC-REMOVE.1`–`.7`,
`AC-LOCK.8`, `AC-ERR.5`/`.6`. Depends on Task 5 (lock + strict entry validation),
Task 4 (hash, for clean-vs-modified), Task 6 (group removal). Default root is
local; `-g`/`--global` the global root.

**Steps:**
1. **Argv wiring**: add `remove` to the known-command set + `validateRemoveArgs`
   (require ≥1 id; recognized flags `-g`/`--global`, `--force`; else
   `invalid_command`); register `makeRemoveCommand()`; create
   `packages/cli/src/commands/remove.ts`.
2. Create `executeRemove` (in `packages/cli/src/install/remove.ts`). Resolve the
   target root; `readLock`. Process ids **in order, no pre-validation pass**; the
   **first failure** emits the uniform `Error:` and exits 1, leaving already-removed
   ids removed (`AC-REMOVE.7`, P15). Before acting on a selected entry, **strictly
   validate it** (`validateLockEntry`, `AC-LOCK.8`).
3. Per id:
   - **tracked + dir present + clean** (disk hash == lock hash) → delete the unit
     dir and drop the entry (`AC-REMOVE.1`);
   - **tracked + dir present + modified** (disk hash != lock hash) →
     `local_modifications` unless `--force`, which deletes anyway (`AC-REMOVE.2`,
     P19);
   - **tracked + dir gone** (drift) → drop the stale entry (`AC-REMOVE.3`, P15);
   - **untracked** (dir present, no entry) → `not_jastr_installed`, delete nothing
     (`AC-REMOVE.4`);
   - **neither** → `not_installed`, with a hint if the id is tracked in the **other**
     root (`AC-REMOVE.5`).
   A group id removes the whole group dir + entry (`AC-REMOVE.6`).
4. After each successful mutation, write the lock atomically (unit first, then lock,
   per §5.1 order). Non-interactive, no prompt (`AC-ERR.6`).
5. **Requirements**: `packages/cli/requirements/functional/17-remove.yml`.
6. **e2e cases** (use `setup: cli: ["add", …]` to create real clean locks; `cp`
   to modify an installed unit for the dirty flavor):
   - clean remove deletes dir + entry — `AC-REMOVE.1`;
   - modified → `local_modifications`, `--force` deletes — `AC-REMOVE.2`;
   - drift (dir removed via `cp`-over or fixture) → stale entry dropped —
     `AC-REMOVE.3`;
   - untracked → `not_jastr_installed`, deletes nothing — `AC-REMOVE.4`;
   - unknown → `not_installed` (+ other-root hint), default-local vs `-g` —
     `AC-REMOVE.5`;
   - group removal — `AC-REMOVE.6`;
   - multi-id in-order, first failure exits 1, prior removals persist —
     `AC-REMOVE.7`;
   - tampered lock entry → `invalid_lock` before mutation — `AC-LOCK.8`;
   - missing-id / unknown-flag → `invalid_command` — `AC-ERR.5`.
7. Regenerate `BEHAVIOR.md`.

**Files modified:** `packages/cli/src/args.ts`, `packages/cli/src/program.ts`,
`packages/cli/src/commands/remove.ts` (NEW),
`packages/cli/src/install/remove.ts` (NEW),
`packages/cli/requirements/functional/17-remove.yml` (NEW),
`packages/cli/test/e2e/cases/<remove-cases>/…` (NEW),
`packages/cli/docs/BEHAVIOR.md` (regenerated).

**Verification:**
- `bun run test:cli:e2e` exits 0, including new `remove` cases + traceability.
- `bun run docs:cli:living --check` passes.
- `bun run typecheck`, `bun run check`, `bun run test`.

**Acceptance criteria:**
- `remove` satisfies `AC-REMOVE.1`–`AC-REMOVE.7`, `AC-LOCK.8`, `AC-ERR.5`/`.6`.
- Every new `REMOVE-FR-*` AC has a covering e2e case; `BEHAVIOR.md` current.

---

### Task 12: `update` command — wiring, logic, requirements, e2e

**Objective:** Implement `jastr update [<id>...]`: lock-driven, best-effort refresh
with the three-hash decision matrix, validation-before-replace, `--check`, and
`--force`.

**Input / context:** Spec §5.5, §5.1 (crash safety, interrupted-update reconcile),
§5.6, §7 (`--check`+`--force` behavior and missing-dir drift are explicit DoF —
**decide and test consistently**). Decisions P6, P16, P18, P20, P24. `AC-UPDATE.1`–`.12`,
`AC-LOCK.8`, `AC-ERR.6`. Depends on Task 3 (same acquire path as `add`), Tasks 4/5/6/7,
and Task 8 (`setup`/`cp` for hash transitions). Default root local; `-g`/`--global`
global.

**Steps:**
1. **Argv wiring**: add `update` to the known-command set + `validateUpdateArgs`
   (ids optional; recognized flags `-g`/`--global`, `--force`, `--check`; else
   `invalid_command`). **Decide** `--check` + `--force`: either reject with
   `--check cannot be combined with --force.` (mirroring `generate`, DoF) or ignore
   `--force` under `--check` — pick the reject form for consistency with the
   established `generate` precedent unless the implementer prefers otherwise; pin
   the choice in tests. Register `makeUpdateCommand()`; create
   `packages/cli/src/commands/update.ts`.
2. Create `executeUpdate` (in `packages/cli/src/install/update.ts`). Resolve the
   root; `readLock`. **Targets**: bare → all tracked ids; with ids → those ids; an
   explicit id with no entry → `not_installed` (`AC-UPDATE.1`). A bare `update` in a
   root with no tracked installs → exit 0 with an explicit nothing-to-update message
   (`AC-UPDATE.10`). Strictly validate each acted-on entry (`validateLockEntry`,
   `AC-LOCK.8`).
3. Per id, compute three hashes (Task 4): `stored` (lock `hash`), `disk` (current
   on-disk unit), `upstream` (freshly re-fetched via the **same acquire path as
   `add`**, re-resolving the recorded `name` under the recorded `path` from the
   recorded `url`/`ref` — current tip of the ref; local-path re-read from the
   recorded realpath, `AC-UPDATE.5`/`.12`). Optionally batch one clone per shared
   source (DoF).
4. Decision matrix (§5.5):
   - `upstream == stored` → **up to date**, no change (`AC-UPDATE.2`);
   - `upstream != stored` and `disk == stored` (clean) → **validate** upstream
     (Task 7) then **stage-then-swap** the unit and bump lock `hash`+`commit`
     (`AC-UPDATE.3`, `AC-UPDATE.8`, `AC-UPDATE.9`);
   - `upstream != stored`, `disk != stored`, `disk == upstream` (interrupted prior
     update) → **reconcile** the lock to the new `hash`/`commit`, no refusal
     (`AC-UPDATE.11`, P24);
   - `upstream != stored`, `disk != stored`, `disk != upstream` (locally modified)
     → refuse + skip with `local_modifications` unless `--force`, which validates +
     overwrites + re-records (`AC-UPDATE.4`).
5. **Best-effort across ids** (`AC-UPDATE.7`): report each id's outcome, continue
   past per-id failures/skips, exit 1 if anything errored, was skipped-dirty, or
   (under `--check`) is stale; else exit 0. This differs intentionally from
   `remove`'s first-failure-throw.
6. **`--check`** (`AC-UPDATE.6`): report per-id status, change nothing, exit 0 only
   if every target is up to date; exit 1 if any update is available / dirty-blocked
   / errored (use `update_available` for the stale/dirty-blocked detection per
   §5.6). Mirrors `generate --check` drift detection.
7. **Missing-dir drift** (DoF): a target whose unit dir is gone — choose
   non-destructive **report** (recommended; simplest, consistent with `list`'s
   `missing`) or re-install; pin the choice and test it.
8. All swaps stage on the destination filesystem and commit by atomic rename;
   clone temps always cleaned (`AC-UPDATE.8`). Lock writes are atomic, unit-first
   then lock (§5.1). Non-interactive, no prompt (`AC-ERR.6`).
9. **Requirements**: `packages/cli/requirements/functional/18-update.yml`.
10. **e2e cases** (drive state with `setup: cli: ["add", …]` then `cp:` to mutate
    the recorded source and/or the installed unit):
    - bare = all / explicit ids / unknown → `not_installed` — `AC-UPDATE.1`;
    - up-to-date (source unchanged) — `AC-UPDATE.2`;
    - replace + bump (source mutated via `cp`) — `AC-UPDATE.3`;
    - dirty refuse + `--force` overwrite (unit mutated + source mutated) —
      `AC-UPDATE.4`;
    - local-path re-read from recorded path; cwd-independent via absolute `url`
      (run from a subdir via `cwd:`) — `AC-UPDATE.5`, `AC-UPDATE.12`;
    - `--check` exit 0 (up to date) and exit 1 (stale/dirty) — `AC-UPDATE.6`;
    - best-effort multi-id (one ok, one errored → exit 1, both reported) —
      `AC-UPDATE.7`;
    - mid-copy failure leaves prior unit intact + no temp (simulate via a
      validation-failing upstream `cp`) — `AC-UPDATE.8`, `AC-UPDATE.9`;
    - nothing-to-update exit 0 — `AC-UPDATE.10`;
    - interrupted-update reconcile (disk == upstream != stored) — `AC-UPDATE.11`;
    - tampered entry → `invalid_lock` — `AC-LOCK.8`; missing-dir drift policy as
      pinned; `--check`+`--force` per the pinned choice.
11. Regenerate `BEHAVIOR.md`.

**Files modified:** `packages/cli/src/args.ts`, `packages/cli/src/program.ts`,
`packages/cli/src/commands/update.ts` (NEW),
`packages/cli/src/install/update.ts` (NEW),
`packages/cli/requirements/functional/18-update.yml` (NEW),
`packages/cli/test/e2e/cases/<update-cases>/…` (NEW),
`packages/cli/docs/BEHAVIOR.md` (regenerated),
`packages/cli/test/install/update.test.ts` (NEW, integration for the hash matrix
with injected `GitRunner`).

**Verification:**
- `bun run test packages/cli/test/install/update.test.ts` exits 0 (hash-matrix
  transitions).
- `bun run test:cli:e2e` exits 0, including new `update` cases + traceability.
- `bun run docs:cli:living --check` passes.
- `bun run typecheck`, `bun run check`, `bun run test`.

**Acceptance criteria:**
- `update` satisfies `AC-UPDATE.1`–`AC-UPDATE.12`, `AC-LOCK.8`, `AC-ERR.6`; the
  `--check`+`--force` and missing-dir-drift DoF choices are pinned and tested.
- Every new `UPDATE-FR-*` AC has a covering e2e case; `BEHAVIOR.md` current.

---

### Task 13: Documentation — `AGENTS.md` and `README.md`

**Objective:** Bring the two human/agent-facing docs in line with the shipped
command family, the lock file, the `.jastr/` source convention, and the new error
codes — this feature **does** add error codes, unlike recent CLI-only features.

**Input / context:** Spec §5.7, `AC-DOC.1`, P17, and the `AGENTS.md` "Update rule"
(reconcile stale "v1 restrictions"/"only"/"always" claims about the command set
and engine boundary). Depends on Tasks 9–12 (final behavior/wording settled).

**Steps:**
1. **`AGENTS.md`**: add the command family to "Current v2 direction" (canonical
   commands now include `add`/`list`/`remove`/`update`); describe the per-root
   `<root>/.jastr/lock.json` provenance lock (ignored by template discovery like
   `config.yml`), the named-ref-only `.jastr/` source convention, local-path vs
   clone acquisition, and the ten new `JastrErrorCode`s. Add an Architecture
   Decisions bullet pointing at this thread's spec
   (`docs/threads/260626094825Z-remote-template-install/specs/001/spec.md`). Grep
   `AGENTS.md` for now-stale absolutes (e.g. "no network or subprocess code",
   "engine adds no error code", canonical-command lists) and rewrite them.
2. **`README.md`**: extend the `## Commands` block with the four commands and a
   short usage description (install/inspect/refresh/remove mental model), note the
   lock file and `git` runtime requirement for remote `add`/`update`.
3. Keep `CLAUDE.md` (symlink to `AGENTS.md`) untouched — it follows automatically.

**Files modified:** `AGENTS.md`, `README.md`.

**Verification:**
- `grep -nE "jastr add|jastr list|jastr remove|jastr update" README.md AGENTS.md`
  shows the new commands in both.
- `grep -nE "lock\.json" AGENTS.md README.md` shows the lock documented.
- `grep -nE "git_unavailable|clone_failed|invalid_lock|unsupported_source_entry" AGENTS.md`
  shows the new codes documented.
- `grep -n "no network or subprocess" AGENTS.md` returns nothing (stale claim
  removed).
- `bun run check` (Biome formats markdown too).

**Acceptance criteria:**
- `AGENTS.md` and `README.md` describe the command family, the lock file, the
  `.jastr/` source convention, and the new error codes; no stale "no
  network/subprocess" or "no new error code" claim remains (`AC-DOC.1`).

---

### Task 14: Finalize — regenerate living docs and run the full gate sweep

**Objective:** Confirm the whole change is internally consistent and every standing
gate is green, the closing whole-change verification.

**Input / context:** `AGENTS.md` "Notes" gate list; spec `AC-DOC.2`, `AC-DOC.3`,
`AC-ERR.2`, `AC-ERR.3`. Depends on all prior tasks. This task writes no new feature
code; it regenerates the living doc and runs the sweep, fixing only fallout it
surfaces.

**Steps:**
1. Regenerate the living doc deterministically: `bun run docs:cli:living`, then
   confirm `bun run docs:cli:living --check` is clean.
2. Run the full standing-gate sweep and ensure each exits 0: `bun run check`,
   `bun run typecheck`, `bun run test`, `bun run test:cli:e2e`,
   `bun run docs:cli:living --check`, `bun run build`.
3. Re-assert the engine boundary holds end-to-end:
   `grep -rE "node:fs|node:child_process|node:net|node:https?|node:dns" packages/engine/src`
   returns nothing, and the only engine diff for the feature is the
   `JastrErrorCode` additions (`AC-ERR.3`).
4. Spot-check `package.json` (root + both packages) added **no** new runtime
   dependency (`AC-ERR.4`).
5. Fix any drift the sweep reveals (e.g. a `BEHAVIOR.md` mismatch, a Biome format
   nit) — scope strictly to making the gates pass, no new behavior.

**Files modified:** `packages/cli/docs/BEHAVIOR.md` (final regeneration if any
later task left it stale); any minimal fixes the sweep surfaces.

**Verification:**
- All six commands exit 0:
  `bun run check && bun run typecheck && bun run test && bun run test:cli:e2e && bun run docs:cli:living --check && bun run build`.
- `git diff --stat packages/engine/src` shows only `errors.ts` changed for the
  engine (`AC-ERR.3`).

**Acceptance criteria:**
- `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:cli:e2e`,
  `bun run build` all exit 0 (`AC-DOC.3`).
- `bun run docs:cli:living --check` passes; all functional requirements have
  covering e2e cases (`AC-DOC.2`).
- The engine's only diff is the new `JastrErrorCode` literals (`AC-ERR.3`); no new
  runtime dependency (`AC-ERR.4`).

## Notes

- **Module layout is a degree of freedom** (spec §7). This plan proposes a
  `packages/cli/src/install/` directory (`git.ts`, `source.ts`, `hash.ts`,
  `lock.ts`, `unit.ts`, `validate-unit.ts`, and per-command `add.ts`/`list.ts`/
  `remove.ts`/`update.ts`) with Commander factories under
  `packages/cli/src/commands/`, mirroring the existing `run`/`generate`/`validate`
  split. The implementer may reshape this; the task boundaries remain valid as long
  as each task's observable acceptance holds.
- **`JASTR_GIT_BIN`** is introduced as the git-binary resolution point (Task 2). It
  is the hermetic test seam for `git_unavailable` and the fake-git e2e path, and
  doubles as a reasonable real-world escape hatch. It is within the spec's
  "non-interactive git mechanism specifics" / internal-structure DoF, but it is a
  visible surface — document it in `AGENTS.md` (Task 13) and flag it for the senior
  reviewer.
- **Harness growth (Task 8)** — per-case `env`, the `setup:` (`cli`/`cp`) primitive,
  and the fake-git shim — is a direct consequence of the existing **e2e-only
  traceability gate** applied to a stateful, git-dependent, offline-tested feature.
  It adds test infrastructure only; it changes no product behavior. Call it out in
  review as the largest non-product change.
- **Two open DoF in `update`** (spec §7) are settled inside Task 12 and must be
  tested as pinned: `--check` + `--force` (recommended: reject, mirroring
  `generate`) and the missing-unit-dir drift policy (recommended: non-destructive
  report).
- **Crash-order invariant** (spec §5.1, P24): every command mutates the **unit
  first, then the lock**, both atomically; the inter-step crash window is
  self-healing on the next command. Tasks 9/11/12 each implement their half of this
  and Task 12 implements the `update` reconcile that closes the `add`/`update`
  interrupted window.
