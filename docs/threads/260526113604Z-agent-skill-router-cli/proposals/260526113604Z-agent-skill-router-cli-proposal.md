# Draft

I'm trying to build a cli for ai agent skills because complex skills have a problem they force the agent to read also unnecessary instructions.
Here is an example:
```
---
name: analyze-code
description: Analyze TypeScript code for bugs, security issues, and code quality problems
---

<input>
- language: typescript | python
- target: file | file[] | directory | directory[] | null
- depth: quick | standard | deep
- fix: boolean | null
</input>

<check>
- `language`: language is required and if not provided or not supported, return an error
- `target`: target is not required but if provided, it must be a valid file/s or directory/ies
- `depth`: depth is required and must be one of the following: quick, standard, deep

If there is any error, stop immediately and return the error.
</check>


<steps>
<step name="read-language-analysis-rules">
if `language` is `typescript`, read the language analysis rules from `docs/languages/typescript/analysis-rules.md`.
if `language` is `python`, read the language analysis rules from `docs/languages/python/analysis-rules.md`.
</step>

<step name="read-target">
if `target` is provided, read the target files/directories.
if `target` is not provided, read the target files/directories from the current working directory.
</step>

<step name="analyze-code">
if `depth` is `quick`, analyze only the most important files/directories.
if `depth` is `standard`, analyze all the files/directories.
if `depth` is `deep`, analyze all the files/directories and the dependencies between them.
</step>

<step name="output-results">
output the results in a human-readable format.
</step>
</steps>
```

In this case you see that the agent is forced to read also things that he shouldn't if the user was clear about it's intentions.

My goal is to build a system that decomposes the skills into variants based on user input for example we can have a skill like this.

# Idea

```
---
name: analyze-code
description: Analyze TypeScript code for bugs, security issues, and code quality problems
---

Run this cli and follow what it says.

```
my-cli analyze-code $ARGUMENTS
```
````

## Examples

### Errors

Command ran: `my-cli analyze-code --language=c++`

Output:
```
Error: Language 'c++' is not supported. Please tell the user to use a supported language.
```

Command ran: `my-cli analyze-code --invalid-argument=true`

Output:
```
Error: Invalid argument 'invalid-argument'. Please tell the user to use a valid argument.
```

### Valid

Command ran: `my-cli analyze-code --language=typescript --target=src/index.ts --depth=quick`

Output:
```
<steps>
<step name="read-language-analysis-rules">
read the language analysis rules from `docs/languages/typescript/analysis-rules.md`.
</step>

<step name="read-target">
read `src/index.ts`
</step>

<step name="analyze-code">
analyze only the most important files/directories.
</step>

<step name="output-results">
output the results in a human-readable format.
</step>
</steps>
```

So with this tool the more complex skills the author will just write in the skill body to run the cli and follow the instructions.

I'n my mind I have this UX:
<!-- Final user project structure -->
```
- .agents/ <!-- Or .claude/ depending on the agent used: not our business -->
  - skills/
    - analyze-code/
      - SKILL.md <!-- This is the skill "router" that just instructs the agent to call the correct cli command -->
- .skillrouter/
  - analyze-code/
    - SKILL.template.md <!-- This is the skill template that the user will write the skill in with conditional blocks -->
```

The cli job given an argument like `skillrouter <skill-name>` will search for the `.skillrouter/<skill-name>/SKILL.template.md` file and "parse" with cli arguments it to convert the template into a final instruction that will be outputted to the stdout and the agent can read it.

```
- .skillrouter/
  - my-workflow/
    - fragments/
      - create-spec.md # Note that also the files in fragment *could** be a `.template.md` file in this case the cli will just recursively parse the template
      - implement.md
    - SKILL.template.md
```

This also helps with organization and readability.

I'd like to desing this project in "a modular way" to avoid tight coupling between the components.

I'd like to use bun as runtime, package manager and bunder but we should not use any native bun feature (including tests) to no being locked into bun and be able to use other runtimes like node in the future if needed.

---


# Agent Skill Router CLI Proposal

## Intent

Move deterministic skill behavior, such as argument validation, supported-value checks, conditional instruction expansion, includes, and rendering, out of the LLM and into a CLI. Given explicit runtime arguments, the agent should receive only the task-specific instructions it actually needs to read.

The CLI should not pretend to deterministically infer ambiguous user intent. If required inputs such as language, target, or depth are missing or unclear, that uncertainty should remain visible as a validation error or a request for clarification.

## Context

Complex agent skills can degrade behavior because the agent must read validation logic, irrelevant branches, and conditional instructions before knowing which path applies. This wastes tokens and context, and the problem grows when a project has many installed skills competing for the agent's context window.

The proposed approach keeps agent-facing skills small. A visible skill can simply instruct the agent to run a command such as `skillrouter run analyze-code $ARGUMENTS` and then follow the command output. The richer authoring surface lives outside the agent-facing skill, under a project-local `.skillrouter/` tree.

The same mechanism can support both narrow conditional skills and broad workflow routers. For example, a visible `my-workflow` skill could route to `--create-spec` or `--implement` flows. From the tool's point of view, this is not meaningfully different from routing `analyze-code` by `language` or `depth`: both are template specialization from explicit inputs.

## Rough Shape

A project defines agent-facing router skills wherever the active agent ecosystem expects them, such as `.agents/skills/<skill>/SKILL.md`, `.claude/skills/<skill>/SKILL.md`, or another tool-specific location. Those router skills stay minimal:

````md
---
name: analyze-code
description: Analyze code for bugs, security issues, and code quality problems
---

Run this command and follow its output exactly:

```bash
skillrouter run analyze-code $ARGUMENTS
```

If the command returns an error, report the error to the user and stop.
````

The project-local Skillrouter source lives under `.skillrouter/<skill-name>/SKILL.template.md`. The CLI reads that template, validates arguments, evaluates conditions, resolves includes, recursively parses included `.template.md` files, and prints final agent-facing Markdown to stdout.

The authoring format should remain mostly Markdown, with frontmatter/schema plus simple Markdown directives backed by a small declarative expression language. The core goal is deterministic skill specialization, not general-purpose templating.

```txt
template markdown
-> parse frontmatter / directives
-> validate args
-> evaluate simple conditions
-> resolve selected includes
-> render minimal final markdown
```

An authoring template could look like this:

```md
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

