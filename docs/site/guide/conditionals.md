# Conditionals

Templates can select content with `if`, `else-if`, and `else` container
directives.

Conditions reference inputs as `${input-name}`. Missing optional inputs are
falsey. Boolean inputs use their boolean value. Provided string and enum inputs
are truthy.

Nested conditional containers require a longer outer fence than inner fences.

<Example id="missing-optional-condition" />
