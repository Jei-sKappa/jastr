# Template Input Defaults Design Discussion

Discussion of missing pieces and ambiguities in the template input defaults proposal before writing a final implementation spec.

## P1: Config Scope for Direct Template Runs

Point: Should the final spec include an explicit config-file option for direct `.md` runs, while keeping automatic `.jastr/config.yml` discovery limited to named refs?

What you need to know: Current `run` syntax is `jastr run <template-ref> [input flags...]`, and Commander passes unknown options after the template ref through to Jastr’s own `parseRunFlags`. This is deliberate because input flags are template-specific, not Commander options. Adding a global `--config` after `<template-ref>` collides with possible template input names, especially an input literally named `config`. A command-level option before the template ref avoids that collision but creates a slightly less natural invocation shape, for example `jastr run --input-config prefs.yml templates/review.md --depth=quick`.

Named mode should still not be described as merely a wrapper around direct mode: it owns stable identity, `.jastr` project discovery, named/grouped lookup, and default config keying. Direct mode can share the lower-level render pipeline, but it does not have equivalent identity unless a config file is supplied explicitly.

Choice: Add a command-level explicit input config option for v1, with named automatic discovery as the fallback.

Rationale: Direct `.md` users need a way to provide standing preferences without requiring `.jastr` discovery, but the option must not collide with template input flags. The spec should require the config option to appear as a command-level option before `<template-ref>`. Named access still automatically discovers `.jastr/config.yml` when no explicit input config is provided; when an explicit config is provided, it overrides automatic config discovery as the selected user preference source.

## P2: Input Value Precedence

Point: What exact precedence should the spec use once there are three possible input sources: CLI flags, explicit input config, automatic named config, and template-author defaults?

What you need to know: The proposal already says `CLI flag > config value > frontmatter default`. P1 adds a second way to get config values: explicit command-level input config and automatic `.jastr/config.yml` for named refs. We need to decide whether explicit and automatic config can both participate or whether exactly one config source is active per run.

If both participate, a named run could merge `.jastr/config.yml` with `--input-config team-local.yml`. That sounds flexible, but it creates harder-to-debug behavior because one omitted value might come from the project config while another comes from the explicit file. If exactly one config source is active, the mental model is simpler: explicit config replaces automatic discovery; otherwise named refs may use automatic config; direct refs use no config unless explicit.

Choice: Use one active config source per run.

Rationale: The deterministic and debuggable merge order is `CLI flags > selected input config > template-author defaults`, where selected input config is the explicit command-level input config when present, otherwise automatic `.jastr/config.yml` for named refs only. Explicit config replaces automatic discovery rather than layering over it. This avoids hidden mixed-source behavior while preserving the core override model.

## P3: Supersede Explicit Config for V1

Point: Should the spec supersede the earlier explicit input config decision and drop `--input-config` from v1?

What you need to know: The explicit config option looked attractive because it gave direct `.md` runs a low-level way to receive standing preferences without `.jastr` discovery. The next design question exposed the cost: explicit config either needs a separate flat file shape for the current invocation or reintroduces unstable direct-template identity keys. Keeping v1 config automatic and `.jastr`-scoped avoids that problem entirely because one project config can use named template refs as stable keys.

This supersedes P1 and simplifies P2. In v1, named refs may use automatic `.jastr/config.yml`; direct `.md` refs do not use user config values. The remaining precedence is `CLI flags > .jastr/config.yml value > template-author default` for named refs, and `CLI flags > template-author default` for direct refs.

Choice: Drop the explicit input config option from v1.

Rationale: The explicit option adds a second config shape or fragile direct path identity before there is enough need to justify it. Named config remains keyed by stable template identity inside `.jastr`, while direct templates stay portable and rely on CLI flags plus template-author defaults. This intentionally leaves direct standing preferences out of v1.

## P4: Config File Shape and Naming

Point: What exact `.jastr` config shape should v1 use for user standing input values?

