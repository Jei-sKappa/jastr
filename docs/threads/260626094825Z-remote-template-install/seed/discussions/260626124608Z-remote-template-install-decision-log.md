# Decision log — remote template install (the seed)

Thread: docs/threads/260626094825Z-remote-template-install/
Target: seed/260626094825Z-remote-template-install-seed.md
Subject: shaping the remote-template-install feature — a `jastr` command family
(install/list/remove/update) that fetches templates from a remote source into a
local or global `.jastr/` root — into a spec that can be safely handed off to a
junior dev. This genesis discussion settles the design questions the seed defers
(source formats, fetch, local/global target, naming/placement, update/refresh,
conflict handling, trust of remote content).

## P1: Thread scope — command family, not install-only

Point: Is this thread scoped to a single `jastr install` command, or to a family
of commands?

What you need to know: The seed frames the work as "a `jastr install` (name TBD)
command." But the explicit inspiration, vercel/skills, is a command family —
`add`, `list`, `remove`, `update`, `find`, `use`. Several of those
(`list`/`remove`/`update`) only work if provenance is tracked from the first
install, so deciding scope up front determines whether the spec must design a
provenance/lockfile substrate now rather than retrofit it later.

Decision: The thread covers a command family — at least install, list, remove,
and update — not install alone. (User clarification; the seed's "install" framing
is the entry point, not the boundary.) v1 may still ship a subset, but the data
model must anticipate the family.

Rationale: The stated goal is to be "the vercel/skills of templates," which is
inherently a multi-command lifecycle. Designing the substrate (especially
provenance) up front avoids a forced migration when list/remove/update land. The
trade-off — more design surface now — is accepted in exchange for not painting
the data model into a corner.

## P2: Fetch mechanism

Point: How does the install path actually retrieve remote template bytes? This
cascades into which source formats are feasible, what runtime dependencies we
take on, and how much code the junior writes.

What you need to know: jastr's CLI bundles to a single Node file importing only
Node built-ins and has no network or subprocess code today — `install` is its
first network/IO surface. The vercel reference has two backends: (1) a GitHub
"blob fast-path" (`blob.ts`) that is GitHub-only AND gated behind an owner/repo
allowlist (`BLOB_ALLOWED_OWNERS = ['vercel','vercel-labs','heygen-com']`), using
the GitHub Trees API + `raw.githubusercontent.com` + their own hosted
`skills.sh/api/download` snapshot server — i.e. it depends on first-party
infrastructure jastr has no analogue for; and (2) the general `git clone`
(`git.ts`), used for GitLab, arbitrary git URLs, `--full-depth`, and whenever
blob is unavailable — `git clone --depth 1 [--branch <ref>]` into a `mkdtemp`
temp dir, copy out, delete temp, with an auth ladder (HTTPS → `gh repo clone` →
SSH), `GIT_TERMINAL_PROMPT=0`, LFS disabled, timeout, guarded cleanup. The
host-agnostic mechanism vercel itself relies on is therefore `git clone`; the
blob path is a CDN optimization, not reusable. The remaining sub-choice is raw
`child_process` git (zero deps) vs the `simple-git` dependency.

Decision: A — fetch by `git clone --depth 1` into a temp dir, copy the template
out, delete temp; raw `child_process.execFile('git', ...)` with zero new
dependencies; a single clone attempt that surfaces git's own error (no `gh`/SSH
auth ladder in v1). The blob/registry fast-path is explicitly out of scope. `git`
on PATH becomes a hard runtime requirement for these commands.

Rationale: This is the host-agnostic path vercel itself relies on; its blob
fast-path requires a first-party hosted snapshot server, so it is not reusable
for a general tool. Raw `git` over `simple-git` keeps the single-file Node bundle
dependency-free for what is one `execFile` call, and avoids bundling concerns.
The cost — a new hard dependency on `git` in PATH for a previously
pure-deterministic tool — is inherent to any clone-based fetch and isolated to
these commands. Auth ladders (gh/ssh) are deferred as later polish.

## P3: Command name

Point: What is the install command named? (The seed left it TBD.)

What you need to know: The seed frames the work as "a `jastr install` (name TBD)
command." jastr's existing commands are verbs (`run`, `generate`, `validate`).
The inspiration, vercel/skills, names this command `add`, paired with `remove`
and alongside `list`/`update`.

Decision: `jastr add`.

Rationale: Matches the vercel/skills command family the project is explicitly
modeling itself on, and `add`/`remove` pair cleanly across the planned family.
Consistent with jastr's verb-command convention. No countervailing reason to
diverge from the inspiration's naming.

## P4: config.yml is never imported

Point: Does `add` ever import the source's `.jastr/config.yml` (project input
overrides / variants) into the destination root?

What you need to know: Author-side configuration already travels with the
template files — input `default:`s live in TEMPLATE.md frontmatter, base
agent-skill target metadata lives in the template's `targets` frontmatter, and
included files come along in the directory copy. `<root>/.jastr/config.yml` holds
*only* consumer-side customization: `inputs.<ref>` (project-level overrides of
defaults) and `variants.<ref>` (locked-input presets plus per-variant
agent-skill overrides), keyed by ref. jastr has no author-side variant
declaration, so a remote template has nothing of its own in config.yml to bring.

Decision: Never — not in v1, not later. `add` never reads or writes
`.jastr/config.yml`. It is consumer-owned and stays that way. (Owner stated this
as a permanent design principle.)

Rationale: config.yml is purely the installing project's customization;
importing a source's config would splice another consumer's choices into this
consumer's project. Because all author intent travels via TEMPLATE.md
(frontmatter defaults + `targets` metadata) and included files, the never-import
rule loses nothing the author shipped — it is the correct rule, not a compromise.

## P5: Installable unit — standalone template or whole group (atomic)

Point: What is the installable unit, and is grouped-template support in scope for
v1?

