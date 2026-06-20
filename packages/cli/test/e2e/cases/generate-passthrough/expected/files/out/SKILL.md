---
name: demo
description: A demo skill
license: MIT
my-extension-field: custom-value
---

## Inputs

- `--language` (enum: typescript|python, required)

Map the user's request to the inputs above and append them as `--flag=value` arguments, including every required input. Then run this command and follow its output exactly:

```bash
jastr run demo
```

If the command exits non-zero, report the exact error output to the user and stop.
