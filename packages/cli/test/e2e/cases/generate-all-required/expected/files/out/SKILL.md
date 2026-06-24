---
name: build-skill
description: Build something.
argument-hint: --tag=<value> --force
---

## Inputs

- `--tag` (string, required)
- `--force` (boolean, required)

Map the user's request to the inputs above and append them as `--flag=value` arguments, including every required input. Then run this command and follow its output exactly:

```bash
jastr run demo --tag=<value> --force=<value>
```

If the command exits non-zero, report the exact error output to the user and stop.
