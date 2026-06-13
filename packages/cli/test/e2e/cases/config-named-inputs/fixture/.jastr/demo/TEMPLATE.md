---
inputs:
  depth:
    type: enum
    values: [quick, standard, deep]
    required: true
  dry-run:
    type: boolean
    required: false
---
depth={{depth}} dry-run={{dry-run}}
