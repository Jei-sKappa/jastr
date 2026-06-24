---
targets:
  agent-skill:
    argument-hint-prefix: build the project
    frontmatter:
      name: build-skill
      description: Build something.
      allowed-tools: Read
inputs:
  tag:
    type: string
    required: true
---
Build {{tag}}.