What you need to know: With explicit config dropped, the config file is always project-local and discovered from `.jastr`, so it can be keyed only by stable named refs. Standalone named templates use one segment like `review`; grouped named templates use `group/template-id`, matching the command users run. This means there is no path-keying problem.

The remaining naming issue is whether the top-level key should be called `inputs`, `defaults`, `presets`, or something else. I would avoid `defaults` because template-author defaults are a separate concept. The user config values are supplied inputs, not schema defaults.

A likely shape is:

```yaml
inputs:
  review:
    depth: standard
    output: chat
  team/review:
    depth: deep
```

Choice: Use `.jastr/config.yml` with top-level `inputs`.

Rationale: The config file is project-scoped and can grow future project-level categories, while `inputs` remains a concise name for standing input values. The spec must avoid calling this section `defaults` because template-author defaults are a separate schema concept.

## P5: Stale or Unknown Config Entries

Point: What should happen when `.jastr/config.yml` names an input that the selected template does not declare?

What you need to know: Current engine validation rejects unknown input names when values are passed into `validateTemplateInputs`: `Input <name> is not declared.` The CLI has a more user-facing version for unknown flags: `Unknown input flag --<name>.` This strictness catches typos immediately. With config, an unknown configured input usually means either a typo in `.jastr/config.yml` or template drift, for example the template renamed `depth` to `review-depth`.

There are two scopes to distinguish:

```yaml
inputs:
  review:
    depth: standard
    stale-name: old
  other-template:
    old-input: value
```

For `jastr run review`, `review.stale-name` is relevant to the selected template and could be rejected. `other-template.old-input` belongs to a different template key and should not affect this run, otherwise one broken config entry would break unrelated templates.

Choice: Be strict only within the selected template's config entry.

Rationale: This preserves today's strict input behavior for the template being run, catching typos and stale input names where they affect output. Entries for other template refs should not be validated during this run, because one broken config section should not block unrelated templates.

## P6: Invalid Config Values Overridden by CLI Flags

Point: If `.jastr/config.yml` contains an invalid value for an input, but the user supplies a valid CLI flag for that same input, should the run fail or should the CLI flag mask the invalid config value?

What you need to know: The precedence model says CLI flags win over config values. But validation can happen either before or after precedence is applied.

Example:

```yaml
inputs:
  review:
    depth: typo
```

Template schema:

```yaml
inputs:
  depth:
    type: enum
    values: [quick, standard, deep]
    required: false
```

Command:

```bash
jastr run review --depth=deep
```

If we validate the whole selected config entry, this fails because `typo` is invalid. If we merge first and validate only winning values, this succeeds because the effective value is `deep`.

Choice: Validate only effective values after precedence.

Rationale: The effective input set is what determines rendering, so an explicit CLI flag should be able to repair a bad standing config value for that run. The final spec must make this behavior explicit with an ad-hoc functional requirement, and the implementation should include a focused code comment at the merge/validation point so future maintainers do not accidentally "clean up" the behavior into pre-validating overridden config values.

## P7: Template-Author Default Location

Point: Should template-author defaults live in `TEMPLATE.md` frontmatter, or should v1 use a separate template-local defaults file?

What you need to know: We rejected merging author defaults with user standing values, but there is still a separate design choice: where author-owned defaults live. The original proposal puts them in frontmatter:

```yaml
inputs:
  depth:
    type: enum
    values: [quick, standard, deep]
    required: false
    default: standard
```

That keeps the input contract and fallback behavior in one file. A separate author defaults file beside `TEMPLATE.md` would package cleanly with template folders, but it splits the schema across files and forces the CLI or engine to load extra files before knowing the full input contract. It also complicates direct source rendering through `@jastr/engine`, which currently renders from explicit source text and inputs, not a template folder.

Choice: Keep template-author defaults in frontmatter.

