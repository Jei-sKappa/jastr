# V1 Input And Condition Ambiguity Review Discussion
This log records decisions for resolving the v1 spec review finding about input-name syntax, condition-expression grammar, generate validation scope, and rendered output stability.

## P1: Input Identifier Grammar

Point: Decide the exact grammar for declared input names and whether the same spelling is used in frontmatter keys, CLI flags, condition identifiers, and `{{...}}` interpolation.

What you need to know: The current spec says input flags are declared in frontmatter under `inputs`, referenced in conditions, referenced in interpolation, and passed as CLI flags, but it never defines a valid input-name shape. Relevant places: `docs/threads/260526113604Z-agent-skill-router-cli/specs/260526140146Z-v1-spec.md` lines 106-124, 185-194, and 224-240.

This is not just naming style. If v1 allows kebab-case names like `target-file`, they are natural as CLI flags (`--target-file=value`) but awkward as condition identifiers (`target-file` looks like subtraction, even if subtraction is unsupported). If v1 allows camelCase like `targetFile`, conditions and interpolation are clean, but CLI flags look less conventional. If v1 introduces mapping (`targetFile` becomes `--target-file`), the contract gets friendlier but less direct and creates more validation surface.

Choice: Use kebab-case input names as canonical CLI-oriented names; use the same kebab-case spelling in frontmatter keys, CLI flags, and body interpolation; require condition references to wrap the input name as `${input-name}`.

Rationale: Inputs are essentially CLI flags, so kebab-case gives the most natural command surface. Bare kebab-case condition identifiers would make `target-file` look like `target - file`, so conditions will use explicit `${...}` input references instead. A local parser smoke test confirmed `remark-directive` preserves quoted attribute values such as `condition="${target-file} == 'README.md'"` cleanly. The accepted trade-off is that body interpolation uses `{{input-name}}` while conditions use `${input-name}`.

## P2: Condition Grammar Details

Point: Decide the exact v1 condition-expression grammar for literals, precedence, associativity, and escaping now that input references are written as `${input-name}`.

What you need to know: The current spec says conditions support identifiers, string literals, number literals, boolean literals, truthiness, `!`, `==`, `!=`, `&&`, `||`, and parentheses only, but it does not define precedence, associativity, accepted quote forms, string escaping, or number-literal shape. With P1, bare identifiers should probably disappear from the condition language and declared inputs should be referenced only as `${input-name}`.

The main implementation risk is divergent parsing. For example, `${a} || ${b} && ${c}` must either always mean `${a} || (${b} && ${c})`, always mean `(${a} || ${b}) && ${c}`, or be rejected unless parenthesized.

Choice: Define a conventional small expression grammar. Support `${input-name}`, booleans `true`/`false`, single-quoted and double-quoted strings with backslash escapes, integer/decimal number literals, parentheses, prefix `!`, equality `==`/`!=`, `&&`, and `||`. Precedence from high to low: `!`, equality, `&&`, `||`; all binary operators are left-associative. Remove bare identifiers from the condition contract.

Rationale: A safe parser and evaluator are required because delegating condition strings to TypeScript or JavaScript would violate the v1 constraint against arbitrary JS/TS execution and would expose unwanted semantics such as globals, function calls, property access, coercion, and runtime-specific behavior. A conventional grammar matches author expectations without much extra implementation cost once parsing is required. Equality tokens remain `==` and `!=`, but Skillrouter should evaluate them with explicit typed semantics rather than JavaScript coercion.

## P3: Generate Validation Scope

Point: Decide whether `skillrouter generate` validates the full template body or only the frontmatter metadata needed to write the router skill.

What you need to know: The current spec says `generate` will “Validate and load `.skillrouter/<skill>/SKILL.template.md`” and then read `name` and `description` from frontmatter. That leaves room for two implementations: one that rejects malformed directives/includes/interpolation during generation, and one that only checks frontmatter because generated output only needs metadata.

This affects onboarding. If `generate` fully validates the template, users discover template errors before installing or writing the router skill. If it validates only metadata, users can generate the wrapper earlier, but the first real `run` may fail later.

Choice: `generate` performs full static template validation: frontmatter, schema, body directives, condition syntax, interpolation references, declared input references, statically checkable include paths, missing includes, and include cycles. It does not evaluate runtime branch truth because no invocation inputs are provided.

Rationale: Generated router skills should not point at templates with errors that are knowable before invocation. The important implementation constraint is that `generate` and `run` must share the same compiler validation pipeline or common validation modules; the checks should not be duplicated independently in each command. The trade-off is that `generate` can fail for body-level template errors even though it only needs `name` and `description`, but this is acceptable because it gives earlier feedback and keeps command behavior consistent.

## P4: Rendered Markdown Stability

Point: Decide whether successful `run` output is byte-stable Markdown or whether tests/implementations may normalize whitespace around removed directives and rendered includes.

What you need to know: The current spec says `run` prints “clean Markdown,” “ordinary Markdown,” and “Markdown only,” but does not say whether exact whitespace is part of the contract. This matters because directive removal can easily leave extra blank lines, and Markdown parsers/stringifiers may normalize formatting.

TypeScript does not decide this automatically. The renderer can remove directive lines from the original text and keep whatever whitespace remains; parse Markdown into an AST, remove nodes, then stringify Markdown again; or remove nodes and apply a small cleanup rule to blank lines. Those are all TypeScript implementations, and they can produce different text.

The question is not whether Skillrouter literally preserves exactly what the user wrote, because successful `run` must remove directive syntax and unselected branches. The question is: after removing hidden Skillrouter syntax, should the renderer preserve leftover whitespace exactly, or clean up whitespace created by that removal?

For example, given:

```md
A

::::if{condition="${show-b}"}
B
::::

C
```

If `${show-b}` is false, preserving leftover whitespace exactly may produce:

```md
A


C
```

Cleaning up directive-removal gaps would instead produce:

```md
A

C
```

Choice: Use byte-stable/source-preserving rendered output for v1: after removing directive syntax and unselected content, preserve the leftover authored whitespace exactly rather than applying additional blank-line cleanup.

Rationale: This is the simplest, most explicit, and most unambiguous v1 behavior. Note: I recommended bounded normalization because hidden routing syntax can create extra blank lines in agent-facing Markdown, but the user accepted that trade-off and preferred source-preserving behavior for now. If exact preservation becomes inconvenient, a later spec can introduce a bounded normalization rule.
