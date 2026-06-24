---
targets:
  agent-skill:
    frontmatter:
      name: build-skill
      description: Build something.
      argument-hint: do not let me through
inputs:
  tag:
    type: string
    required: true
---
Build {{tag}}.
