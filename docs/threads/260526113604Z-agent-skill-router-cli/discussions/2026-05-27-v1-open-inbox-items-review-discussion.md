# V1 Open Inbox Items Review Discussion

This log captures decisions for the open v1 review follow-ups in `docs/threads/260526113604Z-agent-skill-router-cli/inbox/open`.

## P1: Frontmatter Metadata Safety

Point: Should generated router `SKILL.md` frontmatter strictly follow the Agent Skills spec, or should Skillrouter also pass through extra kebab-case top-level fields from the template?

What you need to know: The Agent Skills spec requires `name` and `description`; defines optional top-level fields `license`, `compatibility`, `metadata`, and `allowed-tools`; and says arbitrary additional properties belong under `metadata`. It also constrains `name` more tightly than Skillrouter currently does: max 64 chars, lowercase letters/numbers/hyphens, no leading/trailing hyphen, no consecutive hyphens, and matching the parent directory name. `description` must be non-empty and max 1024 chars.

Current Skillrouter templates also use `inputs` in frontmatter for routing. That field should not be blindly copied into generated agent `SKILL.md` frontmatter unless we intentionally make generated skills non-spec metadata carriers.

Choice: Support spec-defined fields plus kebab-case top-level pass-through for additional fields, excluding Skillrouter-owned fields such as `inputs`.

Rationale: The user wants Skillrouter to validate only the minimal common Agent Skills contract that other skill specifications build on top of, then pass through additional kebab-case top-level fields so authors can target ecosystem-specific extensions such as Anthropic-style skill frontmatter without Skillrouter needing to understand each ecosystem. This improves UX by preserving author freedom and avoiding unnecessary checks outside Skillrouter's concern. Main trade-off: generated files with extra top-level fields may not satisfy validators or clients that reject unknown fields; Skillrouter accepts that compatibility risk to support layered specifications. Note: recommended strict spec output with `metadata` for arbitrary properties; user clarified that strict output would be too limiting for ecosystem-specific SKILL specifications and accepted the validator-compatibility trade-off.

## P2: Include Read Error Classification

Point: Should `readIncludeFile` keep reporting every file read failure as `include_not_found`, or should it distinguish other filesystem failures?

What you need to know: `src/compiler/includes.ts` resolves include paths first, then catches every `readFile` failure and throws `include_not_found` with “was not found.” That means missing files, permission errors, directories used as files, and symlink loops all produce the same message. The v1 spec currently lists “include not found” but does not define separate categories for unreadable includes, directory includes, or symlink-loop failures. Adding distinctions would improve debugging, but it expands the error contract.

Choice: Keep `include_not_found` for missing files and add `include_error` for non-ENOENT include read failures, with a normalized filesystem cause such as `EACCES`, `EISDIR`, or `ELOOP` in the message rather than forwarding the raw caught error message.

Rationale: This is more honest than reporting every read failure as “not found” while avoiding raw platform-specific filesystem messages that may expose absolute paths and make tests brittle. The main trade-off is expanding the v1 error contract with one additional include error category, but the added category is broad enough to avoid a full filesystem taxonomy.

## P3: Symlink-Aware Include Containment

Point: Should include containment remain lexical, or should Skillrouter resolve symlinks before deciding whether an include escapes the project root?

What you need to know: `resolveIncludePath` currently checks containment with `path.relative(projectRoot, resolved)` after normalizing the include path. The v1 spec explicitly says `../` is allowed only if the lexically normalized path remains inside the discovered project root, and it records symlink-aware containment as an unresolved follow-up. With the current behavior, a symlink inside the project can point to a file outside the project and still be included. The spec says this was accepted for v1 partly because symlinked content is often intentional.

Choice: Keep lexical containment for now, but add a TODO in the include path code explicitly noting that symlinks can bypass the project-root boundary and should be considered for explicit handling.

Rationale: This preserves the current v1 behavior and intentional symlink workflows while making the caveat visible at the implementation site. The main trade-off is that project-root containment remains an authoring convention rather than a real filesystem security boundary until symlink handling is revisited.

## P4: `generate_validation_failed` Error Code

Point: Should the declared-but-unused `generate_validation_failed` error code be removed, or should `generate` wrap shared static validation failures with it?

What you need to know: `SkillrouterErrorCode` includes `generate_validation_failed`, but no code throws it. `generate` currently calls `validateSkillTemplate`, and any validation failure surfaces as the underlying compiler error code such as `malformed_schema`, `invalid_directive`, or `invalid_interpolation`. The spec lists “generate static validation failure” in the error catalog, but the implementation currently preserves more specific compiler errors. P1 also means `generate` will likely do more frontmatter-specific validation and pass-through handling, so this error decision affects that work too.

Choice: Keep `generate_validation_failed`, but use it only for generate-specific router frontmatter validation introduced by P1; shared template validation should continue surfacing precise compiler error codes.

Rationale: P1 creates generate-specific concerns around Agent Skills `name` and `description` constraints, official optional fields, kebab-case pass-through fields, and excluding Skillrouter-owned fields such as `inputs`. Those checks justify a generate-specific error code without hiding ordinary compiler validation failures behind a generic wrapper. The main trade-off is that the spec must define the boundary clearly so `generate_validation_failed` does not become a catch-all.

## P5: `SKILLROUTER_TEST_CWD` in Shipped CLI

Point: Should the shipped CLI entrypoint keep the `SKILLROUTER_TEST_CWD` environment override used by integration tests?

What you need to know: `src/cli/index.ts` currently does `process.env.SKILLROUTER_TEST_CWD ?? process.cwd()` and passes that into `runSkillrouterCommand`. The only usage is the test helper, which runs the CLI process from the repo root but simulates a project cwd via the env var. The command layer is already testable without this because `runSkillrouterCommand(argv, cwd)` accepts `cwd` directly. The env var is therefore a test harness shortcut living in shipped code.

Choice: Remove the `SKILLROUTER_TEST_CWD` override from the shipped CLI entrypoint and adjust integration tests to invoke the entrypoint by absolute path from the real process cwd under test.

Rationale: Production CLI behavior should derive cwd from `process.cwd()` only. The existing command layer already supports direct cwd injection for lower-level tests, while integration tests should exercise the actual process cwd. The trade-off is a small test-helper adjustment, but it removes an invisible test-only control path from shipped code.

## P6: `writeRouterSkill` Return Value

Point: Should the CLI use the path returned by `writeRouterSkill`, or is it okay for `generate` to stay silent on success?

What you need to know: `writeRouterSkill` returns the resolved output path after writing. `runSkillrouterCommand` currently awaits it but ignores the value and returns an empty string, so `skillrouter generate` prints nothing on success. The return value is still useful for library consumers that call `writeRouterSkill` directly. The current tests expect empty stdout for successful `generate`. If the CLI starts printing the path, that becomes user-facing behavior and changes the “quiet success” contract.

Choice: `generate` should print a success message using the returned output path, in the form `Generated <generated path> from template <template path>`.

Rationale: The `generate` command is user-facing rather than agent-facing, so clarity is more useful than quiet success. Printing both the generated path and source template gives humans immediate confirmation of what happened. The main trade-off is that this changes stdout behavior and tests must be updated, but the added output is appropriate for this command.
