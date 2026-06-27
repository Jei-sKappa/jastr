---
version: 1
status:
  approved: 260627212527Z
---

# Spec: `jastr list --variants`

Render config-defined variants in the `jastr list` inventory, opt-in behind a
new `--variants` flag, as a tree hanging under each runnable template row.

> Settled decisions feeding this spec live in
> `seed/discussions/260627172443Z-list-variants-design-decision-log.md`
> (cited inline below as `P1`–`P5`). Read it for the full reasoning behind each
> pinned behavior.

## Intended outcome

After this ships, a user can run `jastr list --variants` and see, beneath every
runnable template in the inventory, the config-defined variants that exist over
it — each as a copy-pasteable `<ref>#<variant-id>` line. Plain `jastr list`
(no flag) is completely unchanged. The result is a single command that shows the
full runnable surface: every base template/group-member ref **and** every variant
ref, across whichever roots are in scope.

## Context

`jastr list` today is a **folder-first inventory with a lock overlay**
(`packages/cli/src/install/list.ts`): it enumerates the real unit directories
under each `<root>/.jastr/`, joins each against that root's `lock.json`, and
renders a **Local** and a **Global** section, each shown only if it has rows.
Group rows already render their member templates beneath them as a sorted
`├── `/`└── ` tree of runnable `<group>/<member>` refs (`LIST-FR-0001.AC-0002`).

Variants are **not on disk**. They live only in `<root>/.jastr/config.yml` under
`variants.<template-ref>.<variant-id>` (`packages/cli/src/config.ts`), and
`run`/`generate`/`validate` accept them as `<ref>#<variant-id>`. So today they
are invisible in the inventory — there is no single command that answers "what
can I actually run, including every variant?" (the seed). This spec closes that
gap by teaching `list` to read variant **keys** from `config.yml` when, and only
when, `--variants` is passed.

The shape of the feature was settled across a genesis discussion (P1–P5). The
governing choice (P1) is **strict per-root, authored-where, row-driven**: each
section shows only the variants authored in that same root's `config.yml`,
looked up by iterating the rows the section already computes. This is chosen
deliberately over a "composed/effective run-resolution" view, because the owner
is separately introducing a **co-location constraint** (a variant may only be
defined in the root where its template exists). Under that future constraint the
per-root view is provably complete (P5); the present spec must therefore be
written so that it is **already correct** under co-location and needs no rework
when it lands — no "this will change later" scaffolding in code or tests (P1).

## Scope

- A new boolean CLI flag `--variants` on the `list` command (opt-in; variants
  are never shown without it — per the seed's `--variants` framing, confirmed in
  P5/P2).
- When `--variants` is set, `list` reads each in-scope root's `config.yml`,
  enumerates the variant ids under `variants.<ref>` for each **present, runnable**
  ref it already lists, and renders them as a sorted tree beneath that ref (P1,
  P2, P4).
- The flag composes with the existing `--local` / `--global` scope flags with no
  new interaction rules; each section reads only **its own root's** `config.yml`
  (P1).
- Malformed in-scope `config.yml` content that `list --variants` consumes fails
  the command with the existing `invalid_config` code and messages (P3).
- Documentation and traceability updates that the change makes stale: the
  `jastr list` command surface in `AGENTS.md`/`CLAUDE.md` and `README.md`, the
  functional requirements in `packages/cli/requirements/functional/16-list.yml`,
  new e2e cases, the regenerated `packages/cli/docs/BEHAVIOR.md`, and any
  `list` help/usage output or snapshot affected by the new option (Commander
  surfaces `--variants` in `jastr list --help` / `jastr help list`
  automatically).

## Non-scope

- **No richer variant line content.** Variant lines show only the bare runnable
  ref; locked-input names/values are not rendered (P2). Surfacing them is a clean
  additive follow-up, explicitly deferred.
- **No separate "composed / effective run-resolution" command** (the discarded
  Option B). `list --variants` is the complete runnable inventory; the cross-root
  case is closed by the co-location constraint, not by a second command (P5).
- **No provenance for variant lines.** Like group members, variant lines carry no
  `source@ref`/commit (P2; the lock tracks units, not variants).
- **No engine change.** No new `JastrErrorCode`; reuse the existing
  `invalid_config` (P3). The feature is CLI-only.
- **No change to plain `jastr list`.** Without `--variants`, `config.yml` is not
  read and output is byte-identical to today (P3).
- **The co-location constraint itself is out of scope** — it is a separate
  future thread. This spec only ensures `list --variants` is forward-compatible
  with it.

