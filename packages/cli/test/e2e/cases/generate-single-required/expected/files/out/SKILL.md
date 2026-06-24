---
name: tag-skill
description: Tag something.
argument-hint: --tag=<value>
---

This skill takes one input, `--tag` (string). Fill in `--tag=<value>` from the user's request. Then run this command and follow its output exactly:

```bash
jastr run demo --tag=<value>
```

If the command exits non-zero, report the exact error output to the user and stop.
