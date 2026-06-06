# Core and CLI Package Split Design Discussion

This log records decisions about grey areas in the core and CLI package split proposal so they can feed a detailed, unambiguous specification.

## P1: Core Input API Shape

Point: Decide whether the new core package should accept CLI-shaped flag records or a domain-shaped input API.

What you need to know: The current implementation leaks CLI concepts into compiler/core-like code. [src/compiler/render.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/compiler/render.ts:2) imports `RawFlag` from CLI code, and [src/compiler/render.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/compiler/render.ts:26) exposes `rawFlags` in `RenderSkillTemplateOptions`. [src/compiler/flags.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/compiler/flags.ts:8) then coerces `RawFlag[]` into `InputValues`, while error messages are still written in CLI terms like `--name`. [src/cli/args.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/cli/args.ts:3) defines `RawFlag` as `bare` or `value`, which is directly shaped by command-line syntax.

That means a mechanical package split would either keep core depending on CLI vocabulary, or force an early API decision. If the stated goal is "a TypeScript library should consume core without pretending to be a shell command," this is the highest-leverage decision.

Choice: Core will accept a domain-shaped input API, for example `InputValues = Record<string, string | boolean>`, and CLI will translate argv-derived flags into that API.

Rationale: This best matches the proposed library-consumable boundary. CLI may keep an internal `RawFlag` or `CliInputToken` parser, but that type must not cross into `packages/core`; core should expose domain vocabulary such as `InputValues` or `SkillInputs`, while CLI owns command-line syntax translation and `--flag`-specific presentation.

## P2: Filesystem Boundary

Point: Decide how `packages/core` should access templates, includes, project roots, and generated router skill output.

What you need to know: Several current core-like modules directly use Node filesystem APIs. [src/compiler/render.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/compiler/render.ts:1) reads template files during rendering. [src/compiler/includes.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/compiler/includes.ts:54) resolves and reads include files from disk. [src/fs/project-root.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/fs/project-root.ts:5) walks upward looking for `.skillrouter`. [src/skills/skill.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/skills/skill.ts:17) hardcodes `.skillrouter/<skill>/SKILL.template.md`. [src/generate/router-skill.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/generate/router-skill.ts:168) writes the generated `SKILL.md`.

There are two separate concerns hiding under "filesystem": reading project templates/includes for `run`, and writing generated router skill files for `generate`. If both stay directly in core, core is easy to use from the CLI but carries Node filesystem and `.skillrouter` layout assumptions. If all filesystem moves to CLI, core becomes more reusable but CLI becomes a heavier adapter.

Choice: Core will define pure primitives plus explicit reader/writer abstractions, and CLI will provide the Node filesystem implementation.

Rationale: This preserves a clean core boundary while avoiding a giant CLI orchestration layer. `packages/core` must not import `node:fs` for runtime behavior. Core may own include/path validation rules through interfaces such as `ProjectReader` or `TemplateLoader`, and tests can use in-memory readers. Router skill content generation belongs in core because it is pure string construction; writing the file belongs in CLI or a filesystem adapter outside the pure core surface.

## P3: Input Coercion and Error Ownership

Point: Decide where schema-aware input coercion and CLI-shaped input error messages should live after core accepts domain-shaped inputs.

What you need to know: P1 says core should not accept `RawFlag[]`. But today [src/compiler/flags.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/compiler/flags.ts:8) does three jobs at once: it validates schema requirements, coerces CLI flag forms into typed values, and emits CLI-shaped messages like `Missing required input --language.` or `Boolean input --dry-run must be true, false, or a bare flag.` The tests in [test/flags.test.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/test/flags.test.ts:19) lock in that combined behavior.

This matters because `--dry-run=false` can only be parsed correctly if the translator knows the template schema says `dry-run` is boolean. If CLI owns all argv translation, the CLI must either load the schema before translating, or call a core helper that understands schema but does not understand argv syntax. Otherwise we get a confused boundary where core accepts "domain inputs" but still has to know what a bare flag means.

Choice: Core owns domain validation, and CLI owns argv syntax translation plus CLI-specific input error wording.

Rationale: This avoids validation duplication while preserving the P1 boundary. Core should expose domain validation over `InputValues` against `TemplateSchema`, with neutral concepts like `input "language"` rather than `--language`. CLI should parse argv into a CLI-local intermediate, load schema through the core reader/loader, translate to typed `InputValues`, and preserve existing CLI error wording at the adapter layer where necessary.

