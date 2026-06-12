---
name: demo
description: Demo skill
inputs:
  language:
    type: string
    required: true
---
::::if{condition="${language} == 'typescript'"}
TypeScript selected.
::::
