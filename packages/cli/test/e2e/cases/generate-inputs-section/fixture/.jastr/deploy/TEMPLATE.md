---
targets:
  agent-skill:
    frontmatter:
      name: deploy
      description: Deploy to an environment.
inputs:
  env:
    type: enum
    values: [dev, prod]
    required: true
    description: target environment
  region:
    type: string
    required: false
    default: us-east-1
    description: deployment region
  dry-run:
    type: boolean
    required: false
    description: preview without applying
  tag:
    type: string
    required: true
  verbose:
    type: boolean
    required: false
    default: false
---
Deploy to {{env}}.
