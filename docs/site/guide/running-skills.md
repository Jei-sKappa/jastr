# Running Skills

`skillrouter run <skill> [input flags...]` finds the nearest ancestor directory
containing `.skillrouter/`, loads `.skillrouter/<skill>/SKILL.template.md`,
validates inputs, evaluates directives, resolves includes, interpolates values,
and prints final Markdown to stdout.

Successful output is Markdown only. Failures print `Error: <message>` to stderr
and leave stdout empty.

<Example id="run-branch-enum" />
