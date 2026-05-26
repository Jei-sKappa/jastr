# Agent Skill Router CLI Design Discussion

This discussion clarifies technical and product decisions for the Agent Skill Router CLI proposal before writing a spec.

## P1: V1 Product Boundary

Point: Should v1 only render specialized instructions from `.skillrouter/`, or should it also generate/install the tiny agent-facing `SKILL.md` router files?

What you need to know: The proposal separates two surfaces:

The agent-facing skill lives wherever the active agent ecosystem expects it, for example `.agents/skills/<skill>/SKILL.md` or `.claude/skills/<skill>/SKILL.md`, and contains only “run `skillrouter run <skill> $ARGUMENTS` and follow the output.”

The richer source lives in `.skillrouter/<skill-name>/SKILL.template.md`, which Skillrouter reads, validates, specializes, resolves includes for, and prints as Markdown.

This boundary matters because “render templates” is a smaller compiler-like product, while “also install router skills” means Skillrouter needs opinions about different agent ecosystems, paths, generated files, overwrites, sync behavior, and maybe uninstall/update commands.

Choice: V1 includes `skillrouter run <skill>` plus a narrow `generate` command for creating agent-facing router skill files.

Rationale: This keeps `run` as the core compiler-like behavior while giving users a supported onboarding path for the tiny agent-facing `SKILL.md` files. The main trade-off is that `generate` adds some filesystem and overwrite concerns, so the spec should keep it explicit and narrow rather than expanding into full lifecycle management.

## P2: Generate Target

Point: How should `skillrouter generate` decide where to write the agent-facing `SKILL.md` file?

What you need to know: The proposal says agent-facing router skills may live in different ecosystems, such as `.agents/skills/<skill>/SKILL.md`, `.claude/skills/<skill>/SKILL.md`, or another tool-specific location. Since the project goal is not to be tightly coupled to any one agent, auto-detecting the “right” destination can become surprising.

This is especially important because `generate` writes files. If it guesses wrong, it may create noise in the repo or overwrite a skill for a different agent. But if it requires too much manual path input every time, the command becomes annoying and less useful than a documented snippet.

Choice: `skillrouter generate` requires an explicit output path, for example `skillrouter generate analyze-code --out .claude/skills/analyze-code/SKILL.md`.

Rationale: Explicit output keeps v1 deterministic, agent-agnostic, and aligned with the proposal's “not our business” boundary. The trade-off is a more verbose command and requiring users to know their agent's skill location, but that is preferable to surprising auto-detection or premature agent-specific target support.

## P3: Template Authoring Syntax

Point: Should v1 use Markdown directives as the primary template syntax, or use a more config-first format?

What you need to know: The proposal leans toward Markdown templates with frontmatter plus directives like:

```md
::::include{path="docs/languages/typescript/analysis-rules.md" when="language == 'typescript'"}

::::step{name="read-target" when="target"}
Read `{{target}}`.
::::
```

This keeps authoring close to normal skill writing: Markdown remains the main surface, and directives mark conditional blocks/includes. The downside is that directive syntax can feel unusual, and using Markdown AST tooling introduces parsing edge cases we must define carefully.

The alternative is a more config-first model, for example YAML/JSON describing inputs, routes, includes, and steps. That can be easier to validate structurally, but it makes authoring feel less like writing an agent instruction and more like maintaining a workflow config.

Choice: V1 uses Markdown with frontmatter and directives as the primary template authoring syntax.

Rationale: This matches the proposal and keeps authoring close to normal skill writing while still enabling deterministic specialization. The trade-off is that directive syntax and parser behavior need careful documentation, so v1 should support a small documented directive set rather than multiple authoring formats.

## P4: Parser Foundation

Point: Should v1 build on the `unified`/`remark` Markdown AST ecosystem, or implement a small custom parser for Skillrouter directives?

What you need to know: I checked the repo shape and there is no existing `package.json` or implementation stack yet, so we are not constrained by current dependencies.

Because P3 chose Markdown + frontmatter + directives, the implementation needs to parse normal Markdown, frontmatter, directives, nested directive content, and then render clean Markdown. The proposal already mentions `remark` / `unified` with `remark-directive` as a likely fit.

The product contract should be “Skillrouter supports this documented template syntax,” not “Skillrouter exposes remark internals.” The library choice should help us implement the contract, but users should not need to know the AST model.