## P4: `executeRun` and `executeGenerate` Ownership

Point: Decide whether `executeRun` and `executeGenerate` should move into core, stay in CLI, or be split into core use cases plus CLI adapters.

What you need to know: The current helpers in [src/cli/commands.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/cli/commands.ts:10) are called "execute" helpers, but they are CLI-shaped. `executeRun` accepts `RawFlag[]`, uses `cwd`, discovers `.skillrouter`, resolves a skill path, and calls rendering. `executeGenerate` validates `--out`, discovers the project, validates the template, builds router skill content, writes the output file, and returns a CLI status string. These helpers are exported from [src/index.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/index.ts:1), so today they are also the closest thing to a public library API.

After P1-P3, `executeRun` cannot remain unchanged in core because it accepts CLI flags. After P2, `executeGenerate` cannot remain unchanged in pure core because it writes files and returns CLI-oriented prose. But deleting the concept entirely would make the CLI rebuild orchestration manually.

Choice: Split them: core exposes process-free use-case functions, and CLI owns adapter wrappers for the `run` and `generate` commands.

Rationale: This keeps useful orchestration without making core depend on process or shell concerns. Core should expose command-free use cases such as `renderSkill` and `prepareRouterSkill` with domain inputs, injected readers, and structured results. CLI should own wrappers such as `executeRunCommand` and `executeGenerateCommand` that parse argv, discover the Node-backed project, write files, format success text, and map errors to CLI output. The core should not know about the `run` or `generate` command names.

## P5: Bun Boundary

Point: Decide where Bun is allowed after the workspace split.

What you need to know: The current root package uses Bun for the build script: [package.json](/Users/jacopo/Developer/projects/personal/tools/skillrouter/package.json:10) runs `bun build ... --target=node` and injects `SKILLROUTER_GIT_SHA`. The runtime code is mostly Node-oriented, but there are still dev/test assumptions: [test/support/helpers.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/test/support/helpers.ts:43) and [test/e2e/harness/case-runner.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/test/e2e/harness/case-runner.ts:104) invoke the CLI through `bun`. The current project instructions also say to use Bun as runtime/package manager/bundler but avoid Bun-specific runtime APIs and Bun's test runner.

For the split, this should be sharpened. "No Bun-specific runtime APIs" is not enough if the published CLI or core package implicitly requires consumers to have Bun installed.

Choice: Bun is allowed for package management and build tooling, but never for runtime behavior or public package boundaries.

Rationale: This matches the current setup with less churn while preserving a Node-compatible package story. After the split, `packages/core` and `packages/cli` must not require Bun at runtime, and public package exports must not expose Bun types or APIs. Bun can remain a workspace/package-manager/build tool. CLI e2e tests should eventually exercise the Node-targeted CLI artifact or Node-compatible entrypoint, not rely on `bun <ts entrypoint>` as proof that the packaged CLI works.

## P6: E2E Tests and Living Behavior Docs

Point: Decide whether `docs/BEHAVIOR.md` and the e2e case suite should remain CLI-facing, split into core/CLI documents, or add core coverage without splitting the public behavior reference.

What you need to know: The current living docs generator describes itself as generated from `requirements/functional/` and `test/e2e/cases/`, and says every example is expected output asserted by the e2e suite in [scripts/living-docs.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/scripts/living-docs.ts:471). The functional requirements are mostly written as CLI behavior: `skillrouter run`, command exit codes, stdout/stderr, `--out`, `--force`, help, version, and CLI flags. The traceability harness in [test/e2e/harness/traceability.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/test/e2e/harness/traceability.ts:15) requires every active acceptance criterion to be covered by e2e cases.

After the split, many behaviors have a core aspect and a CLI aspect. For example, include path safety is core behavior, but `Error: ...` on stderr is CLI behavior. A mechanical split of `docs/BEHAVIOR.md` risks producing two weaker docs: one that no longer proves the CLI contract, and one that invents a premature SDK reference before the core API is stable.

Choice: Keep `docs/BEHAVIOR.md` and e2e traceability CLI-facing, and add or keep focused core package tests only for exported contracts and important behavior.

Rationale: The living behavior reference is a high-level CLI requirements document, so it should not be split or rebranded as core documentation during this package split. At the same time, the new core package boundary needs targeted tests for exported contracts, reader abstractions, structured results, domain input validation, pure rendering behavior, and router skill content generation. These should not become exhaustive tiny unit tests that mirror every implementation detail; the goal is contract and behavior coverage that localizes failures beneath the CLI e2e layer.

