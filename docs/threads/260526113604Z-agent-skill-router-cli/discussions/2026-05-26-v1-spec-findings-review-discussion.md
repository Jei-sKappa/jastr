# V1 Spec Review Discussion

This log records decisions for resolving the v1 spec review findings around output paths, directive syntax, include safety, included frontmatter, and skill-name validation.

## P1: Generated Output Path Boundary

Point: How should `skillrouter generate <skill> --out <path>` resolve the output path, and should it be allowed to write outside the discovered project root?

What you need to know: The review points out that the v1 spec says `generate` writes “to the explicit output path,” but does not define whether relative paths are resolved from the invoking `cwd` or the discovered project root, nor whether the destination may be outside the project root.

The earlier design discussion already decided that `generate` must require an explicit `--out` because agent-facing skill locations are ecosystem-specific and guessing would cause surprising writes. It also decided existing files are protected by default and require `--force` to overwrite. This means the remaining question is not whether the user must be explicit, but what “explicit” means for path resolution and project boundaries.

Choice: Resolve relative `--out` paths from the invoking `cwd`, and allow output outside the project root.

Rationale: `--out` behaves like a normal filesystem CLI argument, which works naturally with shell path autocomplete from the current directory. If the user invokes the CLI from a subdirectory such as `docs/`, they can intentionally use `..` or an absolute path. The main trade-off is that project-local examples like `.claude/skills/foo/SKILL.md` become sensitive to the invocation directory; recommended project-root examples and clear docs should make that expectation explicit.

## P2: Missing Parent Directories

Point: Should `skillrouter generate --out <path>` create missing parent directories, or fail unless the parent directory already exists?

What you need to know: The review points out that the spec says `generate` writes to the explicit output path and refuses overwrites without `--force`, but does not say what happens when the destination parent directory is missing.

This matters because generated router skills commonly target nested paths like `.claude/skills/analyze-code/SKILL.md`. If the CLI creates parents, first-time setup is smoother. If it refuses missing parents, accidental typos in `--out` are easier to catch.

Choice: Create missing parent directories automatically.

Rationale: `--out` is already explicit and existing files remain protected unless `--force` is provided, so creating parent directories is a useful first-time setup convenience. The main trade-off is that a mistyped destination can create an unwanted directory tree, but that is acceptable for this scaffolding-like command.

## P3: Include Directive Marker Syntax

Point: Should `include` and `include-raw` be leaf directives with `::` syntax, or should v1 accept the `:::` examples currently shown in the spec?

What you need to know: The review found a real mismatch: the earlier design discussion chose examples like `::include{path="docs/languages/typescript/analysis-rules.md"}`, while the current spec shows:

```md
:::include{path="fragments/typescript.md"}

:::include-raw{path="examples/raw-prompt.md"}
```

With `remark-directive`, this distinction matters. `::name{}` is a leaf directive. `:::name ... :::` is a container directive. The spec examples use triple-colon syntax without closing container markers, which is ambiguous and likely malformed depending on parser behavior.

Includes do not need child Markdown content; they only need a `path` attribute and expand to the referenced file content. Conditional content already uses container directives because it wraps body content.

Choice: Normatively require leaf directives for includes: `::include{path="..."}` and `::include-raw{path="..."}`.

Rationale: The current `:::` examples are a spec bug rather than syntax worth preserving. Includes are leaf operations with no body content, so v1 should expose one clear marker form that matches the design discussion. The trade-off is that includes use a different marker length than conditional container directives, but that difference reflects the underlying directive shape.

## P4: Include Symlink Containment

Point: Should include containment be checked lexically after path normalization, or after resolving symlinks with real filesystem paths?

What you need to know: The current spec says `../` is allowed only if “the final resolved path remains inside the discovered project root.” The review notes that this does not say whether “resolved” means lexical normalization or real filesystem resolution.

The difference matters when a file inside the project is a symlink to somewhere outside it. Lexical containment would allow `.skillrouter/fragments/secrets-link.md` because the path string is inside the project. Realpath containment would reject it if the symlink target is outside the project root.

This is a read-safety boundary. Includes cause Skillrouter to read files and print their contents into agent-facing output.

Choice: Use lexical normalization only for v1, and add a TODO/open question to think through symlink handling because symlinks can bypass the project-root boundary but may often be intentional by the final user.

Rationale: Lexical containment keeps v1 simple and does not reject intentional user-created symlink workflows. The main trade-off is that the project-root boundary is not a complete read-safety boundary when symlinks point outside the project. Note: recommended realpath containment because it better matches the stated safety boundary; user accepted the symlink escape risk for v1 and wants the spec to carry a TODO for future handling.

## P5: Included Fragment Frontmatter

Point: If an included fragment contains YAML frontmatter, should `include` reject it, strip it and process the body, or render it as ordinary Markdown content?

What you need to know: The spec says root templates have YAML frontmatter with `name`, `description`, and optional `inputs`. It also says included files are v1 fragments and “do not declare additional input schemas.”

The ambiguity is what happens if an included file starts with frontmatter anyway:

```md
---
title: TypeScript Rules
---

Use strict compiler diagnostics.
```

This matters because `include` recursively processes Skillrouter directives and interpolation. If included frontmatter is accepted as metadata, implementers must decide whether to merge it, ignore it, validate it, or strip it. If it renders as text, the final agent instructions may contain accidental metadata fences.

Choice: Render frontmatter-like content in included fragments as ordinary Markdown content.

Rationale: Skillrouter only recognizes YAML frontmatter on the root `SKILL.template.md`; included files are Markdown fragments, not frontmatter-bearing template documents. If a fragment starts with `---`, those lines are part of the fragment body and pass through the normal `include` processing pipeline, including nested directive processing and interpolation. The main trade-off is that accidental copied frontmatter may appear in rendered output, but this matches the principle that authors who write content in fragments generally intend it to be preserved as content. `include-raw` remains available for literal insertion with no Skillrouter processing.

## P6: Skill Name Validation

Point: What exact rule should define a valid v1 `<skill>` name?

What you need to know: The review flags that “single safe directory name” is underspecified. The existing decision only says slash-separated skill paths are out of v1 and `<skill>` maps to `.skillrouter/<skill>/SKILL.template.md`.

This affects both behavior and tests. Without an exact rule, implementers could differ on uppercase letters, dots, spaces, Unicode, leading dots, or reserved names like `.` and `..`.

The rule should be boring and easy to explain because v1 intentionally does not support nested skill groups.

Choice: Allow lowercase ASCII slugs only: `^[a-z0-9][a-z0-9-]*$`.

Rationale: Lowercase ASCII slugs are simple, shell-friendly, and easy to document in examples and tests. The trade-off is rejecting underscores, uppercase names, dots, and Unicode in v1, but loosening the rule later is easier than tightening an overly permissive initial contract.