What you need to know: A standalone template (`.jastr/<id>/TEMPLATE.md` +
included siblings) has its include boundary set to the template directory itself,
so a plain recursive copy of `.jastr/<id>/` is complete and correct (confirmed in
includes.ts: every include root — template/group/file — is clamped to one
boundary). A grouped template (`.jastr/<group>/templates/<id>/TEMPLATE.md` +
`.jastr/<group>/.jastrgroup`) has its boundary set to the whole group root, so it
can `root="group"` include shared files anywhere under `.jastr/<group>/`. Options
considered: (A) standalone-only, reject grouped sources; (B) standalone + whole
group; (C) mirror an arbitrary `.jastr/` subtree with a config merge. I initially
recommended A, claiming grouped support (B) was meaningfully harder. The owner
challenged that: the recursive copy of a group directory is the same operation as
a standalone directory.

Decision: B. The installable unit is either (a) a standalone template directory
copied to `<destRoot>/.jastr/<id>/`, or (b) a whole group directory (its
templates + `.jastrgroup` marker + shared includes) copied atomically to
`<destRoot>/.jastr/<group>/`. Both reuse the same recursive copy and the existing
standalone/grouped classification logic (`classifyDirectTemplate`). config.yml is
never touched (per P4). Extracting a *single* template out of a multi-template
group is explicitly out of scope.

Rationale: Conceded the owner's point — the original "B is harder" claim
conflated two different things. Copying a whole group atomically is the same
directory copy as a standalone, with only trivial extras (classify via existing
logic; place under `.jastr/<group>/`). The genuine complexity lives solely in
extracting one template out of a group, which needs merge-into-existing-group
semantics and risks dangling group-level includes; that one case is excluded by
treating a group as an atomic whole. Option C (subtree mirror + config merge) is
rejected outright: it requires the config import that P4 permanently forbids.

## P6: The `jastr add` source argument

Point: What can you type as `<source>` in `jastr add <source>`, and how are
branch/tag (ref) and in-repo location (subpath) expressed?

What you need to know: Because fetch is `git clone` (P2), any string `git clone`
accepts works for free — `https://…`, `git@…:…`, `ssh://…`, and local repo
paths. Two things clone can't infer: GitHub `owner/repo` shorthand (must expand
to a clone URL) and which ref / which in-repo subpath. vercel encodes both by
parsing host-specific URL shapes (`github.com/o/r/tree/<ref>/<subpath>`, `#ref`,
`@skill`, GitLab `/-/tree/`) — the single largest chunk of source-parser.ts.
Shallow `--branch <ref>` supports branches and tags but not arbitrary commit
SHAs. Options considered: (A) explicit flags, no URL parsing; (B) vercel-style
smart URL parsing; (C) hybrid (flags + a thin GitHub tree-URL parser).

Decision: A. `jastr add <repo-or-url> [--ref <branch|tag>] [--path <subpath>]`.
`owner/repo` shorthand expands to `https://github.com/owner/repo.git`; local
paths skip the clone; any other string is handed straight to `git clone`. No
host-specific URL parsing in v1. `owner/repo` shorthand IS in scope for v1.
`--ref` maps to shallow `git clone --branch <ref>` and therefore accepts
branches and tags only. Commit SHAs are explicitly NOT supported in v1 — passing
one is an error, not a silent fallback.

Rationale: Deterministic, tiny, host-agnostic (anything git can clone just
works), and trivially testable; `--ref`/`--path` are unambiguous where
host-specific URL regex is sprawling and edge-case-laden — the riskiest code to
hand a junior. URL-paste parsing is pure sugar that sits on top of A and can be
added later without reworking anything.

Future improvements (explicitly deferred, not rejected):
- Commit-SHA refs. The shallow `--branch` path cannot check out an arbitrary
  SHA; supporting it needs a non-shallow clone (or `git init` + `fetch <sha>` +
  `checkout`), so it is a distinct code path, not a tweak to A. Worth adding once
  the basic flow is solid.
- Pasted GitHub/GitLab tree-URL parsing (options B/C) as ergonomic sugar that
  extracts `--ref`/`--path` from a copied browser URL.

## P7: Source resolution — `.jastr/` named refs only, no direct access

Point: After cloning (or for a local-path source), how does `add` decide which
template/group to install, and from where in the source tree?

What you need to know: We first explored a dual model mirroring `run` — named
refs resolved via the source's `.jastr/`, plus a `direct` mode pointing at an
arbitrary TEMPLATE.md / group folder, with `--path` as a base-dir "cd". That ran
into a lexical ambiguity: a bare two-segment token like `a/b` could be a named
grouped ref (`group/template`) or a relative direct path. The reflection that
resolved it: do we need direct access at all? vercel/skills has no "direct"
concept — it sources from a convention folder (`skills/`). jastr's natural
analogue is `.jastr/`, the very folder `run` already discovers from. Dropping
direct dissolves the ambiguity and makes `add` mirror local discovery (least
astonishment): the thing you author and test with `run` locally is the thing
others `add`. The cost is that a source repo must adopt `.jastr/` to be
installable — an acceptable publishing convention (vercel likewise expects
`skills/`).

Decision: `add` sources templates only from the repo's `.jastr/`, by named ref,
resolved the same way `run` resolves named refs locally. No direct /
arbitrary-folder access in v1. Grammar:
`jastr add <repo-source> <name> [--path <base-dir>] [--ref <git-ref>]`.
- `<name>`: a normal jastr named ref resolved against `<base>/.jastr/`. A bare
  single segment classifies the `.jastr/<name>/` directory as a standalone
  (TEMPLATE.md) or a whole group (`.jastrgroup`). A two-segment
  `group/template` is resolved and then rejected (whole-group atomicity, per P5)
  with a helpful error.
- `--path <base-dir>`: kept — a pure `cd` that relocates the base from which
  `.jastr/` is found, for monorepos whose `.jastr/` is in a subdirectory. Base
  defaults to the repo root. It carries no other semantics and no conditions.
Implementation reuses the existing named-resolution machinery
(`tryLoadStandaloneNamedTemplate` / `tryLoadGroupedNamedTemplate`) rooted at the
base, plus one new bare-name → whole-group classification step (a concept `run`
lacks, since `run` always targets a single TEMPLATE.md).

Rationale: A single convention removes the dual-world ambiguity entirely and
aligns `add` with how jastr already finds templates, which is the least
astonishing rule for users. Direct access bought installing from non-conforming
repos; requiring `.jastr/` is a reasonable publishing convention and direct
access can return later as a non-breaking addition if real demand appears.
`--path` is kept because monorepo `.jastr/` subdirs are a genuine need and the
flag is trivial and unambiguous now that no direct mode competes with it. This
revises the earlier in-conversation dual named/direct synthesis, which was never
logged.

