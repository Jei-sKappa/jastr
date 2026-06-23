# Decision log — seed (argument-hint feature genesis)

Thread: docs/threads/260623191813Z-skill-argument-hint/
Target: the seed (seed/260623191813Z-skill-argument-hint-seed.md)
Subject: designing how `jastr generate agent-skill` produces the `argument-hint` frontmatter field for generated Agent Skill wrappers — composition model, rendering rules, author configuration, variant interaction, and `--check` impact — before a spec is written.

## P1: Where the `argument-hint` value comes from (composition model)

Point: The composition model — is the hint auto-derived from the template's inputs, author-written, or some combination? Everything else (rendering rules, variants, ordering) hangs off this.

What you need to know: The generated wrapper already auto-derives its body (4 shapes by input count) and its command (inline `--flag=<value>` for required inputs); an auto-derived `argument-hint` is consistent with that philosophy. A literal `argument-hint` declared in `targets.agent-skill.frontmatter` already passes through verbatim today (via `collectPassthroughFrontmatter` in `packages/cli/src/targets/agent-skill.ts`), so "full author control" is the current behavior, not new work. The seed sketched a prefix (author) + derived suffix (jastr) shape. Three options were presented: A — auto-derive only, reject author-declared hint; B — author prefix + derived suffix (the seed sketch); C — auto-derive by default, author literal overrides.

Decision: Adopt option C as the base (auto-derive the input-flag portion by default) AND add an author-declared **intent prefix** in the Agent Skill section of the frontmatter. jastr derives the flag portion; the author supplies the non-derivable intent text as a prefix.

Rationale: jastr can only derive the *form* of the arguments (the flags from the input schema), never a description of the template's *intent* — that is exactly what an autocomplete hint most wants to convey. Option A is therefore rejected (no way to express intent). Pure B is rejected in favor of C's derive-by-default base. The exact author-knob shape (whether a separate full-literal override coexists with the prefix), the prefix field's name/location, and the rendering rules are refined in the following points.

## P2: One author knob (prefix only) or two (prefix + full-literal override)?

Point: You said "C, but with the prefix." Option C's distinctive feature is a full-literal override (author writes the entire `argument-hint`, no derivation). The prefix is a second kind of author control. Do we keep both, or is the prefix the single knob?

What you need to know: Under "C + prefix" an author could be in three states: (1) nothing declared → hint = derived flags only (`--manifest <value> [--mode new|merge]`); (2) prefix `P` declared → hint = `P` + derived flags; (3) full literal `argument-hint` `L` declared → hint = `L` verbatim, no flags appended. State 3 is the only one that lets an author suppress or rewrite the derived flags. The stated reasoning — "intent isn't derivable, flags are" — is fully served by state 2 alone. State 3 only earns its keep if an author would ever want to hide the accurate auto-derived flags, which for an autocomplete hint is unlikely; CLAUDE.md leans hard on KISS/YAGNI, and two author-facing fields controlling one output line is a complexity smell (plus it forces a precedence rule and more `--check`/validation surface). Options: A — one knob (prefix only), derived flags always appended, no suppression, a literal `argument-hint` inside `frontmatter` rejected as jastr-managed; B — two knobs (prefix + full-literal override that wins verbatim).

Decision: A — one knob. A single author prefix field; the derived flag portion is always appended; there is no full-literal override. A literal `argument-hint` declared inside the agent-skill `frontmatter` is rejected (it becomes a jastr-managed field).

Rationale: Matches the P1 reasoning exactly (intent via prefix, form always derived and always accurate), honors KISS/YAGNI, and eliminates the "which field wins" precedence question. No concrete case was identified where hiding the true flags in the hint would be desirable.

## P3: Prefix field name and location

Point: The prefix needs a home in the template frontmatter. The name should be self-documenting, and the location decides whether per-variant override comes "for free" or becomes a deliberate later choice.

What you need to know: Today `targets.agent-skill` allows exactly one key, `frontmatter` (verbatim passthrough into the generated skill YAML; `name`/`description` validated, `inputs` forbidden, the rest passed through) — see `AGENT_SKILL_TARGET_FIELDS` and `collectPassthroughFrontmatter` in `packages/cli/src/targets/agent-skill.ts`. The prefix is jastr generation config, not a real Claude Code skill frontmatter field: jastr consumes it and emits the real `argument-hint`. Per P2 a literal `argument-hint` inside `frontmatter` is rejected, so the prefix needs a distinct name; `argument-hint-prefix` mirrors the emitted field and signals "flags get appended after this." Variant coupling: variant overrides flow through `agent-skill.frontmatter` (the merge at `packages/cli/src/commands.ts:145-151`), so a prefix inside `frontmatter` would be variant-overridable for free but would masquerade as passthrough and need stripping; a sibling key keeps the directive/passthrough split clean and makes per-variant override a separate decision. Options: A — sibling directive key `targets.agent-skill.argument-hint-prefix` (added to `AGENT_SKILL_TARGET_FIELDS`); B — `targets.agent-skill.frontmatter.argument-hint-prefix` inside frontmatter, stripped before emission.