## Expected behavior

The model is **row-driven and orphan-agnostic** (P1): `list` computes its rows
exactly as today, and `--variants` *augments* them. Nothing iterates
`config.yml`'s variant entries looking for a home; instead, for each present
runnable ref already in the listing, `list` looks that ref up in the same root's
`config.yml`. Config entries that match no present runnable ref are never
visited.

### B1 — Opt-in; default output unchanged (P3, P5)

`jastr list` without `--variants` never reads `config.yml` and prints exactly
what it prints today. `--variants` is the only trigger for reading variant data.

### B2 — Which refs get variants: present, runnable refs only (P4)

Variants are attached by iterating **present, runnable templates**:

- every **standalone** unit on disk (ref = its id, e.g. `code-review`); and
- every **on-disk group member** (ref = `<group>/<member>`, e.g. `team/api`).

Consequences fall out **emergently**, with no special-case branch:

- A **group aggregate** row (id = bare group name) is never a runnable ref, so it
  is never looked up and never gains direct variant children.
- A **`missing`** row (lock entry whose unit dir is gone, `LIST-FR-0002`) has no
  present body, so it is not in the set and gains no variant children.
- A variant authored for a ref that has **no matching present row in that root**
  (a cross-root "orphan") is simply never looked up, so it does not appear. This
  behavior is deliberately **left emergent and is not pinned by an acceptance
  criterion** (see Degrees of freedom / the P1 guard rail), because the
  co-location constraint will make that authoring shape illegal.

### B3 — Variant line content: bare runnable ref (P2)

Each variant renders as a single line carrying only its runnable ref:
`<ref>#<variant-id>` (e.g. `code-review#strict`, `team/api#v2`). No
`(variant)` tag — the `#` self-identifies and cannot be confused with a group
member's `/` ref. No locked-input detail, no provenance.

### B4 — Placement and exact tree rendering (P2)

Variants are sorted **ascending by variant id** using the same string ordering
`list` already uses for rows and members (default ascending `.sort()`), and
rendered with the box-drawing connectors `├── ` (every variant but the last) and
`└── ` (the last). A ref with no variants contributes no lines.

The canonical rendered examples below are the **byte-exact contract**. In each,
`Local:` sits at column 0 and rows sit at the existing 2-space indent (the same
base indent `list` uses today) — every leading space shown is literal output, not
document formatting.

**Under a standalone row**, variants are direct children at the 2-space row
indent — exactly where a group member would sit:

```text
Local:
  notes (standalone) (local)
  ├── notes#brief
  └── notes#full
```

**Under a group member**, variants are grandchildren nested one level beneath the
member line. The continuation prefix depends on whether the member is the group's
last member:

- member is **not** the group's last member → `  │   ` (2-space base + `│` + three
  spaces) then the variant connector;
- member **is** the group's last member → `      ` (six spaces) then the variant
  connector.

```text
Local:
  team (group) acme/lib@main @ 0a1b2c3d4e5f
  ├── team/api
  │   ├── team/api#strict
  │   └── team/api#v2
  └── team/demo
      └── team/demo#draft
  tools (group) (local)
  └── tools/fmt
```

Here `team/api` is a non-last member, so its variants carry the `│` continuation;
`team/demo` is the last member, so its variant is indented with spaces;
`tools/fmt` has no variants and so gains no grandchildren. Variant ref text aligns
at the same column as a sibling-level connector's payload: standalone variants and
group-member lines at column 6, grouped-member variants four columns further, at
column 10.

### B5 — Per-root authorship; scope flags (P1)

Each section's variants come **only from that same root's `config.yml`**. There
are **no cross-root config reads**: `--local` reads only the local `config.yml`,
`--global` only the global `config.yml`, and the default (both roots) reads each
section's own. A variant authored in one root is never displayed under the other
root's section.

### B6 — Malformed config fails loudly, row-scoped (P3)

When `--variants` is set and `list` consumes a root's `config.yml`, it validates
only what it must to read variant keys, reusing the **existing** `invalid_config`
code and messages (exit 1, `Error: <message>` per the uniform error UX):

- unparseable YAML → `.jastr/config.yml could not be parsed.`
- top-level `variants` present but not a mapping → `.jastr/config.yml variants must be a mapping.`
- `variants.<ref>` present but not a mapping, **for a ref that matches a present
  runnable row** → `.jastr/config.yml variants.<ref> must be a mapping.`