:::include{path="docs/languages/typescript/analysis-rules.md" when="language == 'typescript'"}

:::include{path="docs/languages/python/analysis-rules.md" when="language == 'python'"}

:::step{name="read-target" when="target"}
Read `{{target}}`.
:::

:::step{name="read-target" when="!target"}
Read the target files/directories from the current working directory.
:::

:::step{name="analyze-code" when="depth == 'quick'"}
Analyze only the most important files/directories.
:::

:::step{name="output-results"}
Output the results in a human-readable format.
:::
```

Directive syntax is authoring syntax only. The compiler should output clean Markdown for the agent, not preserve directive markers. For example, a `step` directive can compile to a normal heading and body:

```md
## Step: output results

Output the results in a human-readable format.
```

Includes should not require a prescribed folder name. A user may organize reusable content however they want and reference it from the template, such as `@mycustomfolder/myfile.md`. Plain `.md` includes can be inserted as static Markdown, while `.template.md` includes should be parsed recursively.

The condition language should stay intentionally small:

```txt
language == "typescript"
language != "python"
target
!target
depth in ["quick", "standard"]
language == "typescript" && depth == "deep"
```

There should be no arbitrary JavaScript or TypeScript execution, no file-system access from expressions, and no user-defined functions in v1. Includes, interpolation, validation, and rendering are explicit compiler features, not template helper side effects.

For implementation, the project can lean toward the `remark` / `unified` ecosystem with `remark-directive`, or an equivalent parser abstraction, because this gives the compiler a real Markdown AST and allows directives to be transformed into normal Markdown output. This should remain an implementation choice rather than the product contract. Parsing, validation, include resolution, condition evaluation, interpolation, and rendering should be separate modules.

A useful internal model could be:

```ts
type SkillTemplate = {
  metadata: SkillMetadata;
  inputs: SkillInput[];
  blocks: SkillBlock[];
};

type SkillBlock =
  | {
      kind: "step";
      name: string;
      when?: ConditionExpression;
      content: MarkdownNode[];
    }
  | {
      kind: "include";
      path: string;
      when?: ConditionExpression;
      recursive?: boolean;
    };
```

The CLI should be a thin shell around the compiler:

```txt
skillrouter run analyze-code --language=typescript --target=src/index.ts --depth=quick
```

Use Bun as runtime, package manager, and bundler, but avoid Bun-specific runtime APIs and Bun's test runner so the project can move to Node or another runtime later if needed.

## Non-Goals

Skillrouter does not enforce semantic scope, workflow coherence, or skill quality. It only resolves templates from explicit inputs. Users may use the same mechanism for narrow conditional skills or broad workflow routers.

Skillrouter v1 should not be a general-purpose template engine, should not embed JS/TS execution in templates, and should not depend on generic template engine semantics such as Handlebars helpers.

## Caveats

`remark-directive` uses `:::` / `::` / `:` markers. If that authoring UX proves unpleasant, the project may need a preprocessor, aliases, or a custom parser later.

The custom directive language needs documentation, examples, and good diagnostics. The expression language must stay deliberately small or it will drift into a poorly specified programming language.

Includes need a clear security model: relative resolution, blocked path traversal, and probably an allowlist for roots such as `.skillrouter/` and `docs/`.

Interpolation should be constrained. Simple placeholders like `{{target}}` are useful, but arbitrary expression interpolation is out of scope.

If skill authors strongly prefer config-first workflows, the Markdown-directive model may feel less testable than pure YAML or JSON routing config. If future use cases require highly dynamic behavior, a plugin API may be needed, but that should be separate from v1 template syntax.

## Open Questions

- Should v1 use `skillrouter run <skill>` as the canonical command, replacing the earlier `skillrouter <skill-name>` shape?
- Should all input schema live in frontmatter for v1, or should longer skills be able to declare inputs with directives?
- Should plain `.md` includes always be rendered inline, and should `.template.md` includes always be parsed recursively?
- What path resolution and security rules should includes use: only inside `.skillrouter/<skill>/`, also `docs/`, or configurable roots?
- What exact output shape should each directive compile to, especially `step` blocks?
- How should interpolation format scalars, booleans, arrays, and paths?
- Should v1 include `--format=json` for debugging or integration, or keep only Markdown stdout?
- How much validation belongs in the template compiler versus the CLI argument parser?
- Should include paths support aliases such as `@mycustomfolder/myfile.md`, and if so, where are aliases declared?
