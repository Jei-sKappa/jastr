---
inputs:
  depth:
    type: enum
    values: [quick, standard, deep]
    required: false
    default: quick
  output:
    type: string
    required: false
    default: template
---
depth={{depth}} output={{output}}
