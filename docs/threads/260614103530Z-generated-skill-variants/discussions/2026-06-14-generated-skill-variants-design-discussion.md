# Generated Skill Variants Design Discussion

This log records decisions about missing pieces and ambiguities in the locked-input generated skill variants proposal before writing the implementation spec.

## P1: Variant Definition And Addressing

Point: Decide whether variants are project-config-defined virtual template refs, and what syntax/shape identifies them.

What you need to know: Today `jastr run <template-ref>` accepts either a direct `.md` path or a named ref parsed as `demo` / `team/review`; `#` is not part of the current ref grammar ([packages/cli/src/templates/template-ref.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/templates/template-ref.ts:47)). Named runs load `.jastr/config.yml` and select only `inputs.<template-ref>` ([packages/cli/src/config.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/config.ts:6)), then merge config below CLI flags ([packages/cli/src/commands.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/commands.ts:23)). Generated Agent Skills currently embed exactly one `jastr run <template-ref>` command, optionally with `$ARGUMENTS` ([packages/cli/src/targets/agent-skill.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/targets/agent-skill.ts:165)).

Your proposed direction is strong because `jastr run demo#custom` makes the variant explicit at the call site and avoids pretending locked values are just "defaults." But I would not accept the exact sample shape:

```yaml
variants:
  demo:
    name: custom
    inputs:
      depth: deep
      dry-run: true
```

That shape says "variants" but permits only one obvious variant per template unless we invent a list or repeat `name` fields. The variant id should be a key, not a value. Also, I would not say user-assigned config values "no longer exist": the existing `inputs:` section is useful for overridable standing preferences. Variants should be extra and locked; `inputs:` should remain for overridable values.

Choice: Use project config variants as named-only virtual template refs, with nested variant ids such as `variants.demo.custom.inputs` and runtime syntax such as `jastr run demo#custom`. Do not support variants for direct `.md` calls such as `jastr run path/to/template.md`.

Rationale: This keeps variant definitions in `.jastr/config.yml`, where project-specific generated skill variants belong, and gives each variant a clear addressable identity without duplicating templates. Direct `.md` runs are excluded because variants depend on `.jastr/config.yml`, which the current product deliberately loads only for named template runs. The interaction between normal overridable `inputs.<template-ref>` values and locked `variants.<template-ref>.<variant-id>.inputs` is intentionally deferred to a later decision in this log.

## P2: Variants-Only Config Surface

Point: Decide whether this spec should preserve `.jastr/config.yml inputs:` or supersede it with a variants-only config model.

What you need to know: The current implementation and v2 spec already define `inputs.<template-ref>` as the way named runs receive overridable project config values. That behavior is documented in `README.md` and `AGENTS.md`, specified in the template defaults v2 spec, and covered by a dedicated config requirement file plus 14 `config-*` e2e cases. Removing `inputs:` is still viable because the project is private and early, but it is a real supersession: the new spec must say the generated-skill-variants contract replaces the previous `.jastr/config.yml inputs:` section, not merely extends it.

I accept your UX argument that having both `inputs:` and `variants:` may be too much surface area. The part I would push back on is using `#` as the special config key. In YAML, `#` is comment syntax unless quoted, and `variants.demo."#"` is too clever for a config format. If this path is chosen, use a normal reserved key like `default`.

Choice: Preserve `.jastr/config.yml inputs:` and add `variants.<template-ref>.<variant-id>.locked-inputs`. For variant runs, `inputs.<template-ref>` remains a baseline overridable preference layer, while `locked-inputs` supplies locked specialization values. If `inputs.<template-ref>` contains the same input as the selected variant's `locked-inputs`, the run does not error; the locked value takes precedence.

Rationale: This keeps the existing config feature for ordinary preferences while making variant specialization visibly different through `locked-inputs`. Allowing `inputs` to duplicate a locked key avoids noisy conflicts when a user has broad project preferences and wants a variant to override one of them. The trade-off is that the proposal's original "duplicates fail" principle must be narrowed: config baseline duplicates are resolved by precedence, while runtime duplicate handling still needs its own decision.

