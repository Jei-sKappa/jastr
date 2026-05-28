---
name: demo
description: A demo skill
license: MIT
my-extension-field: custom-value
inputs:
  language:
    type: enum
    values: [typescript, python]
    required: true
---
::::if{condition="${language} == 'typescript'"}
TS
::::
