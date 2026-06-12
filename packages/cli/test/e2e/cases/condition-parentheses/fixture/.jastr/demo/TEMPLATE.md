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
---
::::if{condition="!(${flag-a} && ${flag-b})"}
Grouped.
::::
::::else
Not grouped.
::::
