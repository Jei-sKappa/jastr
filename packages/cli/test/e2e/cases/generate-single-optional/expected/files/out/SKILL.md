---
name: lang-skill
description: Pick a language.
argument-hint: "[--language=typescript|python]"
---

This skill takes one optional input, `--language` (enum: typescript|python, default: typescript) — target language. Add `--language=<value>` if the user's request calls for it; otherwise leave it out. Then run this command and follow its output exactly:

```bash
jastr run demo
```

If the command exits non-zero, report the exact error output to the user and stop.
