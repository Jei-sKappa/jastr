---
version: 1
status:
  accepted: 260627091320Z
  rationale: seed/discussions/260626124608Z-remote-template-install-decision-log.md
---

# Review — adversarial pre-mortem: remote-template-install handoff review

## References

- Review under adversarial review: `specs/001/reviews/260626205104Z-handoff-grade-bar-review.md`
- Current spec state after that review was accepted: `specs/001/spec.md` (version 3)
- Genesis decision log: `seed/discussions/260626124608Z-remote-template-install-decision-log.md`
- Prior lossless-mapping review: `specs/001/reviews/260626185958Z-spec-lossless-mapping-review.md`

## Steelmanned thesis

The handoff-grade review did its stated job: it checked whether the spec was
coherent enough for implementation, caught concrete ambiguity in the lock and
atomic-move contracts, and recommended a separate adversarial pass because the
feature adds the CLI's first network / subprocess / filesystem-mutation surface.
The accepted follow-up decisions (P22/P23 plus the spec v3 edits) resolve the
review's named findings.

This pass pressures a different claim: whether the handoff review's output is
sufficient to let implementation begin without a separate security/crash-safety
tightening pass. On that axis, it is not sufficient. The review correctly names
the hostile surface in its final bullet, but it leaves several implementation-
shaping risks as a future recommendation rather than escalating them into spec
findings.

## Verdict

**Not ready for implementation on the adversarial axis.** The handoff review is
valid but under-scoped for this feature's failure modes. It should be treated as
one completed review pass, not as the final gate before planning. The current
spec needs one focused hardening revision before a junior implementer starts:
pin unit+lock crash semantics, source-tree file-type handling, git subprocess
non-interactivity, path anchoring, and strict lock-entry validation.

## Adversary profiles

- **Hostile template publisher:** controls a git repo the user runs `jastr add`
  against; wants to plant surprising filesystem state, exhaust resources, or
  make future `run` / `generate` fail after install appears successful.
- **Bad lock contributor:** cannot run code on a teammate's machine directly, but
  can submit a PR that edits committed `.jastr/lock.json`; wants `jastr update`
  to fetch from an attacker-controlled source or misclassify local edits.
- **Unlucky CI / OS environment:** has credential helpers, SSH prompts,
  cross-device temp dirs, no network timeout, or LFS installed; turns an
  apparently deterministic command into a hang or nondeterministic failure.
- **Careless implementer:** follows the prose literally, uses the simplest
  recursive copy / `execFile("git", args)` / `writeFile(lock.json)` path, and
  only tests happy-path e2e cases.

## Findings

### `issue` — Crash safety: unit replacement and lock mutation are not specified as one recoverable transaction

The handoff review caught the cross-filesystem `rename()` problem for the unit
directory, and spec v3 now requires destination staging on the destination
filesystem. That still does not define the crash/failure semantics of the
**two-resource commit**: the unit directory and `<root>/.jastr/lock.json`.

`add` moves the staged unit into place, then writes the lock entry. `update`
replaces the unit, then bumps the lock hash/commit. `remove` deletes the unit,
then drops the lock entry. The spec requires deterministic lock serialization
but does not explicitly require atomic lock-file writes, does not define write
ordering as a contract, and does not say what state is acceptable if the process
crashes or the disk fills between the unit rename and the lock update.

**Failure narrative:** it is three months from now. `jastr update foo` fetches a
new upstream, validates it, atomically replaces `.jastr/foo/`, then crashes while
rewriting `lock.json`. The on-disk unit now has the upstream hash but the lock
still has the old hash. The next `jastr update foo` sees `disk != stored` and
refuses with `local_modifications`, even though the user never edited the
template. A clean update has become a dirty-blocked install. The root cause is
that the handoff review treated "atomic move into place" as sufficient
crash-safety, but the lifecycle state spans both the unit and the lock.

**Required hardening:** specify atomic lock writes (same-filesystem temp +
rename), the commit order for `add`/`update`/`remove`, and the intended recovery
state for a crash between unit and lock mutation. Add AC coverage for lock-write
failure after a successful unit move/replacement.

### `issue` — Source-tree symlinks and special files are undefined, so hostile repos can escape the intended copy/hash model

The handoff review's final recommendation names "symlink/path-traversal in copied
trees" as a reason for a later adversarial pass, but this is already a
handoff-relevant ambiguity. The spec says units are copied recursively and that
the lock hash ignores file mode / permissions / symlink-ness. It never defines
whether symlinks, hardlinks, FIFOs, devices, sockets, or other non-regular files
are rejected, preserved, dereferenced, or normalized during classification,
validation, copy, and hashing.

**Attack narrative:** a malicious repo ships `.jastr/foo/TEMPLATE.md` as a symlink
to `/etc/passwd`, or ships an included file symlinked to `../../.env`. A naive
implementation using `stat`, `readFile`, or a recursive copy helper may follow
the link during validation/hash/copy; another implementation may preserve the
symlink into the destination. Both are plausible readings of "copied
recursively." The result is either local file disclosure into a copied unit, a
template whose real path sits outside the expected boundary, or future
include-containment failures after an install that appeared valid. Special files
add a denial-of-service variant: hashing or copying a FIFO can hang.

**Required hardening:** define the allowed source-unit file types. The simplest
safe contract is regular files and directories only, with symlinks and other
special entries rejected before validation/copy/hash under a named error. If
symlinks are intentionally supported, pin whether they are preserved or
dereferenced, require realpath containment checks for every resolved target, and
make the hash serialization include enough information to avoid false equality.