Rationale: Author defaults are part of the template schema and should live with the input contract. This keeps direct source rendering viable, avoids an additional file-loading responsibility, and preserves the separation between template-owned fallback values and project-owned standing input values.

## P8: Defaults on Required Inputs

Point: Should `default:` be allowed on `required: true` inputs?

What you need to know: The proposal says defaults are valid only with `required: false`, because `required: true` means a value must come from the caller or selected user config. If `required: true` also has a default, then "required" becomes misleading: the template can run with no caller/user value.

There is a possible alternative: treat `required: true` as "must have an effective value from any source," including default. But at that point every defaulted input is functionally optional. This would force readers to inspect both fields to understand requiredness.

Choice: Reject `default:` on `required: true`.

Rationale: This preserves a crisp meaning for `required`: a required input must be supplied by CLI flag or selected user config. A defaulted input is optional by definition. If Jastr later needs "suggested but must confirm" semantics, that should be a separate feature rather than overloading `default`.

## P9: Default Value Type Rules

Point: How strict should schema validation be for frontmatter `default:` values?

What you need to know: Existing input values are typed as `string | boolean`. Current validation rejects non-boolean values for boolean inputs, non-string values for string/enum inputs, empty strings, and enum values outside the declared set. Defaults are schema, not runtime flags, so invalid defaults should be caught by `validateTemplateSchema` before rendering.

Examples to pin:

```yaml
inputs:
  dry-run:
    type: boolean
    required: false
    default: true
  language:
    type: enum
    values: [typescript, python]
    required: false
    default: typescript
  target-file:
    type: string
    required: false
    default: src/index.ts
```

Ambiguous cases are empty string defaults, quoted boolean-like strings for boolean inputs (`default: "true"`), and enum defaults not in `values`.

Choice: Use the same domain rules as runtime input values.

Rationale: Boolean defaults must be YAML booleans; string and enum defaults must be non-empty strings; enum defaults must be in `values`. This keeps schema validation consistent with runtime input validation and catches invalid templates before rendering.

## P10: Where Defaults Are Applied

Point: Should `@jastr/engine` apply frontmatter defaults inside `validateTemplateInputs`, or should the CLI merge defaults before calling the engine?

What you need to know: `@jastr/engine` owns schema validation and direct source rendering. `renderTemplateSource` currently parses the source, validates schema, calls `validateTemplateInputs`, and renders from the returned values. The CLI currently also parses schema to validate flags before calling `renderTemplateSource`, so there is already some duplication at the boundary.

If defaults are applied only in the CLI, direct TypeScript consumers of `@jastr/engine` would not get template-author defaults unless they reimplement merging. That is a bad split because defaults are part of the template schema, not CLI policy. User config is different: config discovery/reading belongs in CLI, and the CLI can pass selected config values as normal input values.

Choice: Apply frontmatter defaults in the engine.

Rationale: Template-author defaults are schema semantics, so `validateTemplateInputs(schema, suppliedInputs)` should return effective values including defaults, and `renderTemplateSource` should render from those effective values. The CLI remains responsible for filesystem config discovery and flag/config value preparation.

## P11: CLI Config Validation Responsibility

Point: Should the CLI pre-validate `.jastr/config.yml` values against the template schema, or should it merge selected config values with CLI flags and let the engine validate the effective input set?

What you need to know: P6 decided that invalid config values overridden by CLI flags should not fail. P10 decided that the engine applies template defaults while validating inputs. That implies the CLI should not validate the entire selected config entry before precedence. But the CLI still has responsibilities the engine cannot own: reading YAML, validating config file shape, selecting the `inputs.<template-ref>` entry, coercing YAML config values into `TemplateInputValues`, parsing/coercing CLI flags, and enforcing unknown selected config names if they survive into the effective input set.

One nuance: CLI flags are strings/bare booleans and currently get CLI-specific error wording like `Invalid value ruby for --language. Expected one of: ...`. Config values can be native YAML booleans/strings and should probably use config-specific error wording when they are the winning value.

