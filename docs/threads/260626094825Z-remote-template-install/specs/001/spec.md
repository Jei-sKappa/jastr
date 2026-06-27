---
version: 4
status:
  approved: 260627092122Z
---

# Spec — remote template install: `jastr add` / `list` / `remove` / `update`

> All `P<N>` citations in this spec refer to the genesis decision log at
> `seed/discussions/260626124608Z-remote-template-install-decision-log.md`
> (same thread). Cross-references to other thread artifacts are thread-relative.

## 1. Intended outcome

Jastr gains a four-command lifecycle for sharing templates between repositories:

- `jastr add <repo-source> <name>` — fetch a template (or whole group) from a
  remote git source (or a local path) and install it into the local or global
  `.jastr/` root.
- `jastr list` — show the installed/authored template inventory with provenance.
- `jastr remove <id>...` — delete a previously installed template.
- `jastr update [<id>...]` — refresh installed templates from where they came.

When implemented, a user can publish reusable templates in a repo's `.jastr/`
and a consumer can install, inspect, refresh, and remove them with the same
mental model they already use for `jastr run` — i.e. "be the vercel/skills of
templates" (P1).

## 2. Context

The thread's seed
(`seed/260626094825Z-remote-template-install-seed.md`) proposed a single
`jastr install` command inspired by vercel-labs `skills`. A genesis discussion
(the decision log cited above, P1–P20) expanded it into a **command family** and
settled every open question the seed deferred: fetch mechanism, source formats,
local/global target, naming/placement, update/refresh semantics, conflict
handling, and trust of remote content — plus questions the seed did not
anticipate (config never imported, the provenance lock substrate, the
publish/consume conflation, the error taxonomy, and a non-prompt safety model).

This is the **tier-2** spec for that work (ledger:
`tier: 2 @ 260626094825Z`). It covers all four commands in one document (P10).

The repository today has **no network or subprocess code**: the CLI bundles to a
single Node file importing only Node built-ins, and `@jastr/engine` is a pure
template engine. This feature introduces the CLI's first clone/network/filesystem
mutation surface (P2, P17).

## 3. Scope

### 3.1 In scope

- The four commands `add`, `list`, `remove`, `update` (P10), wired as ordinary
  Commander subcommands with fixed flags — unlike `run`'s per-template flags
  which bypass Commander via `parseRunFlags` (P18 spec note).
- Fetch by `git clone --depth 1` into a temp dir (P2); local-path sources read
  in place without cloning (P6, P18).
- Source resolution from the source repo's `.jastr/` by **named ref only**
  (P7) — no direct/arbitrary-folder access.
- Two installable unit kinds: a standalone template directory, or a whole group
  directory copied atomically (P5).
- A per-root JSON provenance lock at `<root>/.jastr/lock.json` (P9).
- Dual-root (local/global) destinations with friendly bootstrap (P11).
- The error model and new `JastrErrorCode`s (P17), the CLI-only engine boundary
  (P17), and the non-prompt safety model with dirty-guards (P12, P13, P16, P19).
- Pre-commit validation of every fetched unit via the existing static-validation
  pipeline (P20).
- Adversarial hardening of the boundary contracts: crash-safe unit+lock
  transaction semantics (P24), source-unit file-type restriction (P25), pinned
  non-interactive git controls (P26), `--path` containment and local-source
  anchoring (P27), and strict lock-entry validation (P28).
- Documentation, functional-requirement, and e2e-case deliverables per the repo
  conventions (P17 AGENTS.md update; AGENTS.md "Test Layout").

### 3.2 Out of scope

**Permanently excluded:**

- Importing the source's `.jastr/config.yml` (input overrides / variants). `add`
  never reads or writes `config.yml`, not in v1 and not later (P4).
- Extracting a *single* template out of a multi-template group; a group installs
  as an atomic whole (P5).

**Deferred (non-breaking future additions; do not build now):**

- The GitHub blob / hosted-registry fast-path (P2).
- The `gh` / SSH auth ladder on clone failure (P2).
- Commit-SHA `--ref` values (P6) — branches and tags only in v1.
- Pasted GitHub/GitLab tree-URL parsing as ergonomic sugar (P6).
- Direct / non-`.jastr/` source layouts (P7).
- Nested-`.jastr/` autodiscovery beyond the explicit `--path` cd (P7).
- An author-side publish manifest and any remote-discovery / `find` command; the
  publish/consume conflation is accepted as-is for now (P8).
- `add --dry-run` (P13), `list --json` (P14), `remove --all` (P15).
- A `jastr install` (restore-everything-from-lock) command — a natural future
  direction the lock enables; an author note, not a logged decision.
- An interactive confirmation prompt / `--yes` on any command (P13, P19).
- `add` idempotent no-op when the id already exists (P12).

