---
targets:
  agent-skill:
    frontmatter:
      name: opt-skill
      description: Optional inputs only.
inputs:
  region:
    type: string
    required: false
    default: us-east-1
  verbose:
    type: boolean
    required: false
    default: false
---
Region {{region}} verbose {{verbose}}.
