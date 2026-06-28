---
targets:
  agent-skill:
    frontmatter:
      name: demo
      description: Demo skill
inputs:
  depth:
    type: enum
    values: [quick, deep]
    required: true
---
Depth is {{depth}}.
