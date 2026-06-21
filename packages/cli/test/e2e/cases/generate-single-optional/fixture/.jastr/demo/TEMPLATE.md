---
targets:
  agent-skill:
    frontmatter:
      name: lang-skill
      description: Pick a language.
inputs:
  language:
    type: enum
    values: [typescript, python]
    required: false
    default: typescript
    description: target language
---
Lang {{language}}.