## P7: Workspace Package Identity

Point: Decide what package names and ownership mean after the repository becomes a workspace.

What you need to know: Today the root [package.json](/Users/jacopo/Developer/projects/personal/tools/skillrouter/package.json:1) is the only package. It is named `skillrouter`, is `private: true`, declares the `skillrouter` binary, and builds from `src/cli/index.ts`. There are no workspaces yet. The proposal says the repo should have at least `packages/core` and `packages/cli`, but does not say whether the root package remains meaningful or becomes a private workspace shell.

This matters because import paths and build scripts will encode the decision. If `skillrouter` remains at the root while `packages/cli` also exists, the workspace has two competing ideas of "the CLI package." If `packages/core` is intended to be library-consumable, it needs a stable package identity even if it remains private during development.

Choice: Root becomes a private workspace orchestrator; `packages/core` is named `@skillrouter/core`; `packages/cli` is named `@skillrouter/cli` and owns the `skillrouter` binary name.

Rationale: This models the intended final package boundary without overloading `skillrouter` as both package name and binary name. The scoped CLI package name keeps workspace identity consistent with `@skillrouter/core`, while the executable remains the user-facing `skillrouter` command. The accepted trade-off is that a future global install would use the scoped package name, such as `@skillrouter/cli`, unless a separate unscoped distribution package is intentionally added later.

## P8: Core Export Surface

Point: Decide how much of `@skillrouter/core` should be exported as package API during the initial split.

What you need to know: Today [src/index.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/index.ts:1) exports a mixed surface: CLI-shaped `executeRun`/`executeGenerate`, low-level rendering/validation functions, CLI error formatting, and router skill file writing. After P1-P7, that surface is wrong for both packages: CLI command helpers and file writing do not belong in core, but the CLI still needs a supported way to consume core without deep-importing internals.

The proposal says the split should create a "library-consumable boundary first" but does not need to promise a polished public SDK. That still needs teeth. If we export every internal compiler module, the package boundary becomes hard to refactor. If we export almost nothing, `@skillrouter/cli` will depend on unstable deep paths.

Choice: Export a small intentional core contract only.

Rationale: Even if `@skillrouter/core` stays `private: true`, its top-level exports should be treated as the package contract. The initial contract should include command-free use cases such as `renderSkill` and `prepareRouterSkill`, schema/input types, reader interfaces, structured result types, and `SkillrouterError`. Package `exports` should prevent deep imports. This does not mean a stable public SDK forever; it means no accidental export of internals and no CLI dependency on core internals.

## P9: Dependency Ownership

Point: Decide which package owns runtime dependencies after the split.

What you need to know: Current dependencies are all in the root package. CLI code imports Commander from `@commander-js/extra-typings` in [src/cli/program.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/cli/program.ts:1), [src/cli/commands/run.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/cli/commands/run.ts:1), and [src/cli/commands/generate.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/cli/commands/generate.ts:1). Core-like parsing/rendering code imports `yaml` in [src/compiler/frontmatter.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/compiler/frontmatter.ts:1) and [src/generate/router-skill.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/generate/router-skill.ts:4), and imports `remark-directive`, `remark-parse`, and `unified` in [src/compiler/directives.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/compiler/directives.ts:1). `execa` is test/harness-only today.

If dependencies remain duplicated or root-owned, the packages can accidentally pass locally while missing their own package manifests. If core depends on Commander, that violates the package boundary.

Choice: Each workspace package declares its own direct runtime dependencies; root only owns dev tooling shared across the repo.

Rationale: This gives correct package manifests and a clean dependency boundary. `@skillrouter/core` should own `yaml`, `remark-directive`, `remark-parse`, and `unified` if those remain in core. `@skillrouter/cli` should own Commander packages and depend on `@skillrouter/core`. Root should own dev-only tooling such as TypeScript, Vitest, Biome, tsx, and e2e harness dependencies like `execa` unless a package itself uses them at runtime.

## P10: Build and TypeScript Output Strategy

Point: Decide how `@skillrouter/core` and `@skillrouter/cli` should build and expose compiled output.

