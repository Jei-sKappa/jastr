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
  mode:
    type: string
    required: true
    description: review mode
  language:
    type: string
    required: true
---
Review {{depth}} in {{mode}} mode
