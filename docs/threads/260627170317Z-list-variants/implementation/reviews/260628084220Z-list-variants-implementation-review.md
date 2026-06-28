---
status:
  disposed: 260628094955Z
  disposition: accepted
  rationale: implementation/discussions/260628090145Z-list-variants-review-findings-decision-log.md
---

# Implementation Review — `jastr list --variants`

## References

- Implementation under review (jastr repo, branch `feat/list-variants`): commit range `09ac573..aa1b011` — the five commits `2c05235` (feature), `7ecdee0` + `2c15096` (e2e), `850add1` (docs), `aa1b011` (report) over merge-base `09ac573`
- Spec judged against: `specs/001/spec.md`
- Implementer's own account (context, not contract): `implementation/260628075921Z-list-variants-implementation-report.md`
- Genesis decision log (P1–P5, cited throughout the spec): `seed/discussions/260627172443Z-list-variants-design-decision-log.md`
- Spec-review clarification log (P1/P2, scopes FR-0005 + zero-row root): `specs/001/discussions/260627195921Z-spec-review-clarifications-decision-log.md`
- Functional requirements touched: `packages/cli/requirements/functional/16-list.yml`
- Core production code: `packages/cli/src/install/list.ts`, `packages/cli/src/config.ts`, `packages/cli/src/commands/list.ts`, `packages/cli/src/args.ts`
- e2e cases: `packages/cli/test/e2e/cases/list-variants-*` (7 cases)

## Verdict

**Delivers.** Every acceptance criterion in `LIST-FR-0006/0007/0008` maps to a diff hunk and a covering e2e case, the four byte-exact rendering contracts (B4) reproduce the spec's canonical examples verbatim, the B6 error messages are byte-identical to the existing `invalid_config` path, and the engine is untouched. No blockers, no issues. The two findings below are `nit`s — a doc/CLI consistency gap and a non-discriminating test fixture; neither blocks landing. Highest-impact tether: the CLI's own command catalog (`expectedCommandShape`) still advertises `jastr list [--local] [--global]` while `AGENTS.md`/`README.md` were updated to `[--variants] [--local] [--global]`.

## Findings

### 1. `nit` — command-catalog usage string left at `jastr list [--local] [--global]` (scope adherence)

`AGENTS.md` and `README.md` both updated their `list` command-shape line to `jastr list [--variants] [--local] [--global]`. The CLI's runtime command catalog — `expectedCommandShape` in `args.ts`, the `unknown-command` e2e case that pins it, and its rendering in `BEHAVIOR.md` — still reads `jastr list [--local] [--global]`. The three CLI surfaces agree with each other (so nothing is *internally* broken and all gates stay green), but they now disagree with the two human-facing docs. The spec's Scope lists "any `list` help/usage output ... affected by the new option" and "documentation ... that the change makes stale"; this catalog enumerates `list`'s other two flags, so omitting `--variants` is a genuine staleness. Impact is small: it surfaces only on an unknown/empty command, and `jastr list --help` (Commander, auto-updated) does show `--variants`. Whoever picks this up should decide whether the catalog is in scope (see Open Questions) before touching the pinned test + e2e case + `BEHAVIOR.md`.

### 2. `nit` — `LIST-FR-0006.AC-0001`'s "config.yml is not read" clause is not discriminated by its fixture (test coverage)

AC-0001 asserts plain `jastr list` "produces byte-identical output to the pre-feature behavior, **and `config.yml` is not read**." The `list-variants-default-unchanged` fixture ships a *well-formed* `config.yml` (`variants.notes` = `{full, brief}`), so the case proves "variants are not rendered and output is byte-identical" but cannot distinguish *read-and-ignored* from *not-read*. The discriminating fixture would be a **malformed** `config.yml` under plain `list` asserting exit 0 — which is exactly the "tolerate broken config" path. The code is structurally correct (`inventoryRoot` calls `attachVariants` only under `includeVariants`, so plain `list` never touches `config.yml`), and the spec's B6 deliberately leaves that no-throw tolerance *unpinned by a dedicated AC*. So this is a coverage observation, not a contract breach — the byte-identical clause (the AC's primary assertion) is fully verified.

## Evidence

- **Finding 1** — diff: `packages/cli/src/args.ts:8` (`expectedCommandShape` unchanged, lists `jastr list [--local] [--global]`); contrast with the updated `AGENTS.md` line (`jastr list [--variants] [--local] [--global]`) and `README.md` synopsis block, both in commit `850add1`. Pinned by `packages/cli/test/cli-shell.test.ts:61` and `packages/cli/test/e2e/cases/unknown-command/case.yml:11`. Spec: **Scope** bullet 6 ("any `list` help/usage output ... affected by the new option") and **Constraints** ("Documentation and traceability updates that the change makes stale").
- **Finding 2** — diff: `packages/cli/test/e2e/cases/list-variants-default-unchanged/fixture/.jastr/config.yml` (well-formed `variants.notes`) + `.../expected/stdout.txt` (notes row only). Spec: **Acceptance criteria** `LIST-FR-0006.AC-0001` ("...and `config.yml` is not read") cross-referenced with **B6**'s explicit note that the broken-config no-throw outcome "is **not pinned by a dedicated AC**."

## Open Questions

- Was leaving `expectedCommandShape` (and its pinned test, `unknown-command` e2e case, and `BEHAVIOR.md` rendering) at `[--local] [--global]` an intentional scoping call — treating the catalog as a "which commands exist" summary distinct from `list --help` — or an oversight? The spec's Scope parenthetical names only `jastr list --help` / `jastr help list` (Commander auto-handles those) but its general phrasing is broader.
- Test-coverage axis was **not** skipped: all nine ACs (`LIST-FR-0006.AC-0001..0005`, `LIST-FR-0007.AC-0001`, `LIST-FR-0008.AC-0001..0003`) carry covering e2e cases. The emergent edges the spec deliberately left unpinned (orphan suppression, `missing`-row suppression, zero-row root never consulted, B2's last-member tail) correctly have **no** dedicated cases, honoring the P1 guard rail / "no forward-reference scaffolding" constraint.

## Next Actions

- For Finding 1: confirm intended scope (Open Question), then either update the catalog trio (`expectedCommandShape` + `unknown-command` case + `BEHAVIOR.md`) to include `[--variants]` in a fresh implementation pass, or record the deliberate non-update so the AGENTS/README-vs-CLI divergence is documented rather than latent. Either way is a CLI-only edit; no engine or AC change.
- For Finding 2: optionally add a malformed-config-under-plain-`list` e2e case to fully discriminate AC-0001's "not read" clause — low priority, since the spec left this path unpinned by design and the existing case proves byte-identical output. If declined, no action.
- Otherwise: this implementation satisfies the spec's contract and is ready to land.
