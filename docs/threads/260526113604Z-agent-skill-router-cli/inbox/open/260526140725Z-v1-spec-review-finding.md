## Verdict

Partially ready. All eight semantic-contract elements are present, and the spec is broadly correct relative to the discussion, but several handoff-level details remain ambiguous enough that a downstream implementer would have to choose behavior for generated output paths, directive syntax, include safety, included frontmatter, and skill-name validation.

## Findings

- `issue` - Expected behavior / constraints: `generate --out` requires an explicit path, but the spec does not define how that path is resolved or bounded. A downstream implementer would have to guess whether relative paths are resolved from `cwd` or the discovered project root, whether output may be outside the project root, and whether missing parent directories are created or rejected. That matters because `generate` writes files and the discussion's main safety concern was avoiding surprising writes.

- `issue` - Expected behavior / explicit decisions: The include directive syntax is ambiguous and appears inconsistent with the discussion's concrete example. The discussion records `::include{path="..."}` as the include shape, while the spec examples use `:::include{path="..."}` and `:::include-raw{path="..."}` without closing container markers. A downstream implementer using `remark-directive` would have to decide whether includes are leaf directives, container directives, or whether multiple marker lengths are accepted.

- `issue` - Constraints / expected behavior: Include containment says resolved paths must stay inside the discovered project root, but it does not state whether containment is checked lexically or after resolving symlinks. A downstream implementer could pass tests with simple `../` normalization while still allowing a symlink inside the project to expose files outside the project root.

- `issue` - Expected behavior: Included files are described as v1 fragments that do not declare additional input schemas, but the spec does not define what happens if an included file contains YAML frontmatter. A downstream implementer has to choose between rejecting frontmatter, stripping metadata while processing the body, or rendering the frontmatter as Markdown text, which would produce different final instructions.

- `nit` - Expected behavior: The phrase "single safe directory name" is present but underspecified. Two implementers could reasonably choose different allowed character sets for skill names, including decisions about dots, leading dots, spaces, uppercase letters, Unicode, and reserved names such as `.` or `..`, which would make CLI behavior and tests drift.

## Evidence

- `generate --out` path ambiguity: `## Scope` says `skillrouter generate <skill> --out <path> [--force]`; `## Command Behavior` says it writes "to the explicit output path." The discussion's P2 and P22 decide explicit output and overwrite protection, but not resolution, containment, or parent-directory behavior.

- Include directive syntax mismatch: `## Template Authoring Contract` shows `:::include{path="fragments/typescript.md"}` and `:::include-raw{path="examples/raw-prompt.md"}`. The discussion's P9 states the example as `::include{path="docs/languages/typescript/analysis-rules.md"}`.

- Include containment ambiguity: `## Command Behavior` says `../` is allowed only if "the final resolved path remains inside the discovered project root." The discussion's P18 uses the same containment idea but does not settle lexical versus real filesystem resolution.

- Included frontmatter ambiguity: `## Template Authoring Contract` says "`include` reads the target and processes Skillrouter directives and direct input interpolation inside that file" and "Included files are fragments in v1: they do not declare additional input schemas." The proposal's rough shape mentions recursively parsing included `.template.md` files, which makes frontmatter behavior an observable edge case.

- Skill-name validation ambiguity: `## Scope` says skill resolution is "from a single safe directory name"; `## Command Behavior` says to "Validate that `<skill>` is a single safe directory name."

## References

- `/Users/jacopo/Developer/projects/personal/tools/skillrouter/docs/threads/260526113604Z-agent-skill-router-cli/specs/260526140146Z-v1-spec.md`
- `/Users/jacopo/Developer/projects/personal/tools/skillrouter/docs/threads/260526113604Z-agent-skill-router-cli/discussions/2026-05-26-agent-skill-router-cli-design-discussion.md` - P2, P6, P9, P18, P22, P24, P25, P32
- `/Users/jacopo/Developer/projects/personal/tools/skillrouter/docs/threads/260526113604Z-agent-skill-router-cli/proposals/260526113604Z-agent-skill-router-cli-proposal.md`

## Open Questions

- Should `--out` be resolved relative to the invoking `cwd` or the discovered project root, and may it intentionally write outside the project root?

- Should `generate` create missing parent directories for `--out`, or fail unless the parent directory already exists?

- Are `include` and `include-raw` leaf directives with `::` syntax, or should v1 accept the `:::` examples currently shown in the spec?

- Should include containment use `realpath`-style symlink resolution before deciding whether the target remains inside the project root?

- If an included fragment contains YAML frontmatter, should that be rejected, stripped, or rendered as ordinary content?

- What exact regex or naming rule defines a valid v1 `<skill>` name? This likely needs the spec author to decide.

## Next Actions

- Emit a new spec version clarifying `generate --out` path resolution, containment, parent-directory behavior, and skill-name validation.

- Emit a new spec version or syntax appendix clarifying the normative directive marker syntax for `if`, `else-if`, `else`, `include`, and `include-raw`.

- Clarify include file handling in the new spec version, especially symlink containment and frontmatter behavior in included fragments.

- Consider a separate adversarial review focused on include path traversal, symlink handling, and accidental secret exfiltration before implementation.