## P3: Runtime Duplicates Against Locked Inputs

Point: Decide what happens when `jastr run demo#custom` receives a CLI flag for an input locked by `variants.demo.custom.locked-inputs`.

What you need to know: Baseline config duplication is now settled: `inputs.demo.depth` can coexist with `variants.demo.custom.locked-inputs.depth`, and the locked value wins without error. CLI flags are different because they come from the immediate invocation. The original proposal's central safety property was that locked inputs are "always supplied by the generated variant and user-supplied duplicates fail instead of silently overriding." Generated Agent Skill wrappers forward `$ARGUMENTS` for templates with inputs, so a user or agent can still pass `--depth=quick` unless the CLI deliberately blocks it.

Current CLI flag parsing already rejects duplicate flags within one invocation, but only generically, before variants exist ([packages/cli/src/flags.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/flags.ts:8)). This decision is about a different conflict: a user-supplied CLI flag duplicate of a variant-locked key.

Choice: A CLI flag for an input locked by the selected variant is a stable error. For example, `jastr run demo#custom --depth=quick` fails if `variants.demo.custom.locked-inputs.depth` is defined. Baseline config duplicates under `inputs.demo` are still allowed and overridden by the locked value.

Rationale: Invocation-time arguments represent explicit user or agent intent, so silently ignoring them would be misleading. Ambient project config is different: it can be safely overridden by a more specific selected variant. The implementation spec must make this distinction explicit with code comments near the merge/conflict logic and with dedicated functional requirements and acceptance criteria.

## P4: Variant Agent Skill Metadata

Point: Decide how generated Agent Skill variants get their own `name` and `description`.

What you need to know: Today `generate agent-skill` requires the source template to declare one `targets.agent-skill.frontmatter.name` and `description`, validates them, and copies extra frontmatter fields into the generated wrapper ([packages/cli/src/targets/agent-skill.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/targets/agent-skill.ts:20)). If `jastr generate agent-skill demo#custom --out ...` uses the base template's metadata unchanged, two generated skills from the same template would have the same Agent Skill identity, which is not acceptable in practice.

Because variants live in `.jastr/config.yml`, this is also a config-schema question. We need enough variant metadata to generate a real distinct `SKILL.md` without adding template copies or new target blocks in frontmatter.

Choice: Variant Agent Skill metadata is optional. A variant may define `variants.<template-ref>.<variant-id>.agent-skill.frontmatter` with `name`, `description`, and other allowed frontmatter fields to override the base template's `targets.agent-skill.frontmatter` for generated wrappers. If omitted, `jastr run <template>#<variant>` still works, and `jastr generate agent-skill <template>#<variant>` falls back to the base template's `targets.agent-skill.frontmatter`.

Rationale: A variant is first a runnable virtual named template ref, not necessarily a generated Agent Skill. Requiring Agent Skill metadata for every variant would force users to create skill-generation metadata even when they only want `jastr run demo#custom`. Note: I recommended requiring explicit variant metadata for generateable variants because fallback metadata can produce duplicate Agent Skill names/descriptions across base and variant wrappers; the user accepted that trade-off and prefers optional override metadata.

## P5: Variant Ref Grammar And Config Keys

Point: Decide the exact grammar for variant refs and config keys, including grouped templates.

What you need to know: Named template refs currently allow only `demo` or `team/review`, where each segment matches the existing lowercase kebab-case template id grammar ([packages/cli/src/templates/template-ref.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/templates/template-ref.ts:86)). Existing config uses exact named refs as keys under `inputs`, including grouped keys like `team/review` ([docs/threads/260612215058Z-template-input-defaults/specs/260613125936Z-v2-spec.md](/Users/jacopo/Developer/projects/personal/tools/jastr/docs/threads/260612215058Z-template-input-defaults/specs/260613125936Z-v2-spec.md:174)). That exact-key model avoids nested group parsing inside YAML.

For variants, the user-facing ref has two identifiers: base template ref and variant id. `team/review#deep` is readable, but the parser must reject malformed forms like `demo#`, `demo#deep#extra`, `path.md#deep`, `bad/ref/shape#deep`, and probably `demo#Deep`.

