# Show Available Template Inputs — Spec Design Decision Log

Resolving the open questions and ambiguities in
`proposals/260620171740Z-generated-router-skill-show-inputs-proposal-v2.md` so a
final spec can be handed off to a junior dev for implementation.

## P1: The agent-instruction contract — `$ARGUMENTS` vs. construct-flags

Point: The proposal's headline behavioral shift is "instruct the agent to construct flags" instead of forwarding raw `$ARGUMENTS`, but it explicitly defers *how* this coexists with the existing `$ARGUMENTS` passthrough contract. Everything else (section format, the bash block, which specs get amended) hangs off this decision, so it has to be settled first.

What you need to know: Today the generated body (`buildAgentSkillContent`, `packages/cli/src/targets/agent-skill.ts:182`) is literally: "Run this command and follow its output exactly:" then a bash block `jastr run <ref> $ARGUMENTS`, then "If the command exits non-zero, report the exact error output to the user and stop."

`$ARGUMENTS` is the Claude Code slash-command substitution token — it's replaced with whatever the user typed *after* the slash command before the agent acts. The catch: this passthrough only works when the user already typed valid jastr flags. If a user invokes the skill with natural language ("deploy to prod"), `$ARGUMENTS` becomes `deploy to prod`, the command becomes `jastr run deploy deploy to prod`, and `parseRunFlags` (`args.ts:68`) rejects it as invalid flag syntax. So the current passthrough is already weak for the exact natural-language case this proposal targets — that's the real motivation, not just "fewer validation round-trips."

The flag grammar the agent would construct against (from `flags.ts`/`args.ts`): strings/enums require `--name=value` (empty rejected), booleans are bare `--flag` (= true) or `--flag=true|false`, no `--no-` negation, duplicates rejected.

This is also where the determinism thesis bites: "construct flags" moves an interpretation step onto the agent. But the interpretation is bounded — the agent picks flag names and enum values from a closed documented set; jastr still validates and renders deterministically. The non-determinism is only in mapping NL→flags, which is unavoidable the moment a human invokes with prose.

Choice: A — Pure construct. Drop the literal `$ARGUMENTS` token entirely from the generator. The body lists a `## Inputs` section and instructs the agent to build the `jastr run <ref> --flag=value …` invocation from the user's request using only the documented inputs. Argument-less templates and fully-locked variants keep the existing bare `jastr run <ref>` line with no section.

Rationale: A makes the whole generator uniform — `$ARGUMENTS` disappears completely, so every wrapper is either a bare command or a constructed `--flag=value` line, matching how argument-less/fully-locked wrappers already behave. This fits the determinism/KISS ethos. Note: recommended B (hybrid: keep `$ARGUMENTS` as an explicit-flags channel plus the construct fallback) because it preserves verbatim passthrough for power users who slash-invoke with exact flags; user chose A and accepted that trade-off (the agent re-derives such flags by reading the request, which it reproduces in practice, so the cost is negligible).

## P2: Constraints and validation for the new per-input `description` field

Point: The proposal adds an optional `description` key under each input in `TEMPLATE.md` frontmatter, validated by the engine. It asks (open question 3) whether `description` should be single-line, length-capped, and non-empty when present. A junior dev needs exact rules to write the validator and its tests.

What you need to know: The field lands on `TemplateInputDefinition` (`packages/engine/src/schema.ts:3`) — all three variants (`string`, `boolean`, `enum`) get an optional `description?: string`. Validation goes in `validateInputDefinition` (`schema.ts:68`), alongside the existing checks.

There's precedent in the codebase for each constraint flavor: empty-string rejection in `validateStringDefault` rejecting `""` (`schema.ts:178`); trimmed-empty rejection + length cap in the agent-skill `description` rejecting `description.trim() === "" || description.length > 1024` (`agent-skill.ts:93`), with `compatibility` capped at 500 (`agent-skill.ts:152`).

The field renders into a single markdown bullet — `` - `--env` (enum: dev|prod, required) — target environment``. A newline in the value would break that bullet, so single-line isn't cosmetic; it's required for the body to stay well-formed and for `--check`'s byte comparison to stay deterministic.

Error code: this is a frontmatter schema defect caught in the engine, so it reuses the existing `malformed_schema` code (no new codes), consistent with every other input-definition check.

Choice: B — non-empty + single-line, no length cap. The validator rejects a non-string value, a value where `trim() === ""`, and a value containing `\n` or `\r`; it imposes no maximum length. Defect code is the existing `malformed_schema`.

