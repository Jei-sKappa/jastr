---
name: deploy
description: Deploy to an environment.
---

## Inputs

- `--env` (enum: dev|prod, required) — target environment
- `--region` (string, optional, default: us-east-1) — deployment region
- `--dry-run` (boolean, optional) — preview without applying
- `--tag` (string, required)
- `--verbose` (boolean, optional, default: false)

Map the user's request to the inputs above and append them as `--flag=value` arguments, including every required input. Then run this command and follow its output exactly:

```bash
jastr run deploy --env=<value> --tag=<value>
```

If the command exits non-zero, report the exact error output to the user and stop.