Choice: Define variant refs as named-only `<template-ref>#<variant-id>`. Config uses exact `<template-ref>` keys under `variants`, including grouped keys such as `team/review`. Variant ids use the same lowercase kebab-case grammar as existing template id segments.

Rationale: This keeps `inputs:` and `variants:` parallel: `inputs["team/review"]` and `variants["team/review"].deep`. Reusing exact named-template keys also avoids inventing nested YAML semantics for grouped templates and keeps invalid variant refs easy to diagnose.

## P6: Config Validation Scope For Variants

Point: Decide how much of `.jastr/config.yml variants:` is validated during a run or generate command.

What you need to know: Existing `inputs:` validation is intentionally selected-entry-only: unknown top-level keys are ignored, `inputs` must be a mapping if present, and only `inputs.<selected-template-ref>` is shape-validated for the current run ([docs/threads/260612215058Z-template-input-defaults/specs/260613125936Z-v2-spec.md](/Users/jacopo/Developer/projects/personal/tools/jastr/docs/threads/260612215058Z-template-input-defaults/specs/260613125936Z-v2-spec.md:214)). That prevents a broken config entry for another template from breaking unrelated runs. Variants can follow the same model, but there is a new wrinkle: to decide whether `demo#custom` exists, the CLI must inspect `variants.demo.custom`.

The spec needs to say whether malformed unrelated variants break commands. Example: `jastr run demo#custom` should probably not fail because `variants.other.bad` is malformed. But if `variants.demo.custom.locked-inputs` is not a mapping, that selected variant must fail.

Choice: Use selected-only validation for variants. `variants` must be a mapping when present. `variants.<selected-template-ref>` is validated only when selecting a variant for that template. `variants.<selected-template-ref>.<variant-id>` must be a mapping for the selected variant. The selected variant's `locked-inputs` and optional `agent-skill.frontmatter` are validated strictly. Unrelated templates and variants are ignored during the command.

Rationale: This matches existing config ergonomics and keeps `.jastr/config.yml` draft-friendly. A malformed unused variant should not break unrelated runs, while the selected variant path must be strict enough to produce deterministic behavior and stable errors.

## P7: Variant Value Validation And Missing Variants

Point: Decide which component validates variant locked values and what errors users see for missing or invalid variants.

What you need to know: Existing config values are not fully type-validated by the CLI. The CLI loads YAML, checks selected config shape, merges, and lets the engine validate unknown input names, requiredness, types, and enum membership. This is important because invalid baseline config values can be overridden by CLI flags before validation. Variant locked values are different in two ways: they cannot be overridden by CLI flags, and they are not part of template frontmatter, so the engine does not know they are "locked"; it only sees final supplied inputs.

For selected variant values, we can still reuse engine validation by merging `locked-inputs` into the final supplied input map after conflict checks. Missing variant identity, however, is a CLI config/reference error because the engine only knows templates and inputs.

Choice: The CLI validates only variant config shape, missing selected variants, and CLI flag conflicts with locked inputs. Selected `locked-inputs` are merged into the supplied input map and validated by the engine for unknown input names, value types, enum membership, requiredness, and defaults.

Rationale: This preserves the existing engine/CLI boundary and avoids duplicating input domain validation in the CLI. The trade-off is that invalid locked values produce existing engine-style input errors rather than path-specific config errors, but that is consistent with how selected `.jastr/config.yml inputs` values are validated today.

## P8: Stable Error Messages

Point: Decide the stable error messages for variant-specific failures.

What you need to know: Jastr's CLI error UX is stable `Error: <message>` output with exit code 1. Most CLI-owned failures use `JastrError` codes from the engine package's shared error type ([packages/engine/src/errors.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/engine/src/errors.ts:1)), and the CLI formatter prints only the message ([packages/cli/src/errors.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/errors.ts:3)). Existing command-shape messaging still says `jastr run <template-ref>` ([packages/cli/src/args.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/args.ts:7)), so adding `#` syntax also needs help/error text updates.

