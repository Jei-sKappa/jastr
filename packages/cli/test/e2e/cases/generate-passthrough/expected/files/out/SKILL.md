---
name: demo
description: A demo skill
argument-hint: --language=typescript|python
license: MIT
my-extension-field: custom-value
---

This skill takes one input, `--language` (enum: typescript|python). Fill in `--language=<value>` from the user's request. Then run this command and follow its output exactly:

```bash
jastr run demo --language=<value>
```

If the command exits non-zero, report the exact error output to the user and stop.
