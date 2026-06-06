---
name: demo
description: Demo skill
inputs:
  x:
    type: boolean
    required: false
---
::::if{condition="${x}"}
a
::::
interrupting text
::::else-if{condition="${x}"}
b
::::
