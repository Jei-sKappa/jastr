---
name: demo
description: Demo skill
inputs:
  language:
    type: enum
    values: [typescript, python]
    required: true
---
::::if{condition="${language} == 'typescript'"}
Use the TypeScript checklist.
::::
::::else-if{condition="${language} == 'python'"}
Use the Python checklist.
::::
