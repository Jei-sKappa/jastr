---
targets:
  agent-skill:
    frontmatter:
      name: review-base
      description: Review with the base policy.
inputs:
  depth:
    type: enum
    values: [quick, deep]
    required: true
  region:
    type: string
    required: false
    default: us-east-1
    description: deployment region
---
Review {{depth}} in {{region}}