Choice: V1 uses the `unified` / `remark` Markdown AST ecosystem, including `remark-directive` or equivalent remark-compatible directive support.

Rationale: A real Markdown parser reduces edge-case risk around nested Markdown, code fences, and clean Markdown rendering. The trade-off is accepting a dependency surface and somewhat unusual directive marker syntax, so the implementation should isolate remark behind internal parser/rendering modules and keep the user-facing contract focused on Skillrouter's documented syntax.

## P5: V1 Directive Set

Point: Which Markdown directives should v1 support as first-class syntax?

What you need to know: We have chosen Markdown + frontmatter + directives, backed by `remark`. The proposal examples use two directive concepts:

`include`: pull in another Markdown or template file, optionally gated by `when`.

`step`: wrap selected instruction content and compile it to clean agent-facing Markdown.

There is a tempting third concept: a generic conditional block such as `if`, for content that is not an include or a step. Without it, authors may misuse `step` just to conditionally include arbitrary prose. With it, the directive set becomes slightly broader but more honest.

The v1 directive set should be small enough to document fully, but expressive enough that authors do not immediately need hacks.

Choice: V1 supports conditionals (`if` / `if-else`) and include/embed directives, but does not support `step` as a first-class directive.

Rationale: `step` is an author-level instruction pattern rather than a core routing primitive. I initially recommended supporting `step`, but the better boundary is for Skillrouter to select and embed Markdown while leaving headings, steps, and workflow structure to the template author. The trade-off is that Skillrouter provides less semantic structure, but the compiler surface stays smaller and less opinionated.

## P6: Include vs Embed

Point: Should v1 treat `include` and `embed` as two different operations, or use one directive for inserting external Markdown?

What you need to know: You named “include/embed” as part of the minimum syntax. Those words can mean the same thing, but they can also imply different behavior:

`include` often means “read another Skillrouter template or Markdown fragment and process it as part of the current template.”

`embed` often means “insert a file’s contents literally, without interpreting directives inside it.”

This distinction matters for safety and predictability. Recursive template evaluation is powerful, but it means included files can contain their own conditionals and further includes. Literal embedding is safer for examples, docs snippets, prompts, or code blocks where `::::if`-like text should not execute.

Choice: V1 uses two directives named `include` and `include-raw`.

Rationale: Two directives make the processing boundary explicit: `include` reads the target file and processes Skillrouter syntax recursively, while `include-raw` reads the target file and inserts its contents without evaluating Skillrouter directives or interpolation inside that file. The `include-raw` name is preferred over `embed` because both operations are forms of including, and `raw` clearly communicates that the difference is Skillrouter processing, not whether the result is Markdown.

## P7: Conditional Block Syntax

Point: What conditional directive shape should v1 support for `if` / `else`?

What you need to know: We need syntax that works well with `remark-directive`, stays readable in Markdown, and is easy to parse into a deterministic conditional tree.

The awkward part is `else`. Markdown directives naturally express blocks, but paired `if` / `else` blocks can be represented in a few ways. The syntax should avoid ambiguity when nested conditionals appear.

Choice: V1 supports sibling `if`, `else-if`, and `else` block directives with strict adjacency.

Rationale: This shape is familiar and expressive while keeping parsing deterministic if `else-if` and `else` are required to immediately follow the prior conditional branch except for blank lines. The trade-off is that the compiler must implement and diagnose adjacency rules carefully, especially for nested conditionals.

## P8: Condition Attribute Name

Point: Should conditional directives use a named `condition` attribute, a shorter `when` attribute, or positional text for the expression?

What you need to know: The proposal examples used `when`, for example `when="language == 'typescript'"`. For an actual `if` directive, both of these are plausible:

```md
::::if{when="language == 'typescript'"}
```

```md
::::if{condition="language == 'typescript'"}
```

Some directive syntaxes also allow labels, but those are usually less obvious and may be harder to parse consistently:

```md
::::if[language == 'typescript']
```

This is small, but it affects every template example.

Choice: `if` and `else-if` use a `condition` attribute, and include directives do not accept conditional attributes.

Rationale: The condition syntax is explicit where it matters, and conditional includes must be expressed by wrapping the include in an `if` block. This avoids having two ways to express conditional rendering, even though it makes simple conditional includes slightly more verbose.

## P9: Include Directive Shape

Point: What exact attribute shape should `include` and `include-raw` use?

