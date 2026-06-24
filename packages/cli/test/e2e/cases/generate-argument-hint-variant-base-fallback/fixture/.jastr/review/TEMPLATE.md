---
targets:
  agent-skill:
    argument-hint-prefix: review with the base policy
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
---
Review {{depth}} {{language}}
