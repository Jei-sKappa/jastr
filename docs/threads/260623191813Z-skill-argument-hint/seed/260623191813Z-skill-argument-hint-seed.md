# Seed: `argument-hint` in generated Agent Skill wrappers
External: none — private, single-owner personal tool; the repo is the sole owner and there is nothing external to drift against.

Claude Code skills support an `argument-hint` frontmatter field that previews the arguments a
skill takes. We want `jastr generate agent-skill` to emit one. The shape the user sketched is an
author-declared prefix composed with an auto-derived suffix from the template's inputs — e.g.
`argument-hint: "<prefix-declared-in-agent-skill-frontmatter> --manifest <file> [--mode new|merge] [--resolve auto|interactive]"`,
where required inputs render bare (`--name <value>`) and optional inputs render bracketed
(`[--name <value>]`), with choice-like inputs showing their alternatives.

Open design questions the thread will resolve: how the hint is derived from input declarations
(required vs. optional bracketing, value/choice rendering), where the author-declared prefix lives
in `targets.agent-skill`, how variants' locked inputs are excluded from the hint, and how the
`--check` byte-comparison absorbs the new frontmatter line.
