# Frontmatter Schema

Root templates use YAML frontmatter.

```yaml
name: demo
description: Demo skill
inputs:
  language:
    type: enum
    values: [typescript, python]
    required: true
```

Every input must declare `type` and `required`. Enum inputs must include a
non-empty `values` array.

<Example id="duplicate-flag" />
