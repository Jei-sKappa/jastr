---
name: demo
description: Demo skill
inputs:
  dry-run:
    type: boolean
    required: false
---
::::if{condition="${dry-run}"}
Dry run enabled.
::::
::::else
Not a dry run.
::::
