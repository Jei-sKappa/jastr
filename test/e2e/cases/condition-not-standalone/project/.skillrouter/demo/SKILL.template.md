---
name: demo
description: Demo skill
inputs:
  enabled:
    type: boolean
    required: false
---
::::if{condition="!${enabled}"}
Not enabled.
::::
::::else
Enabled.
::::
