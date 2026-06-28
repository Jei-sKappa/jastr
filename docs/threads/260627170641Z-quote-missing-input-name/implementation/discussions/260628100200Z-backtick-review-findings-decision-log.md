# Decision log — backtick-quoting implementation review findings (implementation/)

Thread: docs/threads/260627170641Z-quote-missing-input-name/
Target: the implementation (`implementation/260628084403Z-backtick-quoting-convention-implementation-report.md`)
Subject: disposing the findings raised in the implementation review at `implementation/reviews/260628085952Z-backtick-quoting-convention-implementation-review.md` — what to do about the bare value tokens in `agent-skill.ts` non-Markdown messages, and the `git.ts` passthrough-error nit.

## P1: Finding 1 — bare value tokens in `agent-skill.ts` non-Markdown messages

Point: `targets/agent-skill.ts` keeps ~10 user-facing *non-Markdown* validation/info messages whose interpolated value tokens stay bare, because FR-6 / AC-6.2 and the §5 surface exclude the whole file. The §1 intended outcome — backtick quoting "consistently, across all CLI messages" — is therefore only partially delivered. How do we dispose this finding?

What you need to know: The spec excludes `agent-skill.ts` at the *file* level (AC-6.2: "No edit to `targets/agent-skill.ts` is made"; §5 lists it as the "Markdown surface"). The implementer honored that exactly — the file is absent from the diff. The problem is the file mixes two surfaces: the generated-Markdown body (legitimately excluded; Markdown has its own code-span rules) **and** ~10 thrown/emitted plain CLI messages that are `Error:`/stdout lines, not Markdown, and interpolate value tokens bare — config-key path labels, field names, output paths, template refs (`agent-skill.ts:78, 81, 87, 105, 173, 187, 232, 404, 438, 448, 453`).

The sharpest evidence is one shared helper rendering two ways: `validateArgumentHintPrefix` is called with a **bare** label from the base path (`agent-skill.ts:62`) so `targets.agent-skill.argument-hint-prefix must be a string.` ships unquoted, but with a **quoted** label from the variant path (`config.ts:265`) so the variant equivalent ships quoted. Same validation, adjacent in the codebase, inconsistent on screen.

The spec's exclusion *reason* is always stated as "Markdown surface" (§3 non-scope, §5) — a reason that doesn't apply to these validation messages. So the file-level exclusion likely conflated "the file" with "the Markdown the file emits." Fixing it requires editing `agent-skill.ts`, which AC-6.2 forbids — so it cannot be done under this spec; it needs either a spec amendment or a forward-extension in a new thread. §9 already parks an analogous "extend backticking later for visual consistency" call (fully-literal tokens) as a deferred future discussion.

Project context: private, high-dev-phase, no users, breaking changes cheap. The thread's own genesis (P1 decision C) escalated this work specifically to fix the quoting inconsistency *project-wide in one pass*.

Decision: Accept the finding. Fix the ~10 bare non-Markdown value tokens in `targets/agent-skill.ts` **within this thread** (not a separate follow-up thread) — a separate thread is disproportionate ceremony for a small mechanical fix. The generated-Markdown body stays untouched; only the plain `Error:`/stdout validation/info messages get quoted via the existing per-package `quote` helper.

Rationale: The AC-6.2 / §5 / FR-6 exclusion was justified by "Markdown surface," and that reason does not cover these non-Markdown validation/info messages — they fell through a scoping crack rather than being deliberately exempted. Leaving them bare contradicts the thread's reason for existing (P1 decision C: fix the quoting inconsistency project-wide, in one pass) and ships visibly mixed quoting to users (e.g. base-path `targets.agent-skill.argument-hint-prefix must be a string.` bare vs the quoted variant equivalent from the same helper). The fix is small and mechanical (~10 sites + a few test assertions + `BEHAVIOR.md` regen), so a fresh thread is not warranted. Consequence flagged and accepted: editing `agent-skill.ts` knowingly **supersedes the approved spec's AC-6.2** ("No edit to `targets/agent-skill.ts`") and narrows §5 / FR-6 to exclude only the *generated-Markdown body*, not the file's validation/info messages. This owner-approved, record-backed decision is the authorization for that supersession; the spec's AC-6.2 / §5 / FR-6 should carry a marked erratum so they do not later read as stale. (AGENTS.md's "generated agent-skill Markdown stays untouched" claim remains accurate — the Markdown body is genuinely not edited.) I recommended fixing, so this is an agreed decision with no dissent.

## P2: Finding 2 — `git.ts:170` passthrough error message bare

Point: `install/git.ts:170` renders `git could not be run: ${error.message}` with the underlying Node error message bare. Do we quote it or leave it?

What you need to know: This is the non-`ENOENT` branch of the spawn-error handler (the `ENOENT`/"git missing" case is handled separately and is already quoted via `git_unavailable`). `error.message` here is a free-form OS/Node error *sentence*, not a discrete value token — it's none of the kinds §4.1 enumerates (input names, flags, refs, ids, paths, URLs, config-key paths, type names, enum values, directive snippets). §8 Degrees-of-freedom item 2 explicitly leaves per-site tokenization to the implementer.

The contrast with P1 matters: the agent-skill.ts cases we just accepted are *discrete value tokens* (paths, field names, refs) that plainly belong in the domain. This one is a nested sentence. Backticking it would produce e.g. `git could not be run: \`spawn EACCES\`.` — and for a longer system message, wrapping a whole sentence in a code span reads worse, not better, and isn't what the convention targets.

Decision: Reject — leave it bare, no code change.

Rationale: The token is outside the convention's value-token domain (§4.1) and squarely within the implementer's granted tokenization latitude (§8 DoF #2). Quoting a free-form error sentence reads worse than leaving it bare and would require redefining the convention as "backtick every interpolation regardless of kind," which is broader than what §4.1 defines and was not the intent. No dissent — recommendation and decision agree.
