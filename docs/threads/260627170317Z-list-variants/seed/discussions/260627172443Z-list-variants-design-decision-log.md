# Decision log — list --variants (the seed)

Thread: docs/threads/260627170317Z-list-variants/
Target: the seed (seed/seed.md) — genesis discussion, held before any spec exists
Subject: shaping `jastr list --variants` — where variant rows come from, how the two roots factor in, and the rendering/data-source rules — ahead of writing a hand-off spec.

## P1: Where variant rows come from, and how the two roots factor in

Point: When `jastr list --variants` shows variants, does it report them by where they are authored (each root's own `config.yml`) or by how they would resolve at run time (composed across roots)? And how do the per-root Local/Global sections factor in?

What you need to know:

`list` today is deliberately folder-first with a lock overlay (`packages/cli/src/install/list.ts`). It enumerates the real unit directories under each `<root>/.jastr/` and joins them against that root's `lock.json`. It renders a Local section and a Global section independently, each from its own root's folders. `LIST-FR-0005` makes it an explicit rule that enumeration skips `config.yml` — `list` never reads it.

Variants don't exist on disk. They live only in `<root>/.jastr/config.yml` under `variants.<template-ref>.<variant-id>` (`packages/cli/src/config.ts`). So `--variants` forces `list` to read `config.yml` for the first time — a deliberate carve-out from FR-0005.

A variant key is a template-ref: `my-template` (standalone) or `group/template` (grouped). At run time, `loadComposedConfigVariant` resolves `#variant` local-config-first, else global-config, wholesale — regardless of which root holds the template body. That creates a cross-root subtlety: a template whose body is in one root can have a variant defined in the other root's `config.yml`, and that variant really does apply when you `run` it (the global-library + local-overrides pattern the dual-root feature exists for).

Worked example used in the discussion:

```
Global root  ($JASTR_HOME/.jastr/)
  code-review/        <- standalone template, installed from a library
  config.yml:
      variants:
        code-review:
          quick:  { locked-inputs: { severity: low } }
          strict: { locked-inputs: { severity: high } }

Local root  (./.jastr/)
  my-notes/           <- standalone template, authored here
  config.yml:
      variants:
        code-review:
          strict: { locked-inputs: { severity: critical } }   # overrides global "strict"
          team:   { locked-inputs: { reviewer: senior } }
        my-notes:
          brief:  { locked-inputs: { length: short } }
```

Option A — Strict per-root: each section shows only the variants in that same root's `config.yml`, hung under a row that exists in that section. Simplest; mirrors the existing per-root folder-first model. Today it under-reports the cross-root case — `code-review#team` and the local `strict` override would not appear, and the `strict` shown under Global would be the global definition even though `run` uses the local one.

Option B — Per-row composed resolution: for each row, show the variants that would actually resolve for that ref (local shadows global, like `run`). Matches the seed's "what can I actually run?" motivation. Cost: more complex; a Local variant authored in local `config.yml` would render under a Global-section row, so the section label and authorship diverge; and it forces cross-root config reads even under `--local`/`--global`.

Option C — Flat, authored: don't nest; each root lists the variants its own config authored as plain rows. Honest about authorship but loses the template->variant visual link and splits a template's variants across sections.

Decision: Option A — strict per-root. Each Local/Global section shows only the variants authored in that same root's `config.yml`, attached to a row present in that section. Implementation must be **row-driven**: iterate the folder-first rows, and for each row look up its ref in that same root's `config.yml`; never iterate config entries hunting for a home. No cross-root config reads.

Rationale: The owner is about to add a constraint that a variant may only be defined in the root where its template exists (co-located). Under that rule every variant is guaranteed a matching same-root row, so A's only weakness — the cross-root orphan — ceases to exist rather than needing a patch; A is the model the future rule converges on, not a compromise to outgrow. The row-driven lookup realizes A with zero forward-reference scaffolding: an orphan config entry is simply never visited (emergent, not special-cased), so when the co-location rule lands it is added in the variant authoring/validation path and `list` needs no change. The owner explicitly wants no "this will change later" comments or code; row-driven lookup satisfies that. A also keeps the scope flags simple (`--local`/`--global` read only their own root's config). Accepted trade-off: until the co-location constraint ships, `list --variants` does not show a variant defined for a template absent from that root — accepted because that authoring shape is on its way to being disallowed. Guard rail recorded for the spec stage: do NOT enshrine the transitional orphan-hiding behavior in `16-list.yml` or an e2e case (such a test would break when the constraint lands); scope the new requirement and cases to co-located variants only, leaving orphan handling unspecified-and-emergent. Interpretation pinned: "have the template locally" reads as co-located in the same root as the variant's config (global config may still define variants for global templates), not local-root-only; this does not affect `list`'s implementation.

