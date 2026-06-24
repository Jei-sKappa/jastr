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
  force:
    type: boolean
    required: true
---
Build {{tag}} force={{force}}.
