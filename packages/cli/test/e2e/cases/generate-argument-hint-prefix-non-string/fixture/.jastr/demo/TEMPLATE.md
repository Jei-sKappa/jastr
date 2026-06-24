---
targets:
  agent-skill:
    argument-hint-prefix: 42
    frontmatter:
      name: build-skill
      description: Build something.
inputs:
  tag:
    type: string
    required: true
---
Build {{tag}}.
