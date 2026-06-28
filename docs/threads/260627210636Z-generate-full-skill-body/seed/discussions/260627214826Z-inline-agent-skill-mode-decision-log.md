# Decision log — fully-rendered self-contained skill generation (the seed)

Thread: docs/threads/260627210636Z-generate-full-skill-body/
Target: the seed (seed/seed.md) — genesis design discussion, pre-spec
Subject: designing how jastr emits a fully-rendered, self-contained `SKILL.md` (frontmatter + inlined body, no runtime `jastr` dependency) so it can be committed and distributed downstream where no jastr exists. Resolving the surface shape, input resolution, `argument-hint` handling, and error semantics before a spec is written.

## P1: Surface shape — new target vs. a mode of the existing `agent-skill` target

Point: What surface should the rendered-skill output take? The new mode must emit the same frontmatter the wrapper carries but with the fully-rendered body (includes inlined, conditionals resolved) underneath instead of the "go run jastr" stub, and inherit `--check` freshness and `validate` the same way the wrapper does.

What you need to know:

Grounding facts about the current code: (1) `targets` is a *closed* set in the engine — `validateTargets` (engine `schema.ts:259`) rejects any key but `agent-skill`, so a new `targets.skill` key would be an engine schema change. (2) The render pipeline already exists and is already called: `renderTemplateSource` (engine `render.ts:53`) returns the rendered body with no frontmatter, and both `generate agent-skill` and `validate` already invoke it — today with *sampled* inputs (`"sample"`, `false`, first enum value) purely for validation. (3) `generate agent-skill` takes no input flags today; only `run` passes flags through to a run-flag parser. The wrapper samples inputs and inlines required ones as literal `--name=<value>` placeholders. (4) Frontmatter assembly, the `--check` byte-compare (`checkAgentSkillOutput`, CLI `targets/agent-skill.ts:421`), and `validate` are cleanly separable from body generation. The biggest consequence: the new mode's input semantics differ fundamentally from the wrapper's — the wrapper never needs input *values* (it emits placeholders); a rendered skill needs every input *resolved* at generate time.

Three shapes were weighed. A — new first-class `targets.skill` + `jastr generate skill` (self-evident naming, but touches the engine and adds a parallel target block). B — a boolean `--inline` flag on `generate agent-skill` reusing `targets.agent-skill` (leanest, but a silent flag makes input handling mode-dependent — astonishing). C — a new `generate skill` command reusing `targets.agent-skill` config (no engine change, but command/target name asymmetry).

I initially recommended A. The user pushed back: a Claude Code "Agent Skill" *is* the standard artifact (`SKILL.md`), and both the router wrapper and the inline-rendered file are agent skills — so this is one target with two render modes, not two artifact types. "router" is also already this codebase's vocabulary (the `generated-router-skill-show-inputs` thread). The user proposed expressing the mode either as a flag (`--mode=router|inline`) or as two command names (`generate agent-skill-router` / `generate agent-skill-inline`).

Refined recommendation: an explicit, named `--mode=router|inline` flag on `generate agent-skill`, defaulting to `router`. Reasons: (1) it keeps `generate agent-skill` as the standard command and keeps the current `generate agent-skill <ref> --out` invocation working unchanged as `mode=router`, whereas two compound command names force the clean standard name to disappear or become an alias; (2) the two-command option's only genuine edge — one fixed input model per command — is recoverable with a single rule: template input flags are valid only in `inline` mode (router emits placeholders and needs no values, so passing input flags in router mode is an error). An explicit named mode also dissolves the earlier POLA objection, which was really an objection to a *silent* boolean flag. Rejected alternative: mode as template frontmatter (`targets.agent-skill.mode`) — mode is a generate-time output concern (it sits with `--out`/`--check`/`--force`), and the same template may be routed locally yet inlined for distribution.

Decision: Express the new output as a **mode of the existing `agent-skill` target**, not a new target or command. Add `--mode=router|inline` to `jastr generate agent-skill`, defaulting to `router` (preserves current behavior and the standard command name). `inline` renders the full body via the existing `renderTemplateSource` under the same `targets.agent-skill` frontmatter; `router` is today's wrapper stub. No new `targets.skill` and no engine schema change for this part. Mode is a CLI/generate-time flag, not template frontmatter. The *source* of resolved input values for inline mode (CLI flags vs. config.yml variants/inputs) is explicitly deferred to the next decision point.