Validation is **row-scoped**: `list` checks that top-level `variants` is a
mapping (unavoidable to index it) and the shape of `variants.<ref>` only for refs
it actually looks up. It never inspects the shape of an unmatched (orphan)
`variants.<other-ref>` entry, and it never reads a variant's inner
`locked-inputs` body. Plain `jastr list` (no flag) still never reads
`config.yml`, so the "show me what's installed even when things are broken" path
is preserved.

A root that contributes **no present runnable rows is never consulted**: its
`config.yml` is not parsed and a malformed config there never fails the command
(per `specs/001/discussions/260627195921Z-spec-review-clarifications-decision-log.md`
P2). Consequently the failures above apply only to a root with **at least one
present runnable row** — exactly how `FR-0008`'s ACs are scoped — and with no
units anywhere `list --variants` still prints `No templates installed.` and exits
0 even if a config is broken. Like the orphan/missing-row edges, this no-throw
outcome is a committed entailment of the row-driven model and is **not pinned by a
dedicated AC** (its fixture would resemble the orphan/empty case the P1 guard rail
leaves emergent).

## Constraints

- **CLI-only; no engine change.** All logic lives in `@jastr/cli`. No new
  `JastrErrorCode`; reuse `invalid_config` with the messages quoted in B6 (P3).
  `@jastr/engine` is untouched.
- **Reuse the existing config parse + messages.** The three messages in B6 are
  produced today by `packages/cli/src/config.ts`; the new variant-enumeration
  read path must emit byte-identical messages (P3). (`list` needs a new
  read shape — "enumerate the variant ids for a ref" — because the existing
  `tryLoadProjectConfigVariant` is selected-by-id; how that read path is factored
  is a Degree of freedom.)
- **`LIST-FR-0005` keeps its assertion and AC verbatim; add one cross-reference
  sentence** (per `specs/001/discussions/260627195921Z-spec-review-clarifications-decision-log.md`
  P1). FR-0005's claim — `config.yml` never appears as a *unit row* — stays
  literally true: `enumerateUnits` only classifies directories, so `config.yml`
  (a file) can never be enumerated as a unit; `--variants` reads its *content*
  for variant data, which is orthogonal. To pre-empt a reader conflating "not a
  unit" with "never read," append a sentence to FR-0005's *description* such as:
  *"Reading `config.yml` content for variant data under `--variants` is a
  separate concern (see `LIST-FR-0006`); `config.yml` is still never a unit
  row."* FR-0005's AC-0001 is unchanged. (The genesis log's "carve-out from
  FR-0005" phrasing is superseded by this clarification: there is no carve-out —
  enumeration is unchanged.)
- **Read-only.** `list --variants` mutates nothing and exits 0 on success
  (`LIST-FR-0004`); the only non-zero path is the `invalid_config` failure in B6.
- **No forward-reference scaffolding.** The implementation and its tests must be
  correct as-is and require no edit when the co-location constraint lands. In
  particular, do not add code comments, branches, or e2e cases that encode the
  transitional orphan-hiding behavior (P1 guard rail).
- **Determinism.** Output is fully determined by on-disk units + lock + that
  root's `config.yml`; variant ordering is the same stable ascending id sort used
  elsewhere in `list`.
- **Match surrounding style.** `--variants` is a real Commander `.option()` on the
  `list` command, alongside `--local`/`--global` (`packages/cli/src/commands/list.ts`).

## Acceptance criteria

New functional requirements to be added to
`packages/cli/requirements/functional/16-list.yml`, each AC a pass/fail
assertion. e2e cases live under `packages/cli/test/e2e/cases/<case-id>/` with
`covers: [<FR-ID>.AC-NNNN]`, and `packages/cli/docs/BEHAVIOR.md` is regenerated.
All AC fixtures use **co-located** variants (the variant's template present in
the same root), per the P1 guard rail.

### LIST-FR-0006 — `list --variants` renders config-defined variants; default is unchanged

- **AC-0001** — `jastr list` without `--variants` produces byte-identical output
  to the pre-feature behavior, and `config.yml` is not read. *(enforces B1; P3/P5)*
- **AC-0002** — `jastr list --variants` follows a standalone row with the variant
  ids under `variants.<id>` in that root's `config.yml`, rendered at the row's
  2-space indent as a tree using `├── ` for every variant but the last and `└── `
  for the last, each line the runnable ref `<id>#<variant-id>`. *(B2 standalone,
  B3, B4; P2/P4)*
- **AC-0003** — `jastr list --variants` follows an on-disk group-member line with
  the variant ids under `variants.<group>/<member>` in that root's `config.yml`,
  nested one level beneath the member: prefixed `  │   ` + connector when the
  member is not the group's last member, and six spaces + connector when it is;
  each line the runnable ref `<group>/<member>#<variant-id>`. *(B2 grouped, B3,
  B4; P2/P4)*
