---
name: demo
description: Demo skill
inputs:
  language:
    type: string
    required: true
---
::::if{condition="${language} != 'python'"}
Not Python.
::::
::::else
Python.
::::
