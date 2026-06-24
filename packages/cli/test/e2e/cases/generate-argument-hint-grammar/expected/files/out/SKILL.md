---
name: build-skill
description: Build something.
argument-hint: build the project --tag=<value> [--note=<value>] --mode=new|merge
  [--level=low|high] --force [--verbose]
---

## Inputs

- `--tag` (string, required)
- `--note` (string, optional)
- `--mode` (enum: new|merge, required)
- `--level` (enum: low|high, optional)
- `--force` (boolean, required)
- `--verbose` (boolean, optional)

Map the user's request to the inputs above and append them as `--flag=value` arguments, including every required input. Then run this command and follow its output exactly:

```bash
jastr run demo --tag=<value> --mode=<value> --force=<value>
```

If the command exits non-zero, report the exact error output to the user and stop.