What you need to know: Today [package.json](/Users/jacopo/Developer/projects/personal/tools/skillrouter/package.json:10) has one build command that bundles `src/cli/index.ts` to root `dist/index.js` with a shebang and injected git SHA. [tsconfig.json](/Users/jacopo/Developer/projects/personal/tools/skillrouter/tsconfig.json:4) enables declaration generation, but the normal `typecheck` command is `tsc --noEmit`, so declarations are not currently a real package artifact. After P7-P9, core is a separate package with a top-level export contract, so it needs a build story that the CLI and tests can respect.

If core only works through TypeScript source imports, we may accidentally ship a CLI bundle that passes locally but has no usable core package artifact. If CLI bundles core internally, that is fine for the binary, but it should not replace building the core package contract.

Choice: Build each package to its own `dist/`; core emits JS and `.d.ts`, and CLI emits a Node-targeted binary bundle and/or JS entrypoint.

Rationale: This matches package boundaries, validates package exports, and keeps future publication straightforward. Core package exports should point at built JS and types. CLI may bundle core into the executable, but the build/check pipeline should still validate that `@skillrouter/core` builds as a standalone package. Bun remains allowed as build tooling under P5.

## P11: Source, Test, and Behavior Doc Layout

Point: Decide whether CLI behavior requirements/e2e/living docs are root-level project assets or owned by `@skillrouter/cli`.

What you need to know: P6 decided that the living behavior reference is CLI-facing, not core-facing. If we leave `requirements/functional/`, `test/e2e/`, and `docs/BEHAVIOR.md` at root, future readers may treat them as whole-repo behavior even though they only prove the CLI. A future TypeScript client or other client package should have its own e2e suite and behavior reference rather than sharing the CLI's.

Choice: Move CLI behavior ownership into `packages/cli`: CLI requirements, e2e cases/harness, living-doc generator target, and generated `BEHAVIOR.md` all become CLI-package assets.

Rationale: This is more path churn now, but it matches the package split and prevents the root from pretending CLI behavior is whole-repo behavior. Root-level scripts may remain as convenience commands if useful, but they should delegate to CLI-owned tests and docs. Future client packages can mirror this pattern with their own e2e suites and behavior references.

## P12: Root Developer Commands

Point: Decide what root-level scripts should exist after package-owned tests and docs move under `packages/cli`.

What you need to know: Today `AGENTS.md` and README list root commands: `bun run check`, `bun run typecheck`, `bun run test`, `bun run test:e2e`, and `bun run docs:living --check`. P11 moves CLI e2e requirements and living docs under `packages/cli`, but contributors and agents still need a simple "is the repo clean?" workflow. If root scripts disappear or become package-specific only, routine verification gets more error-prone. If root scripts remain, they must be honest: they are convenience aggregators, not ownership claims.

Choice: Keep root aggregate scripts, but rename CLI-specific commands so ownership is explicit, for example `test:cli:e2e` and `docs:cli:living`.

Rationale: This preserves convenient root-level verification while avoiding misleading names like `docs:living` after the only living behavior reference becomes CLI-owned. README and `AGENTS.md` must be updated to describe the new commands. A broader root aggregate such as `verify` or `test:all` can be added later if desired, but CLI-specific scripts should say they are CLI-specific.

## P13: CLI Version Source

Point: Decide which package version `skillrouter --version` reports after the CLI package moves to `@skillrouter/cli`.

What you need to know: Today [src/cli/version.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/cli/version.ts:1) imports the root `package.json` and [src/cli/program.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/cli/program.ts:11) prints `<version> (<git short SHA or dev>)`. The version requirement in [requirements/functional/08-version.yml](/Users/jacopo/Developer/projects/personal/tools/skillrouter/requirements/functional/08-version.yml:1) says "package version," but after P7 the root is a private orchestrator and the CLI package is `@skillrouter/cli`.

If this is not specified, `--version` may accidentally keep reporting the root workspace version, which is no longer the product package version.

Choice: `skillrouter --version` reports the `@skillrouter/cli` package version and git SHA/dev marker.

Rationale: The `skillrouter` binary is owned by `@skillrouter/cli`, so `--version` should read `packages/cli/package.json`. The git SHA/dev marker behavior can remain the same. If package versions are kept in lockstep, this still works; if they diverge later, the binary reports the version users installed.

## P14: Core Error Shape and CLI Error Mapping

Point: Decide how core errors should be represented and how the CLI preserves its exact error UX after core switches to neutral domain wording.

