---
name: build-skill
description: Build something.
argument-hint: -mode picker --manifest=<value> [--mode=new|merge]
---

## Inputs

- `--manifest` (string, required)
- `--mode` (enum: new|merge, optional)

Map the user's request to the inputs above and append them as `--flag=value` arguments, including every required input. Then run this command and follow its output exactly:

```bash
jastr run demo --manifest=<value>
```

If the command exits non-zero, report the exact error output to the user and stop.
