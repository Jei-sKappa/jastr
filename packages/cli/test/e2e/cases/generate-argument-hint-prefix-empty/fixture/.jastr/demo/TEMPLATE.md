---
targets:
  agent-skill:
    argument-hint-prefix: "   "
    frontmatter:
      name: build-skill
      description: Build something.
inputs:
  tag:
    type: string
    required: true
---
Build {{tag}}.
