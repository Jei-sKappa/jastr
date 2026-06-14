---
targets:
  agent-skill:
    frontmatter:
      name: review-base
      description: Review with the base policy.
      allowed-tools: Read
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