Decision: A — a sibling directive key `targets.agent-skill.argument-hint-prefix`, added to the set of keys allowed directly under `targets.agent-skill`. Per-variant override of the prefix is deferred to its own point.

Rationale: Keeps the conceptual line crisp — `frontmatter` is "what lands in the skill verbatim," directives sit beside it — which matches least-astonishment. Per-variant override should be a chosen feature, not a side effect of where the key is hidden.

## P4: Rendering grammar for the derived flag portion

Point: Exactly how each unlocked input becomes a token in the hint — optionality, value placeholders, enums, booleans, separator, order.

What you need to know: The body command already renders required inputs as `jastr run <ref> --name=<value>` (uniform `<value>`, `=` separator, even for booleans — a deliberate choice in the command-inline-flags thread because that line is meant to be run). The argument-hint is a different surface: read during `/skill` autocomplete, not executed, so it can be more informative (show enum choices, booleans bare). The sketch used spaces (`--manifest <file>`) and bracketed optionals, but jastr's flag grammar requires `=` (`coerceRunFlags` rejects `--name value`) and the body command uses `=`, so a space-separated hint would teach syntax the tool does not accept. `<file>` implies per-input semantic placeholders, which jastr has no metadata for today (only name/type/required/default/description); adding one is scope creep.

