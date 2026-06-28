# Seed: fully-rendered self-contained skill generation target
External: none — private, single-owner personal tool; the repo is the sole owner and there is nothing external to drift against.

Migrating a ~32-file standalone `SKILL.md` repo onto jastr templates (shared boilerplate into `include`
partials, the `review-*` family collapsed into one template routed by a `target` flag) to kill copy-paste
drift. The wrinkle is distribution: consumers run `npx skills add` and receive **one self-contained
`SKILL.md` with nothing else installed — no jastr downstream**. So the `generate agent-skill` wrapper
(which shells out to `jastr run` at invocation time) cannot ship; the full skill must be rendered at
authoring time and the rendered file committed.

The gap: no single jastr command emits a fully self-contained rendered `SKILL.md`. `jastr run <ref>` gives
the rendered body (includes inlined, conditionals resolved) but no frontmatter; `jastr generate agent-skill
<ref> --out` gives the frontmatter (`name`/`description`/`argument-hint`) but a "go run jastr" wrapper stub
for the body. What's missing is a third output mode: the wrapper's frontmatter with the fully-rendered body
inlined underneath instead of the stub — a first-class target inheriting `--check` freshness and `validate`.

Candidate shape (not a mandate): `jastr generate skill <ref> --out <path>`, or a `targets.skill` analogous
to `targets.agent-skill`. Open design point flagged by the requester: a rendered skill has no runtime inputs
(every input resolves at render time via CLI flag / variant lock / config), so `argument-hint` likely should
be omitted for this target and an unresolved required input should be a hard error at generate time rather
than a `<value>` placeholder — but that call is left to the design. The requester has a DIY glue fallback
(call `jastr run`, assemble frontmatter, re-derive argument-hint, build a byte-compare), so this is not
hard-blocking; the motivation is to avoid duplicating and rotting the frontmatter/`--check` machinery jastr
already owns.
