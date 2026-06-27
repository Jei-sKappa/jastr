---
version: 1
status:
  accepted: 260627084429Z
  rationale: seed/discussions/260626124608Z-remote-template-install-decision-log.md
---

# Review — handoff-grade bar: remote-template-install spec (`specs/001/spec.md`)

## References

- Spec under review: `specs/001/spec.md`
- Genesis decision log (P1–P20; findings hinge on **P9** lock determinism/merge, **P12/P16** crash-safe stage-then-move, **P20** validation gate): `seed/discussions/260626124608Z-remote-template-install-decision-log.md`
- Thread seed (upstream input): `seed/260626094825Z-remote-template-install-seed.md`
- Lifecycle ledger (tier-2 classification): `ledger.md`
- Prior review on this spec (lossless-mapping axis, disposed `accepted`): `specs/001/reviews/260626185958Z-spec-lossless-mapping-review.md`

Decision-log consistency check: **clean.** All twenty logged decisions are
carried into the spec without contradiction or silent reversal (cross-checked
per-P in the prior lossless-mapping review and re-confirmed here). No
decision-log finding.

## Verdict

**Partially ready — leaning ready.** All eight semantic-contract elements are
present and the core happy-path, scope/non-scope, decision inlining, and
acceptance criteria are genuinely handoff-grade. What holds it back from a clean
`ready` is a cluster of **three `issue`-level robustness gaps around the lock
file and the atomic-move guarantee** — each a sub-aspect a downstream implementer
would have to guess about, and the lock is the substrate for three of the four
commands. Highest-impact: the spec is silent on how a **malformed/unparseable
`lock.json`** is handled, even though its own P9 merge rationale makes that a
reachable state. None of the three is a blocker; all are addressable in-place
refinements rather than a rework.

## Findings

### `issue` — Expected behavior + Constraints: atomic move is undermined by the OS-temp-dir staging option (cross-element)

The crash-safety contract (§5.1 "Crash safety", AC-ADD.15, AC-UPDATE.8) rests on
an **atomic move into place**, and §7 Degrees of freedom permits destination
staging "within the OS temp dir or within the destination root, so long as the
move into place is atomic on the same filesystem." Those two clauses collide: a
`rename()` from the OS temp dir (commonly a separate filesystem — `tmpfs`, a
different mount) into `<root>/.jastr/` fails with `EXDEV` and is **not** atomic.
The DoF lumps clone-staging (copied out — OS temp is fine) with destination
stage-then-move (renamed in — OS temp breaks atomicity), offering OS temp dir as
a free choice for both. **Downstream impact:** a junior who reads "destination
staging may live in the OS temp dir" and writes `rename(/tmp/staged, …/.jastr/foo)`
gets `EXDEV` on Linux and either crashes or silently falls back to a non-atomic
copy — defeating the very crash-safety AC-ADD.15/AC-UPDATE.8 promise. The spec
should state that destination staging must share the destination filesystem
(e.g. stage under `<root>/.jastr/` itself), and reserve OS-temp use for the clone.

### `issue` — Expected behavior + Constraints: lock `hash` serialization is underspecified for cross-machine reproducibility

