---
name: review-deep
description: Review with the deep policy.
---

This skill takes one optional input, `--region` (string, default: us-east-1) — deployment region. Add `--region=<value>` if the user's request calls for it; otherwise leave it out. Then run this command and follow its output exactly:

```bash
jastr run review#deep
```

If the command exits non-zero, report the exact error output to the user and stop.
