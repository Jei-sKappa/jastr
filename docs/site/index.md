# Skillrouter

Skillrouter is a CLI for deterministic AI-agent skill specialization. It lets
you author rich project-local Markdown templates and render only the
instructions that apply to the current task.

The agent-facing skill stays tiny. It tells the agent to run Skillrouter and
follow the rendered Markdown output. Skillrouter handles the deterministic work:
input validation, branch selection, includes, interpolation, and router skill
generation.

## Core workflow

1. Write a template at `.skillrouter/<skill>/SKILL.template.md`.
2. Run `skillrouter run <skill> [input flags...]`.
3. Give the rendered Markdown to the agent.
4. Optionally generate a minimal router skill with `skillrouter generate`.

## Commands

```bash
skillrouter run <skill> [input flags...]
skillrouter generate <skill> --out <path> [--force]
```

Start with [Getting Started](/guide/getting-started).