§5.1 pins `hash` as "sha256 over the installed unit's files, sorted by relative
path, with each path included in the digest," and AC-LOCK.3 asserts "identical
content yields an identical hash." But the local `lock.json` is **committed and
team-shared** (P9: "committed with the project," "git auto-merges non-overlapping
keys"), so the hash must reproduce **across machines** — and the spec leaves the
exact byte layout to the implementer: path-separator normalization (POSIX `/` vs
Windows `\`), path encoding, the delimiter between path bytes and content bytes,
and whether file mode/symlinks participate. Two reasonable implementations, or
the same implementation on two OSes, can produce different digests for identical
content. **Downstream impact:** a teammate on a different OS runs `update` and
sees false drift (`update_available`) or a spurious dirty-guard refusal in
`remove`/`update`, even though nothing changed — directly violating AC-LOCK.3's
"identical content → identical hash" for the cross-machine case the committed
lock is designed for. Pin the canonical serialization (at minimum: POSIX-normalized
relative paths, UTF-8, explicit path/content framing).

### `issue` — Expected behavior + Error model: no defined behavior for a malformed / unreadable / unknown-version `lock.json`

The spec specifies deterministic lock *writes* (§5.1, AC-LOCK.2) but is silent on
*reading* a lock that is corrupt, truncated, hand-edited, or carries an
unexpected `version`. This is not a hypothetical: P9's own merge rationale notes
git auto-merges **non-overlapping** keys — which means **overlapping** keys
(two installs of the same id from different branches) leave conflict markers and
an **unparseable** `lock.json`. All four commands read the lock; `list`/`remove`/
`update` would all hit this. The §5.6 error table has **no** code for it (no
`invalid_lock` analogue to the engine's `invalid_config`). **Downstream impact:**
the implementer must invent the behavior — error vs treat-as-empty — and, if
error, invent an uncovered error code or overload an existing one, producing a
surface no AC checks and no two implementers would resolve identically. Name the
behavior and, if it errors, the code.

### `nit` — Context: `§2` undercounts the decision log as "P1–P19"

§2 describes the genesis decision log as "(the decision log cited above, P1–P19)"
but the log runs through **P20** (added to resolve the spec's former §8), and the
spec body cites P20 throughout (§5.1, §5.2 step 7, AC-ADD.17, AC-UPDATE.9, §8).
**Downstream impact:** low — a reader cross-referencing the Context's stated range
against the log finds a P20 the Context implies does not exist. Correct to
"P1–P20." (Also caught by the prior lossless-mapping review as an editorial nit.)

### `nit` — Expected behavior: bare `update` with nothing tracked has no specified output/exit

§5.5 says "Bare `update` targets all tracked ids in the root," and AC-UPDATE.1
covers the populated case, but neither states what bare `update` prints or returns
when the root has **zero** tracked ids. `list` defines an explicit empty path
("No templates installed.", §5.3/AC-LIST.4); `update` has no parallel.
**Downstream impact:** low — the implementer guesses the empty-inventory message
and exit (presumably a no-op success), an asymmetry with `list` that a tidy
implementation would otherwise mirror.

## Evidence

- Atomic-move tension: §5.1 "Crash safety" ("atomically moved into place") vs §7
  Degrees of freedom, "Temp-dir location and naming … within the OS temp dir or
  within the destination root, so long as the move into place is atomic on the
  same filesystem"; guarantee asserted in AC-ADD.15 and AC-UPDATE.8.
- Hash reproducibility: §5.1 "The lock", `hash` bullet; AC-LOCK.3; cross-machine
  intent in P9 (committed lock, git auto-merge) of the decision log.
- Malformed lock: §5.1 "The lock" and §5.6 error table (no malformed-lock code);
  reachable-state rationale in P9 ("git auto-merges non-overlapping keys").
- §2 undercount: §2 "Context", "(the decision log cited above, P1–P19)" vs P20 in
  the decision log and §8 "Unresolved questions" ("None … per P20").
- Bare-update empty case: §5.5 first paragraph vs §5.3 / AC-LIST.4 empty path.

## Open Questions

- **Local-path source that is a dirty git repo:** §5.2 step 8 records `commit` =
  `git rev-parse HEAD` while §5.1's `hash` digests the actual (possibly dirty)
  working-tree content. The two then describe different states. The spec treats
  `hash` as authoritative for `update` change-detection and `commit` as
  provenance, so this is likely benign — but is a recorded `commit` that does not
  correspond to the copied bytes acceptable, or should a dirty local repo omit
  `commit` (as a non-git path does)? Author to confirm.

## Next Actions

- **Revise the spec in place to address the three `issue` findings** (one cluster):
  (1) constrain destination staging to the destination filesystem; (2) pin the
  canonical `hash` serialization; (3) define malformed/unknown-version `lock.json`
  behavior and its error code. These are the items standing between the current
  spec and a clean `ready`.
- **Fix the two `nit`s** opportunistically in the same revision (§2 "P1–P20"; bare
  `update` empty-inventory output).
- **Settle the Open Question** with the author (dirty local-repo `commit`), then
  fold the answer into §5.1/§5.2.
- **Recommend a separate adversarial review pass before implementation.** This
  spec introduces the CLI's first network / subprocess / filesystem-mutation
  surface (§2) — a genuine risk surface (clone failure modes, partial-write
  recovery, symlink/path-traversal in copied trees, untrusted remote content)
  that the handoff-grade-bar check does not pressure. Worth a pre-mortem given the
  stakes.
