---
name: demo
description: Demo skill
inputs:
  dry-run:
    type: boolean
    required: false
---
::::if{condition="${dry-run} == 'true'"}
String equal.
::::
::::else
Typed not equal.
::::