The final spec should pin exact messages for at least: malformed variant ref, missing selected variant, malformed selected variant config shape, malformed selected `locked-inputs`, malformed selected `agent-skill` override, and CLI flag conflict with locked inputs.

Choice: Pin concise exact messages in the spec:

- Invalid variant ref grammar uses the existing invalid template reference family, updated to mention variant refs: `Template reference <ref> must be a template id, a group/template id, a template id#variant id, a group/template id#variant id, or a .md file path.`
- Missing selected variant: `Variant <template-ref>#<variant-id> was not found in .jastr/config.yml.`
- Non-mapping `variants`: `.jastr/config.yml variants must be a mapping.`
- Non-mapping selected template variants entry: `.jastr/config.yml variants.<template-ref> must be a mapping.`
- Non-mapping selected variant: `.jastr/config.yml variants.<template-ref>.<variant-id> must be a mapping.`
- Non-mapping selected locked inputs: `.jastr/config.yml variants.<template-ref>.<variant-id>.locked-inputs must be a mapping.`
- CLI locked conflict: `Input --<input-name> is locked by variant <template-ref>#<variant-id>.`

Rationale: Exact message contracts make the feature junior-dev-ready and directly testable in e2e cases. Grouped refs may appear with slashes inside config-path messages, but that matches the existing `.jastr/config.yml inputs.team/review` message style. Variant Agent Skill override validation may reuse existing target metadata validation where appropriate, but selected override shape errors still need stable config-path messages.

## P9: Generated Wrapper Command For Variants

Point: Decide what command `jastr generate agent-skill demo#custom --out ...` writes into the generated `SKILL.md`.

What you need to know: Current wrappers are intentionally minimal: if the source template declares inputs, the command is `jastr run <template-ref> $ARGUMENTS`; otherwise it is `jastr run <template-ref>` ([packages/cli/src/targets/agent-skill.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/targets/agent-skill.ts:165)). The existing defaults/config spec says generation must not inspect `.jastr/config.yml` to decide whether to remove `$ARGUMENTS` for input-bearing templates ([docs/threads/260612215058Z-template-input-defaults/specs/260613125936Z-v2-spec.md](/Users/jacopo/Developer/projects/personal/tools/jastr/docs/threads/260612215058Z-template-input-defaults/specs/260613125936Z-v2-spec.md:318)).

Variants complicate this because some inputs are locked and should be hidden from the generated skill's public surface. But today the wrapper body does not list inputs explicitly; it only forwards `$ARGUMENTS` when the template has any inputs at all. If all inputs are locked by a variant, forwarding `$ARGUMENTS` invites users to pass flags that will all error.

Choice: Variant Agent Skill generation is variant-aware. It writes `jastr run <template-ref>#<variant-id> $ARGUMENTS` only when the base template has at least one input not listed in the selected variant's `locked-inputs`. If all base-template inputs are locked, it writes `jastr run <template-ref>#<variant-id>` with no `$ARGUMENTS`.

Rationale: Generated variants should expose only the unlocked public input surface. This is a deliberate exception to the earlier rule that normal generation does not inspect `.jastr/config.yml` to decide wrapper content: variant generation already must load the selected variant to know it exists, validate it, and apply optional metadata overrides. The implementation spec must include dedicated functional requirements and acceptance criteria for both wrapper command shapes.

## P10: Static Render Validation During Variant Generation

Point: Decide what input values `jastr generate agent-skill demo#custom` uses for its static render validation pass.

What you need to know: Current generation validates the template and includes by rendering once with synthetic sample values for every declared input ([packages/cli/src/commands.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/commands.ts:89)). For variants, selected `locked-inputs` are real semantic values. If generation ignores them during static render, it may validate a branch that the variant will never take and miss a branch that it always will take.

Example: `locked-inputs.language: typescript` should cause generation to validate the TypeScript include branch, not a synthetic enum first-value branch if that differs.

Choice: Variant generation render-validation uses real selected `locked-inputs` for locked keys and synthetic sample values only for unlocked inputs.

Rationale: This keeps generation convenient while making locked values meaningful during validation. A generated variant should not pass validation against a branch it can never use while skipping the branch selected by its locked inputs.