Rationale: No cap is consistent with KISS/YAGNI; an over-long bullet is the template author's own foot, and since the value is echoed verbatim, dropping the cap doesn't threaten `--check` byte determinism. Single-line and non-empty are kept because they are required for a well-formed bullet, not cosmetic. Recommended A (same rules plus a 200-char cap for consistency with the other capped frontmatter strings); user judged the cap unnecessary.

## P3: Exact `## Inputs` rendering — list vs. table, bullet anatomy, ordering

Point: Open questions 4 and 6 in the proposal: pin the precise section format — bullet list vs. table, how required/optional/default/enum/description compose into each entry, and the rendering order. Since `--check` byte-compares the output, every character here is part of the contract; a junior dev can't guess it.

What you need to know: The sketch proposes a `## Inputs` heading followed by bullets like `` - `--env` (enum: dev|prod, required) — target environment``, `` - `--region` (string, optional, default: us-east-1) — deployment region``, `` - `--dry-run` (boolean, optional) — preview without applying``.

Constraints from the code: the engine enforces that only `required: false` inputs may carry a `default` (`schema.ts:89`), so `required` entries never have a default segment — the matrix is exactly three shapes: `(type, required)`, `(type, optional)`, `(type, optional, default: X)`. Booleans render their default as `true`/`false`; string/enum render the literal default string. Input order is YAML object insertion order from the template frontmatter — deterministic, so rendering iterates `Object.entries(schema.inputs)`; this must be pinned so `--check` is stable. Enum value separator: the engine uses `, ` everywhere else (`inputs.ts:84`, `schema.ts:197`), but inside the parenthetical the comma is already the field separator (`enum: dev, prod, required` reads ambiguously), so a pipe (`dev|prod`) avoids that collision.

Choice: A — bullet list, with this exact anatomy: `` - `--<name>` `` (backticked flag with leading `--`); then ` (` + type + `, ` + `required`|`optional` + (optional `, default: <value>`) + `)`, where type is `string` | `boolean` | `enum: <v1>|<v2>|…` (declared order, pipe-separated); then ` — <description>` appended only when declared (em dash, U+2014), omitted entirely otherwise. Inputs rendered in frontmatter declaration order.

Rationale: The wrappers are read by an agent, not browsed by a human in a wide terminal, so compactness and determinism beat the table's scannability; a table also goes ragged with the many optional/absent default and description cells this schema produces. Pipe separator chosen because the comma is already the field separator inside the parens; em dash chosen because `--check` compares UTF-8 bytes (non-ASCII is safe) and it won't be confused with the leading bullet `-`. Declaration order pinned for `--check` stability.

## P4: What replaces `$ARGUMENTS` in the command block

Point: Decision A (pure construct) removed the `$ARGUMENTS` token, but something has to take its place in the command block for input-bearing wrappers. The sketch shows a placeholder usage skeleton (`jastr run deploy --env=<...> [--region=<...>] [--dry-run]`), but that's explicitly "not a spec." A junior dev needs the exact rule for turning the schema into that line — including the awkward boolean case the sketch glosses over.

What you need to know: Under decision A the body for an input-bearing wrapper is, roughly: a `## Inputs` list (P3), then an instruction + command block, then the existing failure line. The question is what the command block contains now that `$ARGUMENTS` is gone. The flag grammar (`flags.ts`/`args.ts`): strings/enums are `--name=value` (empty rejected); booleans are bare `--name` (=true) or `--name=true|false`; no `--no-` form. The sketch's `[--dry-run]` (bare presence) can only express *true* — it gives the agent no way to pass `false`, which matters for a boolean whose default is `true` and a request to turn it off, so the sketch's boolean rendering is subtly lossy. Required vs optional is engine-known per input, and only optional inputs can carry defaults.

Choice: B — bare command + prose. The command block for an input-bearing wrapper is just `jastr run <ref>` (no flags, no `$ARGUMENTS`), and the construct-flags instruction prose points the agent at the `## Inputs` list to build `--flag=value` arguments (including every required input). This makes the command block byte-identical to the argument-less wrapper's; the `## Inputs` section + the construct prose are what distinguish an input-bearing wrapper. The exact instruction sentence is `--check`-sensitive and will be pinned verbatim in the final spec for byte-for-byte implementation.

