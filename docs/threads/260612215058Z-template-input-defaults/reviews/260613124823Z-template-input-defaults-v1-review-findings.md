## Verdict

partially ready - the spec is materially aligned with the settled discussion, especially P3-P18, and it covers all eight handoff-grade elements, but config validation scope and stable config error wording remain ambiguous enough that two downstream implementers could produce different CLI behavior and e2e fixtures.

## Findings

- [issue] Expected behavior / constraints: selected-template config validation scope is ambiguous. The spec says the recognized `inputs` section is strictly validated, but the CLI flow says to select only `inputs.<named-ref>` and that entries for other template refs are not validated during this run. A downstream implementer has to guess whether malformed non-selected entries under `inputs` should break unrelated template runs, which affects project-wide config ergonomics, error behavior, and e2e coverage.

- [issue] Expected behavior / acceptance guidance: config parse and shape error outputs are not pinned. The spec says errors should use a code "such as" `invalid_config` and messages "along these lines", while also requiring stable CLI error messages and living-doc/e2e coverage. A downstream implementer cannot know whether to treat the listed strings as exact golden outputs or examples, so the implementation and tests could drift from the intended UX.

## Evidence

- Config validation scope: `## Project Config File` says unknown top-level keys are ignored while the recognized `inputs` section is strictly validated, then says non-mapping selected template entries are errors; `## CLI Merge and Validation Behavior` says entries for other template refs are not validated during this run. Discussion P5 says entries for other template refs should not affect the selected run; discussion P12 names invalid shape cases but does not explicitly settle non-selected malformed entries.

- Config error outputs: `## Project Config File` says config parse and shape failures should use a stable code "such as" `invalid_config` and message templates "along these lines"; `## Acceptance Guidance` expects invalid YAML and config shapes to fail with stable error messages.

## References

- `/Users/jacopo/Developer/projects/personal/tools/jastr/docs/threads/260612215058Z-template-input-defaults/specs/260613120641Z-v1-spec.md`
- `/Users/jacopo/Developer/projects/personal/tools/jastr/docs/threads/260612215058Z-template-input-defaults/discussions/2026-06-13-template-input-defaults-design-discussion.md` decisions P1-P18, with P3 superseding P1/P2 for v1 config scope and precedence.
- `/Users/jacopo/Developer/projects/personal/tools/jastr/docs/threads/260612215058Z-template-input-defaults/proposals/260612215058Z-input-defaults-proposal.md`

## Open Questions

- Should `jastr run review` ignore a malformed non-selected entry such as `inputs.other-template: true`, or should any malformed child of the recognized `inputs` mapping fail the run? This needs the spec author because P5 strongly protects unrelated templates, while P12 only explicitly names the selected entry shape.

- Are the four config parse/shape messages in the spec exact golden CLI outputs, including punctuation and `<template-ref>` interpolation, or illustrative wording? This should be answered before e2e fixtures are emitted.

## Next Actions

- Emit a v2 spec that explicitly states whether shape validation below `inputs` is selected-entry-only or all-entries, including one acceptance bullet for a malformed non-selected template entry.

- In the same v2 spec, replace "such as" / "along these lines" with exact config error code and message templates, or explicitly state that the implementation may choose exact wording and acceptance should assert only exit code/error class.