## P11: Locked Input Name Scope

Point: Decide whether `locked-inputs` may include keys that are not declared template inputs.

What you need to know: The engine already rejects unknown supplied input names as `Input <name> is not declared.` after merge. That means `locked-inputs` can technically rely on engine validation for unknown names (P7). But P9 uses the set of locked keys to decide whether `$ARGUMENTS` is forwarded. If a variant locks a nonexistent key, the generation logic could miscount unlocked inputs unless it validates through the engine before building content.

There is also a usability issue: allowing undeclared locked keys to get as far as engine validation is okay, but the spec should still state they are invalid. Otherwise a junior dev may treat `locked-inputs` as arbitrary metadata.

Choice: Every selected `locked-inputs` key must correspond to a declared template input. The implementation may enforce this through the existing engine validation path for selected variants rather than adding a separate CLI pre-check.

Rationale: This gives the spec a clear contract while preserving the P7 engine/CLI boundary. The junior implementer must ensure selected locked values are validated before a run or generate command succeeds, especially before generation uses locked keys to decide whether `$ARGUMENTS` should be forwarded.

## P12: Help Text And Command Shape Wording

Point: Decide how much CLI help and command-shape text should change for variant refs.

What you need to know: Current help describes `<template-ref>` as `Template id or .md file path` for both `run` and `generate` ([packages/cli/src/commands/run.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/commands/run.ts:5), [packages/cli/src/commands/generate.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/commands/generate.ts:4)). The top-level invalid command message currently says `jastr run <template-ref> [input flags...] or jastr generate agent-skill <template-ref> --out <path> [--force]` ([packages/cli/src/args.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/args.ts:7)). If variants are real user-facing refs, hiding them from help will make the feature feel accidental.

But help also should not become a mini spec. We need a concise label that covers named refs, variant refs, and direct `.md` paths.

Choice: Update run/generate help argument descriptions to mention template variants with `#` syntax. The argument description should be along the lines of `Template id, template variant (<id>#<variant>), or .md file path`. Keep detailed config examples in README and living docs. The invalid template reference message follows the P8 decision.

Rationale: This makes the new syntax discoverable from CLI help without bloating help output with full config documentation.

## P13: Requirement Organization

Point: Decide where the new functional requirements for variants should live.

What you need to know: Current CLI functional requirements are area files under `packages/cli/requirements/functional/`, with existing files for run, flags, inputs, config, generate, help, etc. Variants touch multiple areas: run behavior, config validation, CLI flag conflicts, and generate output. We can either spread FRs across existing area files or create a new variants area file.

Spreading keeps each FR near its command area, but this feature is cross-cutting enough that a junior implementer may miss cases. A dedicated file makes the variant contract easier to review and trace in living docs.

Choice: Use a middle-ground ownership rule. Create a new `packages/cli/requirements/functional/12-variants.yml` only for behavior that makes no sense without variants: `jastr run <template>#<variant>` resolution, named-only variant refs, P5 grammar, selected variant config lookup, `locked-inputs` precedence over baseline `inputs`, CLI locked-input conflicts, missing selected variants, and selected-only variant validation. Put area-specific effects in existing files: `06-generate.yml` owns `generate agent-skill <template>#<variant>`, optional variant Agent Skill metadata overrides, fallback to base metadata, variant-aware `$ARGUMENTS`, and locked-value static render validation; `07-help.yml` owns help text mentioning `#` syntax. Avoid duplicating the same acceptance criterion in multiple files.

Rationale: This avoids the bad precedent where every cross-cutting feature gets a standalone file and duplicate requirements. The new variants file is justified by a new user-facing concept, while existing command-area files continue to own changes to their command contracts.

## P14: Documentation And Spec Supersession

Point: Decide which existing docs/spec claims the final variant spec must update or explicitly supersede.

What you need to know: The new decisions change documented behavior in at least three places. `AGENTS.md` and `README.md` currently describe `jastr run <template-ref>` and config precedence without variants; `AGENTS.md` also says generated wrappers use `jastr run <template-ref> $ARGUMENTS` whenever the template declares inputs. The template-defaults v2 spec says generation must not inspect `.jastr/config.yml` to decide wrapper content; P9 creates a variant-specific exception. The final spec must not leave these claims stale, because future agents treat `AGENTS.md` as a contract and the old spec will otherwise conflict with the new one.

