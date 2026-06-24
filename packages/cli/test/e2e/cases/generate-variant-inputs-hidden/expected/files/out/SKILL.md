---
name: review-deep
description: Review with the deep policy.
argument-hint: --mode=<value> --language=<value>
---

## Inputs

- `--mode` (string, required) — review mode
- `--language` (string, required)

Map the user's request to the inputs above and append them as `--flag=value` arguments, including every required input. Then run this command and follow its output exactly:

```bash
jastr run review#deep --mode=<value> --language=<value>
```

If the command exits non-zero, report the exact error output to the user and stop.
