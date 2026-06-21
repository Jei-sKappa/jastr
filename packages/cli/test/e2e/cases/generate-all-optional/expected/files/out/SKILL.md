---
name: opt-skill
description: Optional inputs only.
---

## Inputs

- `--region` (string, optional, default: us-east-1)
- `--verbose` (boolean, optional, default: false)

Map the user's request to the inputs above and append them as `--flag=value` arguments, including every required input. Then run this command and follow its output exactly:

```bash
jastr run demo
```

If the command exits non-zero, report the exact error output to the user and stop.
