# V1 Spec Review Findings Discussion

This log records decisions about how to address the review findings on `specs/260606175157Z-v1-spec.md`.

## P1: Engine API Contract Vocabulary

Point: Decide whether the revised spec should pin concrete `@jastr/engine` public export names and error vocabulary, or leave those names to implementation discretion.

What you need to know: The review finding is real. The spec currently says the central model is `Template` and engine API names/types/docs must use template vocabulary, but later says exact TypeScript names may vary and requires `SkillrouterError`-style errors. That creates a public-boundary ambiguity because the same spec also says TypeScript callers can consume `@jastr/engine` directly and package `exports` should block deep imports.

Current code is still skillrouter-shaped: `src/index.ts:1` exports CLI helpers, `renderSkillTemplate`, `validateSkillTemplate`, `SkillrouterError`, `formatCliError`, and router-skill generation helpers. `src/errors.ts:1` defines `SkillrouterErrorCode`; `src/errors.ts:27` defines `SkillrouterError`. The design discussion P15 says to prefer `Template`, `TemplateInput`, `TemplateId`, `renderTemplate`, and `renderTemplateSource`, and P8 says the package needs a small intentional top-level contract.

Choice: Pin the minimum exact V1 export surface in the spec, and remove Skillrouter vocabulary from the new public product/API contract.

Rationale: Because this spec creates a real package boundary and blocks deep imports, exported names are not implementation details. The revision should pin a deliberately small template-vocabulary surface, including concrete render/validation exports, public schema/input/result types, and `JastrError`/`JastrErrorCode` with structured details. Historical context may still mention that the repo and old implementation were Skillrouter, and absolute reference paths may still include the current directory name, but new public APIs, docs, generated wrappers, errors, and acceptance criteria should not carry Skillrouter vocabulary forward.

## P2: Agent Skill Frontmatter Policy

Point: Decide how the revised spec should define `targets.skill.frontmatter` validation instead of referring to an undefined existing policy.

What you need to know: The current implementation's policy lives in `src/generate/router-skill.ts`. It allows official Agent Skill fields `license`, `compatibility`, `metadata`, and `allowed-tools`, plus additional top-level kebab-case extension fields. It validates `license` and `allowed-tools` as strings, `compatibility` as a non-empty string up to 500 characters, and `metadata` as a mapping whose values are strings. It rejects non-kebab-case extension fields, as covered by `test/generate.test.ts` and `requirements/functional/06-generate.yml`.

But the new spec changes the shape: `targets.skill.name` and `targets.skill.description` are the owned fields, and `targets.skill.frontmatter` is extra Agent Skill frontmatter that "may not override `name` or `description`." That means the old root-frontmatter passthrough policy cannot be copied blindly. In particular, the revised spec should explicitly say what happens if `frontmatter` contains `name`, `description`, `inputs`, unknown kebab-case keys, nested objects, arrays, or invalid known fields.

Choice: Inline the current passthrough policy, adapted to the new `targets.skill.frontmatter` shape.

Rationale: This preserves existing extension behavior while making the spec self-contained. The adapted policy should use Jastr vocabulary and explicitly define `targets.skill.frontmatter` as a mapping that cannot include `name` or `description`; known fields keep their current validations; unknown top-level fields are allowed only when kebab-case; and `inputs` should be rejected or reserved rather than silently omitted because nested target metadata should not carry template input declarations.

## P3: CLI Error Specificity

Point: Decide how exact the revised spec should be about CLI error messages and error codes for the new `jastr` behaviors.

What you need to know: The review finding is a nit, not a blocker. The current e2e cases assert exact stderr strings, and existing requirements often say "Error-prefixed stderr" rather than listing every message. The v1 spec already keeps the uniform failure shape: exactly one `Error: <message>` line to stderr and exit 1. The ambiguity is for new or changed surfaces introduced by this spec: invalid `<template-ref>` disambiguation, missing `.jastr` root, missing named template, unsupported `generate` target, missing/invalid `targets.skill`, invalid `targets.skill.frontmatter`, and named/direct include containment wording.

There is a trade-off here. Exact messages in the spec make implementation/e2e updates deterministic, but they add a lot of wording and can turn a design spec into a transcript of test fixtures. Structured error codes are a cleaner middle ground for engine/API errors, but CLI users and living docs still see strings.

Choice: Pin stable error codes and message templates for new/changed surfaces, but leave incidental wording for unchanged legacy rendering errors to existing e2e requirements.

Rationale: This gives enough precision for implementation and adapter mapping without duplicating the entire existing error catalog in the spec. The revised spec should define stable `JastrErrorCode` values and message templates for new split/rename surfaces such as invalid template reference, missing project root, template not found, unsupported generate target, missing target metadata, invalid target metadata, output exists, include path rejected, include outside containment root, include not found, and include read error. Existing directive/input/rendering failures can remain pinned through the moved e2e/living-doc requirements unless the rename forces message changes.

## P4: Package Build Verification Command

Point: Decide what exact build command the revised spec should require in the clean verification set.

What you need to know: The current root package has `bun run build`, which bundles `src/cli/index.ts` to `dist/index.js` with `SKILLROUTER_GIT_SHA`. The split spec says each package builds to its own `dist/`, `@jastr/engine` emits JS and `.d.ts`, and `@jastr/cli` emits a Node-targeted binary and/or JS entrypoint. The review finding is that acceptance ends with "the package build command," which is not executable guidance.

P10 in the design discussion says the build/check pipeline should validate that the engine builds as a standalone package. P12 keeps root aggregate scripts for routine verification. So the spec should name a root command that validates both package builds, and it can also require package-local scripts behind it.

Choice: Require both package-local build scripts and a root aggregate build: `packages/engine` and `packages/cli` each expose a `build` script, and root `bun run build` runs both.

Rationale: This preserves explicit package ownership while keeping the clean verification workflow ergonomic. The revised spec's clean verification set should end with `bun run build`, not "the package build command."
