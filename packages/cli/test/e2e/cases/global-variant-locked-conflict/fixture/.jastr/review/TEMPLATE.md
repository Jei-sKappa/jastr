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
  mode:
    type: enum
    values: [fast, thorough]
    required: false
    default: fast
---
depth={{depth}} output={{output}} mode={{mode}}
