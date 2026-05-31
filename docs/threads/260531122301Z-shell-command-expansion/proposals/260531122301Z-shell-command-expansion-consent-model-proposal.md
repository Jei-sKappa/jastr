# Shell Command Expansion Consent Model

## Intent

Add executable command expansion to templates as a v2 capability, including command-derived values in `if`/`else-if` branch selection, while choosing a consent model that makes host shell execution explicit, reviewable, and impossible for an untrusted template author to self-grant.

This is not a v1 extension. It deliberately revisits v1's deterministic, side-effect-free rendering contract, so the proposal should be treated as the entry point for a v2 capability and a focused security/consent design.

## Context

Skillrouter's goal is to give agents only the instructions they need for the current situation. V1 handles argument validation, includes, interpolation, and declarative branch selection, but it still leaves an important gap: when the relevant branch depends on live project state, a skill author may still need to write instructions such as:

```markdown
# My Skill

Run `git diff`.
If you see changes, do X.
Otherwise, do Y.
```

That shape is weak for complex skills because it pushes observation and branch selection back onto the agent. The rendered output is no longer fully specialized; it becomes a procedure the agent must interpret and execute.

The feature request is to let skillrouter execute author-written commands during rendering, substitute stdout inline, and use command-derived values in conditional branches. That would allow templates to specialize on live facts such as whether `git diff` has output before the agent receives the final Markdown.

The security context is the hard part. V1 explicitly says template evaluation must be deterministic and side-effect free except for include file reads, and must not execute shell commands. Future skillrouter workflows may also pull templates from the internet. Since skillrouter runs on the host with no sandbox, no syntax choice can make untrusted shell execution safe by itself. The consent boundary is therefore part of the feature, not an implementation detail.

## Rough Shape

Add a v2 command-expansion capability for author-written commands, usable both for inline stdout substitution and explicit branch predicates over command output.

The condition side should avoid vague model-like judgments such as "if you see changes." The spec should define explicit predicates over command results, such as non-empty stdout, exit status, regex matching, or structured output checks. The goal is to keep branch selection inside skillrouter rather than recreate agent judgment behind a command syntax.

Command execution must be disabled unless an external consent mechanism authorizes it. The consent mechanism is intentionally left for spec design, but it must not be grantable by template frontmatter, template content, or generated router skills. An untrusted skill should fail in the agent-run path with a clear error that the agent can relay to the human.

The spec should compare at least these consent models before choosing:

- Content-hash trust: a human reviews a skill and records trust pinned to the resolved template content hash; any edit or swapped include revokes trust.
- Per-run flag: the invoker passes a flag such as `--allow-commands` each time command execution is permitted.
- Hash trust plus enforced allowlist: content-hash trust combined with a runtime-enforced command allowlist that is itself covered by the trusted content.

The proposal does not choose among those models. It only asserts that consent must be external to the untrusted template author and compatible with the generated-router path where an AI agent runs `skillrouter run <skill> $ARGUMENTS`.

## Open Questions

- Which consent model should authorize command execution: content-hash trust, per-run flag, hash trust plus allowlist, or another model?
- How should users preview or audit the commands that a template would execute before granting consent?
- What is the condition syntax and semantics for command output: non-empty stdout, exit status, regex match, structured parsing, or explicit predicates?
- Are command bodies literal only, or may they interpolate `{{input}}` values? This decision controls the command-injection model.
- Should command execution use `sh -c` for shell ergonomics or argv-style execution for a smaller injection surface?
- Should command-bearing templates be rejected by `generate`, passed through unchanged, or allowed only with metadata that makes the runtime authorization requirement visible?
- What are the failure semantics for timeout, non-zero exit, stderr, and empty stdout?
- How does this v2 capability revise existing v1 claims that rendering is deterministic and side-effect free?
