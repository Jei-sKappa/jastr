# Implementation Report — backtick-quote agent-skill non-Markdown message tokens

Implements the P1 finding accepted in
`implementation/discussions/260628100200Z-backtick-review-findings-decision-log.md`
(target: the implementation; the finding was raised in
`implementation/reviews/260628085952Z-backtick-quoting-convention-implementation-review.md`).
This is a single-task follow-on to the backtick-quoting convention
(`specs/001/spec.md`); it closes the one gap that review surfaced. Frozen at
emission.

## Run summary

One implicit task, one commit. Quoted every interpolated value token in
`packages/cli/src/targets/agent-skill.ts`'s user-facing **non-Markdown** messages
through the existing per-package `quote` helper: field names (`Unknown
targets.agent-skill field …`, `… must not declare …`, `… must be kebab-case`,
`… metadata field …`), the base `argument-hint-prefix` config-key label, output
paths (`Output file …`, `agent-skill at … is up to date.`), and the
generate/regenerate command suggestions (`No agent-skill found at …`, `… is
stale; regenerate it with …`). The generated agent-skill **Markdown body**, the
`JastrError` `details` payloads, the `JastrErrorCode` union, and the engine
public API are untouched.

| Task | Status | Commit |
|------|--------|--------|
| 1 — quote agent-skill.ts non-Markdown message tokens + test/doc sweep | DONE_WITH_CONCERNS | `3ef1106` |

The full standing gate passes as of the commit: `bun run check`, `bun run
typecheck`, `bun run test` (597), `bun run test:cli:e2e` (301), `bun run
docs:cli:living --check`, and `bun run build` all exit 0.

(A preceding housekeeping commit `cff3aa0` committed the already-present untracked
review + decision-log records, on the user's instruction during the
dirty-worktree check; it carries no source change.)

## 1. Deviations from the plan/input, with justification

1. **Command suggestions quoted as one whole-command token.** For the
   `output_missing` and `output_stale` messages, the suggested command
   (`jastr generate agent-skill <ref> --out <out> [--force]`) is wrapped as a
   single backtick token rather than quoting each embedded value token
   separately. Justification: this matches the established install-message
   precedent (`install/add.ts` `jastr update <id>`, `install/update.ts`
   `jastr add`) and spec §4.2's "composite token / usage hint quoted as one
   unit"; §8 Degrees-of-freedom item 2 grants this per-site tokenization.
2. **Base config-key label quoted at the call site, not inside the validator.**
   `readBaseArgumentHintPrefix` now passes `quote("targets.agent-skill.argument-hint-prefix")`
   into `validateArgumentHintPrefix`, which interpolates the label raw. This
   avoids double-quoting the *variant* caller's label (`config.ts` already passes
   `.jastr/config.yml \`variants.…\``, a composite with the key quoted inside).
   A clarifying comment was added to `validateArgumentHintPrefix` documenting
   that callers pass an already-quoted label — a minor comment-only touch beyond
   the strict message lines, justified by the changed parameter contract.
3. **Literal `--force` (standalone) and `--out` (inside the quoted command) left
   bare.** In `Output file … Use --force to overwrite it.` the standalone
   `--force` is fully-literal prose and stays bare per spec §9; inside the
   command suggestions, `--out`/`--force` ride inside the single quoted command
   token. No interpolated value token is left bare.

## 2. Surprises

- **No unit test asserted the base `argument-hint-prefix` label message.** Only
  e2e cases (`generate-argument-hint-prefix-*`, `validate-argument-hint-prefix-invalid`)
  cover it; the base label quoting is validated through those, not a unit test.
- **`validate-argument-hint-prefix-invalid` exercises the base path**, not the
  variant path, so it picked up the new quoted base label cleanly.
- **`agent-skill.ts` was the only source file needing edits.** The variant-path
  label message (in `config.ts`) was already quoted by the prior convention work,
  so it needed no change and was verified unchanged by the green e2e suite.

## 3. Problems hit

- **One Biome line-width failure.** A reformatted assertion in
  `generate-command.test.ts` exceeded the line width after adding backticks;
  `bun run format` wrapped it and `bun run check` then passed. Resolved before
  commit; not a blocker.
- No commit failures, no contradictory inputs, no halts.

## 4. Follow-ups

1. **Spec erratum (REQUIRED, separate pass).** Editing `agent-skill.ts`
   knowingly supersedes the approved spec's **AC-6.2** ("No edit to
   `targets/agent-skill.ts`") and narrows **§5 / FR-6** to exclude only the
   *generated-Markdown body*, not the file's validation/info messages. The
   decision log (P1) is the owner-approved, record-backed authorization, but the
   approved spec is immutable to this run — so a marked erratum/amendment to
   `specs/001/spec.md` AC-6.2 / §5 / FR-6 must be made in a **separate
   owner-approved authoring pass** so those clauses do not read as stale.
   Routing: candidate amendment for the spec owner (not a new thread).
2. **AGENTS.md needs no change.** Its claim that "the generated agent-skill
   Markdown stays untouched/raw" remains accurate (the Markdown body was not
   edited); the convention now applies *more* uniformly, contradicting nothing in
   AGENTS.md. Noted so a future agent does not assume an update was missed.
3. **Optional: a unit test for the base `argument-hint-prefix` label message.**
   Currently covered only by e2e. Low priority; routing: candidate seed for a
   future thread if desired.
4. **Out of scope (unchanged):** the review's Finding 2 (`git.ts:170` passthrough
   error) was rejected in the decision log (P2) and stays bare; spec §9's
   fully-literal-token backticking remains deferred.

## References

- Decision log (input): `implementation/discussions/260628100200Z-backtick-review-findings-decision-log.md` (P1)
- Review that surfaced the finding: `implementation/reviews/260628085952Z-backtick-quoting-convention-implementation-review.md`
- Spec (context): `specs/001/spec.md` (§4 convention, §8 DoF, AC-6.2 / §5 / FR-6)
- Ledger: `ledger.md` (tier 2)
- Commits: `3ef1106` (fix), `cff3aa0` (prior housekeeping: review + decision-log records)
