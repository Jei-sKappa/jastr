# Skillrouter

> Deterministic skill routing for AI agents: write rich Markdown templates once,
> then render only the instructions each task actually needs.

Skillrouter is a design-stage CLI for keeping agent-facing skills tiny while
moving validation, branching, includes, and instruction rendering into a
deterministic command-line workflow.

The core idea is simple: authors write richer templates under `.skillrouter/`,
while visible agent skills only tell the agent to run
`skillrouter run <skill> $ARGUMENTS` and follow the Markdown output.

## Goals

- Reduce unnecessary skill instructions in agent context.
- Keep skill specialization deterministic and explicit.
- Preserve Markdown as the main authoring surface.
- Stay agent-agnostic instead of coupling to one skill ecosystem.

## Current Status

This repository is currently in the design phase. The main product decisions
live in `docs/threads/260526113604Z-agent-skill-router-cli/`.
