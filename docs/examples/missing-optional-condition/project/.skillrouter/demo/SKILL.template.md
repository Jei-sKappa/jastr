---
name: demo
description: Demo skill
inputs:
  target-file:
    type: string
    required: false
---
::::if{condition="${target-file}"}
Has target
::::
::::else
No target file.
::::