What you need to know: We have decided that `include` processes Skillrouter syntax recursively, while `include-raw` inserts the target file without Skillrouter processing. We have also decided that includes must not have their own `when` or `condition` attribute.

That leaves the file reference itself. The proposal used `path="..."`, but directive syntax could make the path shorter. This matters because includes will appear often, and path parsing needs good diagnostics.

Choice: `include` and `include-raw` require a `path` attribute, for example `::include{path="docs/languages/typescript/analysis-rules.md"}`.

Rationale: The explicit `path` attribute gives the directive a clear schema and leaves room for future attributes without inventing a second form. The trade-off is slight verbosity, but it improves validation and diagnostics because include directives can require exactly one path and reject conditional attributes.

## P10: Condition Expression Scope

Point: What operators and value types should v1 allow inside `condition="..."`?

What you need to know: The proposal’s condition examples are intentionally small:

```txt
language == "typescript"
language != "python"
target
!target
depth in ["quick", "standard"]
language == "typescript" && depth == "deep"
```

This language must be deterministic and safe: no JavaScript execution, no file access, no user functions. The question is how much expression power v1 actually needs.

If we allow too little, templates become repetitive. If we allow too much, we end up designing and maintaining a mini programming language.

Choice: V1 condition expressions support identifiers, string/number/boolean literals, truthiness, `!`, `==`, `!=`, `&&`, `||`, and parentheses only.

Rationale: This minimal expression language is enough for basic argument routing while avoiding premature mini-language design. The trade-off is that enum-set checks such as `depth in ["quick", "standard"]` must be written more verbosely for now; `in` can be added later if real templates show it is worth the extra semantics.

## P11: Input Schema Location

Point: Should all v1 input schema live in frontmatter, or should templates be able to declare inputs elsewhere?

What you need to know: The proposal shows inputs in frontmatter:

```yaml
---
name: analyze-code
description: Analyze code for bugs, security issues, and code quality problems
inputs:
  language:
    required: true
    enum: [typescript, python]
  target:
    required: false
    type: path[]
  depth:
    required: true
    enum: [quick, standard, deep]
---
```

Input schema is not just documentation. It drives CLI argument validation and determines which identifiers exist in condition expressions and interpolation.

If schema can appear in directives or external files too, authors get flexibility, but validation becomes harder to reason about. If schema is frontmatter-only, the contract is obvious: read metadata first, validate args, then render.

Choice: V1 input schema lives only in template frontmatter.

Rationale: Frontmatter-only schema gives the renderer a simple lifecycle: parse metadata, validate arguments, then render. The trade-off is that long schemas can make templates top-heavy, but shared or external schemas can wait until real usage proves they are needed.

## P12: Validation Ownership

Point: How much validation should come from the template compiler versus the CLI argument parser?

What you need to know: The proposal asks: “How much validation belongs in the template compiler versus the CLI argument parser?”

There are two layers:

The CLI parser can validate command shape: `skillrouter run <skill>`, unknown flags, duplicate flags, malformed `--key=value`, and maybe basic coercion.

The template compiler can validate skill-specific inputs from frontmatter: required arguments, enum values, types like string/boolean/path/path array, unknown input names relative to the schema, and whether conditions reference declared inputs.

If too much lives in the CLI parser, it needs skill schema knowledge and becomes less reusable. If too much lives in the compiler, basic command errors may be reported late or inconsistently.

Choice: The CLI validates only generic command syntax, while the compiler validates all skill-specific inputs and template semantics.

Rationale: This keeps the CLI a thin shell around the compiler and lets the compiler remain independently testable and reusable. The trade-off is that the compiler needs a structured error interface so the CLI can display schema and template errors cleanly.

## P13: V1 Input Types

Point: Which input types should frontmatter support in v1?

What you need to know: The proposal examples include `enum` and `type: path[]`. Conditions also need booleans and simple values to be useful.

This is a deceptively important choice. `string`, `boolean`, and `enum` are straightforward. `path` and `path[]` are more useful for agent skills, but they introduce filesystem questions: does validation merely parse a path string, or check existence? Is it relative to the project root? Can it point outside the repo? Are directories allowed?

If v1 includes `path`, we should define it clearly rather than treating it as a fancy string.

Choice: V1 supports `string`, `boolean`, and `enum` input types only.

