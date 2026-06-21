---
name: review-deep
description: Review with the deep policy.
allowed-tools: Read
---

This skill takes one input, `--language` (string). Fill in `--language=<value>` from the user's request. Then run this command and follow its output exactly:

```bash
jastr run review#deep --language=<value>
```

If the command exits non-zero, report the exact error output to the user and stop.