What you need to know: Current errors are simple `SkillrouterError(code, message)` objects in [src/errors.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/errors.ts:1), and CLI formatting just prepends `Error: `. E2E cases assert exact CLI stderr strings, including CLI-shaped input messages like `Missing required input --language.`, `Unknown input flag --unknown.`, and `Input --target-file requires --target-file=value.` The entrypoint in [src/cli/index.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/cli/index.ts:11) also normalizes Commander errors into the same single-line form.

P3 says core should use neutral domain wording like `input "language"` rather than `--language`, while CLI should preserve CLI presentation. If core only exposes plain strings, the CLI cannot reliably map neutral core validation errors back to existing CLI messages without parsing text. If core exposes structured error details, the CLI can format stable CLI output.

Choice: Extend core errors with structured details where CLI mapping needs them, while keeping human-readable messages.

Rationale: CLI can preserve exact e2e stderr without core knowing `--flag` syntax, and core remains useful for library consumers. `SkillrouterError` remains the shared error type, but typed details should exist for errors that need adapter-specific presentation, especially input validation errors. Core messages should be neutral and good enough for programmatic consumers; CLI formatting should use `code` plus details to render CLI-facing messages where required. The CLI must not parse error message strings.

## P15: Template-Centered Model

Point: Decide whether the core model remains centered on skills or shifts to templates.

What you need to know: The expert consultation concluded that the broader product capability is not "skill routing"; it is rendering Markdown templates based on typed inputs. A template is a Markdown file with YAML frontmatter, declared inputs, conditional directives, includes, interpolation, and deterministic rendering from explicit input values. Agent Skills are an important output target, but they are not the central model.

Choice: The central abstraction is `Template`, not `Skill`.

Rationale: This shifts the spec away from skill-specific names and assumptions. Core names should avoid `SkillTemplate`, `renderSkill`, and "skill inputs" unless code is specifically dealing with generated Agent Skill files. Prefer names like `Template`, `TemplateInput`, `TemplateId`, `renderTemplate`, and `renderTemplateSource`. This supersedes earlier skill-centered API wording in this log where applicable.

## P16: Four-Layer Architecture

Point: Decide the high-level architectural layers for the new direction.

What you need to know: The report separates four concerns: a template engine that parses, validates, and renders templated Markdown; template lookup/catalog logic that resolves a template reference into Markdown source; artifact targets that generate outputs from templates, such as Agent Skill wrappers or TypeScript modules; and the CLI that parses commands, resolves files, reads and writes disk, and prints stdout/stderr.

Choice: Architecture separates template engine, template lookup/catalog, artifact targets, and CLI.

Rationale: The low-level engine must not know about Agent Skills, `SKILL.md`, `.skillrouter`, `SKILL.template.md`, Commander, cwd, filesystem discovery, or TypeScript code generation. Keeping those concerns separate protects the template engine from target-specific and CLI-specific assumptions.

## P17: Template Engine Package Direction

Point: Decide the conceptual package direction after moving away from a skill-centered core.

What you need to know: Earlier discussion used package names like `@skillrouter/core` and `@skillrouter/cli`. The expert consultation concluded that the clean conceptual package is a low-level template engine, with a CLI package above it. Target generators can start internal to the CLI or repository and only become separate packages later if reuse justifies extraction.

Choice: The conceptual package split is a template engine package plus a CLI package; target generators start internal.

Rationale: Possible future package names are shaped like `@<new-name>/template-engine` and `@<new-name>/cli`, not `@skillrouter/core` as the long-term conceptual model. Agent Skill and TypeScript generators can live under internal target areas such as `targets/agent-skill` and `targets/typescript` until there is concrete reuse pressure to extract them.

## P18: Project Identity Must Broaden

Point: Decide whether `skillrouter` remains the likely long-term project identity.

What you need to know: The original product identity was tied to agent skill routing. The report concluded that the project's purpose is broader: rendering input-specialized Markdown instruction templates, with first-class generators for Agent Skills and later TypeScript workflow functions. The exact new name is still open.

Choice: `skillrouter` is no longer preferred as the long-term project name.

Rationale: The name is probably too narrow for a template renderer with multiple artifact targets. A future spec must leave the exact new product/tool name open until decided, but it should not continue treating Skillrouter as the stable long-term identity.

## P19: Generic Template Layout Convention

Point: Decide whether `.skillrouter/<skill>/SKILL.template.md` remains the long-term canonical layout.