## P8: Publish/consume conflation — accepted for v1, mechanism deferred

Point: jastr uses `.jastr/` as both the authoring/discovery surface and the
install destination, so a template a project merely *consumed* (installed from
elsewhere) and recommitted into its `.jastr/` could later be installed *from that
project's repo* as if it were authored there. Do we account for this (separate
dirs / manifest), or accept it?

What you need to know: vercel avoids this because its consume surface (`.claude/`,
`.agents/`, …) is a different folder from its source surface (`skills/`), so its
source scanner never re-surfaces consumed skills. jastr structurally cannot copy
that: `run` discovers from `.jastr/`, so anything installed must land in
`.jastr/` to be usable — author and consume surfaces are the same folder by
construction. Crucially, the concern only *activates* with remote discovery —
scanning a repo's `.jastr/` to enumerate what is installable — and that is not in
v1. v1 is named `add` (the user must already know the exact name) plus, later,
local `list` (which, like vercel's `list`, lists *installed* templates, not a
remote repo's offerings). Neither scans a remote `.jastr/`, so a consumed,
recommitted template is never surfaced as an offering. Options considered: (a)
accept; (b) separate publish/consume directories; (c) author-side publish
manifest; (d) provenance-based authored-vs-consumed distinction.

Decision: Accept for v1 (option a). `.jastr/` is the shared source-and-install
convention; no author-side publish manifest in v1. The publish/consume mechanism
(b/c/d) is deferred to whenever remote discovery is actually designed, because
nothing shipped before then exposes the conflation.

Rationale: YAGNI — the accidental-redistribution surface does not exist without
remote scanning, and the tool is pre-release, so a later opt-in publish manifest
(absent → everything installable; present → only listed) is non-breaking. The
consumer-side provenance record we need anyway for `update`/`remove` (next
decision) will additionally enable a manifest-free way to distinguish authored
(no provenance entry) from consumed (has one), so a dedicated publish manifest
may never be required.

## P9: Install provenance — the lock file

Point: When `add` installs a template, what provenance do we record, where, and
in what form, to power `list` / `remove` / `update`?

What you need to know: `remove` needs only to know an id was jastr-installed (the
entry's existence is that signal, so it never deletes an author's hand-written
template); `update` needs `source`/`ref`/`name`/`path` to re-fetch and a hash to
detect change and local edits; `list` needs id + origin. P4 forbids touching
`config.yml`, and provenance is a separate concern, so it must be its own
root-level file (sibling of the template dirs, never inside a unit — otherwise it
pollutes the unit and could be re-installed). The entry's existence also doubles
as P8's authored-vs-consumed signal. vercel runs two locks: a committed project
lock that is deliberately timestamp-free ("to minimize merge conflicts") with a
disk content hash, and an older user-global lock carrying timestamps plus a
GitHub tree SHA. The tree SHA needs the GitHub API; jastr clones (no API), so it
uses a disk content hash for both roots. `update` compares a freshly computed
source hash against the stored hash (equal → up to date; differ → update);
entries with no hash are unmanageable ("cannot be checked automatically"). Open
sub-questions settled here: location (inside `.jastr/` vs project root), format
(JSON vs YAML), and timestamps (vercel's split — global has them, committed lock
does not).

Decision:
- One JSON lock per root at `<root>/.jastr/lock.json`, identical format for the
  local and global roots (local committed with the project; global personal).
  `version: 1` for future migrations.
- Keyed by installed id (standalone id or group name).
- Per-entry fields: `source` (repo-source string as typed), `url` (resolved
  clone URL), `ref?` (branch/tag; omitted = default branch), `name` (named ref
  used), `path?` (the `--path` base if given), `kind` (`standalone` | `group`),
  `commit` (cloned HEAD SHA), `hash` (sha256 over the installed unit's files,
  sorted by relative path, with the path included in the digest so renames are
  detected).
- Uniform and timestamp-free — no `installedAt`/`updatedAt` in either root.
- `commit` + `hash` written from day one.
- Written deterministically: entries sorted by key, 2-space JSON, trailing
  newline (clean diffs; git auto-merges non-overlapping keys).

Rationale:
- JSON over YAML: matches the lock-file convention and vercel; `JSON.parse` is
  built-in (no new dependency); it is a machine-managed file, not hand-authored
  config.
- Inside `.jastr/` over project root: a uniform path for both roots (a
  project-root placement would strand the global lock at a weird
  `$JASTR_HOME/jastr-lock.json` sibling); the ecosystem rule is "lock next to the
  manifest," and jastr's manifest (`config.yml`) lives in `.jastr/`; it is a
  file, so template discovery ignores it and `add` never installs it.
- Uniform timestamp-free over vercel's split: vercel's global-lock timestamps are
  largely a legacy shape, not a considered ideal; the merge-conflict rationale
  also applies to a committed `~/.jastr` dotfiles repo; determinism is a core
  jastr value (goldens / `--check` / e2e fixtures), and a timestamp would force a
  nondeterministic lock plus a new e2e substitution; nothing in the command
  family consumes time ("when" is recoverable from git history or a future `list`
  reading mtime). Owner agreed uniform timestamp-free.
- `commit` + `hash` now: cheap at install (one `git rev-parse`, one hash) and
  required for `update` change-detection — without the hash, `update` cannot tell
  whether the source changed.

## P10: Spec scope — all four commands in one spec

Point: The thread plans a command family (P1: install/list/remove/update). Does
the spec we're about to write cover all of it, or a bounded slice?

What you need to know: `add` is the bulk of the real work — clone, resolve
against `.jastr/`, classify, copy the unit, write the lock, plus the new error
paths (git missing, clone/network failure, ref/name not found, conflict). Given
the lock (P9) the others differ greatly in size: `list` ≈ read the lock and
print; `remove` ≈ delete the unit dir + drop the entry; `update` ≈ re-fetch +
hash-compare + replace, but with genuine extra design (detecting
locally-modified installs, dirty-overwrite policy, a `--check`/dry mode,
latest-vs-pinned ref). Options: (A) `add` + lock only, others as follow-up specs;
(B) `add` + lock + `list` + `remove`, `update` deferred; (C) all four in one
spec.

Decision: C — this spec covers `add`, `list`, `remove`, and `update` together.

Rationale: Owner wants the complete lifecycle specified as one coherent unit, and
the lock (P9) was designed to support all four, so nothing is painted into a
corner. I recommended A (tightest, lowest-risk junior handoff) and flagged C as
the largest surface, which pulls in `update`'s extra design; the owner accepted
that larger scope deliberately. Consequence: this discussion must still settle
`update`'s semantics (local-modification detection, dirty-overwrite policy,
`--check`/dry mode, latest-vs-pinned ref) and the `list`/`remove` command shapes
before the spec is complete.