Rationale: This keeps schema validation simple for the first version and avoids prematurely defining filesystem, array, object, and numeric semantics. The main trade-off is weaker built-in validation for code-analysis targets; the spec or implementation notes should explicitly leave a TODO/future consideration for `path`, arrays, objects, and numbers.

## P14: Boolean Flag Syntax

Point: How should CLI flags map to `boolean` inputs?

What you need to know: A frontmatter input like this is a boolean schema field:

```yaml
inputs:
  fix:
    type: boolean
    required: false
```

Users will expect `--fix` to mean `fix = true`, not always `--fix=true`. But accepting both raises edge cases: should `--no-fix` exist? Should `--fix=false` be allowed? What happens if the same boolean is passed twice with conflicting values?

This matters because the CLI parser only validates generic command syntax, but it still has to preserve enough raw argument shape for the compiler to validate schema-specific behavior cleanly.

Choice: Boolean inputs accept `--flag`, `--flag=true`, and `--flag=false`; duplicate or conflicting boolean values are rejected.

Rationale: This gives users the convenient flag syntax while still allowing explicit false. The trade-off is a little more coercion behavior to define, but it avoids introducing `--no-flag` before defaults or more advanced boolean ergonomics require it.

## P15: Input Defaults

Point: Should v1 support default values for inputs in frontmatter?

What you need to know: Defaults would allow templates like:

```yaml
inputs:
  depth:
    type: enum
    values: [quick, standard, deep]
    default: standard
```

This can reduce required arguments and make router skills easier to invoke. But defaults also hide missing intent. The proposal explicitly says the CLI should not pretend to infer ambiguous user intent, and missing required inputs should remain visible as validation errors or clarification requests.

Defaults are not necessarily inference if the author declares them. Still, they change behavior: omission becomes a chosen value rather than “not provided,” which affects conditions like `depth == "standard"` and truthiness checks.

Choice: V1 does not support input default values.

Rationale: Defaults add validation rules and omission semantics that are not needed for the first version. The trade-off is more verbose invocations and no author-declared safe defaults, but missing inputs remain explicit and defaults can be added later if real templates need them.

## P16: Interpolation Scope

Point: Should v1 support `{{input}}` interpolation in Markdown output, and if so, how much?

What you need to know: The proposal uses simple interpolation:

```md
Read `{{target}}`.
```

With v1 types limited to `string`, `boolean`, and `enum`, interpolation can stay simple. The danger is letting interpolation become a second expression language, for example `{{target || "cwd"}}`, formatting helpers, filters, function calls, or file reads.

Interpolation also affects `include-raw`: we decided `include-raw` inserts content without evaluating Skillrouter directives or interpolation inside that file.

Choice: V1 supports only direct input interpolation, for example `{{language}}` or `{{fix}}`; no expressions, helpers, nested paths, or function calls.

Rationale: Direct interpolation is needed for string inputs to be useful in rendered instructions, but it should not become a second expression language. The trade-off is intentionally limited formatting power; templates can only interpolate declared input names, with missing-value behavior to be decided separately.

## P17: Missing Optional Interpolation

Point: What should happen when a template interpolates an optional input that was not provided?

What you need to know: Since v1 has optional inputs but no defaults, a declared input may be absent at render time. For conditions, absence can naturally be falsey:

```md
::::if{condition="target"}
Read `{{target}}`.
::::
```

But interpolation is different. If a template contains `{{target}}` outside a guard and the user does not pass `--target`, the renderer has to choose between failing, inserting empty text, or inserting a marker.

This is important because silent empty interpolation can produce confident but broken instructions, for example `Read ``.` or `Analyze .`

Choice: Rendering fails if a template interpolates an absent optional input.

Rationale: Strict interpolation catches author mistakes and avoids silently producing malformed agent instructions. The trade-off is that authors must guard optional interpolations with conditionals, which is acceptable because optional data that changes final text should be explicit.

## P18: Include Path Roots

Point: Which filesystem roots should `include` and `include-raw` be allowed to read from in v1?

What you need to know: The proposal calls out include security directly: relative resolution, blocked path traversal, and probably an allowlist for roots such as `.skillrouter/` and `docs/`.

This matters because templates are executable in the loose sense that they cause the CLI to read files and print their contents for the agent. Even in a private project, allowing arbitrary file reads creates footguns: a template could accidentally include `.env`, credentials, private notes, huge files, or unrelated repo content.

