## Verdict

partially ready - the core containment model is mostly actionable, but the questions/decisions layer and stable error contract leave enough ambiguity that a downstream implementer would have to make product decisions while coding.

## Findings

- [issue] Unresolved questions / explicit decisions: the questions layer is internally inconsistent. The scope says nested groups and the final named-access grammar are deferred, the command-shape section calls named lookup an open item, but the Questions section contains only resolved answers for both areas. A downstream implementer cannot tell whether grouped named access and nested group behavior are in scope for this spec, deferred to a later spec, or already settled.
- [issue] Expected behavior / acceptance guidance: the changed include error contract is underspecified. The spec says to update the include error contract and requires stable `Error: <message>` output, but it does not define the new message templates or error codes for containment escapes, invalid `root` values, `root="group"` on standalone templates, or invalid group-marker layouts. Because the CLI behavior docs and e2e cases pin exact output, the implementer would have to invent user-facing contract text.
- [issue] Expected behavior: group-marker validity rules are stated as errors without enough observable behavior. The spec says `.jastrgroup` is an empty marker and that `.jastrgroup` without `templates/` or with `template.md` is an error, but it does not say whether non-empty marker files are invalid, when the layout checks run, or whether the checks apply equally to direct-file rendering, named access, and includes. Two implementers could produce incompatible failure timing and coverage.
- [nit] Intended outcome / cross-element coherence: the opening guarantee around `.env`, SSH keys, and arbitrary files is broader than the later containment-only decision. Later sections explicitly allow within-boundary `.env` files and remove the denylist, so the initial wording could cause an implementer or reviewer to preserve a secrets denylist that the body otherwise rejects.

## Evidence

- Finding 1: `## Scope` says nested groups and final named-access grammar are deferred, `### Command shapes` calls named lookup "an open item", and `## Questions` has only `### Resolved` answers for named access and nested groups.
- Finding 2: `## Scope` includes "Updating the include error contract", `## Constraints` requires one `Error: <message>` line, and `## Acceptance Guidance` asks for a stable error without defining the replacement messages.
- Finding 3: `### Group marker` states that `.jastrgroup` is empty and that two marker/layout shapes are errors, but `## Acceptance Guidance` only checks that `.jastrgroup` establishes a boundary and that `templates/` alone does not.
- Finding 4: `## Intended Outcome` promises protection from `.env` and SSH-key style files, while `## Scope` removes the standalone denylist and `## Questions` resolves within-boundary secrets as author responsibility.

## References

- /Users/jacopo/Developer/projects/personal/tools/jastr/docs/threads/260607220555Z-include-group-containment/specs/260607220555Z-v1-spec.md
- /Users/jacopo/Developer/projects/personal/tools/jastr/docs/threads/260605091319Z-core-cli-package-split/specs/260606182808Z-v2-spec.md - cited by the reviewed spec as the superseded include/error contract.

## Open Questions

- Should grouped named access be implemented as part of this v1 spec, or is it intentionally deferred despite the command-shape examples?
- Are nested groups intentionally supported by nearest-marker discovery, intentionally rejected, or outside this implementation pass?
- What exact stable error codes and message templates should replace the superseded include error contract?
- Should the spec state that no unresolved questions remain, or are there still non-blocking open items to name explicitly?

## Next Actions

- Emit a new spec version that reconciles scope, command shapes, and Questions so named access and nested groups each have one clear status.
- Add an explicit replacement error-code/message contract and acceptance cases for invalid root values, missing group roots, containment escapes, and invalid group-marker layouts.
- Tighten the intended-outcome security wording so it matches the settled containment-only/no-denylist decision.
- After the handoff-grade gaps are addressed, run a separate adversarial review focused on the containment/security edge cases.