## P11: Destination root (local vs global) and missing-root behavior

Point: Which root does `add` install into, and what does it do when that root
doesn't exist yet?

What you need to know: jastr has two roots — a local project `.jastr/` (found by
walking up from cwd) and a global one (`$JASTR_HOME/.jastr`, else `~/.jastr`).
`add` writes into exactly one of them (the lock is per-root, P9); the dual-root
layering is a `run`-time concern, not an install-time one. vercel mirrors this
with `-g/--global` (default = project). The wrinkle is bootstrap:
`run`/`generate`/`validate` require a root and raise `missing_project_root` when
there's none, but `add` is a setup command, so erroring on a fresh project is
hostile; and `--global` almost never pre-exists on first use, so it must create
regardless. The real fork is create-vs-require for the local root.

Decision: A — friendly bootstrap. Default = local: walk up from cwd for an
existing `.jastr/`; if found, install there; if none anywhere up the tree, create
`.jastr/` in cwd and install there. `--global`/`-g` installs into the global root
(`$JASTR_HOME/.jastr` else `~/.jastr`), creating it if absent. Exactly one root
per invocation; `add` never raises `missing_project_root`.

Rationale: `add` establishes a project rather than consuming one, so creating on
first use is the least-friction, on-brand behavior (matches vercel); walk-up-first
means you never accidentally spawn a second root inside an existing project. A
deliberate, well-justified divergence from the other commands' require-a-root
rule. The mild risk — `add` in a stray directory silently creating a `.jastr/` —
is bounded (only when no root exists up the tree) and trivially reverted.

## P12: Conflict with an existing destination — `add` is create-only

Point: `add` wants to write `.jastr/<id>/` (or `.jastr/<group>/`). What happens
when something is already there — and does `add` need a `--force` overwrite at
all, or is that redundant with `update`?

What you need to know: There are two flavors of "already there," distinguished by
the P9 lock: a previously jastr-installed unit (has a lock entry) or an author's
hand-written template (no entry — clobbering it destroys real work). jastr is
non-interactive, so the behavior must be a deterministic default plus, at most, an
explicit override — never a prompt. We also want crash-safety (a half-copied
template must never be left behind). The reconsideration: an `add --force`
(replace + rewrite the lock entry) overlaps with the planned `update`. The real
distinction between them is the source of truth — `add` is argument-driven (you
supply `source`/`ref`/`name`, for acquiring or re-pointing), while `update` is
lock-driven (id-only; reads the recorded source; hash-aware; batchable).
`add --force` overlaps with `update` only in the narrow "re-acquire the same
tracked id from the same source" case.

Decision: `add` is create-only. If the destination id already exists, `add`
errors and writes nothing — there is no `--force` on `add`. The message differs by
flavor: tracked (lock entry present) → "already installed from `<source>`; use
`jastr update <id>` to refresh"; untracked (no entry) → "exists and was not
installed by jastr; delete it yourself to replace it." Crash-safety: stage the
copy in a temp dir, then atomically move it into place; always clean up the clone
temp. Overwrite/refresh is consolidated on `update` (where a `--force` will live,
for discarding local edits / forcing a re-fetch — specified under the `update`
decision). No idempotent no-op (owner declined).

Rationale: Single responsibility — add = create, update = refresh, remove =
delete — eliminates the add/update overwrite overlap and the "which do I use?"
ambiguity, and shrinks the `add` surface (no overwrite branch, no force flag) for
the junior. Author-written templates are safe by default. The cost is that
re-pointing an id to a new source and overwriting an untracked template become two
steps (`remove` + `add`, or a manual delete + `add`); both are rare and the error
message guides the user. Owner confirmed dropping `add --force` and wants no
idempotency.

## P13: Interactivity, trust, and `add`'s output

Point: Does `add` confirm before fetching/writing remote content, and what does
it print?

What you need to know: vercel's `add` is heavily interactive (spinners,
multiselect, `--yes`); jastr's CLI is the opposite — fully non-interactive,
deterministic, scriptable. On trust: a jastr template is inert — plain Markdown
plus deterministic directives that jastr renders; installing one executes nothing
(unlike an agent skill that may carry runnable content). The fetch is a shallow
`git clone`, which does not run repo git hooks, and LFS smudge would be disabled
as vercel does — so the clone is not a meaningful code-execution surface either.
The only side effects are filesystem writes into `.jastr/`, which are create-only
(P12) and possibly creating the root (P11).

Decision: No prompts and no `--yes` — `add` is non-interactive and just performs
the install. On success it prints one deterministic line naming the unit, the
source + ref (provenance), the destination path, and which root, e.g.
`Installed foo from owner/repo (ref main) into .jastr/foo [local].`; a group
reports its template count. Errors use the existing uniform shape
(`Error: <message>`, exit 1). `--dry-run` is deferred.

Rationale: Consistent with jastr's non-interactive, deterministic design; the
trust surface is low (inert templates execute nothing; shallow clone runs no repo
hooks; LFS smudge disabled), so there is nothing to gate behind a confirmation. A
one-line provenance-bearing success message keeps output scriptable and
informative. A meaningful `--dry-run` would require cloning to inspect, so it is
not free — a clean future addition rather than a v1 necessity.

## P14: `jastr list` — folder-first, lock overlay, full inventory

Point: What does `list` show, across which roots, and in what shape — does it
read the lock or the folder?

