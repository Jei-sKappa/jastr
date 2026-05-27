# Errors

Skillrouter failures use one stderr line:

```text
Error: <message>
```

Stdout is empty on failure. This keeps router skills safe: rendered Markdown is
only read from stdout, and errors can be relayed from stderr.

<Example id="missing-required-input" />
<Example id="unknown-flag" />
