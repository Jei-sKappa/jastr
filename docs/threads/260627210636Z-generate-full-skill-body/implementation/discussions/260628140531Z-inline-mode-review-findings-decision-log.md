# Decision log — inline-mode implementation review findings (the implementation, commits `c247c79..cbf9cd5`)

Thread: docs/threads/260627210636Z-generate-full-skill-body/
Target: the implementation (branch `feat/generate-full-skill-body`, commits `c247c79..cbf9cd5`)
Review served: implementation/reviews/260628121707Z-inline-mode-implementation-review.md
Subject: disposing the two findings (nit 1, nit 2) raised in the implementation review of the `inline` agent-skill generation mode.

## P1: Router-mode message for a mistyped known option

Point: In router mode, a mistyped *known* generate option (e.g. `--ou` for `--out`, or `--frce` for `--force`) no longer produces `Unknown generate option <arg>.` — it now produces `Template input flags are only valid with --mode=inline.` Decide whether to act on this.

What you need to know: Before this change, `validateGenerateArgs` (`packages/cli/src/args.ts`) had an `else` branch that threw `invalid_command` `Unknown generate option <arg>.` for any unrecognized `--flag`. The diff replaced that branch with *collect-as-input-flag-candidate* (`args.ts:393-401`), and a post-loop gate (`args.ts:410-417`) throws `Template input flags are only valid with --mode=inline.` whenever the effective mode is router and any candidate was collected. The literal "Unknown generate option" string is now gone from `@jastr/cli` entirely (confirmed by grep).

This was a deliberate plan decision (`plans/001/plan.md:65`) and sits inside the spec's Degrees of freedom ("Commander wiring… always collect passthrough flags and reject any in router mode"). The spec pins neither the message nor unknown-option handling; FR-2/AC-2.x byte-identity is about the generated output bytes, not argv error messages. The only friction is mild tension with the "with no `--mode`… behavior is byte-identical to today" line, on this one error path.

The reason it can't be cleanly "fixed back" to the old message unconditionally: in router mode the validator genuinely cannot tell a typo'd known option (`--frce`) from a real template-input-flag candidate (`--frce` *is* a legal input name for some template in inline mode). All it knows in router mode is "input flags aren't allowed here."

Three options were weighed against two user-facing mistake cases that hit the same branch:
- Case #1 — typo of a known option (`jastr generate agent-skill demo --out out/SKILL.md --frce`, meant `--force`).
- Case #2 — a real input flag but the user forgot `--mode=inline` (`jastr generate agent-skill demo --out out/SKILL.md --topic=auth`).

Option A (current message): helpful for Case #2 (points at `--mode=inline`), misleading for Case #1, and never names the offending token. Option B (restore `Unknown generate option <arg>.`): byte-identical to pre-feature behavior and best for Case #1, but for Case #2 it frames a valid input flag as an unknown option and gives no hint that `--mode=inline` would accept it — steering the user to a wrong conclusion. Option C (combined): `Unknown generate option or template input flag <arg>; template input flags are only valid with --mode=inline.` — names the token and covers both readings, the only option helpful in both cases.

Decision: Option C. Change the router-mode rejection message to the combined form that names the offending token and covers both interpretations: `Unknown generate option or template input flag <arg>; template input flags are only valid with --mode=inline.` Update the one affected e2e expected-stderr (`generate-inline-router-flag-rejected`) and regenerate `BEHAVIOR.md`.

Rationale: C is the only option helpful in both failure cases, names the offending token (which the current message A does not), and points to the inline fix. The user initially proposed Option B (restore "Unknown generate option"), which restores exact byte-identity with pre-feature behavior and is the strongest message for the typo case; we preferred C because B's failure mode for Case #2 is the more damaging one — it leads the forgot-inline user to conclude the flag is unsupported rather than pointing them at `--mode=inline`, whereas a typo (Case #1) is usually self-recoverable even with an imperfect message. C stays within the spec's degrees of freedom (exact wording of error messages) and keeps GEN-FR-0029.AC-0001 satisfied (still `invalid_command`, exit 1; the AC pins the code, not the text).

## P2: `missing_target_metadata` "writes no file" half has no machine assertion

Point: The inline `missing_target_metadata` e2e case (`generate-inline-missing-target`) asserts exit 1 + stderr, but not that no file was written (AC-6.5). Its sibling `missing_required_input` does get a unit-level "…and writes no file" assertion. Decide whether to close that asymmetry.

What you need to know: The e2e harness has no `fileAbsent:` primitive, so the "writes no file" half is checked by inspection during fixture capture — matching the existing `generate-check-invalid-template` convention. The implementation report already routed a `fileAbsent:`-style harness primitive to a candidate seed (a future thread), not this one.

The code path provably guarantees no write for both errors: in `executeGenerate`, target resolution throws `missing_target_metadata` at `commands.ts:172-192`, the render throws `missing_required_input` at `:206`, and `writeAgentSkill` is the very last step at `:248`. Notably, `missing_target_metadata` throws strictly earlier in the same linear function than `missing_required_input` — which already has a passing unit test asserting no file is written (`generate-command.test.ts`: "fails inline generation when a required input is unresolved and writes no file"). So the no-write guarantee for the target-metadata case is already transitively covered: if the later throw writes nothing, the earlier one cannot either.

Decision: Add one cheap mirror unit test in `generate-command.test.ts` for the `missing_target_metadata` inline path (asserting it throws `missing_target_metadata` and writes no file), giving AC-6.5 the same direct machine teeth AC-5.1 has. Do not build the `fileAbsent:` harness primitive in this thread — it stays the already-named candidate seed for a future thread.

Rationale: the `fileAbsent:` primitive is a real harness feature that would benefit many existing cases, so forcing it in here would be scope drift; it belongs in its own thread. The mirror unit test is ~5 lines, lives next to the test it mirrors, and the code is already open for P1, so the marginal cost is near-zero. It is belt-and-suspenders given the transitive coverage, but it pins the write-ordering against a future refactor that could move `writeAgentSkill` earlier. The alternative (accept as-is, rely on transitive coverage) was acceptable too; we chose the test because the cost is trivial while already in the file.