What you need to know: vercel's `list` reads the folder as the source of truth —
`listInstalledSkills` scans the install directories on disk (returning each
skill's canonical path, scope, and which agent dirs link it) and consults the
lock only as a secondary overlay (for `pluginName` display grouping). It does so
because vercel skills are symlinked into multiple agent dirs and only a disk scan
reflects actual link state (it even prints "not linked"). Key structural
difference: vercel's authored surface (`skills/`) and consumed surface
(`.claude/` etc.) are different folders, so its folder-scan of the consume dir
yields consumed-only; jastr's `.jastr/` is unified (authored and installed
templates live together), so a folder-scan of `.jastr/` yields everything. P8
established that lock-entry presence is the authored-vs-consumed signal.

Decision: `list` is folder-first with a lock overlay, showing the full inventory.
It enumerates the actual template/group units in `.jastr/` (reusing the
standalone/group classification) and joins each against the lock: an entry
present → tracked (show `source@ref`, kind, short commit); no entry →
local/authored (marked `local`). Disk is the source of truth, so a
manually-deleted template never appears as a ghost; a lock entry whose unit dir is
gone is flagged `missing` (drift). Both roots are shown in labeled sections
(Local / Global), each only if it has units; `--local` / `--global` scope to one.
Entries sorted by id. Read-only. `--json` deferred.

Rationale: Folder-first matches vercel's "disk is truth" model and is robust to
drift — vercel's exact reason. Full-inventory (showing local/authored units too,
annotated) is more useful than tracked-only and natural for jastr's unified
`.jastr/`, and it visibly realizes P8's authored-vs-consumed distinction via
lock-entry presence. The implementation increment over lock-only is modest
(reuses the existing classification plus the lock reader). `--json` deferred
because the lock is already JSON on disk; add later if wanted.

## P15: `jastr remove`

Point: What does `remove` delete, with what safety, and across which root?

What you need to know: `remove` is the inverse of `add` — delete a tracked
install and drop its lock entry. The critical safety line is the one P12/P8 drew:
an id in `.jastr/` may be a tracked install (lock entry) or an author-written
template (no entry); `remove` must never delete author work. Installs are
per-root, and an id can exist independently in local and global. jastr is
non-interactive, and a removed tracked install is recoverable (re-`add` from its
recorded source). I had proposed an atomic batch (validate all ids, then act);
the owner rejected it as too much work for little gain.

Decision: `jastr remove <id>...` removes one or more tracked installs from one
root — default local, `-g/--global` for global. A group removes as a whole (the
entire group dir + entry). Per id: tracked + dir present → delete the unit dir +
drop the entry (`Removed foo (was owner/repo@main) [local].`); tracked + dir
already gone (drift) → drop the stale entry (`Cleaned stale entry foo.`);
untracked (dir exists, no entry) → refuse (`Error: foo was not installed by
jastr; delete it manually if you mean to.`); neither → `Error: foo is not
installed [local].` (with a hint if it is tracked in the other root). No atomic
batch: ids are processed in order with no pre-validation pass; the first failure
emits the uniform `Error: <message>` and exits 1, and any ids already removed
stay removed (partial completion accepted). Non-interactive, no prompt. `--all`
deferred.

Rationale: Tracked-only deletion keeps author work sacrosanct; default-local /
`-g` mirrors `add`; no prompt because a removed tracked install is re-addable.
The owner rejected the atomic validate-then-act batch; processing in order and
letting the first failure throw reuses jastr's existing single-error handling
with the least code, at the cost of accepting partial completion on a bad id.

## P16: `jastr update`

Point: How does `update` refresh a tracked install — change detection, local-edit
safety, dry-run, ref semantics, and batch behavior?

What you need to know: `update` is lock-driven (id only; it reads the recorded
`source`/`ref`/`name`/`path`). Three hashes are in play: `stored` (lock hash,
what we installed), `disk` (current on-disk unit), `upstream` (freshly re-fetched
unit). Ref semantics follow P6 — commit SHAs were never pinned, so `update`
re-fetches the current tip of the recorded ref (a branch advances; a tag moves
only if retagged), i.e. "latest from where it came." `--check` mirrors jastr's
existing stale-detection (`generate --check` fails on drift).

Decision:
- `jastr update [<id>...]` — bare = update all tracked in the root; with ids =
  just those. Default local, `-g/--global` for global.
- Per id: re-clone recorded `source@ref`, re-resolve `name`/`path`, compute
  `upstream`:
  - `upstream == stored` → up to date, no-op.
  - `upstream != stored` and `disk == stored` (clean) → replace the unit, bump
    lock `hash`+`commit` → `updated (abc123 → def456)`.
  - `upstream != stored` and `disk != stored` (locally modified) → refuse + skip
    (`local modifications; use --force to discard them`); `--force` overwrites
    anyway.
- `--check`: report per-id status, change nothing; exit 0 if all up to date, exit
  1 if any update is available or any is dirty-blocked (CI drift detection).
- Crash-safe stage-then-swap (like `add`); the lock is rewritten deterministically
  (P9).
- Best-effort across ids: report each, continue past per-id failures/skips, exit 1
  if anything errored, was skipped-dirty, or (in `--check`) is stale.
- `--force` lives on `update` (spelled `--force`), discarding local edits /
  forcing the overwrite.

