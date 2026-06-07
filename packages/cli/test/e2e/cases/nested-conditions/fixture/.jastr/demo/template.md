---
name: demo
description: Demo skill
inputs:
  mode:
    type: enum
    values: [full, quick]
    required: true
---
::::if{condition="${mode} == 'full'"}
outer
:::if{condition="${mode} == 'full'"}
inner
:::
::::