### `issue` — The "must not hang" git guarantee is aspirational without pinned subprocess controls

The spec requires clone/fetch to be non-interactive and not hang waiting for
credentials, but grants too much freedom around the mechanism. The decision log
mentions the vercel reference using `GIT_TERMINAL_PROMPT=0`, disabled LFS smudge,
timeouts, and guarded cleanup. Spec v3 says clone is non-interactive, but does
not pin the environment variables, timeout behavior, child-process kill policy,
or LFS stance; it even makes LFS disabling a Degree of freedom.

**Failure narrative:** it is a week after implementation. A CI job runs
`jastr add git@github.com:private/repo.git foo` with no SSH key, or a malicious
remote accepts a connection and stalls during pack negotiation. The raw
`execFile("git", ...)` call has no timeout and the environment still allows a
credential helper or SSH prompt. The process hangs until CI times out at the job
level. Another machine has git-lfs installed and smudge enabled, so a plain-text
template path stored as an LFS object triggers an unexpected network/download
path. The root cause is that the spec states the outcome but leaves the controls
needed to guarantee it to implementation taste.

**Required hardening:** pin a non-interactive git environment (`GIT_TERMINAL_PROMPT=0`
and the platform-appropriate askpass / credential-helper suppression), an
operation timeout, cleanup-on-timeout behavior, and LFS smudge policy. Treat
timeout as `clone_failed` with a deterministic message.

### `issue` — `--path` and local-source provenance are not anchored, creating traversal and cwd-dependent updates

The feature's safety story says `add` sources only from the source repo's
`.jastr/` by named ref, with no direct/arbitrary-folder access. The spec then
defines base directory as `<sourceRoot>/<--path>` but does not require `--path`
to be relative, normalized, free of `..`, or realpath-contained by `sourceRoot`.
For local-path installs, the lock stores the `source` string "as typed" and
`update` re-reads the recorded path, but the spec does not define what a relative
local source is relative to during future updates.

**Attack narrative:** a user follows hostile setup docs that include
`--path ../../..`, or a local install records `source: ../shared-templates` from a
subdirectory. A permissive implementation resolves outside the cloned/local
source root, violating the no-direct-source rule. Later, the same project runs
`jastr update` from a different cwd and the relative local source points
somewhere else, producing `clone_failed`, `template_not_found`, or a refresh from
the wrong local directory. The root cause is that path anchoring is treated as an
obvious implementation detail even though it defines the source boundary.

**Required hardening:** require `--path` to be a relative subpath whose final
realpath remains inside `sourceRoot`; reject absolute paths and traversal escapes.
For local sources, define the stored provenance path and update base explicitly
(for example, store an absolute realpath, or store a project-root-relative path
with a pinned base). Add ACs for `--path ..`, absolute `--path`, and updating a
relative local-source install from a different cwd.

### `issue` — Lock read handling covers parse/version only, not strict schema or tampered fields

The handoff review correctly forced a behavior for unparseable and unknown-version
locks. That still leaves a committed lock as a mostly trusted command source.
Spec v3 says `invalid_lock` covers a present lock that is unparseable or has an
unknown `version`; it does not say malformed entry fields, wrong types, unknown
`kind`, invalid `hash`, invalid `name`/`path`, missing `url`, or mismatched
`source`/`url` are invalid. `update` is lock-driven, so these fields directly
drive future clone and source-resolution behavior.

**Attack narrative:** a bad PR edits `.jastr/lock.json` for `foo`, changing
`source`/`url` to an attacker repo, `path` to a traversal string, or `kind` to a
shape the implementation did not expect. A teammate runs `jastr update` and the
CLI acts on the tampered provenance because the JSON parses and `version` is 1.
The root cause is treating the lock as machine-managed while also committing it
to a collaborative repo, without a strict read schema.

**Required hardening:** define strict lock-entry validation and fail with
`invalid_lock` before any mutation when a selected entry is malformed. Pin whether
unknown extra fields are ignored or rejected. When invoking git, terminate option
parsing before the repo argument so a malformed/tampered source cannot be
interpreted as a git option.

## Early warning signs

| Signal | Predicts |
|---|---|
| Implementation uses `writeFile(lock.json, ...)` directly | Truncated/corrupt lock after crash or disk-full |
| Tests assert only copy-failure before unit rename | Missing coverage for post-rename lock failure |
| Recursive copy helper is used without an explicit `lstat` policy | Symlink/special-file ambiguity |
| Git subprocess has no timeout/env tests | CI hang on auth/network failure |
| `--path` tests cover only normal subdirs | Source-boundary traversal remains untested |
| Lock parser checks only JSON parse + `version` | Tampered but valid JSON drives update behavior |

## Synthesis / recommended revision

The strengthened position is: keep the handoff review accepted for the standard
handoff-grade axis, but do not treat it as implementation clearance. Add a short
adversarial hardening revision to the spec before planning. The revision should
not expand product scope; it should tighten boundary contracts that an
implementer must otherwise guess:

1. Unit+lock crash/recovery semantics.
2. Allowed file types and symlink handling for source units.
3. Git subprocess non-interactivity, timeout, cleanup, and LFS policy.
4. `--path` containment and local-source provenance anchoring.
5. Strict `lock.json` entry validation on read.

After those edits, rerun a narrow adversarial check against the revised spec.
