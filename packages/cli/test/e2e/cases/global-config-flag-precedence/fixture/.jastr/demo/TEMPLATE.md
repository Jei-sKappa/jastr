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
  region:
    type: string
    required: false
    default: us
---
depth={{depth}} output={{output}} region={{region}}
