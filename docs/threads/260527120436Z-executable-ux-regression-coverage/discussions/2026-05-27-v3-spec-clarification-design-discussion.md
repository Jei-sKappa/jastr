# V3 Spec Clarification — Functional Requirements Registry With E2E Case Coverage

Resolving open ambiguities in `specs/260527192816Z-v3-spec.md` so the spec is unambiguous enough to produce a detailed implementation plan.

## P1: Functional requirement ID format

Point: The spec defines the ID format as `FR-<AREA>-<FEATURE>-<NNN>` (four segments, e.g. `FR-CLI-RUN-001`), but lists `FR-ERR-*` as an initial area — which is only three segments (`FR` + `ERR` + `NNN`). The validator needs one precise regex, so this inconsistency must be resolved.

What you need to know: The area list in the spec (lines 154–164) is: `FR-CLI-RUN-*`, `FR-CLI-GEN-*`, `FR-CLI-HELP-*`, `FR-CLI-VERSION-*`, `FR-CLI-FLAGS-*`, `FR-TPL-INPUT-*`, `FR-TPL-COND-*`, `FR-TPL-INCLUDE-*`, `FR-ERR-*`. Every entry except `FR-ERR-*` parses cleanly as `FR-<AREA>-<FEATURE>-<NNN>` where AREA ∈ {CLI, TPL} and FEATURE is the third token; `FR-ERR-*` has no FEATURE token. Validation must "fail when a requirement has an invalid ID format" (spec line 278), so the regex is load-bearing — error records can't be filed under an ID the validator rejects. The `<NNN>` convention in every spec example is exactly three digits. The spec's own agent-prompt example (line 110) is "remove FR-CLI-GEN-003" — area + number, with no descriptor token.

