---
targets:
  agent-skill:
    argument-hint-prefix: review the change
    frontmatter:
      name: review-base
      description: Review with the base policy.
inputs:
  depth:
    type: enum
    values: [quick, deep]
    required: true
  language:
    type: string
    required: true
  notes:
    type: string
    required: false
---
Review {{depth}} {{language}} {{notes}}
