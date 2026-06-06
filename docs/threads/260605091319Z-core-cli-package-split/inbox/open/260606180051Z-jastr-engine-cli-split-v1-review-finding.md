## Verdict

partially ready - the spec is broadly consistent with the proposal and P1-P33 discussion decisions, but the engine public contract is still not handoff-grade because exported API names and error vocabulary are left partly to implementer discretion while also being part of the package boundary.

## Findings

- [issue] Explicit decisions / expected behavior: the `@jastr/engine` top-level API contract is present but under-specified, and it conflicts at the edge with the spec's own template-vocabulary rule. The spec says engine API names and types must use template vocabulary, but later allows exact TypeScript names to vary and refers to `SkillrouterError`-style errors. A downstream implementer could reasonably export `SkillrouterError`, `JastrError`, or another error type, and could choose different render/parse/validate function names, making the public package contract and acceptance review subjective.

- [issue] Expected behavior / constraints: `targets.skill.frontmatter` validation depends on an undefined "existing Agent Skill passthrough validation policy." The spec does not inline that policy or point to a concrete current artifact that defines allowed fields, value types, nested metadata behavior, or error handling. A downstream implementer would have to inspect old code or infer the rules, which can produce incompatible Agent Skill wrappers.

- [nit] Expected behavior: several CLI error surfaces use soft wording rather than pinned observable output. "Clear CLI error" and category-only descriptions are present, but they do not specify the exact messages or structured codes for invalid template refs, unsupported generate targets, missing `targets.skill`, invalid target metadata, or include containment failures. Because the CLI behavior docs and e2e harness assert output, two implementers could create different stderr strings while both believing they followed the spec.

- [nit] Acceptance guidance: the verification set ends with "the package build command" without naming that command. A downstream executor cannot tell whether the required check is a root aggregate such as `bun run build`, a package-scoped build, or multiple package builds, so the final clean-check contract is not fully executable from the spec alone.

## Evidence

- Engine API ambiguity: `## Intended Outcome` says engine API names, types, and docs must use template vocabulary; `## Engine API Expectations` says "The exact TypeScript names may vary" and requires `SkillrouterError`-style structured errors.

- Undefined Agent Skill frontmatter policy: `## Template Contract` says `targets.skill.frontmatter` "must follow the existing Agent Skill passthrough validation policy" without defining or linking that policy.

- Soft CLI error wording: `## Run Behavior` says invalid template references fail with "a clear CLI error"; `## Generate Behavior` names rejection categories but not the observable messages or codes.

- Unnamed build verification: `## Acceptance Guidance` ends the clean verification set with "and the package build command."

- Discussion consistency: P15 requires the central abstraction to be `Template`, P8 requires a small intentional exported package contract, P14 discusses the legacy `SkillrouterError` shape, and P33 settles physical packages as `@jastr/engine` and `@jastr/cli`; the spec aligns with these at the architectural level but leaves the concrete export vocabulary unresolved.

## References

- `/Users/jacopo/Developer/projects/personal/tools/skillrouter/docs/threads/260605091319Z-core-cli-package-split/specs/260606175157Z-v1-spec.md`
- `/Users/jacopo/Developer/projects/personal/tools/skillrouter/docs/threads/260605091319Z-core-cli-package-split/discussions/2026-06-05-core-cli-package-split-design-discussion.md` - P1-P33, especially P8, P14, P15, P24, P30, P32, and P33.
- `/Users/jacopo/Developer/projects/personal/tools/skillrouter/docs/threads/260605091319Z-core-cli-package-split/proposals/260605091319Z-core-cli-package-split-proposal.md`

## Open Questions

- Should the engine contract name concrete exports such as `renderTemplateSource`, schema/input validation helpers, public result types, and a renamed error type, or is only a capability list intended to be contractual? This needs the spec author because it decides the public package boundary.

- What is the exact allowed schema for `targets.skill.frontmatter`, including nested objects, arrays, unknown fields, and invalid type errors? This needs either an inline rule or a stable reference to the existing policy.

- Which command is the required package build verification command after the workspace split? This likely belongs in the spec and AGENTS/README update rather than implementation planning.

## Next Actions

- Emit a new spec version that pins the engine export contract or explicitly states which names are non-contractual and how acceptance should verify the package boundary without exact names.

- Inline or link the concrete Agent Skill frontmatter passthrough validation policy, including the error surface for invalid `targets.skill.frontmatter`.

- Tighten the CLI error and verification guidance by naming required messages or structured codes where e2e output must be exact, and by naming the build command in the clean verification set.