The competing concern is author convenience. You mentioned project organization and reusable fragments; overly narrow roots may make legitimate reuse annoying.

Choice: V1 resolves include paths relative to the file containing the include, allows `../`, requires the resolved path to stay inside the discovered project root, rejects absolute paths and `~`, and explicitly rejects `.env` / `.env.*` files.

Rationale: File-relative includes make nested fragments composable without requiring templates to know the final project folder structure. The discovered project root, defined as the nearest ancestor containing `.skillrouter/`, provides a stable boundary that is safer than raw cwd while still allowing includes from `.skillrouter/`, docs, or other project folders through relative traversal. The trade-off is that root-relative includes and home/absolute paths are not available in v1; a future `$PROJECT_ROOT` syntax or permission system can add those deliberately.

## P19: Recursive Include Cycles

Point: How should v1 handle recursive include cycles?

What you need to know: We decided `include` processes Skillrouter syntax recursively. That means this is possible:

```txt
a.template.md includes b.template.md
b.template.md includes a.template.md
```

Or a longer cycle through several files. Without explicit handling, the renderer can recurse forever or fail with a poor stack overflow error.

`include-raw` does not matter for cycles because it does not process Skillrouter syntax inside the included file.

Choice: V1 detects recursive include cycles and errors with the include chain.

Rationale: Recursive include support directly creates the possibility of cycles, so deterministic cycle detection is required for reliable rendering. The trade-off is tracking an include stack, but that is small compared with the cost of stack overflows or unclear recursion failures.

## P20: Debug Output Format

Point: Should v1 support `--format=json` or another machine-readable/debug output mode?

What you need to know: The proposal asks whether v1 should include `--format=json` for debugging or integration, or keep only Markdown stdout.

The main runtime path is agent-facing: `skillrouter run <skill> ...` prints final Markdown to stdout for the agent to follow. That path should stay clean.

But while authoring templates, users may need to understand which inputs were parsed, which branches were selected, which includes were resolved, and why validation failed. JSON can help tests and integrations, but it also creates a second public output contract.

Choice: V1 supports Markdown stdout only.

Rationale: Markdown-only output keeps the first public output contract small and focused on the agent-facing path. The implementation should still be designed so future output formats can be added cleanly, and the spec or implementation notes should include TODOs to consider adding additional output formats and a `--verbose` flag that reports process details.

## P21: Generated Router Skill Content

Point: What exact content should `skillrouter generate` write into the agent-facing `SKILL.md`?

What you need to know: We decided v1 includes a narrow `generate` command with explicit `--out`. That generated file is what an agent actually reads first, so it needs to be short and reliable.

The proposal’s router skill body is:

"""
---
name: analyze-code
description: Analyze code for bugs, security issues, and code quality problems
---

Run this command and follow its output exactly:

```bash
skillrouter run analyze-code $ARGUMENTS
```

If the command returns an error, report the error to the user and stop.
"""

There are a few choices here: should `generate` copy `name` and `description` from the `.skillrouter/<skill>/SKILL.template.md` frontmatter? Should it include any extra instructions about not reading the source template? Should it include a generated-file comment?

Choice: `generate` writes a minimal router skill with frontmatter `name` / `description`, the `skillrouter run <skill> $ARGUMENTS` command, and error handling only.

Rationale: The minimal file keeps agent-facing token cost low and matches the core goal of having the agent read only the router instruction before delegating to the CLI. The trade-off is less human-facing generated-file metadata, but docs can explain that these files are generated.

## P22: Generate Overwrite Behavior

Point: What should `skillrouter generate --out <path>` do if the output file already exists?

What you need to know: `generate` writes an agent-facing `SKILL.md` at an explicit user-provided path. Existing files may be manually written skills, previously generated router skills, or unrelated content.

Overwrite behavior is risky because a wrong `--out` can destroy user content. But if `generate` never overwrites, regenerating after a description change becomes annoying.

Choice: `generate` refuses to overwrite existing files by default and requires `--force` to replace them.

Rationale: Refusing to overwrite protects manual skills and wrong output paths. The trade-off is requiring an extra flag for regeneration, but that is appropriate because generated files intentionally do not contain markers that would allow reliable safe-overwrite detection.

## P23: Project Root Discovery

Point: How should Skillrouter discover the project root in v1?

