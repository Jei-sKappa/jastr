**Why:** Three small code-quality nits surfaced during v1 review and were intentionally left as-is; parking them so they aren't lost if a cleanup pass happens later.

1. **`generate_validation_failed` is a declared-but-unused error code** (`src/errors.ts`). It's in the `SkillrouterErrorCode` union but never instantiated — `generate` surfaces the underlying compiler error codes from the shared validation pipeline instead. Kept because the spec's error catalog lists a "generate static validation failure" category; removing it would diverge from the spec. Decide whether to remove it or actually produce it.

2. **`SKILLROUTER_TEST_CWD` test seam in shipped `src/cli/index.ts`** (`process.env.SKILLROUTER_TEST_CWD ?? process.cwd()`). It's read in production code purely so the execa-based integration tests can drive cwd discovery. Harmless and genuinely used by the harness, but it's a test concern living in shipped code — consider whether to keep it.

3. **`writeRouterSkill` return value ignored** (`src/cli/commands.ts` calls `await writeRouterSkill({...})` without using the returned output path). Harmless; the return is useful for library consumers. No action unless we want the CLI to report the written path.

None affect correctness; all three were reviewed and deemed acceptable for v1.