**Non-goal — concurrency/locking (P21).** Concurrent invocations mutating the
same root are not guarded against; a single-user CLI is assumed. The atomic
stage-then-move for unit writes and the deterministic `lock.json` write bound the
worst case to a recoverable lost-update on `lock.json` (no unit or lock
corruption). The implementation must leave a `// TODO:` comment beside the
`lock.json` mutation code noting that locking for the rare concurrent case is a
deliberate, deferred future consideration.

## 4. Constraints

- **`git` on PATH is a hard runtime requirement** for `add` and for `update` of
  remote sources (P2). Its absence is reported as `git_unavailable`, never a hang.
- **Raw `node:child_process` for git, zero new npm dependencies** — no
  `simple-git` (P2). Clone uses `git clone --depth 1 [--branch <ref>]`; commit
  capture uses `git rev-parse HEAD` (P9). Copy and lock IO use `node:fs` (P17).
- **The fetch is non-interactive, bounded, and single-attempt** (P2, P13, P26):
  the clone runs with all terminal / credential-helper / SSH prompting suppressed
  and LFS smudge disabled, under a bounded timeout that on expiry kills the git
  child process and surfaces `clone_failed` with a deterministic message — it must
  never hang. On failure it surfaces git's own error text; there is no auth retry
  ladder in v1. (The exact prompt-suppression mechanism and the timeout
  default/override are Degrees of freedom.)
- **`@jastr/engine` stays pure.** The only permitted engine change is adding the
  new string literals to the `JastrErrorCode` union in
  `packages/engine/src/errors.ts`; the engine imports no fs / child_process /
  network code (P17). All command logic lives in `@jastr/cli`.
- **Uniform error UX is unchanged** (P17): every failure prints `Error: <message>`
  to stderr and exits 1. The only exit-0 informational paths are `--help`,
  `help [command]`, `--version`, and a clean `update --check`.
- **Determinism**: the lock file is serialized deterministically (entries sorted
  by key, 2-space JSON, trailing newline) and is timestamp-free, so committed
  locks diff cleanly and git auto-merges non-overlapping keys (P9). No command
  writes nondeterministic content.
- **Node-compatible / no Bun-specific runtime APIs** in CLI source, per the repo
  build contract (AGENTS.md).
- **Discovery is unchanged** (P17): installed units live at the normal locations
  (`.jastr/<id>/`, `.jastr/<group>/`) and are found by `run`/`validate`/`generate`
  as usual; `.jastr/lock.json` is a root-level file ignored by template discovery
  exactly like `config.yml`.
- **Pre-commit validation reuses the engine** (P20): `add` and `update` run the
  existing static-validation pipeline (the same one `jastr validate` uses) against
  the staged unit before committing; this adds no new dependency and no new error
  code — template defects surface with the engine's existing codes.
- **Source-unit file types are restricted** (P25): a fetched unit may contain only
  regular files and directories; a symlink, FIFO, device, socket, or any other
  non-regular entry is rejected via `lstat` (never followed) with
  `unsupported_source_entry` before any validation, copy, or hash.
- **`--path` is containment-checked** (P27): it must be a relative subpath whose
  resolved realpath stays within the source root; absolute paths and `..`-escapes
  are rejected as `invalid_command`. (Refines P7's "no conditions," which meant no
  marker requirement, not permission to leave the source.)
- **git option-injection guard** (P28): every git invocation places `--` before
  positional arguments (URL, ref, path) so a tampered or hostile value cannot be
  read as a git option.
- **Crash-safe two-resource commit** (P24): both the unit and `lock.json` are
  written atomically (same-filesystem temp + rename); commands mutate the unit
  first then the lock, and the crash window between them is self-healing (§5.1).

## 5. Expected behavior

### 5.1 Shared concepts

**Roots.** A *local* root is the nearest `.jastr/` found by walking up from cwd;
the *global* root is `$JASTR_HOME/.jastr` (else `~/.jastr`) (existing discovery,
P11). Each command operates on exactly one root per invocation; the lock is
per-root (P9, P11).

**Installable unit (P5).** Either:
- a **standalone** template directory (`.jastr/<id>/` containing `TEMPLATE.md`),
  copied recursively to `<destRoot>/.jastr/<id>/`; or
- a **group** directory (`.jastr/<group>/` containing `.jastrgroup` and
  `templates/…`), copied **atomically as a whole** to `<destRoot>/.jastr/<group>/`.

The destination namespace is shared: a standalone `foo` and a group `foo` both
occupy `.jastr/foo/` and therefore cannot coexist.

**Source-unit file types (P25).** A fetched unit may contain only regular files
and directories. Every entry is examined with `lstat` (so symlinks are never
followed) during classification; a symlink, FIFO, device, socket, or any other
non-regular entry anywhere in the unit is rejected with `unsupported_source_entry`
before any validation, copy, or hashing — closing local-file-disclosure,
boundary-escape, and hang-on-special-file vectors from a hostile source.