What you need to know: We already leaned on project root for include containment. The current proposed rule is: project root is the nearest ancestor containing `.skillrouter/`.

This affects:

`skillrouter run <skill>` locating `.skillrouter/<skill>/SKILL.template.md`.

Include safety, because resolved include paths must stay inside the project root.

CLI usability from subdirectories, because agents may run commands from a project subfolder.

There are still edge cases: nested `.skillrouter/` directories, monorepos, or running the command outside a Skillrouter project.

Choice: V1 walks upward from cwd and uses the nearest ancestor containing `.skillrouter/`; it errors if none is found.

Rationale: This is simple, conventional, works from subdirectories, and matches the include containment model. The trade-off is no explicit override for unusual layouts in v1, but a `--root` option can be added later if real use cases require it.

## P24: Skill Name Resolution

Point: How should `skillrouter run <skill>` map `<skill>` to a template path?

What you need to know: The proposal uses:

```txt
.skillrouter/<skill-name>/SKILL.template.md
```

That is simple and clear. But command arguments can contain slashes or path-like values, intentionally or accidentally:

```bash
skillrouter run analyze-code
skillrouter run workflows/analyze-code
skillrouter run ../secret
```

If `<skill>` is treated as a path, users can organize nested skill folders, but it expands the path traversal and naming rules. If `<skill>` is just a name, v1 stays simpler.

Choice: `<skill>` must be a single safe directory name and maps to `.skillrouter/<skill>/SKILL.template.md`; slash-separated paths are not supported in v1.

Rationale: One directory per skill matches the proposal and keeps path traversal and diagnostics simple. The trade-off is no nested skill groups in v1, but those can be added later if organization pressure appears.

## P25: Canonical CLI Commands

Point: What exact v1 command shapes should be considered canonical?

What you need to know: The original draft had both:

```bash
my-cli analyze-code $ARGUMENTS
```

and later:

```bash
skillrouter run analyze-code --language=typescript
```

We have already made decisions assuming `run` and `generate`, but the spec should lock exact command shapes so examples, generated files, and tests do not drift.

There is also the question of where skill input flags go relative to Skillrouter’s own flags. To keep parsing simple, v1 can require all skill input flags after the skill name.

Choice: V1 canonical commands are `skillrouter run <skill> [input flags...]` and `skillrouter generate <skill> --out <path> [--force]`.

Rationale: Explicit verbs make rendering and router-file generation distinct and avoid future subcommand collisions. The trade-off is slightly more verbosity than `skillrouter <skill>`, but the clarity is worth it.

## P26: Frontmatter Input Schema Shape

Point: What exact frontmatter shape should v1 use for `string`, `boolean`, and `enum` inputs?

What you need to know: We decided input schema is frontmatter-only and supports only `string`, `boolean`, and `enum` in v1.

The proposal used:

```yaml
inputs:
  language:
    required: true
    enum: [typescript, python]
  target:
    required: false
    type: path[]
```

That example treats `enum` as a schema property rather than `type: enum`. For consistency with `string` and `boolean`, the spec should decide whether enum inputs are written as `type: enum` plus `values`, or as a shorthand `enum: [...]`.

Choice: V1 uses a uniform `type` field for all inputs; enum inputs use `type: enum` plus `values`.

Rationale: A uniform schema is easier to validate and extend than special-casing enum as its own schema shape. The trade-off is slightly more verbose enum declarations, but the consistency is worth it.

## P27: Required Field Semantics

Point: Should each input require an explicit `required` field, or should v1 define a default?

What you need to know: The frontmatter shape could require authors to write:

```yaml
inputs:
  language:
    type: enum
    values: [typescript, python]
    required: true
  fix:
    type: boolean
    required: false
```

Or it could define a default such as `required: false` when omitted.

Making `required` explicit is noisier, but avoids ambiguity when reading a template. Defaults reduce boilerplate but create another rule authors must remember.

Choice: Every input must explicitly declare `required: true` or `required: false`.

Rationale: Explicit requiredness makes schemas easier to review and avoids hidden validation defaults. The trade-off is more boilerplate, but v1 benefits from being unambiguous.

## P28: Unknown Input Flags

Point: What should happen when `skillrouter run` receives a flag not declared in the template input schema?

What you need to know: The proposal examples show unknown arguments as errors:

```txt
Error: Invalid argument 'invalid-argument'. Please tell the user to use a valid argument.
```

