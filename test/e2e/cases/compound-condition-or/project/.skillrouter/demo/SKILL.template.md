---
name: demo
description: Demo skill
inputs:
  flag-a:
    type: boolean
    required: false
  flag-b:
    type: boolean
    required: false
  flag-c:
    type: boolean
    required: false
---
::::if{condition="${flag-a} && ${flag-b}"}
AND true
::::
::::else-if{condition="${flag-a} || ${flag-b}"}
OR true
::::
::::else-if{condition="!${flag-c}"}
NOT true
::::
