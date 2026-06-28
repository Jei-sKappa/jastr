---
targets:
  agent-skill:
    argument-hint-prefix: review the change
    frontmatter:
      name: review-skill
      description: Review a change.
inputs:
  target:
    type: enum
    values: [spec, code]
    required: true
  language:
    type: string
    required: false
    default: typescript
---
::include{path="intro.md"}

::::if{condition="${target} == 'spec'"}
Review the spec for {{language}}.
::::
::::else
Review the code for {{language}}.
::::
