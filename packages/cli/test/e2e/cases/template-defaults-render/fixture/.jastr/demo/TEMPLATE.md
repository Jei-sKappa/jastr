---
inputs:
  language:
    type: enum
    values: [typescript, python]
    required: false
    default: typescript
  dry-run:
    type: boolean
    required: false
    default: true
  target-file:
    type: string
    required: false
    default: src/index.ts
---
language={{language}} dry-run={{dry-run}} target={{target-file}}
::::if{condition="${dry-run}"}
Dry run branch
::::