Choice: The final spec must include a Supersedes/Updates section that explicitly names the old-contract overrides: named refs may include `#<variant-id>` for variants; named variant runs may merge baseline `inputs.<template-ref>` with selected `variants.<template-ref>.<variant-id>.locked-inputs`; variant generation may inspect `.jastr/config.yml`; and variant generated wrappers use unlocked-input-aware `$ARGUMENTS` behavior.

Rationale: This preserves historical specs while making the active contract unambiguous for implementers and future agents. Implementation must also update `AGENTS.md`, `README.md`, functional requirements, e2e cases, and living docs so public and agent-facing documentation does not contradict the new behavior.

## P15: Variant Agent Skill Metadata Merge Semantics

Point: Decide how optional `variants.<template>.<variant>.agent-skill.frontmatter` merges with base `targets.agent-skill.frontmatter`.

What you need to know: P4 settled that variant Agent Skill metadata is optional and generation falls back to base template metadata. The remaining ambiguity is whether the override is all-or-nothing or field-by-field. Existing target validation requires base `name` and `description`, validates extra frontmatter fields, and builds the wrapper from the final frontmatter object ([packages/cli/src/targets/agent-skill.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/targets/agent-skill.ts:57)).

Your last comment said name and description are optional "per se" because defaults come from the main `TEMPLATE.md`. That implies field-level merge: a variant can override only `name` or only `description`.

Choice: Use field-level shallow merge for variant Agent Skill frontmatter. Start from validated base `targets.agent-skill.frontmatter`, overlay any fields from `variants.<template-ref>.<variant-id>.agent-skill.frontmatter`, then validate the merged result with the same Agent Skill metadata rules and reserved-field rules. A variant may override only `name`, only `description`, only extra fields, or any combination.

Rationale: Shallow field-level merge matches the intended optional override behavior without adding deletion semantics or deep-merge complexity. If a variant wants different nested `metadata`, it must provide the whole replacement `metadata` mapping.

## P16: Empty Variants And Unknown Fields

Point: Decide whether empty variants are valid, and whether selected variant entries reject unknown fields.

What you need to know: These are separate choices. Allowing this is fine:

```yaml
variants:
  demo:
    custom: {}
```

It means `demo#custom` is a named alias over `demo` unless later fields are added. But allowing arbitrary unknown fields in the selected variant makes typos silent. The implementation can still stay simple: parse the selected variant as a mapping, check its keys against the known set, default missing `locked-inputs` to `{}`, and default missing `agent-skill` to no override.

Choice: Empty variants are valid. `locked-inputs` and `agent-skill` are both optional. Unknown fields in the selected variant entry are rejected.

Rationale: This supports alias variants and keeps `locked-inputs` naturally optional, while preserving strictness where user mistakes are costly. A misspelled selected field such as `locked-input` must not silently turn a locked variant into an empty alias.

## P17: Variant `agent-skill` Shape

Point: Decide the exact allowed shape for `variants.<template>.<variant>.agent-skill`.

What you need to know: P15 settled shallow frontmatter merge, but not whether `agent-skill` may contain fields other than `frontmatter`. Existing template target metadata allows only `targets.agent-skill.frontmatter`; unknown target fields are rejected ([packages/cli/src/targets/agent-skill.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/targets/agent-skill.ts:18)). Keeping the variant override parallel reduces mental load.

Example intended shape:

```yaml
variants:
  demo:
    custom:
      agent-skill:
        frontmatter:
          name: custom-review
```

Questionable shape:

```yaml
variants:
  demo:
    custom:
      agent-skill:
        name: custom-review
```

Choice: Variant `agent-skill` overrides mirror existing `targets.agent-skill` shape. The selected `agent-skill` value must be a mapping whose only allowed field is `frontmatter`. When present, `frontmatter` must be a mapping. Unknown fields under the selected `agent-skill` are rejected.

