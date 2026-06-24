---
targets:
  agent-skill:
    argument-hint-prefix: "-mode picker"
    frontmatter:
      name: build-skill
      description: Build something.
inputs:
  manifest:
    type: string
    required: true
  mode:
    type: enum
    values: [new, merge]
    required: false
---
Build {{manifest}} {{mode}}.
