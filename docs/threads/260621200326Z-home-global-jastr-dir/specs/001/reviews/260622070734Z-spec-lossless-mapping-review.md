---
status:
  disposed: 260622071050Z
  disposition: accepted
---

# Review — lossless mapping: home-global `.jastr` spec

## References

- Document under review (spec): `specs/001/spec.md`
- Genesis decision log (the spec's declared sole source): `seed/discussions/260621201338Z-home-global-jastr-coexistence-decision-log.md` — settles P1 (coexistence model), P2 (discovery mechanics incl. Fork A relaxation + Fork B `JASTR_HOME`), P3 (config/variant composition), P4 (path display / errors / substitute token).
- Upstream seed: `seed/260621200326Z-home-global-jastr-dir-seed.md` — establishes the ask (a home/global `.jastr` usable from any project) and the open question the thread resolved.
- Lifecycle ledger (tier): `ledger.md` — tier 2.

Source-set note: the thread holds exactly one discussion record (the decision log above); the spec self-declares it as its source ("forward-designed from the genesis decision log … hereafter 'the decision log'"). The set is unambiguous, so it was not separately re-confirmed.

## Verdict

**Lossless — the review passes.** Both Findings sections below are empty: every decision and assumption in the spec traces to a settled decision-log point (P1–P4 including both forks), the seed's stated intent, the existing CLI contract (transparently labeled as such), or is explicitly parked under `## Degrees of freedom`; and every decision the user made in the decision log is carried into the spec. One non-finding provenance question is raised under Open Questions for the follow-on discussion.

## Findings

### (a) Smuggled-in — decisions/assumptions the user never accepted

None — every committed choice and presupposition in the spec was checked against the decision log and the seed, and each resolves to one of: a settled P1–P4 decision (cited inline in the spec by `(decision log P<N>)`), the seed's intent, the pre-existing contract (and the spec labels those "existing contract" / "unchanged" / "elaboration of P1 over the existing grouped-template contract"), or an item the spec openly hands to the implementer in `## Degrees of freedom` (DoF-1 malformed `JASTR_HOME`, DoF-2 message wording, DoF-3 substitute-token identity, DoF-4 internal code structure, DoF-5 extra informational output). Spot-checks that could have been over-reaches but are not:
- The global grouped layout `<global>/.jastr/<group>/templates/<template-id>/TEMPLATE.md` + `.jastrgroup` marker (spec "Resolving a template reference") is the existing local grouped contract applied to the new root, and is transparently flagged as an elaboration of P1, whose point 2 already scopes "template-id/**group** collision."
- AC-1.2's "absolute, existing directory" qualifier does not pin down the un-settled cases — empty / whitespace / relative `JASTR_HOME` are explicitly left open in DoF-1, matching the decision log, which only fixed unset→`os.homedir()/.jastr` and set→`$JASTR_HOME/.jastr`.
- The `validate`/`generate --check` coverage (FR-10) is presented as derived from "seed scope; shared resolution path," not as a P-decision, and follows the seed's "available from any project" intent plus the project's shared-resolution contract.

### (b) Dropped — decisions the user made that the document failed to capture

None — each decision-log decision maps to spec content:
- **P1** (layered/compose model; union namespace, both roots always active; local shadows global on id/group collision; roots self-contained, no cross-boundary include) → Intended outcome, Scope, FR-2 (AC-2.1–2.4), FR-7 (AC-7.1–7.2), Non-scope cross-root-include bullet.
- **P2** core + forks (global = `os.homedir()/.jastr`, absolute & never-walked; local = upward walk unchanged; same-realpath collapse applied once with no self-shadow/self-merge; Fork A — `missing_project_root` fires only when neither root exists, global-only is valid; Fork B — `JASTR_HOME` override defaulting to `os.homedir()`) → Terms, "Locating the roots," FR-1 (AC-1.1–1.3), FR-3 (AC-3.1–3.2), FR-4 (AC-4.1), Constraints "Global location is absolute, never walked."
- **P3** (Option A two-layer per-key overlay; both `config.yml` always consulted regardless of where the body resolved; inputs precedence CLI > local > global > template defaults; variants shadow as a whole unit with no `locked-inputs` cross-merge; `unknown_input` edge accepted) → FR-5 (AC-5.1–5.4), FR-6 (AC-6.1–6.2).
- **P4** (global path shown as real absolute/realpath path; local stays cwd-relative; `template_not_found` names both roots; one new e2e substitute token mirroring `projectRoot`) → FR-8 (AC-8.1–8.2), FR-9 (AC-9.1), FR-11 (AC-11.1).
- **Seed** decisions (home/global `.jastr` carrying named/grouped templates, variants, config usable from any project; location `~/.jastr`, not XDG/`~/.config`) → Intended outcome, Scope, and the `os.homedir()/.jastr` commitment in FR-1 (which is the chosen location, implicitly excluding XDG).

## Open Questions

- **Provenance of the three deferred future-features.** The spec states in Non-scope that "a scaffolding subcommand that creates `~/.jastr`, diagnostics that report what a local root is shadowing, and migration tooling … were named and deferred during discussion," and Unresolved questions repeats they were "raised in discussion … deferred deliberately." The sole in-scope discussion record (the decision log, P1–P4) contains no mention of any of the three. This is **not** classified as a smuggled-in decision because (1) it is a deferral, not a commitment among alternatives, and (2) excluding speculative features from scope is the safe YAGNI default that needs no user sign-off. But the *attribution to a discussion event* is unverifiable against the records: did these arise in a discussion turn the decision log simply did not capture (decision logs summarize settled decisions, not deferrals), or is the spec attributing a deferral to a conversation the records don't show? Worth a one-line confirmation in the follow-on discussion; either way the Non-scope listing itself is harmless.

## Next Actions

- The spec is a lossless, additive-free mapping of the decision log and seed — on this axis it is **ready to be approved**. No discussion is required to dispose findings (there are none).
- Optionally, before setting `status.approved`, confirm the single Open Question (provenance of the three deferred future-features) in a brief discussion turn — to either point at where they were raised or soften the spec's "named/raised … during discussion" wording. This is a copy-accuracy nicety, not a blocker.
