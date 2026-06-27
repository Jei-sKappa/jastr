---
version: 1
status:
  accepted: 260626204742Z
  rationale: seed/discussions/260626124608Z-remote-template-install-decision-log.md
---

# Review — lossless mapping: remote-template-install spec (`specs/001/spec.md`)

## References

- Document under review: `specs/001/spec.md`
- Genesis decision log (P1–P20, the decisions the spec maps from): `seed/discussions/260626124608Z-remote-template-install-decision-log.md`
- Thread seed (upstream input the discussion expanded): `seed/260626094825Z-remote-template-install-seed.md`
- Lifecycle ledger (tier-2 classification): `ledger.md`

Confirmed source set: the spec's own header (lines 8–10) names the genesis
decision log as the single citation source for every `P<N>` reference, and the
thread has exactly one spec lineage (`specs/001/`) and one discussion record. No
ambiguity required asking the user.

## Verdict

**Faithful on every logged decision — effectively a pass, with one low-impact
item to dispose.** Section (b) is empty: all twenty decisions in the decision log
(P1–P20) are carried into the spec, in both the prose (`§3`–`§5`) and the
acceptance criteria (`§6`). Section (a) has **one** mild item — the
single-user/no-concurrency premise in `§3.2` is an assumption not established in
the discussions and not placed in `## Degrees of freedom`. The author surfaced it
transparently ("stated, not silently baked in") rather than smuggling it, so the
fix is cheap: confirm it with the user or relocate it to `§7`. Nothing in the
spec commits the implementer to an undiscussed design choice.

## Findings

### (a) Smuggled-in — decisions/assumptions the user never accepted

- **The single-user / no-concurrency assumption (`§3.2`, lines 94–96).** The spec
  states: "concurrency/locking between two simultaneously-running jastr processes
  mutating the same root is not addressed; a single-user CLI is assumed." This
  feature introduces the CLI's *first* filesystem-mutation surface (the spec says
  so itself at `§2` lines 43–46), so two processes racing on the same
  `lock.json`/unit dir is a genuinely new consideration this work raises — not
  inherited background. **The decision log is silent on it**: no point in P1–P20
  discusses concurrency, locking, or a single-user assumption. It is **not** in
  the `## Degrees of freedom` section (`§7`), which is the spec's designated
  pressure valve. To the author's credit it is explicitly flagged "(stated, not
  silently baked in)," so this is a transparently-surfaced premise rather than a
  buried commitment — but by the strict rule (seen-and-accepted *or* marked DoF)
  it is neither. **Disposition is cheap and non-blocking:** either confirm with
  the user that "single-user, no concurrency handling" is accepted, or move the
  sentence into `§7 Degrees of freedom` as a stated non-goal the implementer
  inherits. Low impact — it scopes a concern *out* (commits the implementer to
  nothing harmful), so it does not threaten the spec's correctness.

### (b) Dropped — decisions the user made that the document failed to capture

None — every decision in the genesis decision log is carried into the spec.
Spot-verified each P against where it lands:

- P1 (command family) → `§1`, `§3.1`; P2 (clone fetch, raw `child_process`, zero
  deps, single attempt, `git` hard requirement) → `§3.1`, `§4`, AC-ERR.4; P3
  (`jastr add` name) → throughout; P4 (`config.yml` never imported) → `§3.2`,
  `§5.2` step 7, AC-ADD.14; P5 (standalone | whole-group atomic unit) → `§5.1`,
  AC-ADD.1/2/17; P6 (source arg, `owner/repo` shorthand, `--ref` branch/tag only,
  commit-SHA = error) → `§5.2` step 2, AC-ADD.5/6/8, `§3.2` deferrals; P7
  (`.jastr/` named refs only, two-segment reject, `--path` cd) → `§5.1`, `§5.2`
  steps 3–4, AC-ADD.3/4/9; P8 (publish/consume conflation accepted, mechanism
  deferred) → `§3.2`; P9 (per-root JSON lock, fields, timestamp-free,
  deterministic) → `§5.1`, FR-LOCK AC-LOCK.1–4; P10 (all four in one spec) →
  `§2`; P11 (friendly bootstrap, never `missing_project_root`) → `§5.2` step 1,
  AC-ADD.10/11; P12 (`add` create-only, no `--force`, crash-safe stage-then-move)
  → `§5.1`, `§5.2` step 6, AC-ADD.12/15; P13 (non-interactive, one provenance
  line, `--dry-run` deferred) → `§5.2` step 9, AC-ADD.16, AC-ERR.6; P14 (`list`
  folder-first lock overlay) → `§5.3`, FR-LIST AC-LIST.1–4; P15 (`remove`
  tracked-only, first-failure-throw, partial completion) → `§5.4`, FR-REMOVE
  AC-REMOVE.1–7; P16 (`update` lock-driven, three hashes, `--check`, best-effort)
  → `§5.5`, FR-UPDATE AC-UPDATE.1–9; P17 (new `JastrErrorCode`s, CLI-only engine
  boundary, discovery unchanged) → `§4`, `§5.6`, FR-ERR AC-ERR.1–5; P18
  (local-path sources first-class, `commit` optional, fixed Commander flags) →
  `§3.1`, `§5.1`, `§5.2` step 8, `§5.5`, AC-ADD.13, AC-UPDATE.5; P19 (`remove`
  dirty-guard + `--force`, reuse `local_modifications`) → `§5.4`, AC-REMOVE.2,
  `§5.6`; P20 (validate fetched unit before commit) → `§5.1` validation gate,
  `§5.2` step 7, `§5.5`, AC-ADD.17, AC-UPDATE.9, and the `§8` "None" resolution.

The two items the discussion left genuinely unsettled (`update --check` + `--force`
interaction; `update` of a drifted/missing unit dir) are correctly placed in
`§7 Degrees of freedom` with explicit "Not settled in discussion" notes (lines
542–546) rather than silently decided — the pressure valve used exactly as
intended. The lock's top-level container key (`templates`) is likewise pinned
only as DoF (`§5.1` lines 184–186, `§7` line 547), matching P9's silence on
nesting.

## Open Questions

- **The deferred `jastr install` (restore-everything-from-lock) command —
  traceability of its citation.** `§3.2` (line 90) defers this and attributes it
  to "(discussion close-out)" rather than a `P<N>`. No point in the provided
  decision log (P1–P20) raises or defers a restore/`install` command, so this
  deferral is not verifiable against the in-scope discussions. Deferring an
  undiscussed feature commits the implementer to nothing (it scopes *out*), so it
  is not a smuggled commitment — but the citation points at an exchange not in the
  record. Was there an unlogged close-out where the user agreed to defer it, or
  was it added editorially? If the former, it is fine as-is (optionally captured
  as a P); if the latter, drop the parenthetical or re-attribute it.

## Next Actions

- **The spec is faithful on the lossless-mapping axis and is essentially ready to
  carry the user's decisions forward.** On the strict reading it is one mild
  section-(a) item short of a clean pass; that item is non-blocking and cheaply
  disposed.
- **Dispose the one section-(a) finding** in the follow-on discussion: confirm the
  single-user/no-concurrency assumption with the user, then either leave it as an
  accepted non-goal (now seen-and-accepted) or move it into `§7 Degrees of
  freedom`. Re-running this review is optional given the item's low impact.
- **Settle the Open Question** by checking whether the `jastr install` restore
  deferral traces to a real close-out exchange.
- **Non-blocking editorial nit (outside the lossless-mapping core):** `§2` (line
  36) describes the decision log as "P1–P19," but it runs through **P20** (added
  to resolve the spec's former `§8`), and the spec cites P20 throughout. Correct
  the prose to "P1–P20" so the Context accurately states the extent of the
  discussion it maps from. Not a finding — a factual typo in the document's
  self-description.