Rationale: This keeps variant metadata structurally parallel with template target metadata and avoids adding a second flattened Agent Skill metadata shape.

## P18: Final Variant Precedence Order

Point: State the final effective input precedence for `jastr run demo#custom`.

What you need to know: We have decided pieces of precedence across P2, P3, P7, and P16, but the final spec needs one explicit ordered list. Existing named runs are CLI flags over `inputs.<template-ref>` over frontmatter defaults. Variant runs add selected `locked-inputs`, with two special rules: CLI flags for locked keys fail, while baseline `inputs` duplicates are allowed and overridden.

The order must also handle empty/alias variants: if selected `locked-inputs` is omitted or empty, the variant run should behave like the base named run, except it uses the variant ref identity where relevant for generation/help/errors.

Choice: Variant run precedence is locked inputs over CLI flags over baseline config inputs over frontmatter defaults. The implementation must first collect selected locked keys and reject CLI flags for those keys. After that conflict pre-check, the supplied map is built as baseline `inputs.<template-ref>` overwritten by CLI flags, then overwritten by selected `locked-inputs`; the engine then applies frontmatter defaults.

Rationale: This captures both concepts precisely: locked values have the highest effective precedence, but direct CLI attempts to set locked keys fail instead of being silently overridden. Empty or alias variants naturally reduce to the existing named-run behavior because there are no locked keys to add or reject.

## P19: Base Agent Skill Metadata Requirement

Point: Decide whether `jastr generate agent-skill demo#custom` requires the base template to declare `targets.agent-skill`.

What you need to know: Current generation is template-owned: `executeGenerate` validates `schema.targets["agent-skill"]` before writing, and missing metadata fails with `Template must declare targets.agent-skill metadata for generate agent-skill.` ([packages/cli/src/commands.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/commands.ts:81), [packages/cli/src/targets/agent-skill.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/targets/agent-skill.ts:18)). P15 chose a shallow merge starting from base frontmatter, which also assumes base metadata exists.

If we allow a variant to provide all Agent Skill metadata when the base template has none, `.jastr/config.yml` becomes an alternate place to define a generation target, not just override a base target. That is more flexible, but it changes ownership of Agent Skill metadata from template-first to config-can-create.

Choice: Normal `jastr generate agent-skill <template-ref>` keeps the existing behavior and requires valid base `targets.agent-skill.frontmatter`. Variant generation uses a merged Agent Skill frontmatter object as its input: start from base `targets.agent-skill.frontmatter` when present, treat missing base metadata as empty for selected variant generation only, shallow-merge selected variant `agent-skill.frontmatter`, then require the merged result to pass normal Agent Skill metadata validation. In practical terms, a selected variant can supply the `name` and `description` needed to generate its wrapper even if the base template does not declare `targets.agent-skill`.

Rationale: The generation command's real invariant is that it needs one valid Agent Skill frontmatter object before writing a wrapper. For base generation, that object comes from the template target. For variant generation, it can be constructed from the additive sum of base and selected variant frontmatter. This follows the additive config model while keeping normal non-variant generation unchanged.

## P20: Strict Variant Field Error Messages

Point: Decide exact stable messages for unknown selected variant fields and malformed selected `agent-skill` override shape.

What you need to know: P16 says selected variant entries reject unknown fields. P17 says selected `agent-skill` allows only `frontmatter`, and `frontmatter` must be a mapping. P8 pinned several variant messages, but not these. Existing config messages name the config path, while target metadata messages name `targets.agent-skill...`. Since these failures are in `.jastr/config.yml`, config-path messages will be clearer and easier to trace in e2e cases.

Choice: Pin config-path-specific messages:

- Unknown selected variant field: `.jastr/config.yml variants.<template-ref>.<variant-id> field <field> is not supported.`
- Non-mapping selected `agent-skill`: `.jastr/config.yml variants.<template-ref>.<variant-id>.agent-skill must be a mapping.`
- Unknown selected `agent-skill` field: `.jastr/config.yml variants.<template-ref>.<variant-id>.agent-skill field <field> is not supported.`
- Non-mapping selected variant frontmatter: `.jastr/config.yml variants.<template-ref>.<variant-id>.agent-skill.frontmatter must be a mapping.`

