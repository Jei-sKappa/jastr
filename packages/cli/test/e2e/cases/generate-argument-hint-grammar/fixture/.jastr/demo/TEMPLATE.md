---
targets:
  agent-skill:
    argument-hint-prefix: build the project
    frontmatter:
      name: build-skill
      description: Build something.
inputs:
  tag:
    type: string
    required: true
  note:
    type: string
    required: false
  mode:
    type: enum
    values: [new, merge]
    required: true
  level:
    type: enum
    values: [low, high]
    required: false
  force:
    type: boolean
    required: true
  verbose:
    type: boolean
    required: false
---
Build {{tag}} {{mode}} force={{force}}.