Choice: CLI parses shape and merges, engine validates effective values.

Rationale: This honors P6 by validating only the effective supplied input set after CLI flags override config values. The CLI owns filesystem/YAML/config selection and merge mechanics; the engine remains the source of truth for unknown input names, value types, requiredness, and template-author defaults. The spec should avoid duplicating enum/type validation in the CLI unless a later UX requirement explicitly needs source-specific wording.

## P12: Missing and Malformed Project Config

Point: How should `jastr run <named-ref>` behave when `.jastr/config.yml` is absent, empty, malformed, or structurally invalid?

What you need to know: Named template lookup already requires a `.jastr` directory, but today `.jastr` contains only template directories. With v1 config, `.jastr/config.yml` should be optional; otherwise every existing named template project would break. But if the file exists and is malformed, silently ignoring it is dangerous because the user intended to supply standing values.

There are several states:

```text
.jastr/                    # no config.yml
.jastr/config.yml          # empty file
.jastr/config.yml          # invalid YAML
.jastr/config.yml          # YAML parses, but top-level value is not a mapping
.jastr/config.yml          # inputs exists, but is not a mapping
.jastr/config.yml          # inputs.review exists, but is not a mapping
```

Choice: Absent and empty mean no config; malformed and invalid shape error.

Rationale: This preserves backward compatibility for existing projects and allows harmless placeholder config files, while still failing loudly when a non-empty config file cannot be parsed or has a shape that Jastr cannot interpret deterministically.

## P13: Grouped Template Config Keys

Point: How should `.jastr/config.yml` key standing input values for grouped named templates?

What you need to know: Current named template refs have two stable forms: standalone `review` and grouped `team/review`. Grouped lookup maps `team/review` to `<project-root>/team/templates/review/TEMPLATE.md` and requires `<project-root>/team/.jastrgroup`. The user-facing command ref is already `team/review`, and `/` is not allowed inside a single template id segment, so this key is unambiguous.

Example:

```yaml
inputs:
  review:
    depth: standard
  team/review:
    depth: deep
```

Choice: Use the exact named template ref string as the key.

Rationale: The natural user-facing identity is the same string passed to `jastr run`, so standalone and grouped template config should be keyed by `review` and `team/review` respectively. This avoids a second naming scheme and keeps grouped config unambiguous.

## P14: Agent Skill Wrapper Arguments

Point: Should `jastr generate agent-skill` change wrapper commands based on template defaults or possible project config satisfaction?

What you need to know: Current wrapper generation includes `$ARGUMENTS` when the template declares any inputs, and omits it when the template declares no inputs. `AGENTS.md` documents this current rule. With defaults and config, some input-bearing templates can run bare:

- Optional input with frontmatter default: bare run works.
- Required input supplied by `.jastr/config.yml`: bare named run works in that project.
- Required input with no config: bare run fails.

But generation cannot reliably know the target runtime project config, especially if the wrapper is shared or generated before config exists. If it omits `$ARGUMENTS` just because current config satisfies inputs, it may produce a brittle wrapper that cannot accept overrides later.

Choice: Keep the current wrapper rule.

Rationale: If the template declares any inputs, the generated wrapper should keep `jastr run <template-ref> $ARGUMENTS`; if it declares no inputs, it should use bare `jastr run <template-ref>`. Defaults and config can make a run succeed without flags, but they should not remove the wrapper's ability to pass explicit arguments through. The final implementation should update `AGENTS.md` if its description of wrapper behavior or config support changes.

## P15: Required Inputs Satisfied by Project Config

Point: Should `.jastr/config.yml` be allowed to satisfy `required: true` inputs?

What you need to know: We already decided `default:` cannot satisfy required inputs, because defaults are author-provided and would make `required` meaningless. Project config is different: it is user/project-provided standing input. The original proposal explicitly allowed config to satisfy required inputs: `required` means "a value must arrive from somewhere," and config is one of those sources.