- **AC-0004** — variant lines under a ref are sorted ascending by variant id
  (same ordering as rows/members), and a present runnable ref with no variants
  contributes no variant lines. *(B4; P2)*
- **AC-0005** — `--variants` reads only the in-scope root(s)' own `config.yml`:
  `--local` shows local-authored variants only, `--global` global-authored only,
  and a variant authored in one root never appears under the other root's
  section. *(B5; P1)*

### LIST-FR-0007 — variants attach only to present, runnable refs

- **AC-0001** — for a group whose `config.yml` defines variants for a member ref
  (`variants.<group>/<member>`), those variants render nested under the
  **member** line, and the **group aggregate** row itself shows no direct variant
  children. *(B2; P4)*

  *(The further consequences — a `missing` row and an unmatched orphan entry gain
  no variant lines — are emergent entailments of the present-runnable-ref rule
  and are deliberately not pinned by an AC; see Degrees of freedom.)*

### LIST-FR-0008 — `list --variants` validates consumed config and fails loudly

- **AC-0001** — with `--variants`, an in-scope root that has at least one present
  runnable row and an **unparseable** `config.yml` fails with `invalid_config`,
  message `.jastr/config.yml could not be parsed.`, exit 1. *(B6; P3)*
- **AC-0002** — with `--variants`, a root with at least one present runnable row
  whose top-level `variants` is **not a mapping** fails with `invalid_config`,
  message `.jastr/config.yml variants must be a mapping.`, exit 1. *(B6; P3)*
- **AC-0003** — with `--variants`, when `variants.<ref>` for a ref that matches a
  present runnable row is **not a mapping**, the command fails with
  `invalid_config`, message `.jastr/config.yml variants.<ref> must be a mapping.`
  (the actual ref interpolated), exit 1. *(B6 row-scoped; P3)*

**Coverage** — every observable behavior B1–B6 maps to at least one AC: B1→0006.AC-0001;
B2→0006.AC-0002/0003 + 0007.AC-0001; B3→0006.AC-0002/0003; B4→0006.AC-0002/0003/0004;
B5→0006.AC-0005; B6→0008.AC-0001/0002/0003. Behaviors deliberately left emergent
(orphan/missing-row suppression, B2's tail) are excluded from coverage by design
and recorded under Degrees of freedom.

## Degrees of freedom

The *what* above is pinned to the rendered bytes and the error messages. The
following *hows* are explicitly granted to the implementer:

- **Config read factoring.** How the new "enumerate variant ids for a ref" read
  is implemented — a new helper in `config.ts`, loading each root's config once
  and building a `ref → variant-id[]` map vs. looking up per ref, reusing vs.
  refactoring `loadProjectConfig` — is free, provided the B6 messages/code are
  byte-identical and validation stays row-scoped.
- **Where variant lines are computed in `list.ts`.** Extending the existing
  `ListRow`/`formatMemberTree` shapes, adding a parallel renderer, or threading a
  `variants` field through rows — any structure is fine as long as the rendered
  output matches B4 exactly.
- **Box-drawing prefix construction.** How the `  │   ` / six-space continuations
  are generated (string constants, a depth/`isLast` helper, etc.) is free; only
  the emitted bytes are fixed.
- **Config read timing within a rows-bearing root.** For a root that has at least
  one present runnable row, whether its `config.yml` is parsed once eagerly (once
  the root is known to bear rows) or lazily on the first ref lookup is free —
  there is no observable difference, since the top-level `variants` check fires as
  soon as the first ref is indexed. (Whether a *zero-row* root is consulted is **no
  longer free**: it is pinned to "never consulted" — see B6 and the spec-discussion
  P2 decision.)
- **Orphan and `missing`-row variant suppression is left emergent, not pinned.**
  Per the P1 guard rail, the implementation must *not* add explicit handling,
  comments, or e2e cases for "a variant authored for a template absent from this
  root is hidden" or "a missing row hides its stale config variants." These
  outcomes must fall out of the present-runnable-ref iteration so that the
  co-location constraint, when it lands, requires no change here. (This is the one
  place the spec deliberately declines to pin an observable edge: it is granted as
  emergent rather than committed, precisely so the feature stays forward-correct.)

## Unresolved questions

None block implementation. The forward-looking co-location constraint (which this
spec is written to be compatible with) is a separate future thread and is not a
prerequisite for shipping `list --variants`.