Proposed grammar (unlocked inputs, declaration order, joined by single spaces): string → `--name=<value>` / `[--name=<value>]`; enum → `--name=a|b|c` / `[--name=a|b|c]`; boolean → `--name` / `[--name]`. Rules: required → bare token, optional → wrapped in `[ ]`; string → `<value>` placeholder; enum → values joined by `|`; boolean → flag name only (no placeholder). Three judgment calls flagged: (1) separator `=` not space (matches real grammar and body command, diverges from sketch); (2) booleans render bare `[--flag]` not `[--flag=<value>]` (diverges intentionally from the command's uniform `<value>`); (3) uniform `<value>` placeholder, not per-input `<file>`-style (no new metadata).

Decision: Accept the proposed grammar exactly as written, including all three judgment calls — separator `=`, bare booleans, uniform `<value>` placeholder, enums show pipe-joined values, optional inputs bracketed, required inputs bare, declaration order, single-space join.

Rationale: The `=` separator and uniform `<value>` keep the hint honest about jastr's real flag grammar and consistent with the runnable body command; bare booleans and pipe-joined enum values make the read-only hint maximally informative. Per-input placeholders are deferred (YAGNI) and can be added later without disturbing this grammar.

## P5: Assembly rules — joining, empty cases, and field position

Point: How prefix and derived flags combine into the emitted `argument-hint`, what happens in the empty cases, and where the field sits in the YAML.

What you need to know: With one knob (prefix) + always-appended derived flags, four states exist. `buildAgentSkillContent` emits frontmatter as `{ name, description, ...frontmatter }`, and `argument-hint` is now jastr-owned (never in passthrough), so jastr must decide where to insert it — which matters for `--check` byte-stability.

Decision: Accept the proposed rules. (1) Join: value = `<prefix> <derived>` joined by a single space when both present. (2) Prefix only (no unlocked inputs — zero-input template or a variant that locked everything): value = `<prefix>` alone. (3) Derived only (no prefix declared): value = `<derived>` alone. (4) Neither: omit the `argument-hint` field entirely. (5) Field position: insert immediately after `description`, so emitted order is `name`, `description`, `argument-hint`, then author passthrough `frontmatter` fields in their existing order. (6) Prefix used verbatim (single-line, non-empty per the validation point); join inserts exactly one space. This is independent of the four body shapes (A/B/C/D), which are unchanged; `argument-hint` is purely a frontmatter addition (a zero-input template, body Shape A, with a prefix still gets `argument-hint: <prefix>`).

Rationale: Omitting the field when there is nothing to hint avoids an empty/noise field; inserting after `description` follows conventional skill-frontmatter ordering and keeps output deterministic for byte-comparison.

## P6: Variant interaction — locked inputs and per-variant prefix

Point: Two things: (a) do locked inputs appear in a variant's hint, and (b) can a variant override the prefix?

What you need to know: The derived flags build from `listUnlockedTemplateInputs(schema, lockedInputs)` — the same helper the body uses (`packages/cli/src/commands.ts:163`) — so locked inputs drop out of the hint exactly as they drop out of the body and inline command. (a) is therefore a confirm, not a fork. (b): variants today override only `agent-skill.frontmatter` (`commands.ts:148-151`); the prefix is a sibling key (P3), so a variant's `frontmatter` override does not reach it. Per-variant prefix would add a symmetric `agent-skill.argument-hint-prefix` to the variant config schema. Tension: a variant can rebrand `name`/`description`, so without a prefix override a specialized variant inherits base intent text that may read slightly off — but `description` and the prefix serve different surfaces, so the mismatch is cosmetic. Options: A — no per-variant override in v1 (variant inherits base prefix; derived portion still adapts); B — add per-variant override now (symmetric key, replaces base when present).

Decision: (a) Locked inputs are excluded from the derived portion (confirmed). (b) B — add per-variant prefix override now: variant config gains `agent-skill.argument-hint-prefix`, symmetric with the base, replacing the base prefix when the variant declares it.

Rationale: User chose B explicitly — better to build it now while fully immersed in the feature with all details in mind than to context-switch back later. B is a clean additive, symmetric extension of the existing variant `agent-skill` override; the marginal schema/validation/test cost is small relative to the re-immersion cost.

## P7: Validation rules and the `argument-hint` reservation

Point: What makes a prefix valid (base and variant), which error codes fire, and how we stop authors from hand-writing `argument-hint`.

What you need to know: Base agent-skill metadata validates in `packages/cli/src/targets/agent-skill.ts` and throws `invalid_target_metadata`; variant config validates in `packages/cli/src/config.ts` and throws `invalid_config`. The codebase pattern (every recent thread) is no new `JastrErrorCode` — reuse these. The existing input-`description` validation is the template for a single-line string rule.

Decision: (1) Base prefix `targets.agent-skill.argument-hint-prefix`: optional; if present must be a string, non-empty after trim, single-line (no `\n`/`\r`); add `argument-hint-prefix` to `AGENT_SKILL_TARGET_FIELDS`; violations → `invalid_target_metadata`. (2) Variant prefix `agent-skill.argument-hint-prefix`: same rules; add `argument-hint-prefix` to `SELECTED_AGENT_SKILL_FIELDS`; add `agentSkillPrefix?: string` to the composed variant; variant prefix replaces base when present; violations → `invalid_config`. (3) Reserve `argument-hint` in passthrough frontmatter: add it to `RESERVED_FRONTMATTER_FIELDS` (alongside `inputs`) so an author declaring `argument-hint` in base or variant `agent-skill.frontmatter` is rejected via `collectPassthroughFrontmatter` → `invalid_target_metadata` ("must not declare argument-hint"). (4) The prefix is `.trim()`-ed before joining so a stray trailing space cannot produce a double space. (5) No new error codes.

Rationale: Reuses the existing validation seams and error codes (consistent with the project's "no new codes" pattern), mirrors the proven single-line `description` rule, and the reservation closes the only way the author knob and the managed field could collide.

## P8: Scope, churn, and definition-of-done

Point: Confirm what the implementation ships with, and explicitly accept the churn that "derive by default" (P1) imposes on the existing corpus.

What you need to know: Because derivation is on by default, every existing template with inputs now emits an `argument-hint` line it did not before, so every existing generate/`--check` test fixture and golden whose template declares inputs must be regenerated (across ~37 agent-skill e2e cases plus engine/CLI unit tests); zero-input, no-prefix templates are unaffected. `jastr validate` needs no special-casing — it already validates declared agent-skill target metadata and resolves the selected variant, so the new base/variant prefix validation rides along (the spec should state this). The emitted `argument-hint` value (contains `<`, `[`, `|`, `=`, leading `-`) must be serialized via the existing `YAML.stringify` path, not hand-built, so quoting and `--check` byte-comparison stay deterministic. No committed product skills need migrating (playground is gitignored); churn is confined to tests/fixtures/goldens.

Decision: Accept the proposed scope as the spec's definition-of-done: (1) engine unchanged, all logic in `@jastr/cli`; (2) implement base prefix (P3/P7), per-variant prefix (P6b/P7), derived-flag grammar (P4), assembly (P5), reservation (P7); (3) regenerate all affected goldens/fixtures and add new dedicated e2e cases covering derived-only, prefix+derived, prefix-only (zero inputs), neither (field omitted), enum/boolean/optional rendering, variant locked-exclusion, variant prefix override, and the three rejection errors; (4) regenerate `packages/cli/docs/BEHAVIOR.md` and reconcile `AGENTS.md`; (5) green gates: `check`, `typecheck`, `test`, `test:cli:e2e`, `docs:cli:living --check`, `build`. Accept the golden churn from derive-by-default.

Rationale: The churn is a direct, intended consequence of the P1 derive-by-default choice and is confined to tests (acceptable for a private, pre-release tool). Routing serialization through `YAML.stringify` and leaning on the existing validate path keeps the change small and consistent with established CLI seams.