Because the compiler owns schema-aware validation, it can compare raw parsed flags against frontmatter `inputs`.

The alternative is to ignore unknown flags, but that is dangerous for agent workflows: a typo like `--langauge=typescript` would silently render as if language was missing or use a different branch.

Choice: Unknown input flags are validation errors.

Rationale: Failing loudly catches typos and matches the validation-first design. The trade-off is no pass-through flexibility in v1, but there is no clear v1 need for pass-through flags.

## P29: Duplicate Input Flags

Point: What should happen when the same input flag is provided more than once?

What you need to know: V1 does not support arrays, so repeated flags have no natural meaning:

```bash
skillrouter run analyze-code --language=typescript --language=python
```

For booleans, we already decided duplicate or conflicting values should be rejected. The same rule can apply to all input types.

Some CLIs use “last value wins,” but that can hide mistakes, especially when an agent constructs the command.

Choice: Duplicate input flags are rejected for all types.

Rationale: Since arrays are deferred, repeated flags have no valid v1 meaning. Rejecting duplicates is deterministic and catches command construction mistakes instead of silently choosing one value.

## P30: Error Output Shape

Point: What should v1 print when validation or rendering fails?

What you need to know: The generated router skill will tell the agent: if the command returns an error, report the error to the user and stop. So errors should be concise, human-readable, and safe for an agent to relay.

There are several error categories: invalid command syntax, missing skill, invalid frontmatter, missing required input, unknown input flag, invalid enum value, condition parse error, include not found, include outside project root, include cycle, and unsafe `.env*` include.

The CLI should also use exit codes correctly: success exits `0`, failures non-zero.

Choice: V1 prints a single-line `Error: ...` message to stderr and exits non-zero on failure.

Rationale: Concise stderr errors are simple, agent-friendly, and keep successful Markdown output isolated on stdout. The trade-off is less debugging detail in v1, but future verbose or alternate output modes can add more context without changing the basic success/error contract.

## P31: Router Skill Error Instruction

Point: Should the generated router skill explicitly tell the agent to include the CLI error text when reporting failure?

What you need to know: P21 chose a minimal generated router skill with command and error handling only. P30 chose stderr for errors.

The proposed generated text says:

```md
If the command returns an error, report the error to the user and stop.
```

That is probably enough, but agents can sometimes summarize vaguely unless instructed to quote the error. We need to keep the router file minimal while making failures actionable.

Choice: Generated router skills say: “If the command exits non-zero, report the exact error output to the user and stop.”

Rationale: This keeps the router skill minimal while aligning with the stderr/non-zero error contract and making failures actionable for the user. The trade-off is a few more tokens in the generated file, but the clarity is worth it.

## P32: Directive Output Shape

Point: What should directives compile to in final Markdown output?

What you need to know: The proposal originally asked about output shape for directives, especially `step` blocks. We later decided `step` is not a first-class directive in v1, so the remaining directives are only:

`if` / `else-if` / `else`: select one Markdown branch.

`include`: replace the directive with recursively processed file content.

`include-raw`: replace the directive with literal file content.

This means Skillrouter does not need to invent headings, wrappers, comments, or metadata in the final output. The template author owns the final Markdown structure.

Choice: Directives are erased and replaced only by selected/rendered content in the final Markdown.

Rationale: Clean Markdown output matches the minimal compiler role and avoids adding hidden wrappers, comments, or metadata for agents to read. The trade-off is less provenance in the rendered output, but debugging can be handled later through `--verbose` or alternate output formats.

## P33: Include Path Aliases

Point: Should v1 support include path aliases such as `@docs/foo.md` or `$PROJECT_ROOT/foo.md`?

What you need to know: The proposal asks whether include paths should support aliases and where they would be declared. During P18, we chose file-relative include paths with `../` allowed inside the discovered project root, and noted a possible future `$PROJECT_ROOT`.

Aliases can make root-relative or shared paths more convenient, but they require defining alias syntax, config location, precedence, and safety behavior. Without aliases, authors can still reach other project files by relative paths, as long as they stay inside project root.

Choice: V1 does not support include path aliases.

Rationale: Deferring aliases keeps the path model simple and avoids introducing project config or special path syntax in v1. The trade-off is potentially long relative paths; if that becomes painful, a built-in `$PROJECT_ROOT/...` syntax is the likely first future addition.