## P2: How a variant renders in the tree, and what its line shows

Point: How does a variant render in the tree, and what does its line show?

What you need to know:

Today only group rows have children — their member templates, as a `├──`/`└──` tree of bare runnable refs (`my-group/template-a`), with no per-member detail (`LIST-FR-0001.AC-0002`). Standalone rows have no children at all.

Variants attach to whatever row owns their ref. A standalone template (`code-review`) gains variant children directly:

```
code-review (standalone) library@v1 @ abc123
├── code-review#quick
└── code-review#strict
```

A grouped member (`my-group/template-a`) is already a child of its group row, so its variants become grandchildren — depth 2, needing the `│` continuation:

```
my-group (group) library@v1 @ abc123
├── my-group/template-a
│   ├── my-group/template-a#v1
│   └── my-group/template-a#v2
└── my-group/template-b
    └── my-group/template-b#draft
```

The placement is basically forced (a variant hangs under its template). The genuine choice is the line content. The `#` suffix already self-identifies a variant — it cannot be confused with a group member's `/` ref — so no extra `(variant)` tag is strictly needed. Options differ in how much of the locked-input payload to surface:

Option A — Bare runnable ref only: `code-review#strict`. Mirrors the member tree exactly. Copy-pasteable into `jastr run code-review#strict`. `list` only needs the variant id (the keys under `variants.<ref>`), never reading or validating `locked-inputs`, so a malformed inner variant body cannot break `list`.

Option B — Ref + locked input names: `code-review#strict (locks: severity)`. Requires reading `locked-inputs` (must handle a malformed `locked-inputs` shape).

Option C — Ref + full locked values: `code-review#strict (severity=critical)`. Most informative, widest lines, fully couples `list` to parsing/validating every variant's `locked-inputs`.

Decision: Option A — each variant renders as a single line carrying only its bare runnable ref (`code-review#strict`, `my-group/template-a#v1`). Variants are children of their template's row; for grouped members they are grandchildren under the member line, using the `│` continuation for non-last members. Variants under a row are sorted by id, like members. No `(variant)` tag — the `#` suffix self-identifies.

Rationale: A is consistent with the existing member tree (bare refs, no per-item detail), it is the simplest thing, and it keeps `list` reading only variant keys — so malformed inner `locked-inputs` bodies can never break `list`, and the only remaining malformed-config question is the shape of `variants`/`variants.<ref>` themselves (a separate decision). Richer line content (B/C) is a clean additive follow-up if wanted later. Accepted trade-off: A does not reveal what a variant does without opening `config.yml`, matching the member tree's level of detail. The two-level nesting under grouped members was presented as forced and accepted without objection.

## P3: When --variants reads a malformed config.yml, does list fail or degrade?

Point: When `--variants` reads a malformed `config.yml`, does `list` fail or degrade?

What you need to know:

`list` today is rock-solid: it never reads `config.yml`, mutates nothing, and exits 0 showing whatever is on disk — the command you reach for when things are confused. `--variants` changes that: it has to parse `config.yml`.

Because P2 picked bare-ref output, `list` only needs the variant keys — so the malformed cases it can actually hit are narrow: (1) `config.yml` is unparseable YAML; (2) `variants` is present but is not a mapping; (3) `variants.<ref>` (for a ref that matches a row) is present but is not a mapping. Inner `locked-inputs` bodies are never read, so they cannot trigger anything.

Everywhere else in the CLI, every `config.yml` consumer (`run`, `validate`) throws `invalid_config` with fixed messages (`.jastr/config.yml could not be parsed.`, `… variants must be a mapping.`, `… variants.<ref> must be a mapping.`), and the uniform UX is `Error: <message>` + exit 1.

Refinement from P1's row-driven, orphan-agnostic rule: `list` should only inspect `variants.<ref>` for refs that match a row. It must check that top-level `variants` is a mapping (unavoidable to index it), but must not validate the shape of `variants.<orphan-ref>` entries — otherwise a malformed orphan entry would break `list`, and that behavior would shift when the co-location constraint lands. Row-scoped validation keeps `list` orphan-agnostic.

Option A — Throw `invalid_config`, reuse the exact existing messages, row-scoped: parse fails -> throw; non-mapping `variants` -> throw; non-mapping `variants.<matching-ref>` -> throw; orphan entries untouched. Consistent with `run`/`validate`, reuses existing helpers/messages, smallest new surface. Trade-off: a broken local config makes `list --variants` fail entirely, even though plain `list` would still work and the other root's section was fine.

Option B — Degrade gracefully: if a root's config cannot be read, render that root's rows without variants (optionally a stderr warning) and still exit 0. Keeps the inventory total. Trade-off: new behavior inconsistent with every other config reader; exit 0 with a silently broken config sits awkwardly against the uniform error UX; more code; can mask a real problem.

