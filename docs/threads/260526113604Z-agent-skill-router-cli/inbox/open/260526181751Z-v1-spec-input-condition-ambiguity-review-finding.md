## Verdict

Partially ready. All eight semantic-contract elements are present, and the spec is broadly correct relative to the proposal, the design discussion, and the follow-up review-finding discussion; the highest-impact remaining gap is that input-name and condition-expression syntax are still underspecified enough that downstream implementations and tests could diverge.

## Findings

- `issue` - Expected behavior / constraints: The spec defines input types and requiredness, but it does not define the valid input-name grammar or how one declared input name maps across frontmatter keys, CLI flags, condition identifiers, and `{{inputName}}` interpolation. A downstream implementer would have to guess whether names such as `target-file`, `target_file`, `targetFile`, uppercase keys, dotted keys, or Unicode keys are valid, and different choices would change flag parsing, condition validation, interpolation validation, and author-facing diagnostics.

- `issue` - Expected behavior / explicit decisions: The condition-expression contract lists supported literals and operators, but it does not define enough grammar to be handoff-grade. Operator precedence and associativity, accepted string quote forms, string escaping, and number-literal shape are left implicit. A downstream implementer could reasonably parse `a || b && c` differently, or accept only one of the single-quoted and double-quoted string forms used across the spec and proposal, which would make branch selection and template tests drift.

- `issue` - Expected behavior / acceptance guidance: `generate` says it validates and loads the template before reading `name` and `description`, but it does not say whether that means validating only frontmatter metadata or validating the full template body and template semantics. One implementation could generate a router skill for a template with malformed directives because `generate` only needs metadata, while another could fail early; that changes onboarding behavior and the error surface for generated router files.

- `nit` - Expected behavior / acceptance guidance: The output contract uses terms like "clean Markdown" and "ordinary Markdown" to mean directive syntax is erased, but it does not state whether rendered stdout is byte-stable or whether whitespace around removed branches and includes may be normalized by the Markdown renderer. Two implementations could both erase directives while producing different blank lines or wrapping, which matters for snapshot-style CLI tests and for reviewers deciding whether output differences are defects.

## Evidence

- Input-name grammar: `## Template Authoring Contract` says every input must use a uniform `type` field and direct interpolation uses `{{inputName}}`; `## Command Behavior` refers to declared input names, condition references, interpolation references, and input flags, but no section pins the allowed input identifier shape.

- Condition grammar: `## Command Behavior` says condition expressions support "identifiers, string literals, number literals, boolean literals, truthiness, `!`, `==`, `!=`, `&&`, `||`, and parentheses only." The proposal examples use double-quoted strings, while the spec examples use single-quoted strings.

- Generate validation scope: `## Command Behavior` says `generate` will "Validate and load `.skillrouter/<skill>/SKILL.template.md`" and then "Read `name` and `description` from template frontmatter." `## Acceptance Guidance` verifies generated content and output-path behavior, but not whether body-level template errors block generation.

- Output stability: `## Intended Outcome` and `## Command Behavior` say `run` prints "clean Markdown"; `## Template Authoring Contract` says the renderer outputs "ordinary Markdown" and erases directive syntax; `## Error And Output Contract` says successful `run` output is "Markdown only."

## References

- `/Users/jacopo/Developer/projects/personal/tools/skillrouter/docs/threads/260526113604Z-agent-skill-router-cli/specs/260526140146Z-v1-spec.md`
- `/Users/jacopo/Developer/projects/personal/tools/skillrouter/docs/threads/260526113604Z-agent-skill-router-cli/proposals/260526113604Z-agent-skill-router-cli-proposal.md`
- `/Users/jacopo/Developer/projects/personal/tools/skillrouter/docs/threads/260526113604Z-agent-skill-router-cli/discussions/2026-05-26-agent-skill-router-cli-design-discussion.md` - P3, P4, P10, P11, P12, P16, P17, P21, P25, P26, P30, P32
- `/Users/jacopo/Developer/projects/personal/tools/skillrouter/docs/threads/260526113604Z-agent-skill-router-cli/discussions/2026-05-26-v1-spec-findings-review-discussion.md` - P1, P2, P3, P4, P5, P6
- `/Users/jacopo/Developer/projects/personal/tools/skillrouter/docs/threads/260526113604Z-agent-skill-router-cli/inbox/processed/260526140725Z-v1-spec-review-finding.md`

## Open Questions

- What exact regex or grammar defines valid frontmatter input names, and should that grammar be identical to the condition-language identifier grammar?

- Should condition strings accept both single and double quotes, and what escaping rules should apply?

- What precedence and associativity rules apply to `!`, `==`, `!=`, `&&`, and `||` when parentheses are omitted?

- Should `generate` fail on malformed template body syntax, or should it validate only the frontmatter needed to produce the router skill?

- Should acceptance tests compare rendered Markdown byte-for-byte, or should they normalize whitespace that comes from directive removal and Markdown rendering?

## Next Actions

- Emit a new spec version or syntax appendix defining input identifier rules and the condition-expression grammar.

- Clarify `generate` validation scope in expected behavior and acceptance guidance.

- Clarify rendered Markdown stability expectations so downstream tests know whether exact stdout formatting is part of the contract.