Rationale: Config-path-specific messages make selected variant strictness easy to debug and test. The implementation may still share internal validation helpers, but public errors for malformed config data should identify `.jastr/config.yml`, not the template `targets.agent-skill` path.

## P21: Generated Wrapper Body For Unlocked Inputs

Point: Decide whether variant-generated `SKILL.md` wrappers should list or describe remaining unlocked inputs.

What you need to know: The proposal explicitly asked whether generated variant wrappers should list only remaining unlocked inputs. Today generated wrappers are intentionally minimal: frontmatter, one `jastr run ...` command, and the failure instruction ([packages/cli/src/targets/agent-skill.ts](/Users/jacopo/Developer/projects/personal/tools/jastr/packages/cli/src/targets/agent-skill.ts:176)). They do not list template inputs at all. P9 already makes the command variant-aware: `$ARGUMENTS` is included only when at least one input remains unlocked.

Adding an input list would be a new generated-document feature, not just a variant feature. It would require deciding how to render types, enum values, requiredness, defaults, and maybe baseline config. That is useful eventually, but it is more surface area than needed for locked variants.

Choice: Keep generated wrapper bodies minimal. Variant wrappers differ only in command shape (`jastr run <template-ref>#<variant-id>` with or without `$ARGUMENTS`) and optional merged frontmatter. They do not list or describe remaining unlocked inputs.

Rationale: P9 already handles the key locked-surface behavior by omitting `$ARGUMENTS` for fully locked variants. Richer generated input documentation is already planned as a separate feature and should be designed consistently for all generated skills, not introduced only for variants.

## P22: No Implicit Default Variant

Point: Decide whether `jastr run demo` ever selects a special variant such as `variants.demo.default`.

What you need to know: Early in the discussion, one possible replacement for `inputs.demo` was a special default variant that bare `jastr run demo` would trigger. P2 rejected replacing `inputs:` and kept coexistence instead. P18 says empty variants are aliases when called with `#`, but it does not explicitly say whether a variant named `default` has special behavior.

Leaving this implicit could confuse implementation: `variants.demo.default` might accidentally become special because the word "default" came up earlier. If we keep `inputs:` as the baseline preference layer, bare runs should stay simple.

Choice: There is no implicit default variant. `jastr run <template-ref>` never selects a variant and uses only normal named-run behavior: CLI flags over `inputs.<template-ref>` over frontmatter defaults. A variant id named `default` has no reserved meaning and is selected only by explicit refs such as `jastr run demo#default`.

Rationale: Since `inputs:` remains the baseline preference layer, `#` syntax should be the only way to select a variant. This preserves existing bare named-run behavior and prevents `default` from becoming an accidental reserved variant id.

## P23: Variant Error Codes

Point: Decide which `JastrError` codes variant-owned failures should use.

What you need to know: The CLI prints only error messages, but the codebase also has a typed `JastrErrorCode` union. Existing config parse/shape failures use `invalid_config`; invalid ref grammar uses `invalid_template_reference`; target metadata failures use `invalid_target_metadata`; duplicate CLI flags use `duplicate_input_flag`. Variant failures sit across those categories, so leaving codes unspecified creates implementation drift.

Choice: Reuse existing error codes where the existing category fits, and add new codes where it does not. Use this exact mapping:

- Invalid variant ref grammar: `invalid_template_reference`.
- Malformed `variants` structures and unknown selected config fields: `invalid_config`.
- Merged Agent Skill frontmatter validation failures: `invalid_target_metadata` / `missing_target_metadata` through the existing validator, as applicable.
- CLI flag conflicts with locked inputs: new `locked_input_flag`.
- Missing selected variant: new `variant_not_found`.

Rationale: This avoids adding new codes for ordinary config/ref/target failures while not overloading existing codes where the meaning would be misleading. `duplicate_input_flag` means the same flag appeared twice in CLI args; a locked-input conflict is different. A missing selected variant is a failed virtual ref lookup, not malformed config.