Decision: Option A — `list --variants` throws `invalid_config` on a malformed in-scope `config.yml`, reusing the exact existing messages (`.jastr/config.yml could not be parsed.`, `.jastr/config.yml variants must be a mapping.`, `.jastr/config.yml variants.<ref> must be a mapping.`) and exiting 1 per the uniform error UX. Validation is row-scoped: the top-level `variants` mapping is checked, but `variants.<ref>` shape is validated only for refs that match an on-disk row; orphan entries are never inspected. No new `JastrErrorCode`.

Rationale: Consistency and honesty win — if the user explicitly asks for variants and the config is broken, the right answer is the same loud `invalid_config` message `run` would give, not a silent omission. The escape hatch is preserved: plain `jastr list` (no flag) still never reads config, so the "show me what's installed even when things are messy" path is unaffected. Reusing the existing parse + mapping checks means less new code and automatic message consistency. Row-scoped validation is the detail that keeps A future-proof: orphan config entries (soon to be disallowed by co-location) are never inspected, so list's failure surface does not change when that constraint lands. Accepted trade-off: a typo in one root's config blanks the whole `--variants` listing; mitigated by bare `list` remaining robust.

## P4: Exactly which rows get variant children?

Point: Exactly which rows get variant children?

What you need to know:

The row-driven model says "look up a row's ref in config", but not every row has a runnable ref. A standalone row's ref is its id (`code-review`) — runnable. A group member ref is `group/template` (`my-group/template-a`) — runnable. A group aggregate row's id is the bare group name (`my-group`) — not runnable; `jastr run my-group` is not a thing, so `variants.my-group` corresponds to no runnable ref. A missing row (`LIST-FR-0002`) has no on-disk body — not runnable at all; a missing group row cannot even enumerate members (its dir is gone).

Proposed solution: phrase the rule as "for each present, runnable template, attach the variants authored for its ref in that root's config", where "present, runnable template" means a standalone unit on disk (ref = id) and each on-disk group member (ref = `group/template`). Everything else falls out emergently with no special-case branches: group aggregate rows get no variants (their id is not a runnable ref, so it is never looked up, and a stray `variants.my-group` is an unvisited orphan); missing rows get no variants (no present body -> not in the set), keeping the `(missing)` drift signal clean and never dangling a variant ref under a template that cannot be run.

Decision: Accepted as proposed. Variant children are attached only to standalone rows (ref = id) and on-disk group-member lines (ref = `group/template`). Group aggregate rows and missing rows never get variant children, and this is emergent from "look up variants for each present runnable template", not a special-case branch.

Rationale: This is the precise, runnable-ref-only reading of the row-driven model, consistent with P1's orphan-agnostic framing and future-proof against the co-location constraint (nothing here changes when it lands). Showing variants under a missing row was considered and rejected: it would surface un-runnable refs and muddy the drift signal. The owner agreed.

## P5: Is list --variants itself the "what can I run" view, or is a separate composed command needed?

Point: Is `jastr list --variants` (Option A) the complete "what can I actually run" view, or is a separate composed/effective-resolution command (the deferred Option B) still needed?

What you need to know:

P1 chose Option A (strict per-root, authored-where). The only gap A had versus B (composed run-resolution) was the cross-root orphan — a variant authored in one root for a template bodied in the other, runnable but not shown by A. The owner is adding a co-location constraint (a variant may only be authored where its template exists). `list --variants` already lists every row's base ref plus its variant refs, and every one of those is a runnable command (`jastr run <ref>`, `jastr run <ref>#<variant>`). Under co-location, the orphan authoring shape becomes impossible, so every runnable variant is guaranteed a same-root row and A displays it. The one residual — the same template installed in both roots with the same variant id defined in both configs — makes A show that ref in both sections (both runnable as `run <ref>#<id>`); that is a "which definition wins at runtime" detail (local shadows global wholesale, a `run`-resolution concern), not a missing entry, so it does not reopen the gap.

Decision: `list --variants` (Option A) IS the complete runnable inventory. No separate composed/effective-resolution command is in scope now or planned — Option B is dropped, not deferred. The cross-root orphan that originally motivated B is closed by the co-location constraint rather than by a second command.

Rationale: The owner observed that `list --variants` already answers "what can I run" (it lists every runnable base ref and every runnable variant ref), and that the only gap B would fill is closed by the upcoming co-location constraint. Recording this forecloses re-litigating "should there be a separate composed command?" at the spec stage and after. The residual same-id-in-both-roots case is handled acceptably by A (both refs shown; runtime shadowing is documented at `run`, not `list`).