Rationale: A lock-driven, id-only refresh keeps `update` distinct from `add`
(P12). Hash comparison gives precise no-op detection plus a dirty-edit guard so a
refresh never silently destroys local work; `--force` is the explicit escape.
`--check` mirrors the established `generate --check` stale-detection for CI.
Best-effort (vs `remove`'s first-failure-throw, P15) is a deliberate, justified
divergence: per-id status reporting is intrinsic to `update` and "dirty/skipped"
is a normal outcome, not a usage error, so aborting an `update --all` on the first
network blip or one dirty unit would be worse than reporting and continuing.
Latest-from-ref follows directly from P6's no-commit-SHA decision.

## P17: Error model, new codes, engine boundary, and discovery

Point: What new error codes do the four commands introduce, does any of this
touch the engine, and does install change discovery?

What you need to know: `JastrErrorCode` is a single union in
`packages/engine/src/errors.ts` that already houses CLI-only codes
(`invalid_command`, `missing_project_root`, `template_not_found`,
`output_exists`/`output_stale`/`output_missing`); the CLI throws the engine's
`JastrError` with these shared codes. Extending the union is not an
"engine imports no fs/network" violation — it is just string literals. The clone
uses `node:child_process` (a Node built-in, fine in the CLI bundle); copy and
lock IO use `node:fs`. Recent CLI-only features were "no new code" by reusing
existing codes; this feature genuinely needs new ones.

Decision:
- New `JastrErrorCode`s, added to the engine union (the only engine delta):
  `git_unavailable` (git not on PATH); `clone_failed` (any clone/fetch failure;
  message carries git's stderr — covers network/auth/repo-missing/ref-missing);
  `destination_exists` (`add` conflict, P12; message differs tracked vs
  untracked); `not_installed` (`remove`/`update` target absent in the root);
  `not_jastr_installed` (`remove` target exists but is author-written/untracked →
  refuse); `local_modifications` (`update` target locally edited without
  `--force`); `update_available` (`update --check` drift, exit 1);
  `grouped_template_not_addable` (the P7 two-segment `group/template` rejection).
- Reused codes: `template_not_found` (named ref absent in the source's `.jastr/`,
  message names the source), `invalid_command` (argv-shape errors),
  `invalid_template_reference` (malformed ref).
- Uniform UX unchanged: every failure → `Error: <message>`, exit 1; only
  `--help`/`--version`/`help` and a clean `update --check` exit 0.
- Engine boundary: CLI-only. The engine gains only the new error-code literals —
  no fs/child_process/network imports. AGENTS.md must be updated: this feature,
  unlike the recent ones, does add `JastrErrorCode`s.
- Discovery unchanged: installed templates live at `.jastr/<id>/` (or
  `.jastr/<group>/`) and are found by `run`/`validate`/`generate` normally;
  `.jastr/lock.json` is a root-level file ignored by template discovery exactly
  like `config.yml`.

Rationale: Dedicated codes (including `grouped_template_not_addable`) give
clearer, individually testable errors rather than overloading existing ones, with
reuse where the semantics already match (`template_not_found`,
`invalid_command`). Extending the shared union is the established way CLI codes
are housed and does not breach the engine's no-fs/network rule. Discovery needs
no change because installs land in the normal template locations and the lock is
an ignored root-level file like `config.yml`. Owner accepted the full code set
including the dedicated P7 reject code.

## P18: Local-path sources — provenance and update

Point: P6 allows a local path as a source (skipping the clone). If that local
path is not a git repo, there is no HEAD to record. How do provenance (the lock
`commit`) and `update` behave for local-path installs?

What you need to know: `add <local-path>` copies from a directory on disk without
cloning. A local path may or may not be a git repo. The lock (P9) stores `commit`
(cloned HEAD SHA) and `hash` (content hash); `update` re-fetches from the recorded
source and hash-compares. Options: (a) allow local sources with `commit` optional
in the lock, and `update` re-reads the local path's current contents (hash-compare
still works); (b) make `update` of a local-path install a no-op / "re-add to
refresh."

Decision: (a). Local-path sources are first-class; the lock entry's `commit` is
optional — recorded when the path is a git repo, omitted otherwise. `update`
re-reads the local path's current contents and hash-compares exactly as for remote
sources, so a local source stays refreshable with no special-casing.

Spec note (no decision, owner acknowledged): the four new commands have fixed
flags (`--global`/`-g`, `--ref`, `--path`, `--force`, `--check`), so — unlike
`run`'s per-template flags, which bypass Commander via `parseRunFlags` because
they vary per template — they are ordinary Commander options.

Rationale: Keeping local sources first-class (option a) is the minimal, consistent
behavior — `update` already works off the content hash, so it functions for a
local path with no extra branch; making `commit` optional cleanly handles non-git
local directories without blocking the flow. Option (b) would add a special no-op
path for no real gain.

## P19: `remove` dirty-guard instead of a confirmation prompt

Point: Should destructive commands (`remove`, maybe `update`) gain a confirmation
step? (Reconsidering P13's no-prompt stance for destructive operations.)

What you need to know: Reframed risk — `remove` only deletes tracked installs
(P15), which are re-addable from their recorded source, so the only irrecoverable
loss is local edits to an installed template (which `remove` currently destroys
silently). `update` is already self-gating (dirty-refuse without `--force`;
`--force` is an explicit opt-in, P16), so it needs no confirmation. An interactive
prompt is feasible (TTY detection + a `--yes` bypass + a non-TTY policy) but
breaks jastr's deliberate non-interactive/deterministic/scriptable design (P13),
adds stdin/TTY code, forces every non-TTY `remove` (including all e2e fixtures) to
pass `--yes`, and is awkward to golden-test.

Decision: No interactive confirmation prompt on any command. Instead, `remove`
gains a dirty-guard mirroring `update`'s: a tracked install that is locally
modified (disk hash ≠ lock hash) is refused unless `--force`
(`foo has local modifications; use --force to remove anyway`). Clean tracked
installs delete without friction (recoverable via re-add); untracked installs
still always refuse (P15). `remove` therefore gains a `--force` flag. `update` is
unchanged. No new error code: reuse `local_modifications` (P17) for the `remove`
dirty-refuse, since the semantic is identical.

Rationale: The dirty-guard closes the only irrecoverable loss (local edits) while
preserving jastr's non-interactive, deterministic, scriptable character (P13) and
reusing `update`'s established dirty pattern — at zero stdin/TTY/testing cost. It
deliberately does not guard the recoverable fat-finger (removing a clean tracked
install), which is re-addable and low-stakes. A true confirmation prompt was
considered and rejected as fighting jastr's design for marginal gain over
recoverability plus the dirty-guard. `remove --force` is consistent with
`update --force` and distinct from `add`, which stays create-only with no
`--force` (P12).

## P20: Validate fetched templates before committing (`add` / `update`)

Point: Should `add` and `update` validate a fetched template/group before
committing it, or copy verbatim and let defects surface at run time? (Resolving
the spec's one Unresolved question, `specs/001/spec.md` §8.)

What you need to know: The discussion scoped fetch → resolve → copy → lock
without addressing post-fetch validation; the emitted spec flagged it as the only
Unresolved question. `jastr validate` already runs a static-validation pipeline —
parse frontmatter → validate schema → static render with sampled inputs, which
exercises directives, interpolation, include resolution/containment,
missing-include and cycle detection, and engine input validation. Validating
before committing means a broken template never lands in `.jastr/`. The cost is a
static render per fetched template, which `validate`/`generate` already perform;
it reuses existing engine functions, adds no dependency, and surfaces defects with
the engine's existing template-defect codes (no new error code).

Decision: `add` and `update` validate the fetched unit before committing it.
Validation runs against the staged copy (before the atomic move into place for
`add`; before the replace for `update`). A standalone validates its template; a
group validates every template it contains (atomic — any failure fails the whole
unit). On a defect, the unit is not installed/updated and the command fails with
that defect's existing `JastrErrorCode` (e.g. `invalid_frontmatter`,
`malformed_schema`, `invalid_directive`, `include_not_found`, `include_cycle`) —
no new code. For `update`, a broken upstream fails that id under the best-effort
model (reported, exit 1) and leaves the existing install untouched.

Rationale: Installing a template that will not render is a foot-gun the tool can
cheaply prevent; the validation pipeline already exists and runs on the staged
copy with sampled inputs, so it reuses the engine with no new dependency or error
code. Validating the staged copy (not the live destination) preserves
crash-safety and never commits a broken unit. Atomic-group validation matches
P5's whole-group unit. Owner chose to validate on add/update, resolving spec §8.

## P21: Concurrency/locking — accept single-user (with a code TODO)

Point: The spec carried an undiscussed single-user / no-concurrency assumption
(`specs/001/spec.md` §3.2), flagged by the lossless-mapping review
(`specs/001/reviews/260626185958Z-spec-lossless-mapping-review.md`) as neither
seen-and-accepted nor a granted Degree of freedom. Accept single-user / no
concurrency handling, or add locking?

What you need to know: This feature is the CLI's first filesystem-mutation
surface, so two processes racing on the same root's `lock.json` / unit dir is a
genuinely new consideration the discussion never covered. The design already
bounds the risk: unit writes use atomic stage-then-move and `lock.json` is written
deterministically, so concurrent invocations cannot corrupt a unit or produce a
malformed lock; the only residual race is a lost update on `lock.json` (two
simultaneous writers, one entry clobbered), which is rare and recoverable by
re-running. This matches the posture of `npm`/`git`, which do not deeply guard
concurrent invocations. Option B (a lockfile/flock around `lock.json` mutations)
adds code for a rare case.

Decision: A — accept single-user / no concurrency handling as a non-goal. The
atomic-write design bounds the worst case to a recoverable lost-update on
`lock.json` (no corruption). The implementation must leave a `// TODO:` comment
near the `lock.json` mutation code noting that locking for the rare concurrent
case is a deliberate, deferred future consideration. No locking is built in v1.

Rationale: Realistic usage is single-user / sequential, and the existing atomic
writes already prevent corruption, leaving only a rare recoverable lost-update —
not worth a locking layer now. Matches dev-CLI norms (`npm`/`git`). The `// TODO:`
marker keeps the deferral visible at the exact site a future implementer would add
locking, converting the review's flagged assumption into a seen-and-accepted
non-goal with an in-code breadcrumb. Resolves the lossless-review section-(a)
finding.

## P22: Malformed / unknown-version `lock.json` — error (`invalid_lock`)

Point: How does a command handle reading a `lock.json` that is corrupt,
truncated, hand-edited, carries unresolved git conflict markers, or has an
unknown `version`? (Raised by the handoff-grade-bar review,
`specs/001/reviews/260626205104Z-handoff-grade-bar-review.md`.)

What you need to know: The spec specified deterministic lock writes (P9) but not
reads of a malformed lock. This is reachable: P9's merge rationale (git
auto-merges non-overlapping keys) means overlapping keys — the same id installed
on two branches — leave conflict markers and an unparseable lock; all four
commands read the lock. jastr precedent: an unparseable `config.yml` raises
`invalid_config` (`config.ts`), while a missing config is treated as empty `{}`.
Options: (A) error with a new `invalid_lock` code; (B) treat-as-empty (vercel
wipes its lock on a version mismatch).

Decision: A. A missing or empty lock is treated as no tracked installs; a present
lock that is unparseable or carries an unknown `version` fails the command with a
new `invalid_lock` `JastrErrorCode` and mutates nothing. Mirrors `invalid_config`
and never silently discards recorded provenance.

Rationale: A corrupt lock usually means an unresolved git merge conflict the user
must fix; erroring surfaces it loudly and consistently with jastr's existing
config handling, rather than silently dropping installs (option B), which would
lose the provenance `update`/`remove` depend on. `invalid_lock` is one more
string literal on the engine's `JastrErrorCode` union (the only engine delta, per
P17). Resolves the handoff-grade review's highest-impact finding.