Example:

```yaml
# .jastr/config.yml
inputs:
  review:
    output: chat
```

```yaml
# .jastr/review/TEMPLATE.md
inputs:
  output:
    type: enum
    values: [chat, file]
    required: true
```

Then `jastr run review` can succeed, while `jastr run review` without that config would fail.

Choice: Allow project config to satisfy required inputs.

Rationale: Config values are user/project-supplied input values and should not care whether the schema marks an input required or optional. The important distinction is source ownership: author defaults cannot satisfy `required: true`, but project config can because it is an explicit standing input source.

## P16: Project Config Value Types

Point: Should `.jastr/config.yml` values use native YAML/domain types, or should the CLI coerce config strings the same way it coerces command-line flags?

What you need to know: CLI flags are text, so `--dry-run=true` is parsed from a string and coerced to boolean. YAML config is already typed: `dry-run: true` parses as boolean `true`, while `dry-run: "true"` parses as string `"true"`. P11 put final effective-value validation in the engine, whose domain values are currently `string | boolean`.

This means the spec needs to decide whether config should be strict YAML:

```yaml
inputs:
  review:
    dry-run: true      # boolean input OK
    output: chat       # enum/string input OK
```

or forgiving/string-coerced:

```yaml
inputs:
  review:
    dry-run: "true"    # accepted and coerced to boolean true
```

There is a trap in saying "same as flags": flags need coercion because the shell gives strings; config does not. Coercing config strings would make config looser than frontmatter defaults, where we already chose strict YAML/domain types.

Choice: Use strict YAML/domain types.

Rationale: Config is YAML, so users should write values in the same domain shape the engine validates: boolean inputs use YAML booleans, string and enum inputs use non-empty strings, and enum values must be in the declared set after precedence. This keeps config value validation consistent with frontmatter defaults and avoids duplicating CLI flag coercion for config files.

## P17: Unknown Root Keys in Project Config

Point: Should `.jastr/config.yml` allow unknown top-level keys, or reject anything except the recognized `inputs` section?

What you need to know: Template frontmatter currently ignores unknown root keys, while recognized structures are strict. For `.jastr/config.yml`, we chose the generic filename specifically so future config categories can exist. If v1 rejects every top-level key except `inputs`, then adding future categories becomes a breaking change for older CLIs. If v1 ignores unknown top-level keys, future config can be forward-compatible, while the recognized `inputs` section remains strict.

Example:

```yaml
inputs:
  review:
    depth: standard
future-setting:
  enabled: true
```

Choice: Ignore unknown top-level keys and strictly validate `inputs` if present.

Rationale: This matches template frontmatter behavior and preserves forward compatibility for future `.jastr/config.yml` categories. The final spec should include a dedicated functional requirement so this behavior is tested and does not regress into rejecting future root keys.

## P18: Optional Inputs Without Defaults

Point: Should existing behavior for optional inputs without defaults remain unchanged?

What you need to know: Today, optional inputs can be omitted. In conditions, a missing optional input is falsey. In interpolation, a missing optional input still errors with `Input <name> is optional and was not provided for interpolation.` A defaulted optional input would no longer be “missing” after engine validation, so conditions and interpolation should see the default value.

Example:

```yaml
inputs:
  dry-run:
    type: boolean
    required: false
  output:
    type: enum
    values: [chat, file]
    required: false
    default: chat
```

For `jastr run review`:
- `${dry-run}` in a condition remains falsey because no value/default exists.
- `{{dry-run}}` still errors if rendered.
- `${output} == 'chat'` is true because the default supplies `output`.
- `{{output}}` renders `chat`.

Choice: Preserve no-default optional behavior.

Rationale: Defaults are opt-in per input. `required: false` means the user does not have to supply the input; it does not imply a synthetic false or empty value. Only inputs that declare `default:` become effective values when omitted, while optional inputs without defaults retain the current absent-input behavior.