What you need to know: The old layout `.skillrouter/<skill>/SKILL.template.md` made sense for the original Agent Skill story, but both `.skillrouter` and `SKILL.template.md` are skill-specific. The report identifies a better future convention as a generic tool folder with one template per directory, for example `.<tool-name>/<template-id>/template.md`.

Choice: The long-term conventional layout becomes generic and template-centered, not `.skillrouter/<skill>/SKILL.template.md`.

Rationale: `SKILL.template.md` should not be the canonical template filename for a broader template system. One-template-per-directory remains useful because fragments and includes can live naturally beside the template. The exact hidden folder name depends on the future project name.

## P20: Single Run Command With Syntactic Disambiguation

Point: Decide how the CLI renders both named templates and direct template files.

What you need to know: The report accepts a single `run` command for both named lookup and direct file rendering: `<tool> run review [input flags...]` and `<tool> run path/to/template.md [input flags...]`. Disambiguation should be syntactic rather than filesystem-dependent.

Choice: Use one `run` command for named and direct rendering, with syntactic disambiguation.

Rationale: If the argument ends in `.md`, treat it as a direct template file path. If it matches the template-id slug grammar, treat it as named lookup. If it looks path-like but does not end in `.md`, reject it with a clear error. Do not decide based on whether a file exists, because filesystem-dependent disambiguation would make behavior surprising.

## P21: Named Template Lookup

Point: Decide how named template lookup maps template ids to conventional paths.

What you need to know: The report replaces the old mapping `demo -> .skillrouter/demo/SKILL.template.md` with a generic mapping such as `review -> .<tool-name>/review/template.md`. Template ids should remain simple slugs unless a later spec introduces nested groups.

Choice: Named lookup maps a simple template id slug to the conventional template directory and `template.md` file.

Rationale: This keeps named templates ergonomic while avoiding skill-specific path names. The exact folder prefix waits on the project/tool name, but the mapping shape is template-centered: `<template-id>` resolves to `.<tool-name>/<template-id>/template.md`.

## P22: Direct File and Source Rendering

Point: Decide whether direct file rendering and direct source rendering are first-class.

What you need to know: The report explicitly accepts direct file rendering with `<tool> run path/to/template.md --input=value`. It also says the engine API should support direct source rendering through a shape like `renderTemplateSource({ source, inputs, includeResolver })`.

Choice: Direct file rendering and direct source rendering are first-class capabilities.

Rationale: Direct file rendering supports ad hoc usage, tests, and future orchestrators without forcing them into the named-template convention. Direct source rendering keeps the engine usable without CLI lookup or filesystem conventions, which matches the broader template-engine direction.

## P23: Explicit Generation Targets

Point: Decide the CLI shape for artifact generation.

What you need to know: The report accepts generation commands that always name a target, for example `<tool> generate agent-skill review --out .agents/skills/review/SKILL.md`, `<tool> generate agent-skill path/to/template.md --out .agents/skills/review/SKILL.md`, `<tool> generate typescript review --out src/generated/review.ts`, and `<tool> generate typescript path/to/template.md --out src/generated/review.ts`. It rejects `<tool> generate review --out path/SKILL.md`.

Choice: `generate` must always be explicit about the target.

Rationale: There should be no implicit "generate means agent-skill" alias. Explicit target names keep Agent Skill generation first-class without making it the default or the core model, and they leave room for TypeScript and other future generators.

## P24: Agent Skill Generation as Target

Point: Decide how Agent Skill generation fits into the broader template renderer.

What you need to know: The report says Agent Skill generation remains important and first-class, but only as a target generator. It should generate a minimal `SKILL.md` wrapper that invokes the CLI and tells the agent to follow the rendered output.

Choice: Agent Skill generation is a first-class artifact target, not the engine vocabulary.

Rationale: This preserves the original Agent Skill use case while preventing Agent Skill concepts from defining the whole engine. Agent Skill-specific names and metadata belong in the Agent Skill target generator, not in the template engine's generic API.

## P25: Future TypeScript Generation Direction

Point: Decide the architectural direction for future TypeScript generation.

What you need to know: The report says a future TypeScript target should generate callable functions or modules from templates, for example `<tool> generate typescript review --out src/generated/review.ts`. The generated module should call the template engine directly, not shell out to the CLI.

Choice: Future TypeScript generation should produce modules that call the template engine directly.