The discussion moved through three positions:
1. Initial recommendation was a loose free-form namespace (`^FR-[A-Z]+(?:-[A-Z]+)*-\d{3}$`) to accommodate `FR-ERR-*` as-is.
2. User's hot take: an error is not a domain — it is a facet of a feature, so `FR-ERR-RUN` is backwards; it should read feature-first. This also implied dropping the redundant `CLI`/`TPL` domain prefix (since `RUN`/`GEN`/`INPUT`/`INCLUDE` are already unique and self-evidently CLI-surface vs template-language), giving a 3-token `FR-<AREA>-<DESCRIPTOR>-<NNN>` shape. Open sub-question: name segment 2 "descriptor".
3. An external opinion argued for opaque, durable IDs with a coarse type/area prefix (`<AREA>-<TYPE>-<NNNN>`, e.g. `AUTH-FR-0001`): keep meaning in title/metadata, never overload the ID with semantics that can go stale, never renumber/reuse. This argued *against* the semantic descriptor (a `STRING` descriptor lies the day string interpolation broadens) — and it matched the spec's own `FR-CLI-GEN-003` example, which has no descriptor. Recommendation pulled back the descriptor. User then pushed to also adopt the doc's 4-digit numbering and explicit TYPE token as future-proofing (set a durable convention now, before any IDs exist, so a larger future project never has to restructure IDs). Both conceded: 4-digit is free because no IDs are committed yet (the `001` in the spec is illustrative prose), and widening width later is the one thing you cannot do without renumbering; the TYPE token role is committed so adding `NFR`/`BR` later never disturbs existing FR IDs. Final open fork was TYPE position: area-first (`RUN-FR-0001`, matches external doc, clusters a feature's whole requirement set across types) vs type-first (`FR-RUN-0001`, matches current spec text).

Choice: ID format is `<AREA>-FR-<NNNN>` — **area-first, explicit `FR` type token, 4-digit zero-padded durable sequence**. Examples: `RUN-FR-0001`, `INPUT-FR-0002`, `INCLUDE-FR-0001`, `GEN-FR-0003`. Regex for this (functional-requirements-only) file: `^[A-Z]+-FR-\d{4}$`. AREA is the durable feature surface (`RUN`, `GEN`, `HELP`, `VERSION`, `FLAGS`, `INPUT`, `COND`, `INCLUDE`). No descriptor segment; no `CLI`/`TPL` domain prefix; **no `FR-ERR-*` area** — error behaviors fold into their feature area as ordinary numbered requirements (e.g. missing-required-input is `INPUT-FR-NNNN` with a title describing the rejection; rejected unsafe include is `INCLUDE-FR-NNNN`), with the failure behavior expressed in the acceptance criteria. Numbers are assigned once and never renumbered or reused.

Rationale: Meaning lives in `title`/`description`/`acceptance`; the ID is a durable handle, which avoids the staleness a semantic descriptor would introduce. Area-first clusters a feature's entire requirement set (FR/NFR/BR) together in any future combined view, with area as the durable primary axis and type secondary. 4-digit width and the explicit type token are deliberate future-proofing adopted now while it is free (no committed IDs), because both are things that cannot be changed later without violating the never-renumber rule. Folding errors into their feature area honors the "an error belongs to a feature" principle even more strongly than a feature-first `ERR` descriptor would (no `ERR` token at all). This overrides the spec's `FR-<AREA>-<FEATURE>-<NNN>` format text and deletes its `FR-ERR-*` area; the spec must be rewritten accordingly. Trade-off accepted: cannot `grep` an `ERR` token to "audit all error requirements" — if that grouping is ever needed, the cheap fix is an optional `tags: [error]` field (deferred, YAGNI).

## P2: E2E case ID format and its coupling to requirementIds

Point: The spec proposes case IDs that embed the primary requirement ID plus a descriptor — `FR-CLI-RUN-001-basic-run` (spec lines 200–207). But `requirementIds` is now a first-class manifest field (the list of covered FRs), so we need to decide whether the case ID also encodes a requirement ID, and if so, whether that's validated. The case-ID regex also has to be settled.

What you need to know: Current docs-example IDs are plain lowercase kebab slugs (`run-string-interpolation`, `generate-router`), validated by `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$` in `test/docs/example-manifest.ts:5`. The spec's proposed `FR-CLI-RUN-001-basic-run` mixes an uppercase FR prefix with a lowercase descriptor — it wouldn't match the current pattern, and it is now stale anyway (FR IDs became `RUN-FR-0001` in P1). Each case already carries `requirementIds: [...]` as the authoritative traceability link. The spec says case IDs "do not need to be as stable as functional requirement IDs" (line 199). A case may legitimately cover multiple requirements (spec lines 286–288), so "the primary requirement ID" is not always well-defined.

Choice: Option 1 — case ID is a pure descriptive lowercase kebab slug with no embedded FR ID (e.g. `string-interpolation`, `basic-run`, `generate-force-overwrite`), keeping the regex `^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`. Traceability lives solely in the `requirementIds` field. To preserve diagnostics, the runner must include the case's `requirementIds` in failure output (in addition to the existing `[<id>] <field>` context).

Rationale: `requirementIds` is already the authoritative, multi-value link; embedding a single "primary" ID in the case ID would duplicate it and force an artificial primary-requirement concept onto cases that cover several FRs, plus a validation rule that fails in confusing ways. A pure slug keeps the case layer free to be renamed/split/reorganized (spec lines 106–108) without ever touching an FR ID. The self-documenting-diagnostics benefit of embedding is recovered cheaply by printing `requirementIds` in failure output. This overrides the spec's case-ID example, which must be rewritten.

## P3: Does the default `bun run test` run the e2e suite, or only `test:e2e`?

Point: The spec keeps `"test": "vitest run"` and adds `"test:e2e": "vitest run test/e2e"`. Since `vitest run` globs the whole `test/` tree, the e2e suite runs inside the default `test` command too — `test:e2e` is just a path-filtered subset. We should confirm that's intended, because the alternative (excluding e2e from the default run) is a deliberate config choice the planner needs to know up front.

What you need to know: The e2e suite spawns a real `bun src/cli/index.ts` subprocess per case (~21 cases), each copying a fixture into a tmpdir — heavier and slower than the in-process unit tests, with different failure modes (subprocess, filesystem, tmpdir). The spec itself acknowledges the overlap (lines 357–359): "If `bun run test` already includes the e2e suite … `test:e2e` still remains useful as a focused command." The project's verification set (and CLAUDE.md Notes) already runs several commands sequentially and lists both `bun run test` and `bun run test:e2e`, so both are in the gate regardless.

Choice: Option 1 — the default `bun run test` (`vitest run`) runs everything including `test/e2e`; `test:e2e` (`vitest run test/e2e`) is a convenience subset, not a separate surface. No vitest exclude/project split.

Rationale: ~21 short-lived subprocesses across vitest's parallel workers costs only a few seconds — not enough to justify splitting the test surface and risking a default `test` that silently skips e2e. If the e2e suite ever grows slow enough to hurt the inner loop, adding a vitest `exclude`/project split is a trivial later change. The verification list keeps both commands; the second is redundant-but-harmless under this choice.

## P4: The version case couples to the literal package version (`0.1.0`)

Point: The current version example asserts exact stdout `"0.1.0 (dev)\n"` (`docs/examples/version/example.yml`). The manifest only supports exact `stdout`/`stdoutFile` matching — there is no substring or pattern matcher. So this case breaks on every `package.json` version bump, even though bumping the version is legitimate and changes nothing about the behavior under test. The spec's migration list calls for "version output shape" (line 379), which implies asserting the contract, not a frozen number.

What you need to know: The v1 contract (CLAUDE.md): `--version` prints `<package version> (<git short SHA>)`, or `(dev)` when run from source/tests. The e2e runner executes from source (`bun src/cli/index.ts`), so the SHA half is always the literal `dev` — already deterministic. Only the version number half is volatile. `src/cli/version.ts` imports the repo's `package.json` directly, so it reports the repo version regardless of the temp cwd. The harness already has a placeholder mechanism (`{{projectRoot}}`, `{{cwd}}`) expanded only in expected output, and the spec explicitly says the runner "may preserve" and (by implication) extend it (lines 314–324). Every other migrated case is deterministic: help output is version-independent (Commander help lists the `--version` option, not its value), and error/stderr assertions are fixed strings (with paths handled by `{{projectRoot}}`). So version is the only case with this problem.

Choice: Option 3 — add a `{{version}}` test-harness placeholder that expands to the repo's `package.json` version, and assert the version case with exact stdout `"{{version}} (dev)\n"`. No general regex/substring matcher is added.

Rationale: This tests the real contract — output = current package version + space + (sha-or-`dev`) — exactly and deterministically, while surviving version bumps (`dev` stays literal because e2e runs from source). It is strictly more faithful than a loose regex and avoids adding a general matcher feature nothing else needs (version is the sole volatile case — YAGNI). It is a one-placeholder extension of placeholder machinery the spec already keeps. `{{version}}` joins `{{projectRoot}}` and `{{cwd}}` as a test-harness-only placeholder, expanded only in expected stdout/stderr/files/substrings, unrelated to Skillrouter template interpolation.

## P5: Requirement granularity and the coverage unit (acceptance criteria become first-class)

Point: The spec lists 21 behaviors to migrate (lines 375–397) and the FR areas, but leaves the actual requirement records to implementation. The load-bearing decision is the granularity rule: when do related behaviors collapse into one FR (with several e2e cases) versus split into separate FRs? Without a stated rule, the registry's shape is arbitrary and the planner can't derive it deterministically.

What you need to know: A case may cover multiple requirements, and the spec says not to require one case per requirement (lines 286–288), so FRs and cases are deliberately many-to-many. The 21 migration behaviors map to existing example dirs roughly 1:1, but several are clearly variations of one promise: `boolean-true/false/bare` (three forms of boolean flag parsing), `include-escape-rejected/env-rejected` (two instances of "unsafe includes are rejected"), and `help-root/help-run` (help for the program vs a command). A few are genuinely ambiguous about which area they belong to — notably `invalid-enum-value` (flag-syntax error, or input-value-constraint error?).

An initial proposed rule was: "one FR per distinct product promise — a behavior a user or agent would name and reason about on its own; variations that prove the same promise are multiple e2e cases under one FR, not separate FRs; errors fold into the feature area they constrain." Applying that rule yielded a concrete 19-FR / 21-case table:

| FR ID | Promise | e2e case(s) |
|---|---|---|
| `RUN-FR-0001` | Run renders a skill template | `basic-run` |
| `INPUT-FR-0001` | String input interpolates into output | `string-interpolation` |
| `INPUT-FR-0002` | Missing optional input interpolates as empty | `missing-optional-interpolation` |
| `INPUT-FR-0003` | Missing required input is rejected | `missing-required-input` |
| `INPUT-FR-0004` | Value outside an enum input's allowed set is rejected | `invalid-enum-value` |
| `FLAGS-FR-0001` ⇄ | Boolean inputs accept bare / `=true` / `=false` forms | `boolean-bare`, `boolean-true`, `boolean-false` |
| `FLAGS-FR-0002` | Unknown flag is rejected | `unknown-flag` |
| `FLAGS-FR-0003` | Duplicate flag is rejected | `duplicate-flag` |
| `COND-FR-0001` | Enum input selects an if/else-if/else branch | `enum-branch` |
| `COND-FR-0002` | Missing optional input takes the false branch | `missing-optional-condition` |
| `INCLUDE-FR-0001` | `include` renders a fragment | `include-fragment` |
| `INCLUDE-FR-0002` | `include-raw` emits verbatim text | `include-raw` |
| `INCLUDE-FR-0003` ⇄ | Unsafe includes are rejected | `include-escape-rejected`, `include-env-rejected` |
| `GEN-FR-0001` | `generate` writes a router skill | `generate-router` |
| `GEN-FR-0002` | `generate` requires `--out` | `generate-missing-out` |
| `GEN-FR-0003` | `generate` refuses overwrite without `--force` | `generate-overwrite-refused` |
| `GEN-FR-0004` | `generate --force` overwrites | `generate-force` |
| `HELP-FR-0001` ⇄ | CLI prints help for the program and each command | `help-root`, `help-run` |
| `VERSION-FR-0001` | Version prints package version and build SHA | `version` |

The user then surfaced a false-positive concern with this model: with FR-level traceability ("active FR has ≥1 covering case"), a multi-promise FR like `FLAGS-FR-0001` (boolean bare/=true/=false) could be marked "covered" by a single case proving only the bare form. The traceability check would pass while the requirement is only partially implemented. The user's stated workflow is: write a requirement, write a test that defines the behavior, then let an AI agent or teammate implement until the test passes; "green ⇒ requirement met" must hold. The user asked whether to enforce something tighter than many-to-many, or whether the FR layer is even pulling its weight given the test already encodes the intent.

An external expert was consulted. Their reply (paraphrased): the goal is sound but should be restated narrowly — green means "every active executable acceptance criterion is satisfied," not "the natural-language requirement is universally true." The fix is to promote acceptance criteria to first-class traceability targets: each AC gets an ID nested under its FR, cases link to AC refs (not FR refs), the build fails when any active AC is uncovered, and an FR is "covered" only when all its active ACs are covered. The expert recommended renaming `requirementIds` → `covers`, disallowing bare FR refs in `covers`, and keeping the FR registry for stable handles, lifecycle (active/deferred/removed), gap reporting, and agent-promptability. They explicitly endorsed sticking with YAML + Vitest + real subprocess over Gherkin/Cucumber.

Choice: Adopt the acceptance-criteria-as-first-class-traceability-target model, overriding the v3 spec's FR-level coverage rule.

- The FR registry stays, with the 19-FR structure above intact.
- Each FR's `acceptance` becomes a list of records with explicit IDs: `{ id: AC-NNNN, statement: "<observable, finite acceptance statement>" }`, replacing the spec's plain-string `acceptance` list.
- AC IDs use the format `AC-NNNN` — 4-digit, zero-padded, **scoped per FR** (each FR's ACs start at `AC-0001`; numbering does not leak across FRs). Matches the 4-digit width discipline from P1.
- The composite reference for a single AC is `<FR-ID>.AC-NNNN` (dot separator), e.g. `FLAGS-FR-0001.AC-0002`.
- The case manifest's traceability field is renamed `requirementIds` → `covers`. Entries are AC refs only; bare FR IDs are rejected by the validator.
- Traceability rules under this model:
  - Every `active` FR's every AC must have ≥1 covering case.
  - Every case must list ≥1 entry in `covers`, each resolving to an existing AC on an FR that is not `removed`.
  - Referencing a `removed` AC (or a `removed` FR) fails validation, same as the spec's existing rule for removed FRs.
  - An FR's "covered" status is derived from its ACs for diagnostics; it is not a stored field.
- A case may still cover multiple ACs simultaneously when one CLI invocation legitimately proves several observable promises (e.g. `RUN-FR-0001` basic-run's three ACs — exit 0, rendered stdout, empty stderr — are all covered by one case). Many-to-many stays; the unit got tighter.
- For the four judgment calls flagged in the original proposal, the AC-level model makes them safe and the original groupings stand: `FLAGS-FR-0001` boolean forms keeps three ACs, `INCLUDE-FR-0003` unsafe includes keeps two ACs, `HELP-FR-0001` help keeps two ACs (root + run), and `invalid-enum-value` remains under `INPUT` as input value-constraint validation (not flag syntax).

Rationale: The user's "green ⇒ requirement met" guarantee only holds if the coverage unit is observable and finite. ACs are observable by construction; FRs are not (prose can be arbitrarily broad). Promoting ACs to first-class traceability targets closes the false-positive hole without splitting every multi-promise FR into single-promise atoms, which would explode the registry and lose the natural grouping that makes FRs useful for human/agent reasoning. The FR layer earns its keep by carrying lifecycle, stable handles, and grouping; the AC layer carries the executable certification. Renaming to `covers` and disallowing bare FR refs prevents backsliding into the coarse-mode bug. This is a deliberate revision of the v3 spec, which defined traceability at the FR level and `acceptance` as plain strings; both must be rewritten.

## P6: How the schema's "must reject" rules and traceability failures are tested

Point: The spec is prescriptive about what the validator must reject — 12 rejection rules for case manifests (lines 250–264) and 9 traceability failure conditions (lines 273–284, plus the new AC-level rules from P5). The spec doesn't say how those rejections are tested. There's a real fork: unit-test the validator function with bad inputs (the project's current pattern in `test/docs/example-manifest.test.ts`), or add negative-fixture directories under `test/e2e/cases-bad/` that the loader is expected to reject. The planner needs to know which.

What you need to know: The current docs harness already follows the unit-test pattern. `test/docs/example-manifest.test.ts` enumerates bad inputs as TypeScript objects/YAML strings and asserts the validator throws with a recognizable message — no fixture dirs. The validator (`test/docs/example-manifest.ts`) is pure and throws structured errors like `<filePath> (<id>): <detail>`, so calling it directly in tests gives the same error you'd see in production. The acceptance section of the spec (lines 484–488) frames the negative scenarios as manual verifications ("a reviewer can intentionally break a case expectation"), not automated negative fixtures. A happy-path integration test (loader walks a real fixture tree and produces the expected count of cases/FRs) is still useful to catch wiring regressions.

Choice: Option 1 — unit-test the validator function with bad inputs for each rejection rule (both case-manifest rules and traceability rules), plus one happy-path integration test that loads the real `requirements/` + `test/e2e/cases/` tree and asserts it loads cleanly. No negative fixture directories.

Rationale: Matches the project's existing test pattern, keeps rejection rules enumerated in one readable place, and directly tests the only logic that decides rejection (the validator function). The loader is just `YAML.parse` + validator + a directory walk — all unit-testable without filesystem ceremony, and the happy-path integration test covers the wiring. Negative fixtures would scatter ~21+ rejection scenarios across small directories, slow the suite, and duplicate the validator's own unit assertions for no extra signal.

## P7: AGENTS.md / README.md edit scope

Point: The spec says to update AGENTS.md (lines 401–404) and README.md (line 404) but doesn't enumerate which sections must change or how much replacement content to add. AGENTS.md is read as a contract by future agents, so leaving stale claims or silent gaps will mislead them. The planner needs a concrete checklist of edit zones and a principle for replacement content.

What you need to know: Four stale zones, pinned exactly: (1) AGENTS.md lines 192–195 (Test Layout bullet) — "Executable documentation examples live under `docs/examples/` and are validated by `test/docs/`. Final-user docs pages live under `docs/site/`. Any user-facing command, output, generated file, or behavior shown in docs must be backed by an executable docs example or generated from one." (2) AGENTS.md lines 196–200 (VitePress placeholder paragraph) — "The VitePress docs site must render Skillrouter `{{...}}` placeholders literally. The docs Markdown config marks inline code as `v-pre`, and generated example code blocks are emitted with `v-pre`. Do not solve this by changing Vue's global delimiters in VitePress config; that breaks VitePress theme interpolation." (3) AGENTS.md lines 211–212 (Notes verification list) — `bun run docs:check` and `bun run docs:build` entries. (4) README.md lines 85–89 (Development section) — "The user documentation site lives in `docs/site/`. Executable documentation examples live in `docs/examples/`... `bun run docs:build` runs the example checks and then builds the VitePress site. The normal `bun run test` suite includes the docs example validation..."

Choice: Option 1 — surgical edit with replacement content in each of the four zones, calibrated to AGENTS.md's contract role. No other sections touched.

Replacement content must convey: `requirements/functional-requirements.yml` is the source of truth for product promises, with stable FR IDs (`<AREA>-FR-<NNNN>`) and ID-addressable acceptance criteria (`AC-NNNN` per FR). `test/e2e/cases/<case-id>/case.yml` proves ACs through the real CLI; case manifests use `covers: [<FR-ID>.AC-NNNN, …]`. Traceability fails when any active AC is uncovered or any case references a non-existent / removed AC. Verification commands list `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:e2e` — no `docs:*` scripts. No docs site, no VitePress.

Rationale: AGENTS.md is read as a contract; strip-only would leave the "how do I write a regression test?" question unanswered, which fails the file's stated purpose. Full rewrite risks blast radius beyond the stale zones. Surgical edits with concrete replacement content give future agents enough specifics to add/remove/audit a requirement or case without re-discovering conventions, while leaving every untouched section unchanged.