Rationale: YAGNI — the placeholder skeleton (option A) is machinery to build only if agents are observed to make flag mistakes frequently, which the user doubts will happen given the `## Inputs` list already carries name/type/required/optional/default/description. The upgrade path from B to A is clean: it is a pure generator change with no schema or contract impact, so deferring A costs nothing. Recommended A for maximum first-try correctness (with a uniform `--name=<true|false>` boolean rule to fix the sketch's lossy `[--dry-run]`); user chose the leaner B and will revisit A only on evidence of frequent agent errors.

## P5: Locked inputs in variant wrappers — omit vs. show as fixed context

Point: The proposal says only still-open inputs belong in the `## Inputs` section, but it doesn't explicitly decide whether a variant's *locked* inputs should appear anywhere in the body as read-only context. That's a real fork, and it interacts with an existing error path, so it needs settling.

What you need to know: For a `<ref>#<variant>` wrapper, the variant's `locked-inputs` are baked into the rendered output already (merged via `mergeVariantInputs`, `variants.ts:29`) and the agent is forbidden from passing them — `assertNoLockedInputFlags` (`variants.ts:8`) raises `locked_input_flag` if the user supplies a locked flag. So any locked input shown in a way that reads as "settable" is an active footgun. The generator already computes the right gate: `hasUnlockedTemplateInputs(schema, lockedInputs)` (`variants.ts:60`, used at `commands.ts:165`). A fully-locked variant has no unlocked inputs, so under our rules it gets no `## Inputs` section and the existing bare `jastr run <ref>#<variant>` command — unchanged from today. Implementation note for the spec: rendering the section means `buildAgentSkillContent` now needs the actual (unlocked-filtered) input definitions, not just the `hasInputs: boolean` it gets today.

Choice: A — omit locked inputs entirely. The `## Inputs` section lists only unlocked inputs; locked inputs are completely invisible in the generated skill. Fully-locked variants keep today's bare-command, no-section behavior.

Rationale: This is what the variant feature was designed for from the start — the user created template variants specifically so locked inputs act as an invisible curation layer, and the skill must keep them completely transparent and not visible. It also matches the existing "bodies stay minimal" rule and eliminates the footgun of option B, where surfacing a locked input as read-only context risks the agent attempting to pass it and tripping `locked_input_flag`; B's transparency benefit is marginal since locked values are already reflected in the rendered output.

## P6: Spec form and scope — new spec vs. edit-in-place, and which refs get the section

Point: Open question 5: the proposal says "a new or updated spec is needed rather than a silent generator change," but doesn't decide the *form*. And it never explicitly confirms scope — whether direct `.md` wrappers get the `## Inputs` section too. Both need pinning before handoff, because they determine what files the junior dev creates/edits and what the AGENTS.md/README reconciliation looks like.

What you need to know: This feature touches the contracts in three existing specs: (1) package-split v2 — the generated wrapper body and the `$ARGUMENTS` line, which decision P1 directly contradicts; (2) generated-skill-variants v2 — lines 225–227 explicitly state "Generated wrapper bodies stay minimal… They do not list unlocked inputs," which decisions P3/P5 directly contradict, while its `$ARGUMENTS`-gating logic (lines 219–224) survives but is reinterpreted so the same gate controls whether the `## Inputs` section + construct prose appear; (3) input-defaults v2 — the input-definition recognized keys, which the new `description` key extends.

The established project pattern (per AGENTS.md) is: each thread owns its own spec, and a later spec supersedes the relevant rules of earlier specs via prose without editing the older spec files; then AGENTS.md is updated to add the new spec link and rewrite any bullets the change falsifies. Several bullets go stale here — the Project-section claims that wrappers "forward `$ARGUMENTS`," the variant-forwarding bullet, and the recognized-input-keys bullet. README also needs the `$ARGUMENTS`→construct update (the variants spec already obligated a README touch for wrapper behavior).

On scope: direct `.md` runs don't read config and have no variants, but they do declare inputs and do generate skills. The `hasInputs` gate for non-variant refs is already `Object.keys(schema.inputs).length > 0` (`commands.ts:164`). Excluding them would be surprising — an input-bearing `.md` template would silently lack the section that an identical named template shows.

Choice: A — one new v1 spec in this thread (`260531211938Z-…/specs/<stamp>-v1-spec.md`) that supersedes the relevant rules of the three prior specs via prose and lists the AGENTS.md + README + test/BEHAVIOR.md reconciliations as deliverables. Scope = every input-bearing template regardless of ref form (named, grouped, variant-unlocked, and direct `.md`). The spec states no new `JastrErrorCode` values and enumerates deliverables: engine `description` field + tests; generator `## Inputs` rendering + tests; new/updated functional requirements + e2e cases; regenerated `BEHAVIOR.md`; AGENTS.md bullet reconciliation; README update.

Rationale: Old threads are historical documents; work happens only in this new thread, which is exactly the repo's append-only, supersede-by-prose convention. Option B (editing the three old specs in place) would be the surprising deviation and would scatter this feature's contract across three files with no single source of truth. Direct `.md` inclusion follows from Principle of Least Astonishment — an input-bearing `.md` template should not silently lack a section an identical named template shows.