Rationale: This keeps generated TypeScript usable as application code rather than as a wrapper around shell commands. Current design choices should avoid making this hard: do not require root frontmatter `name` to mean Agent Skill name, do not encode Agent Skill metadata at the root of the generic schema, do not name core types around `Skill`, do not let CLI flags cross into the engine, and do not hardcode conventional lookup paths inside the renderer.

## P26: Template-Centric Frontmatter

Point: Decide the direction for root frontmatter and target-specific metadata.

What you need to know: The report says root frontmatter should be template-centric. A likely future shape uses root fields such as `id`, `description`, and `inputs`, with target-specific metadata under a `targets` section, for example `targets.agent-skill.name` and `targets.typescript.export-name`. The exact schema is not fully decided, including whether root frontmatter uses `id` or temporarily keeps `name`.

Choice: Root frontmatter describes the template; target-specific metadata belongs under target-specific sections.

Rationale: This prevents Agent Skill metadata from taking over the generic template schema and keeps room for future targets. The spec still needs to decide exact field names and whether target metadata is introduced immediately or deferred, but the principle is settled.

## P27: Naming Strategy

Point: Decide whether the official spec must choose the new project/tool name now, or whether it should proceed with a placeholder and leave naming as a separate decision.

What you need to know: P18 says `skillrouter` is no longer preferred as the long-term project name because the product is becoming a generic Markdown template renderer with artifact targets, not just an Agent Skill router. But the exact replacement name is still open. The current codebase and docs are heavily wired to `skillrouter`, `.skillrouter`, and `SKILL.template.md`, so choosing a real name affects package scopes, binary name, hidden folder name, generated wrapper commands, docs, e2e fixtures, and README/AGENTS language.

I don't think we should casually invent a name and log it without checking at least package-name and basic search availability. A bad name decision has high churn later. The official spec can either block on naming or use a neutral placeholder like `<tool>` / `<new-name>` and make the rename a dedicated prerequisite.

Choice: Use `jastr` as the new project/tool name.

Rationale: The user chose a concrete name rather than deferring naming. A quick availability check found no `jastr` package on npm at the time of discussion, and a basic web search did not show an obvious exact software/package collision. This is not legal trademark clearance, but it is enough to avoid using a placeholder in the architecture spec.

## P28: Conventional Folder Name

Point: Decide the exact hidden folder name for named template lookup now that the tool name is `jastr`.

What you need to know: P19 chose a generic one-template-per-directory convention, and P21 chose the mapping shape `<template-id> -> .<tool-name>/<template-id>/template.md`. With P27, `<tool-name>` is now `jastr`, so the obvious convention is `.jastr/<template-id>/template.md`. This replaces the old `.skillrouter/<skill>/SKILL.template.md`.

The only real question is whether to use the exact tool name `.jastr` or a more descriptive folder such as `.jastr/templates`. I think adding `templates` is unnecessary nesting: the directory is already the tool's template catalog, and one-template-per-directory gives each template room for fragments/includes.

Choice: Use `.jastr/<template-id>/template.md`.

Rationale: `.jastr/<template-id>/template.md` is the cleanest convention. It is short, predictable, matches the tool name, and directly follows P19/P21. If future non-template state appears, `.jastr/` can still gain sibling folders later, but the initial spec should not add nesting for hypothetical state.

## P29: Template ID Grammar

Point: Decide the exact grammar for named template ids.

What you need to know: Current skill names use `^[a-z0-9][a-z0-9-]*$` in [src/skills/skill.ts](/Users/jacopo/Developer/projects/personal/tools/skillrouter/src/skills/skill.ts:5). P20 says `run` disambiguation is syntactic: if the argument ends in `.md`, it is a direct file; if it matches the template-id slug grammar, it is named lookup; if it looks path-like but does not end in `.md`, reject it. P21 says template ids should stay simple slugs unless the spec later introduces nested groups.

This grammar is not just validation. It affects CLI disambiguation. If template ids allow `/`, `.`, or uppercase, they start looking like paths or create case-sensitivity problems across filesystems. If they allow underscores, they're still manageable, but they depart from the existing slug convention.

Choice: Keep the existing simple slug grammar: `^[a-z0-9][a-z0-9-]*$`.

Rationale: Lowercase kebab-case slugs are path-safe, already familiar from the current implementation, and maintain clear syntactic separation from direct file paths. Nested groups can be added later deliberately, but adding them now would undercut the named-vs-path disambiguation chosen in P20.