Rationale: A Claude Code Agent Skill is the standard artifact and both outputs are agent skills, so one target with two modes is the honest model — recorded after I first recommended a separate `targets.skill` target and the user correctly corrected the framing (a real new fact about the domain, not mere preference). The explicit `--mode` flag beats two compound command names because it preserves the standard command name and backward-compatible default, and the two-command option's only advantage is recovered by the "input flags valid only in inline mode" rule. Chose a CLI flag over `targets.agent-skill.mode` because mode is a generate-time output concern and one template may be both routed and inlined. User agreed ("99%"); the sole reservation — whether inline inputs are passed as CLI flags or predefined via config.yml variants — is carried forward as the next decision point, not a dissent against this one.

## P2: Where `inline` mode gets its resolved input values

Point: Where does `inline` mode get its resolved input values? Inline rendering needs every input to have a concrete value at generate time (there is no downstream jastr to take flags), so the source of those values must be settled.

What you need to know:

The codebase already has four value sources, wired differently across commands: (1) Variant locked-inputs (`<ref>#<variant-id>` → `variants.<ref>.<variant-id>.locked-inputs`) — already resolved by both `run` and `generate agent-skill` today; the `review#spec` example uses this to pin `target=spec`. (2) config.yml `inputs.<ref>` (local + global, composed) — read by `run` today but NOT by `generate agent-skill` (generate only samples + applies variant locks). (3) CLI input flags (`--name=value`) — accepted by `run`, not by `generate`. (4) Template-author defaults — applied by the engine for optional inputs during validation/render.

Key fact: `run` already composes all four with a defined precedence — CLI flags > local config > global config > author defaults, plus variant locked-inputs that reject a conflicting CLI flag (`executeRun`, CLI `commands.ts:38`). And `run`'s resolution already hard-errors via the engine's `missing_required_input` when a required input ends up with no value. So whatever is chosen here also largely settles the "unresolved required input" question.