**Named resolution (P7).** `add` resolves `<name>` against the source's
`.jastr/`, reusing the existing standalone/grouped classification
(`tryLoadStandaloneNamedTemplate` / `tryLoadGroupedNamedTemplate`):
- a bare single-segment `<name>` classifies `<base>/.jastr/<name>/` as standalone
  (has `TEMPLATE.md`) or group (has `.jastrgroup`); neither → `template_not_found`
  naming the source;
- a two-segment `group/template` is recognized but rejected with
  `grouped_template_not_addable` (groups install whole).
There is no direct / non-`.jastr/` resolution (P7).

**The lock (P9).** `<root>/.jastr/lock.json`, JSON, identical shape for both
roots, top-level `version: 1`, a map keyed by installed id. Each entry:

```json
{
  "version": 1,
  "templates": {
    "foo": {
      "source": "owner/repo",
      "url": "https://github.com/owner/repo.git",
      "ref": "main",
      "name": "foo",
      "path": "packages/x",
      "kind": "standalone",
      "commit": "<full-sha>",
      "hash": "<sha256-hex>"
    }
  }
}
```

- `ref` omitted ⇒ default branch (P9). `path` omitted ⇒ base was the repo root
  (P7). `commit` omitted ⇒ source was a non-git local path, or a local git repo
  with a dirty working tree whose copied bytes no commit represents (P18, P23).
  `kind` is `standalone` or `group` (P9, P5).
- For a **local-path** source, `url` is the **resolved absolute realpath** of the
  source root, not the as-typed string, so `update` re-reads the same directory
  regardless of the cwd it runs from (P27); `source` keeps the as-typed string for
  display.
- `hash` is sha256 over the installed unit's files, sorted by relative path, with
  each path included in the digest so renames are detected (P9). The digest is
  **canonical and cross-machine stable**, since the local lock is committed and
  team-shared: relative paths are POSIX-normalized (`/` separators), path and file
  content are hashed as UTF-8 bytes with a deterministic framing between them, and
  file mode / permissions / symlink-ness do not participate — so identical content
  yields an identical hash on any operating system.
- The exact top-level key spelling (e.g. `templates`) and any container nesting
  is at implementer discretion (see Degrees of freedom); the **entry fields and
  the keyed-by-id model are pinned**.
- Writes are deterministic: entries sorted by key, 2-space indent, trailing
  newline; no timestamps (P9).
- Reading: a missing or empty lock is treated as no tracked installs; a present
  lock that is unparseable (e.g. unresolved git conflict markers from overlapping
  keys) or carries an unknown `version` fails the command with `invalid_lock` and
  mutates nothing — provenance is never silently discarded, mirroring how an
  unparseable `config.yml` raises `invalid_config` (P22). Beyond parse + version,
  each entry a command will act on is **strictly validated** before any mutation
  (P28): required fields present and correctly typed, `kind` ∈
  {`standalone`,`group`}, `path` a safe relative subpath, `url` present, and no
  unknown extra fields; any violation is `invalid_lock`. A committed lock is a
  collaborative, partly-trusted input, so a tampered-but-parseable entry must not
  silently drive a clone or source resolution.

**Crash safety & the unit+lock transaction (P12, P16, P24).** Unit writes stage
into a temp location **on the destination filesystem** and are committed by an
atomic rename (a cross-filesystem rename is not atomic, so OS-temp staging is
disallowed for the destination). The `lock.json` write is **also atomic** — a
same-filesystem temp file plus rename — so a crash or disk-full never leaves a
truncated lock. The unit and the lock are not one atomic transaction, so the
commit order and recovery are pinned: every command mutates the **unit first,
then the lock**, and a crash in the window between is self-healing on the next
command:
- `update`: if `disk != stored` but the freshly fetched `disk == upstream`, that
  is an interrupted prior update (not a local edit) — `update` reconciles the lock
  to the new `hash`/`commit` instead of refusing with `local_modifications`.
- `remove`: a unit deleted before its entry is dropped is the drift case
  (tracked + dir gone) already handled by dropping the stale entry (P15).
- `add`: a unit moved into place before its entry is written is left as an
  untracked unit, recoverable by deleting it and re-running `add`; it is not
  auto-adopted, preserving create-only semantics (P12).

Clone temp dirs are always cleaned up.