## P23: Local-path source with a dirty git repo — omit `commit`

Point: For a local-path source that is a git repo with uncommitted changes, the
copied bytes are the dirty working tree but `git rev-parse HEAD` is a commit that
does not correspond to them. Record HEAD, or omit `commit`? (Open question from
the handoff-grade-bar review.)

What you need to know: P18 made `commit` optional — recorded when the source is a
git repo, omitted for a non-git local path. A dirty working tree is the
unaddressed middle case. `hash` (the canonical content digest) is authoritative
for `update` change-detection; `commit` is provenance. Options: (a) omit `commit`
when dirty (consistent with a non-git path); (b) record HEAD anyway as
best-effort provenance.

Decision: (a). `commit` is omitted for a non-git local path and for a local git
repo with a dirty working tree; it is recorded only when it actually represents
the copied bytes (a clone, or a clean local git repo). `hash` remains
authoritative for change-detection.

Rationale: `commit` should mean "these exact bytes came from this commit";
recording HEAD for a dirty tree would be misleading provenance. Omitting it when
dirty keeps the field honest and costs nothing, since `hash` already drives
`update`. Resolves the review's open question.

## P24: Unit + lock as a crash-recoverable transaction

Point: The unit directory and `<root>/.jastr/lock.json` are two resources mutated
per command, with no atomicity across the pair. How are atomic lock writes, commit
order, and crash recovery specified? (Adversarial review,
`specs/001/reviews/260627085112Z-adversarial-handoff-review.md`, finding 1.)

What you need to know: Spec v3 pinned the unit's atomic stage-then-move but left
the two-resource commit undefined. Failure narrative: `update foo` replaces the
unit atomically, then crashes before rewriting `lock.json`; the next `update`
sees `disk != stored` and refuses with `local_modifications` though the user
never edited anything — a clean update becomes a false dirty-block.

