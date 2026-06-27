# Decision log — list --variants spec (specs/001/spec.md)

Thread: docs/threads/260627170317Z-list-variants/
Target: specs/001/spec.md
Subject: clarifying judgment calls surfaced by the spec's self-review — whether `LIST-FR-0005` must change for `--variants`, and how `list --variants` should treat a zero-row root with a malformed `config.yml`. (Distinct from the genesis decision log at `seed/discussions/260627172443Z-list-variants-design-decision-log.md`, whose P1–P5 settled the feature shape.)

## P1: Does LIST-FR-0005 need to change for --variants?

Point: Does `LIST-FR-0005` need to change for `--variants`, and if so how?

What you need to know: `LIST-FR-0005` asserts "List never treats a root-level file as a unit; enumeration skips `config.yml`/`lock.json` so neither appears as an installed unit," with AC-0001: a root with `config.yml` + `lock.json` beside its units lists only the units. `--variants` makes `list` read `config.yml` content (the variant keys) but never enumerates `config.yml` as a unit row — structurally impossible, since `enumerateUnits` only classifies directories and `config.yml` is a file. So FR-0005's assertion and its AC remain literally true. The genesis log's phrasing (P1/P3 called `--variants` "a carve-out from FR-0005") is therefore slightly off: enumeration is unchanged; reading-for-variants is a new, orthogonal capability covered by the new `LIST-FR-0006`. This is a documentation-hygiene question, not a behavior question.

Option A — Leave `FR-0005` exactly as-is: already scoped to "as a unit," which stays true; `FR-0006` establishes the config read. Most surgical.

Option B — Keep `FR-0005`'s assertion + AC verbatim, add one cross-reference sentence to its description (e.g. "`config.yml` is still never a unit row; under `--variants` its content is read for variant data — see `LIST-FR-0006`."). Guards against conflating "not a unit" with "never read."

Option C — Reword `FR-0005` to explicitly split "never enumerated as a unit" from "read for variant data." Most explicit, but over-touches a requirement whose assertion did not change.

Decision: Option B — keep `LIST-FR-0005`'s assertion and AC-0001 verbatim, and append a single cross-reference sentence to its description noting that `config.yml` is still never a unit row while `--variants` reads its content for variant data (pointing at `LIST-FR-0006`). No change to the AC.

Rationale: FR-0005's assertion is genuinely still true (config.yml can never be a unit row), so no substantive change is warranted; the only risk is a careless reader conflating "not a unit" with "never read." B is the cheapest change that keeps the tested assertion and AC intact while pre-empting that misreading, and it directly serves this repo's update rule, which flags "never"-style claims as the ones most likely to go stale and asks that they be reconciled. A was judged also-valid but slightly less defensive; C was rejected as over-touching a requirement whose assertion did not change.

## P2: A zero-row root with a malformed config.yml — throw or stay silent? Pin or DoF?

Point: When `list --variants` is in scope for a root that has zero present runnable rows but a malformed `config.yml`, does the command throw or stay silent? And should this be pinned or left a Degree of freedom?

What you need to know: The decided model is row-driven (genesis log P1): for each present runnable ref, look it up in that root's config. P3's validation is row-scoped — the top-level `variants` mapping is only checked when indexed, which only happens when there is a ref to look up. So a root with zero present runnable rows is never indexed → its `config.yml` is never parsed → a malformed config there is never seen. `list` already gates each section on `rows.length > 0`, so a unit-less root renders nothing regardless. The spec's self-review had called this throw-vs-silent choice a Degree of freedom; on reflection the row-driven + row-scoped decisions determine it (lazy, no-throw), so the real question is which behavior to pin.

Option A — Pin lazy/no-throw: a zero-row root is never consulted, so its malformed config never fails the command; FR-0008's throw-ACs stay scoped to roots with ≥1 present runnable row. Natural consequence of P1+P3, no extra code, least astonishing; preserves "No templates installed." + exit 0 when no units exist anywhere even if a config is broken.

Option B — Pin eager throw: validate every in-scope root's config regardless of rows; a unit-less root with a broken config fails. Simpler one-sentence contract, catches a broken config pre-install, but adds a non-row-driven parse step (against P1/KISS) and fails pointing at a root that would show nothing.

Option C — Leave a DoF (draft status quo): implementers could diverge; a reviewer couldn't call either wrong.

Decision: Option A — pin lazy/no-throw. A root with zero present runnable rows is never consulted: its `config.yml` is not parsed and a malformed config there never fails `list --variants`. FR-0008's failures apply only to a root with at least one present runnable row. The spec's "zero-row config parse" Degree-of-freedom bullet is removed (the behavior is pinned, not free); a slimmer DoF remains only for whether a rows-bearing root parses its config once eagerly or lazily per ref (no observable difference). Consistent with the genesis P1 guard rail, this no-throw behavior is stated as committed expected behavior but is not pinned by a dedicated e2e AC (the fixture would resemble the orphan/empty case the guard rail leaves emergent).

Rationale: It is not a free choice — the row-driven (P1) and row-scoped (P3) decisions already entail lazy/no-throw, so the self-review's DoF label was over-cautious. Pinning A removes ambiguity, adds no code, and preserves `list`'s "robust when empty" character (bare `list` never reads config; `list --variants` over a unit-less root likewise stays silent). B was rejected: it costs a non-row-driven parse step and is astonishing (failing over a root that displays nothing), and config validation of empty roots is `validate`'s job, not `list`'s.