**Validation gate (P20).** Before a fetched unit is committed, it must pass the
same static-validation pipeline `jastr validate` runs — parse frontmatter →
validate schema → static render with sampled inputs (exercising directives,
interpolation, include resolution/containment, missing-include and cycle
detection, and engine input validation). Validation runs against the **staged
copy** (which carries the unit's included files), so nothing broken is ever moved
into place. A standalone validates its one template; a group validates **every**
template it contains (atomic — any failure fails the whole unit). A defect fails
the command with that defect's existing engine `JastrErrorCode` (no new code).

### 5.2 `jastr add <repo-source> <name>`

Flags: `--ref <branch|tag>`, `--path <base-dir>`, `-g`/`--global`.

1. **Destination root** (P11): with `-g/--global`, the global root (created if
   absent). Otherwise the local root: walk up for an existing `.jastr/`; if none
   exists up the tree, create `.jastr/` in cwd. `add` never raises
   `missing_project_root`.
2. **Acquire the source tree**:
   - A **local path** source is read in place — no clone, no temp (P6, P18).
   - `owner/repo` shorthand expands to `https://github.com/owner/repo.git`; any
     other string is passed straight to `git clone` (P6).
   - Remote sources are fetched with
     `git clone --depth 1 [--branch <ref>] -- <url> <dir>` (the `--` guards
     against option injection, P28) into a temp dir, in a non-interactive
     environment under a bounded timeout (P26): no prompt may hang it, and a
     timeout kills the child and is reported as `clone_failed`. `git` absent →
     `git_unavailable`; clone/fetch failure → `clone_failed` (message carries
     git's stderr). A commit-SHA `--ref` is not supported and surfaces as a clone
     failure, never a silent fallback (P6).
3. **Base directory** = `<sourceRoot>/<--path>` (default `<sourceRoot>`) (P7).
   `--path` must be a relative subpath whose resolved realpath stays within
   `<sourceRoot>`; an absolute path or a `..`-escape is rejected as
   `invalid_command` (P27).
4. **Resolve `<name>`** against `<base>/.jastr/` per §5.1 named resolution.
5. **Installed id** = `<name>`; **destination** = `<destRoot>/.jastr/<id>/`
   (standalone) or `<destRoot>/.jastr/<group>/` (group).
6. **Conflict (create-only, P12)**: if the destination already exists, `add`
   writes nothing and errors with `destination_exists`. There is no `--force` on
   `add`. The message differs by flavor: a tracked id (has a lock entry) →
   directs the user to `jastr update <id>`; an untracked id → states it was not
   jastr-installed and must be deleted by hand.
7. **Validate, then install**: copy the unit into a temp staging area on the
   destination filesystem — rejecting any symlink or special file with
   `unsupported_source_entry` (P25) — and run the validation gate (§5.1) against
   the staged copy; on a defect, fail with the defect's existing code and install
   nothing. On success, atomically move the staged unit into place. `config.yml`
   is never read or written (P4).
8. **Record provenance**: write/replace the lock entry **atomically** (§5.1, P24),
   after the unit is in place. `commit` = `git rev-parse HEAD` of the clone, or of
   a **clean** local git repo; it is omitted for a non-git local path and for a
   local git repo with a **dirty** working tree (no commit represents the copied
   bytes) (P18, P23). For a local-path source, `url` is the source root's absolute
   realpath (P27).
9. **Output** (P13): one deterministic success line naming the unit, source+ref,
   destination, and root (e.g. `Installed foo from owner/repo (ref main) into
   .jastr/foo [local].`; a group additionally reports its template count). No
   prompts, no `--yes`.

### 5.3 `jastr list`

Flags: `--local`, `--global` (default: **both** roots).

`list` is **folder-first with a lock overlay**, showing the full inventory (P14):

1. For each in-scope root that exists, enumerate the actual template/group units
   in `.jastr/` (reuse the standalone/group classification) and join each against
   that root's lock:
   - unit present + lock entry → **tracked**: show id, `source@ref`, kind, short
     commit;
   - unit present + no lock entry → **local** (authored): show id marked `local`;
   - lock entry whose unit dir is gone → **missing** (drift), flagged as such.
2. Roots render as labeled sections (Local / Global), each shown only if it has
   rows. Entries are sorted by id.
3. If nothing is found anywhere in scope, print `No templates installed.`
4. `list` is read-only and never mutates the filesystem; exit 0.

### 5.4 `jastr remove <id>...`

Flags: `-g`/`--global` (default local), `--force`.

Removes one or more **tracked** installs from one root. A group removes as a
whole (its directory + entry). Per id (P15, P19):

- **tracked + dir present + clean** (disk hash == lock hash) → delete the unit
  directory and drop the lock entry (e.g. `Removed foo (was owner/repo@main)
  [local].`).
- **tracked + dir present + locally modified** (disk hash ≠ lock hash) → refuse
  with `local_modifications` unless `--force`; with `--force`, delete anyway (P19).
- **tracked + dir already gone** (drift) → drop the stale lock entry (e.g.
  `Cleaned stale entry foo.`).
- **untracked** (dir present, no lock entry) → refuse with `not_jastr_installed`
  (never delete author work).
- **neither** → `not_installed`, with a hint if the id is tracked in the other
  root.

ids are processed in order with **no pre-validation pass**; the first failure
emits the uniform `Error: <message>` and exits 1, and any ids already removed
stay removed (partial completion is accepted) (P15). Non-interactive, no prompt
(P19).

### 5.5 `jastr update [<id>...]`

Flags: `-g`/`--global` (default local), `--force`, `--check`.

`update` is **lock-driven**: it reads each target's recorded
`source`/`ref`/`name`/`path` and refreshes from there (P16). Bare `update`
targets **all** tracked ids in the root; with ids, just those. An explicit id
with no lock entry → `not_installed`. A bare `update` in a root with no tracked
installs is a no-op success (exit 0) with an explicit nothing-to-update message.

Per id, compute three hashes — `stored` (lock `hash`), `disk` (current on-disk
unit), `upstream` (freshly re-fetched unit, via the same acquire path as `add`
§5.2 step 2, re-resolving the recorded `name` under the recorded `path`):

- `upstream == stored` → **up to date**, no change.
- `upstream != stored` and `disk == stored` (clean) → **replace** the unit
  (stage-then-swap, §5.1) and bump the lock `hash` + `commit` (e.g.
  `updated (abc123 → def456)`).
- `upstream != stored`, `disk != stored`, but `disk == upstream` → an interrupted
  prior update (the unit was already replaced before the lock was written), **not**
  a local edit → reconcile the lock to the new `hash`/`commit`, no refusal (P24).
- `upstream != stored`, `disk != stored`, and `disk != upstream` (locally
  modified) → refuse + skip with `local_modifications`, unless `--force`, which
  overwrites and re-records (P16).

Before any replace (the clean and `--force` cases), `update` runs the validation
gate (§5.1) on the fetched upstream unit; a broken upstream fails that id under
the best-effort model and leaves the existing install untouched (P20).

Re-fetch uses the **current tip of the recorded ref** — a branch advances, a tag
moves only if retagged; commit-SHA pinning is not supported (P16, P6). Local-path
installs are re-read from the recorded path and hash-compared the same way (P18).

`--check` reports per-id status, changes nothing, and exits 0 only if every
target is up to date; it exits 1 if any update is available, any is
dirty-blocked, or any errored (CI drift detection, mirroring `generate --check`)
(P16).

`update` is **best-effort across ids**: it reports each, continues past per-id
failures/skips, and exits 1 if anything errored, was skipped-dirty, or (under
`--check`) is stale. This intentionally differs from `remove`'s
first-failure-throw because per-id status is intrinsic to a refresh and
"dirty/skipped" is a normal outcome, not a usage error (P16).

### 5.6 Error model & exit codes (P17)

New `JastrErrorCode`s added to the engine union (the only engine change):

| code | raised when |
|---|---|
| `git_unavailable` | `git` not found on PATH |
| `clone_failed` | any clone/fetch failure (network, auth, repo-missing, ref-missing, commit-SHA `--ref`); message carries git's stderr |
| `destination_exists` | `add` target id already exists (message differs tracked vs untracked) |
| `not_installed` | `remove`/`update` target has no install in the root |
| `not_jastr_installed` | `remove` target exists but is author-written (untracked) |
| `local_modifications` | `remove`/`update` target locally modified, without `--force` |
| `update_available` | `update --check` found a stale/dirty-blocked target |
| `grouped_template_not_addable` | `add` given a two-segment `group/template` ref |
| `invalid_lock` | any command reads a present `lock.json` that is unparseable, has an unknown `version`, or has a malformed/tampered entry it will act on |
| `unsupported_source_entry` | a fetched unit contains a symlink or non-regular (special) file |

Reused codes: `template_not_found` (named ref absent in the source's `.jastr/`,
message names the source), `invalid_command` (argv-shape errors),
`invalid_template_reference` (malformed ref), and the engine's existing
template-defect codes (e.g. `invalid_frontmatter`, `malformed_schema`,
`invalid_directive`, `include_not_found`, `include_cycle`) raised by the
pre-commit validation gate (P20).

Exit codes: every failure → exit 1; success and a clean `update --check` → exit 0;
`--help`/`help`/`--version` → exit 0.

### 5.7 Documentation & test deliverables

Per the repo's conventions, the implementation must also:

- Update `AGENTS.md` to describe the command family, the lock file, the `.jastr/`
  source convention, and the new `JastrErrorCode`s — this feature **does** add
  error codes, unlike the recent CLI-only features (P17). Update `README.md` for
  the user-facing surface.
- Add CLI functional requirements under `packages/cli/requirements/functional/`
  and e2e cases under `packages/cli/test/e2e/cases/` with `covers:` traceability,
  and regenerate `packages/cli/docs/BEHAVIOR.md` (AGENTS.md "Test Layout").

## 6. Acceptance criteria

Functional requirements (`FR-*`) with checkable acceptance criteria (`AC-*`).
Each AC is an observable pass/fail assertion; each traces to the decision(s) it
enforces.

### FR-ADD — `jastr add`

- **AC-ADD.1** Running `add owner/repo foo` with `owner/repo` containing
  `.jastr/foo/TEMPLATE.md` installs it to the destination root's `.jastr/foo/`
  with the directory contents copied verbatim. *(P2, P5, P7)*
- **AC-ADD.2** `add owner/repo mygroup` where the source has
  `.jastr/mygroup/.jastrgroup` installs the **entire** group directory to
  `.jastr/mygroup/`, including the marker and all templates. *(P5)*
- **AC-ADD.3** `add owner/repo grp/tpl` (two-segment) fails with
  `grouped_template_not_addable` and installs nothing. *(P7)*
- **AC-ADD.4** `add owner/repo missing` where `.jastr/missing/` is absent in the
  source fails with `template_not_found` whose message names the source. *(P7)*
- **AC-ADD.5** `owner/repo` shorthand is cloned from
  `https://github.com/owner/repo.git`; an arbitrary git URL or `git@…`/`ssh://`
  string is passed to `git clone` unchanged. *(P6)*
- **AC-ADD.6** A local-path source is read without invoking `git clone` (no temp
  clone dir created for it). *(P6, P18)*
- **AC-ADD.7** With `git` absent from PATH, a remote `add` fails with
  `git_unavailable`; with `git` present but the clone failing, it fails with
  `clone_failed` carrying git's stderr; neither hangs awaiting credentials.
  *(P2)*
- **AC-ADD.8** `--ref <branch|tag>` clones that ref via `--branch`; a value that
  is a commit SHA fails (clone failure) rather than silently using the default
  branch. *(P6)*
- **AC-ADD.9** `--path <subdir>` resolves `<source>/<subdir>/.jastr/<name>`;
  omitting it resolves `<source>/.jastr/<name>`. *(P7)*
- **AC-ADD.10** Default install targets the local root; `-g`/`--global` targets
  the global root. *(P11)*
- **AC-ADD.11** When no local `.jastr/` exists up-tree, a default `add` creates
  `.jastr/` in cwd and installs there; `add` never raises `missing_project_root`.
  *(P11)*
- **AC-ADD.12** `add` to an existing destination id fails with
  `destination_exists` and writes nothing; the message routes a *tracked* id to
  `jastr update` and tells an *untracked* id to be deleted by hand. There is no
  `--force` flag on `add`. *(P12)*
- **AC-ADD.13** A successful `add` writes/updates the lock entry with `source`,
  `url`, `ref?`, `name`, `path?`, `kind`, `commit?`, `hash` per §5.1; `commit` is
  present for a clone or a clean local git repo and omitted for a non-git local
  path or a dirty local git repo. *(P9, P18, P23)*
- **AC-ADD.14** `add` never creates or modifies any `config.yml`. *(P4)*
- **AC-ADD.15** A clone failure or copy failure leaves no partial unit at the
  destination and leaves no clone temp dir behind. *(P12)*
- **AC-ADD.16** On success, `add` prints a single deterministic provenance line
  and issues no prompt and accepts no `--yes`. *(P13)*
- **AC-ADD.17** A fetched unit that fails the static-validation pipeline (bad
  frontmatter/schema, an unresolved or out-of-bounds include, a directive or
  interpolation error, an include cycle, etc.) is **not** installed; `add` fails
  with that defect's existing engine code and the destination is unchanged. For a
  group, a defect in any one template fails the whole install. *(P20, P5)*
- **AC-ADD.18** Destination staging occurs on the destination filesystem so the
  install is committed by an atomic rename, never a cross-filesystem copy. *(P12,
  P16)*
- **AC-ADD.19** A fetched unit containing a symlink or special file (FIFO, device,
  socket) is rejected with `unsupported_source_entry` before any copy, hash, or
  validation; nothing is installed. *(P25)*
- **AC-ADD.20** An absolute `--path`, or a `--path` that resolves outside the
  source root, is rejected with `invalid_command`; a normal relative subpath
  resolves within it. *(P27)*

### FR-LIST — `jastr list`

- **AC-LIST.1** `list` enumerates units found on disk in `.jastr/` (not merely
  lock entries): a unit with a lock entry shows as tracked with `source@ref`,
  kind, and short commit; a unit with no entry shows marked `local`. *(P14)*
- **AC-LIST.2** A lock entry whose unit directory is absent is shown flagged
  `missing` (drift); a manually-deleted unit never appears as a tracked ghost.
  *(P14)*
- **AC-LIST.3** With no flags, both roots are shown as labeled sections, each
  present only if it has rows; `--local` / `--global` restrict to one. *(P14)*
- **AC-LIST.4** Entries are sorted by id; an empty in-scope inventory prints
  `No templates installed.`; `list` mutates nothing and exits 0. *(P14)*

### FR-REMOVE — `jastr remove`

- **AC-REMOVE.1** Removing a clean tracked id deletes its unit directory and drops
  its lock entry. *(P15)*
- **AC-REMOVE.2** Removing a tracked id whose unit is locally modified fails with
  `local_modifications` unless `--force`, which deletes it. *(P19)*
- **AC-REMOVE.3** Removing a tracked id whose directory is already gone drops the
  stale lock entry (drift cleanup). *(P15)*
- **AC-REMOVE.4** Removing an untracked id (present on disk, no lock entry) fails
  with `not_jastr_installed` and deletes nothing. *(P15)*
- **AC-REMOVE.5** Removing an unknown id fails with `not_installed`; default
  targets the local root, `-g`/`--global` the global root. *(P15)*
- **AC-REMOVE.6** A group id removes the whole group directory and its entry.
  *(P5, P15)*
- **AC-REMOVE.7** Given multiple ids, they are processed in order with no
  pre-validation; the first failure exits 1 and ids already removed stay removed.
  *(P15)*

### FR-UPDATE — `jastr update`

- **AC-UPDATE.1** Bare `update` targets all tracked ids in the root; `update <id>`
  targets only the named id(s); an explicit unknown id → `not_installed`. *(P16)*
- **AC-UPDATE.2** For a target where the re-fetched unit hash equals the stored
  lock hash, `update` reports "up to date" and changes nothing. *(P16)*
- **AC-UPDATE.3** For a target where upstream differs and the on-disk unit is
  unchanged from the lock hash, `update` replaces the unit and bumps the lock
  `hash` and `commit`. *(P16)*
- **AC-UPDATE.4** For a target where upstream differs and the on-disk unit was
  locally modified, `update` refuses + skips with `local_modifications` unless
  `--force`, which overwrites and re-records. *(P16)*
- **AC-UPDATE.5** Re-fetch uses the recorded ref's current tip; a local-path
  install is re-read from its recorded path and hash-compared. *(P16, P18)*
- **AC-UPDATE.6** `update --check` changes nothing, exits 0 when all targets are
  up to date, and exits 1 when any update is available, dirty-blocked, or errored.
  *(P16)*
- **AC-UPDATE.7** `update` is best-effort across ids: it reports each, continues
  past per-id failures/skips, and exits 1 if anything errored, was skipped-dirty,
  or (under `--check`) is stale. *(P16)*
- **AC-UPDATE.8** An `update` replace that fails mid-copy leaves the
  previously-installed unit intact (stage-then-swap) and leaves no clone temp dir
  behind. *(P16, P12)*
- **AC-UPDATE.9** Before replacing, `update` validates the fetched upstream unit;
  a broken upstream fails that id (best-effort, exit 1) and leaves the existing
  install untouched. *(P20)*
- **AC-UPDATE.10** A bare `update` in a root with no tracked installs exits 0 with
  an explicit nothing-to-update message (mirroring `list`'s empty path). *(P16)*
- **AC-UPDATE.11** When the on-disk unit differs from the stored hash but equals
  the freshly fetched upstream (an interrupted prior update), `update` reconciles
  the lock instead of refusing with `local_modifications`. *(P24)*
- **AC-UPDATE.12** A local-path install with a relative `source` updates from the
  same directory regardless of the cwd `update` runs from (the lock's `url` is an
  absolute realpath). *(P27)*

### FR-LOCK — provenance lock

- **AC-LOCK.1** The lock lives at `<root>/.jastr/lock.json`, is JSON, is keyed by
  installed id, has identical shape for local and global roots, and carries a
  top-level `version`. *(P9)*
- **AC-LOCK.2** The lock is written deterministically (entries sorted by key,
  2-space indent, trailing newline) and contains no timestamps. *(P9)*
- **AC-LOCK.3** `hash` is sha256 over the unit's files, sorted by relative path
  with the path included in the digest, using a canonical serialization
  (POSIX-normalized paths, UTF-8 content bytes, deterministic framing,
  mode-independent); identical content yields an identical hash across machines
  and operating systems, and any file rename changes it. *(P9)*
- **AC-LOCK.4** `lock.json` is ignored by template discovery — `run`/`validate`/
  `generate` behave identically whether or not it is present. *(P17)*
- **AC-LOCK.5** The code path that writes `lock.json` carries a `// TODO:` comment
  noting that locking for concurrent invocations is a deferred consideration.
  *(P21)*
- **AC-LOCK.6** A missing or empty lock is treated as no tracked installs; a
  present but unparseable or unknown-`version` lock fails the command with
  `invalid_lock` and mutates nothing. *(P22)*
- **AC-LOCK.7** `lock.json` is written atomically (same-filesystem temp + rename);
  a crash or disk-full during the write never leaves a truncated lock. *(P24)*
- **AC-LOCK.8** Before acting on a selected entry, `update`/`remove` strictly
  validate it (required fields, correct types, known `kind`, safe relative `path`,
  `url` present, no unknown fields); a malformed or tampered entry fails with
  `invalid_lock` before any mutation. *(P28)*

### FR-ERR — error model & engine boundary

- **AC-ERR.1** Each of `git_unavailable`, `clone_failed`, `destination_exists`,
  `not_installed`, `not_jastr_installed`, `local_modifications`,
  `update_available`, `grouped_template_not_addable`, `invalid_lock`,
  `unsupported_source_entry` exists as a `JastrErrorCode` and is raised in its
  specified situation. *(P17, P22, P25)*
- **AC-ERR.2** Every failure prints `Error: <message>` to stderr and exits 1;
  `--help`/`help`/`--version` and a clean `update --check` exit 0. *(P17)*
- **AC-ERR.3** `@jastr/engine` source imports no `node:fs`, `node:child_process`,
  or network APIs; the only engine diff for this feature is the new
  `JastrErrorCode` literals. *(P17)*
- **AC-ERR.4** No new npm runtime dependency is added; git is invoked via
  `node:child_process`. *(P2)*
- **AC-ERR.5** Argv-shape errors fail with `invalid_command` and exit 1: a
  missing required `<repo-source>` or `<name>` for `add`, a missing required id
  for `remove`, and any unrecognized flag. *(P17)*
- **AC-ERR.6** No command (`add`/`list`/`remove`/`update`) prompts interactively
  or accepts a `--yes` flag; each runs to completion or fails without reading
  stdin. *(P13, P19)*
- **AC-ERR.7** Every git invocation places `--` before positional arguments so a
  hostile `source`/`url`/`ref` cannot be interpreted as a git option. *(P28)*
- **AC-ERR.8** A clone that cannot complete non-interactively (credential/SSH
  prompt) or exceeds the timeout is killed and reported as `clone_failed`, never
  hanging. *(P26)*

### FR-DOC — documentation & tests

- **AC-DOC.1** `AGENTS.md` and `README.md` are updated to describe the command
  family, the lock file, the `.jastr/` source convention, and the new error
  codes. *(P17, repo update rule)*
- **AC-DOC.2** CLI functional-requirement files and e2e cases with `covers:`
  traceability are added, and `bun run docs:cli:living --check` passes. *(AGENTS.md
  "Test Layout")*
- **AC-DOC.3** `bun run check`, `bun run typecheck`, `bun run test`,
  `bun run test:cli:e2e`, and `bun run build` all exit 0. *(AGENTS.md "Notes")*

## 7. Degrees of freedom

The *what* above is pinned; these *hows* are explicitly the implementer's choice:

- **Internal code structure**: module/file layout, function decomposition, where
  the clone/copy/lock helpers live within `@jastr/cli`, and how `add`/`update`
  share their acquire-and-resolve path.
- **Human-readable message wording**: the exact phrasing of success and error
  messages is free, provided each carries the information the relevant AC names
  (and the specified `JastrErrorCode`). The example strings in §5 are
  illustrative.
- **Short-commit length** in `list` output (e.g. 7/8/12 hex chars).
- **Temp-dir location and naming**: clone staging may live in the OS temp dir;
  **destination** staging must live on the destination filesystem (e.g. a
  dot-prefixed temp dir under `<root>/.jastr/`) so the move into place is a true
  atomic rename. A cross-filesystem destination rename is not atomic and is
  disallowed.
- **`clone_failed` stderr presentation**: passing git's stderr through verbatim
  vs lightly wrapping it, so long as the underlying git message is preserved.
- **Commit-SHA detection for `--ref`**: relying on git's own `--branch` rejection
  vs pre-validating the value, so long as a SHA never silently falls back to the
  default branch (P6).
- **Non-interactive git mechanism specifics** (P26): the exact environment
  variables / askpass mechanism used to suppress all prompting, and the clone
  timeout's default value and any env override, are free — provided no prompt can
  hang the process and a timeout surfaces `clone_failed`. (LFS-smudge-disabling is
  now pinned, not optional.)
- **`update --check` combined with `--force`**: whether this combination is
  rejected (mirroring `generate`'s "`--check` cannot be combined with `--force`")
  or `--force` is simply ignored under `--check`, so long as the behavior is
  consistent and tested. *(Not settled in discussion; granted as open here rather
  than baked in.)*
- **`update` of a target whose unit directory is missing (drift)**: whether to
  re-install it or report it, so long as it is non-destructive and reported.
  *(Not settled in discussion.)*
- The lock's top-level container key spelling (e.g. `templates`) and any nesting,
  provided the keyed-by-id model and the pinned per-entry fields (§5.1) hold.
- **Clone batching in `update`**: cloning a shared source repo once for all ids
  that reference it, vs cloning per id — the installed result is identical either
  way.

## 8. Unresolved questions

None. The single open question from the initial draft — whether `add`/`update`
validate a fetched template before committing it — was settled (validate before
commit) and folded into §3.1, §4, §5.1/§5.2/§5.5, and §6 (per P20). No unresolved
questions remain that block or qualify this spec.
