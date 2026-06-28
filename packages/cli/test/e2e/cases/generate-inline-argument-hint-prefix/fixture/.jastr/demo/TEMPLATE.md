---
targets:
  agent-skill:
    argument-hint-prefix: route the request
    frontmatter:
      name: route-skill
      description: Route something.
inputs:
  topic:
    type: string
    required: true
---
Topic is {{topic}}.