Options: A — variants/config only, `generate` accepts no input flags (fully declarative, `--check` reproduces with zero argv variance, but every render needs a variant or config entry, no ad-hoc one-off). B — CLI input flags only (explicit at the call site, but throws away the variant-lock machinery and duplicates run's flag parsing). C — reuse `run`'s resolution wholesale: inline mode = "`run` the template, then staple the agent-skill frontmatter on top," same precedence, same variant locked-input handling, same `missing_required_input` hard error; supports both declarative locking and ad-hoc flags for free.

Recommendation was C: "inline render = run + frontmatter header" is the most learnable and most DRY (reuses `executeRun`'s resolution path instead of inventing a second one) and least astonishing — `generate agent-skill --mode=inline <ref> [flags]` produces exactly what `jastr run <ref> [flags]` would, just wrapped. It subsumes two downstream questions: input flags are valid in inline mode (resolved per run's rules) and rejected in router mode, and an unresolved required input is already a hard error (`missing_required_input`) with no new code. The `--check` reproducibility worry only bites if ad-hoc flags are passed in CI; the fix mirrors router's today — commit the exact regen command (typically a stable variant ref).

Decision: Reuse `run`'s resolution wholesale (Option C). Inline mode resolves inputs through the same path `run` uses — CLI flags > local config > global config > author defaults, plus variant locked-inputs (a CLI flag conflicting with a locked input is rejected exactly as in `run`) — then renders via `renderTemplateSource` and wraps the result in the agent-skill frontmatter. An unresolved required input is a hard error reusing the engine's existing `missing_required_input` (no new error code for this). This confirms the P1 rule: input flags are accepted in `inline` mode and rejected in `router` mode.

Rationale: Maximal code reuse (the user's explicit priority — "great idea if we can reuse code") and a single learnable mental model: an inline skill is `run`'s output with a frontmatter header. It also avoids forcing the user's earlier either/or — declarative variant/config locking and ad-hoc CLI flags both work, because run's precedence already accommodates both. The only trade-off, `--check` reproducibility under ad-hoc flags, is non-novel (identical to the router workflow) and avoidable by relying on a variant ref. No dissent.

## P3: How `inline` mode populates `argument-hint`

Point: How does `inline` mode populate the `argument-hint` frontmatter field? (Reopened after an initial proposal to omit it entirely was corrected.)

What you need to know:

Correction that reframed the point: there are two distinct kinds of "input." (1) jastr template inputs (typed string/enum/boolean), resolved at generate time in inline mode (flags/variants/config/defaults) and baked into the body — gone by invocation time. (2) Claude Code runtime `$ARGUMENTS` — free-form text a user types when invoking the skill, which is NOT a jastr input; it is literal `$ARGUMENTS` text that passes through jastr untouched and is consumed by Claude Code at invocation. `argument-hint` describes #2, not #1. So an inline skill is not necessarily arg-less — a review skill whose rendered body says "Review the following: `$ARGUMENTS`" genuinely wants a hint like "What would you like to review?". The initial "omit entirely" proposal was wrong; the user correctly identified this.

Consequence: jastr cannot derive #2 (it has no typed notion of `$ARGUMENTS` — it is just body text), so an inline `argument-hint` can only be author-authored free-form text. The derived form (flag list) is doubly irrelevant in inline mode: there are no runtime flags, and mechanically every jastr input is resolved at generate time, so the set of inputs to surface as a form is empty by construction.

Options: A — reuse `argument-hint-prefix`; the derived form is empty in inline, so the existing `assembleArgumentHint(prefix, form)` (which already returns prefix-only when `form === ""`) yields the prefix verbatim as the whole hint, or omits the field when no prefix is set. Near-zero code: inline feeds the frontmatter builder an empty input list. B — a dedicated explicit inline-hint field (allow a literal `argument-hint` in `targets.agent-skill`, currently reserved against passthrough, used only by inline; router keeps deriving prefix+form) — explicit and supports divergent per-mode hints, but adds config surface, makes the `argument-hint` reservation mode-dependent, and makes a both-modes author juggle two keys. C — (bigger) model the free-form runtime argument as a first-class template concept so jastr derives the hint and validates the body references `$ARGUMENTS`; a whole new input category, out of scope.

Recommendation was A: it serves the review-skill example directly, is the natural behavior of existing code (empty form → prefix-only or omitted), and adds nothing to validate/document beyond clarifying that the derived "form" is router-only. B earns its keep only if the same template ships both router and inline modes with different hint text; C is deferred.

Decision: Option A. Inline mode reuses the existing `argument-hint-prefix`. Because every jastr input is resolved at generate time, inline's derived form is always empty, so the existing assembly produces the author prefix verbatim as the entire `argument-hint`, or omits the field when no prefix is set. No new config key, no new validation, no change to router behavior. Documented semantics: `argument-hint = [optional author prefix] + [derived form]`; router fills the form from unlocked inputs, inline has no form so the prefix stands alone.

Rationale: Minimal code (reuses `assembleArgumentHint` with an empty input list) and directly supports the natural-language hint use case the user raised, while keeping the field's reservation rules and validation identical across modes. Correction recorded above: `argument-hint` describes Claude Code runtime `$ARGUMENTS`, not jastr generate-time inputs, so the field is meaningful for inline skills; the user corrected the initial omit-entirely proposal. Option B (explicit per-mode hint field) deferred as YAGNI — justified only by a both-modes template wanting divergent hints, which the migration does not need (it is inline-oriented); Option C parked as out of scope. No dissent.

## P4: How `validate` and `--check`/error messaging treat inline mode (plus two contract details)

Point: How do `validate` and the `--check`/error messaging treat inline mode, and what are the remaining contract details (body↔frontmatter join, `--mode` value validation)?

What you need to know:

Two surrounding surfaces touch the new mode. (1) `validate <ref>` does a sampled static render plus validates `targets.agent-skill` metadata; it produces no output file and does not distinguish router from inline. (2) The `--check`/`output_missing`/`output_stale` messages currently hardcode a suggested-fix command like `jastr generate agent-skill <ref> --out <out>` (and `--force` for stale), which would regenerate the router stub — wrong for an inline file. Two further items are pure contract details: the exact body↔frontmatter join (must be byte-deterministic for `--check`) and `--mode` value validation.

Decision (all four confirmed as proposed):

1. `validate` stays mode-agnostic and unchanged — no `--mode` flag. It already exercises the render and the shared `targets.agent-skill` metadata; the call-specific "are all required inputs actually resolved?" check belongs to `generate --mode=inline` / `--check`, not to generic validation.

2. Inline-mode `--check`/`output_missing`/`output_stale` messages thread the mode through: their suggested-fix command reads `jastr generate agent-skill <ref> --out <out> --mode=inline` (plus `--force` for stale). The ref already carries any `#variant`; the message does NOT attempt to reconstruct arbitrary input flags (KISS — re-running the author's own command with `--force` suffices).

3. Body↔frontmatter join: `---\n<frontmatter yaml>\n---\n\n<rendered body>` — a fixed single blank line between the closing `---` and the body, with the body taken verbatim from `renderTemplateSource`. Byte-deterministic so `--check` is exact.

4. `--mode` validation: only `router` and `inline` are accepted; any other value, and `--mode` without a value, is `invalid_command`, consistent with the existing argv-shape errors.

Rationale: Each resolution favors reuse and the least astonishment — `validate` does not need to know a mode it cannot meaningfully check; the messaging stays honest by naming the mode that actually regenerates the file; the join is pinned so freshness comparison is deterministic; and `--mode` validation reuses the existing `invalid_command` argv-shape error rather than inventing a code. No new `JastrErrorCode` is introduced by the entire feature (the unresolved-required-input path reuses `missing_required_input` per P2). No dissent.