## P30: Template Frontmatter Recognized Fields

Point: Decide which root frontmatter fields the generic template schema recognizes and whether unknown fields are ignored or rejected.

What you need to know: The proposed direction is stricter conceptually than a generic `id`/`description` root metadata model: the generic template engine should recognize only `inputs` and `targets`, with only `targets.skill` supported for now. That fits the template-engine model because pure rendering only needs input declarations and template body behavior.

The risky part is "everything else is ignored." Ignoring unknown root fields is fine if authors may keep arbitrary metadata in the file. But ignoring unknown fields inside recognized structures can hide real mistakes. For example, `input:` instead of `inputs:` would silently define no inputs; `targets.skil:` instead of `targets.skill:` would silently drop generation metadata. That is worse than a clear validation error.

Choice: Ignore unknown root fields, but strictly validate recognized structures.

Rationale: Root fields other than `inputs` and `targets` are ignored. If `inputs` exists, it must be valid. If `targets` exists, only supported target keys are accepted for now, and `targets.skill` must match its schema. This allows flexible root metadata without letting typos inside real config pass silently. A typo at the root like `input:` is still ignored unless a later spec adds special typo detection.

## P31: Include Containment for Direct File Mode

Point: Decide what boundary includes are allowed to read when rendering a direct file path.

What you need to know: Current include safety is project-root based: includes must be relative, cannot target `.env`, and cannot escape the project root. With named lookup after P28, the project root is naturally the nearest ancestor containing `.jastr/`, and named templates live under `.jastr/<template-id>/template.md`. Direct file mode is different: `jastr run path/to/template.md` may have no `.jastr/` project root. We still need containment so `::include{path="../../secrets.md"}` cannot wander arbitrarily. The report left this open. The safest intuitive rule is that direct-file includes are contained to the template file's directory tree, not the process cwd and not an optional discovered project root.

Choice: Direct-file includes are contained to the directory containing the direct template file.

Rationale: Direct file mode should be self-contained and deterministic from the template path. This gives strong safety, keeps behavior portable, and lets direct templates include local fragments beside or below them. If shared include roots are needed later, they should be added as an explicit option rather than making containment depend on ambient project discovery.

## P32: Initial Target Metadata Scope

Point: Decide whether target metadata is introduced now, and if so, which targets are recognized in the initial spec.

What you need to know: P30 decided root frontmatter recognizes `inputs` and `targets`, and only `targets.skill` is supported for now. P23 says `generate` must always name an explicit target. P24 says Agent Skill generation remains a first-class target. P25 says TypeScript generation is future direction, but not necessarily part of the first implementation.

The report says "whether target metadata is introduced now or deferred" was open. The P30 answer effectively introduces `targets.skill` now. The remaining question is whether we also define `targets.typescript` now, or keep TypeScript as future-only until the generator exists.

Choice: Introduce `targets.skill` now; reject other target keys for now.

Rationale: This supports current Agent Skill generation cleanly, avoids speculative TypeScript metadata, and lets strict validation catch target-key typos. `targets.typescript` should not be accepted until the TypeScript target is specified and implemented; otherwise the schema advertises unsupported behavior.

## P33: Physical Package Split Timing

Point: Decide whether the first implementation physically creates `@jastr/template-engine` and `@jastr/cli`, or only creates a template-engine boundary internally first.

What you need to know: Earlier decisions before the expert report leaned toward a physical workspace split. P17 revised the conceptual package direction to a template engine package plus CLI package, with target generators initially internal. P27 renamed the project/tool to `jastr`, so the likely physical packages are `@jastr/template-engine` or shorter `@jastr/engine`, plus `@jastr/cli`.

The open question is timing. A physical split enforces the boundary immediately through package exports, package dependencies, and build artifacts. An internal boundary first can reduce churn, but this repo already needs broad renaming and layout changes from `.skillrouter`/skill vocabulary to `.jastr`/template vocabulary. If we defer the package split, we may do two disruptive migrations instead of one.

Choice: Physically create the workspace packages now: `@jastr/engine` and `@jastr/cli`.

Rationale: The decisions already require broad churn, and package boundaries are the point of the original thread. Doing the physical split now is cleaner than renaming everything and then splitting later. The shorter `@jastr/engine` package name is preferred over `@jastr/template-engine`; within the `@jastr` scope, `engine` is clear enough and avoids redundant package naming.