Decision: Both unit and `lock.json` writes are atomic (same-filesystem temp +
rename). Commands mutate the **unit first, then the lock**. The crash window
between them is self-healing on the next command: `update` treats `disk != stored`
but `disk == upstream` as an interrupted prior update and reconciles the lock
(no `local_modifications` refusal); `remove`'s window is the existing drift case
(tracked + dir gone → drop stale entry, P15); `add`'s window leaves an untracked
unit, recoverable by delete + re-`add` (it is NOT auto-adopted, preserving
create-only semantics, P12). ACs cover post-unit-commit lock-write failure.

Rationale: True two-phase atomicity across a directory and a file is not worth the
complexity; a pinned order plus content-based self-heal makes every crash window
recoverable and kills the false-dirty narrative with no extra protocol. Not
auto-adopting on `add` keeps P12's create-only / no-idempotency stance intact
(the owner declined that nudge).

## P25: Source-unit file types — regular files and directories only

Point: A fetched unit is copied recursively and the hash ignores file mode; what
happens to symlinks, hardlinks, FIFOs, devices, sockets, or other special files
from a hostile source? (Adversarial review, finding 2.)

What you need to know: A malicious repo can ship `TEMPLATE.md` as a symlink to
`/etc/passwd`, or an included file symlinked to `../../.env`. A naive `stat` /
`readFile` / recursive copy may follow the link (local-file disclosure or
boundary escape) or preserve it into the destination; hashing/copying a FIFO can
hang. "Copied recursively" admits both readings.

Decision: A fetched unit may contain only regular files and directories. Every
entry is examined with `lstat` (never followed); a symlink, FIFO, device, socket,
or any other non-regular entry anywhere in the unit is rejected with a new
`unsupported_source_entry` `JastrErrorCode` before any validation, copy, or hash.
This is the only new error code the adversarial revision adds.

Rationale: The simplest safe contract — reject, don't follow or preserve — closes
file-disclosure, boundary-escape, and hang-on-special-file vectors at once, and
matches jastr's low-trust posture for remote content (P13). Supporting symlinks
would require realpath-containment on every target and richer hashing for no real
template use case.

## P26: Non-interactive git controls — prompts off, bounded timeout, LFS off

Point: "The fetch must not hang" (P2/P13) is an asserted outcome; what controls
guarantee it? (Adversarial review, finding 3.)

What you need to know: Spec v3 said the clone is non-interactive but pinned no
environment, timeout, child-kill policy, or LFS stance, and even made LFS
disabling a Degree of freedom. Failure modes: a CI job clones `git@…` with no SSH
key and the process waits on an SSH/credential prompt; a malicious remote stalls
during pack negotiation with no timeout; git-lfs installed + smudge enabled turns
a plain-text template path into an unexpected download. The vercel reference
(cited in P2) already uses `GIT_TERMINAL_PROMPT=0`, disabled LFS smudge, a
timeout, and guarded cleanup.

Decision: Pin the guarantees: the clone runs with all terminal / credential-helper
/ SSH prompting suppressed and LFS smudge disabled, under a bounded timeout that
on expiry kills the git child process and surfaces `clone_failed` with a
deterministic message — it can never hang. The exact prompt-suppression mechanism
(env vars / askpass) and the timeout default/override remain Degrees of freedom.
LFS-smudge-disabled moves from a DoF to pinned.

Rationale: An outcome the spec promises ("must not hang") must have its enabling
controls pinned, or a literal implementation reintroduces the hang. The specific
env-var spelling is platform-dependent and stays open, but the behaviors
(no prompt, bounded, killed, deterministic failure) are required. Consistent with
P2's referenced mechanism.

## P27: `--path` containment and local-source provenance anchoring

Point: `--path` defines the source base but is unbounded, and a relative local
`source` is re-read by `update` from an unspecified base. How are traversal and
cwd-dependent updates prevented? (Adversarial review, finding 4.)

What you need to know: The safety story (P7) is "no direct / arbitrary-folder
access; sources only from the source's `.jastr/`." But `<sourceRoot>/<--path>`
with `--path ../../..` escapes the source root, violating that rule; P7's "no
conditions on `--path`" meant "no marker requirement," not "may leave the repo."
Separately, P9 stores a local `source` "as typed"; a relative local source
re-read by `update` from a different cwd points elsewhere.

Decision: `--path` must be a relative subpath whose resolved realpath stays within
`<sourceRoot>`; an absolute path or a `..`-escape is rejected as `invalid_command`
(reused, no new code). For a local-path source, the lock's `url` stores the source
root's resolved **absolute realpath** (not the as-typed string), so `update`
re-reads the same directory regardless of cwd; `source` keeps the as-typed string
for display.

Rationale: Containment makes `--path` honor P7's own no-arbitrary-access guarantee
(a refinement, not a reversal). Anchoring the local `url` to an absolute realpath
makes `update` deterministic across working directories, using the existing `url`
field rather than a new one.

## P28: Strict lock-entry validation and git option-injection guard

Point: A committed `lock.json` is a collaborative, partly-trusted input, and
`update` is lock-driven; `invalid_lock` (P22) covers only parse + version, not
tampered fields. (Adversarial review, finding 5.)

What you need to know: A bad PR can edit `.jastr/lock.json` for an id — changing
`source`/`url` to an attacker repo, `path` to a traversal string, or `kind` to an
unexpected shape — and a teammate's `update` acts on it because the JSON parses
and `version` is 1. The fields directly drive clone and source resolution.

Decision: Before acting on a selected entry, `update`/`remove` strictly validate
it — required fields present and correctly typed, `kind` ∈ {`standalone`,`group`},
`path` a safe relative subpath, `url` present, and no unknown extra fields — and
fail with `invalid_lock` before any mutation. Additionally, every git invocation
places `--` before positional arguments (URL, ref, path) so a tampered or hostile
value cannot be interpreted as a git option.

Rationale: Extending `invalid_lock` to per-entry schema strictness (reusing the
code, matching jastr's config-strictness precedent of rejecting unknown fields)
prevents a tampered-but-parseable lock from silently steering a fetch; the `--`
guard is standard argument-injection defense. No new error code.
