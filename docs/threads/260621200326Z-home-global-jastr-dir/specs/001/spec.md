---
version: 2
status:
  approved: 260622115755Z
---

# Spec: Home-directory (global) `.jastr` support

## Intended outcome

After this is implemented, a user can keep named templates, grouped templates,
variants, and config in a `.jastr/` directory in their home — a "global install"
— and use them from any directory, not only from inside a project that has its
own `.jastr/`. A project-local `.jastr/` and the global one coexist as **layers**:
the global root is a base library, and a local project extends or overrides it.
`jastr run`, `jastr generate agent-skill`, and `jastr validate` all resolve
template references against this layered local-then-global view.

## Context

Today `.jastr/` is discovered only locally. `findProjectRoot`
(`packages/cli/src/fs/project-root.ts`) walks up from cwd and returns the first
ancestor containing `.jastr/`; there is exactly one project root, ever, and the
walk hitting the filesystem root with no match throws `missing_project_root`.
Named/grouped templates resolve under `<projectRoot>/.jastr/...`
(`packages/cli/src/templates/template-ref.ts`), `config.yml` is read from that one
root (`packages/cli/src/config.ts`), and includes are bounded by realpath to a
template/group root. There is no way to share templates/config across projects
without copying or symlinking them.

This spec is forward-designed from the genesis decision log
`seed/discussions/260621201338Z-home-global-jastr-coexistence-decision-log.md`
(hereafter "the decision log"), which settled the coexistence model (P1),
discovery mechanics (P2), config composition (P3), and CLI path display (P4).
Settled decisions are cited inline at the point where they become operative,
by `(decision log P<N>)`.

This is **version 2**. It additionally incorporates the dispositions of the
handoff + decision-log-consistency review
(`specs/001/reviews/260622071807Z-home-global-spec-handoff-review.md`), settled in
the findings discussion
`specs/001/discussions/260622075358Z-handoff-review-findings-decision-log.md`
(hereafter "the findings discussion") and cited inline as
`(findings discussion P<N>)`. Those dispositions pin the lookup hit predicate and
fall-through behavior (P1), extend path display to included files (P2), and
enumerate the path-display sites by name (P3); none reverses a v1 decision.

## Scope / Non-scope

**In scope**

- A global root located at `os.homedir()/.jastr`, or at `$JASTR_HOME/.jastr` when
  the `JASTR_HOME` environment variable is set (decision log P2).
- Layered resolution of named and grouped template references across the local
  and global roots, with local shadowing global on a template-id/group collision
  (decision log P1).
- Two-layer per-key composition of `config.yml` inputs and unit-level composition
  of variants across the two roots (decision log P3).
- Relaxing the "no project" error so a run backed only by the global root
  succeeds (decision log P2, Fork A).
- CLI path display and not-found messaging for globally-resolved templates
  (decision log P4), including one new e2e test substitute token.
- Uniform application across `run`, `generate agent-skill` (including `--check`),
  and `validate`, since all three share the resolution path.

**Out of scope (explicitly)**

- Any cross-root include: a template never includes a file from the *other* root.
  Roots stay self-contained (decision log P1).
- Direct `.md` template runs: they bypass `.jastr` discovery, read no
  `config.yml`, and support no variants. Global support does not change this.
- A scaffolding subcommand that creates `~/.jastr`, diagnostics that report what
  a local root is shadowing, and migration tooling. These were named and
  deferred during discussion as potential future features; they are not part of
  this spec.
- Surfacing any diagnostic for a **partial local footprint** that is silently
  bypassed (a local `<id>` directory or grouped directory present but missing its
  `TEMPLATE.md` or `.jastrgroup` marker), and the broader `validate` redesign it
  belongs to (`--local` / `--global` root-scope flags, a ref-less whole-`.jastr`
  scan, and a CI exit-code flag). The silent fall-through specified under
  "Resolving a template reference" is deliberate for this spec; surfacing it is
  deferred to its own thread,
  `docs/threads/260622094526Z-validate-setup-checks/` (findings discussion P1).
- Any change to the `@jastr/engine` public API or behavior. All work is CLI-side.

## Expected behavior

Terms: the **local root** is the result of the existing upward walk from cwd
(its *range* is unchanged — still up to the filesystem root). The **global root**
is `$JASTR_HOME/.jastr` if `JASTR_HOME` is set, else `os.homedir()/.jastr`,
located by absolute path and **never** by walking (decision log P2).

**Locating the roots**

- The global root is active whenever it exists on disk; a non-existent global
  root is simply absent and is not itself an error (decision log P2).
- If the upward walk resolves to the *same realpath* as the global root (a
  project that lives at the home base, or a cwd under it with no nearer
  `.jastr`), the two collapse to a **single root**: its templates and `config.yml`
  are applied once, with no self-shadowing and no self-merge (decision log P2).
- `missing_project_root` is raised only when **neither** a local `.jastr` nor the
  global root exists. A run backed only by the global root is valid (decision log
  P2, Fork A).

**Resolving a template reference**

- A named/grouped ref is looked up in the **local root first, then the global
  root**; the first hit wins, so a ref present in both resolves from local
  (local shadows global) (decision log P1).
- A **hit** is the existing single-root existence check, unchanged: for a
  standalone ref, `<root>/.jastr/<template-id>/TEMPLATE.md` exists; for a grouped
  ref, both the `<root>/.jastr/<group>/.jastrgroup` marker and
  `<root>/.jastr/<group>/templates/<template-id>/TEMPLATE.md` exist. The two-root
  model reuses this predicate and only adds what happens on a miss. (Decision log
  P1 framed shadowing as a collision of two *resolvable* templates and did not
  settle the partial case; this elaborates it — findings discussion P1.)
- A **structural miss** in the local root is **any** case where the hit predicate
  above is not satisfied — the local entry is absent, or present but incomplete (a
  `.jastr/<template-id>/` directory with no `TEMPLATE.md`; a grouped directory
  missing its `.jastrgroup` marker; or a grouped `templates/<template-id>/` with no
  `TEMPLATE.md`). A structural miss is **not a hit**, so resolution falls through
  to the global root and a valid global template of the same ref resolves. This
  fall-through is **silent**: no warning is emitted on any command's success path
  (findings discussion P1).
- Once a local **hit** is found, resolution **commits to the local root**: any
  subsequent failure to load, parse, validate, or render the resolved local
  template (e.g. a read error, malformed frontmatter, invalid schema, or a
  render/include failure) surfaces as that failure's existing error and does
  **not** fall through to the global template. A present, claimed local namespace
  is never silently bypassed in favor of a different global template (findings
  discussion P1).
- Grouped lookup in the global root uses the identical layout the local root
  requires: `<global>/.jastr/<group>/templates/<template-id>/TEMPLATE.md` plus a
  `<global>/.jastr/<group>/.jastrgroup` marker (elaboration of P1 over the
  existing grouped-template contract).
- A ref absent from both roots fails with `template_not_found`.

**Includes**

- Includes are resolved and containment-checked **per resolved root**: a global
  template's includes resolve within the global template/group root by final
  realpath; a local template's within the local root. The existing boundary
  error is unchanged. No include crosses between roots (decision log P1).

**Config composition (`config.yml`)**

- Both `config.yml` files — global root and local root — are consulted for any
  ref, **independent of which root the template body resolved from** (decision
  log P3). This is what enables a globally-defined template with per-project
  default overrides.
- Bare named-run input precedence is per key: **CLI flags > local config > global
  config > template-author defaults** (decision log P3). A key present only in
  global takes the global value; a key in both takes the local value; a key in
  neither falls to the template default.
- If the merged effective input map carries a key the resolved template does not
  declare, the engine raises `unknown_input` exactly as today. This is an
  accepted edge that can occur when a local template shadows a global one with a
  different input schema; it fails loudly rather than silently (decision log P3).

**Variant composition**

- A `#<variant-id>` ref selects `variants.<ref>.<id>` from the **local** config
  if present, otherwise from the **global** config — local shadows global at the
  granularity of the **whole variant entry**, with no per-key merge of
  `locked-inputs` across the two configs (decision log P3).
- The selected variant's `locked-inputs` then apply over CLI flags, layered
  config values, and template defaults, and CLI flags naming a locked input are
  rejected — unchanged from the single-root rule (existing contract, preserved).
- A variant's agent-skill metadata composes as today: the resolved template
  frontmatter's `targets.agent-skill` overlaid by the selected variant's
  `agent-skill.frontmatter` (which, per the config rule above, comes from the
  shadowing config entry).

**Path display and errors**

- Path display is scoped to the **resolved root** and applies uniformly to a
  template's own path **and** to the paths of the files it includes: a global
  template renders all of its paths absolute, a local template renders all of its
  paths cwd-relative. Framing the rule by resolved root means any present-day or
  future path output for a global template inherits it without re-deciding
  (findings discussion P2).
- A **globally-resolved** template's own path is shown as its **real absolute
  (realpath-resolved) path** everywhere a template path is printed today: the
  render `sourceId` constructed by `run`, `generate`, and `validate`; the
  `generate` success message; and any other present-day template-path output
  (decision log P4; sites enumerated per findings discussion P3).
- A file **included by a globally-resolved template** has its displayed path —
  the include `id` the CLI assigns to that file — shown as the file's **real
  absolute (realpath-resolved) path** wherever the `id` surfaces today (notably
  errors that reference an included file, and the `from` of a nested include).
  The engine is unchanged; the CLI controls this `id` in the include resolver
  (findings discussion P2, extending P4).
- A **locally-resolved** template renders both its own path and its included
  files' paths **cwd-relative**, unchanged (decision log P4).
- When a ref is absent from both roots, `template_not_found` names **both**
  searched locations: the local one as a cwd-relative path and the global one as
  an absolute path (decision log P4).

**Command coverage**

- `run`, `generate agent-skill` (including `--check`), and `validate` resolve refs
  through the same layered mechanism, so a global ref behaves identically in all
  three (seed scope; shared resolution path).
- Direct `.md` runs are unaffected (existing contract).

## Constraints

- **CLI-only.** All changes live in `@jastr/cli`. `@jastr/engine` is unchanged
  and must not import Node filesystem APIs, `.jastr` lookup code, or Bun runtime
  APIs. The `unknown_input` behavior referenced above is existing engine
  behavior and is not modified (CLAUDE.md engine boundary; decision log P3).
- **No engine change is needed for display or containment.** The CLI already
  chooses the `sourceId` passed to `renderTemplateSource` and supplies the
  `includeResolver` (`packages/cli/src/commands.ts`,
  `packages/cli/src/templates/includes.ts`), so absolute-path display for global
  templates and per-root containment are CLI-side (decision log P4, P1).
- **Global location is absolute, never walked.** `os.homedir()` / `JASTR_HOME`
  resolution happens in the CLI discovery layer (alongside `findProjectRoot`);
  the upward walk is never extended into or past the home directory to find the
  global root (decision log P2).
- **Error codes.** The decisions frame these as relaxing/extending existing
  behavior, so the implementation reuses the existing `JastrErrorCode`s —
  `missing_project_root` (relaxed trigger) and `template_not_found` (extended
  message). No new error code is required (decision log P2, P4).
- **Uniform error UX preserved.** Every failure prints `Error: <message>` to
  stderr and exits 1; only `--help`, `help [command]`, and `--version` exit 0
  (CLAUDE.md).
- **Node-compatible.** No Bun-specific runtime APIs in CLI source (CLAUDE.md).
- **Repo conventions bind the change.** New CLI behavior is captured as
  functional requirements under `packages/cli/requirements/functional/` with e2e
  cases under `packages/cli/test/e2e/cases/`, `BEHAVIOR.md` is regenerated
  (`bun run docs:cli:living`), and the full clean bar must pass: `bun run check`,
  `bun run typecheck`, `bun run test`, `bun run test:cli:e2e`,
  `bun run docs:cli:living --check`, and `bun run build` (CLAUDE.md).

## Acceptance criteria

Each criterion is a pass/fail assertion. Traceability is given inline as
`(decision log P<N>)` or as the noted source. Every expected behavior above maps
to at least one criterion below.

**FR-1 — Global root location**
- AC-1.1: With `JASTR_HOME` unset, the global root is `os.homedir()/.jastr`,
  located by absolute path with no upward walk. (P2)
- AC-1.2: With `JASTR_HOME` set to an absolute, existing directory, the global
  root is `$JASTR_HOME/.jastr`. (P2, Fork B)
- AC-1.3: A global root that does not exist on disk produces no error from its
  absence alone. (P2)

**FR-2 — Layered resolution; local shadows global**
- AC-2.1: A named or grouped ref present only in the global root resolves from
  the global root. (P1)
- AC-2.2: A ref present in both roots resolves its template body from the local
  root. (P1)
- AC-2.3: A ref present only in the local root resolves from the local root, with
  behavior unchanged from today. (P1)
- AC-2.4: Lookup consults local before global and the first hit wins. (P1)
- AC-2.5: A local hit is the existing existence check — standalone:
  `<root>/.jastr/<id>/TEMPLATE.md` exists; grouped: the `.jastrgroup` marker and
  `<group>/templates/<id>/TEMPLATE.md` both exist. (findings discussion P1)
- AC-2.6: A structural miss in the local root — any case where the AC-2.5 hit
  predicate is not satisfied (entry absent; a `.jastr/<id>/` directory with no
  `TEMPLATE.md`; a grouped directory missing its `.jastrgroup` marker or its
  `templates/<id>/TEMPLATE.md`) — is treated as "no hit": resolution falls through
  to the global root, a valid global template of the same ref resolves, and no
  warning is emitted on any command's success path. (findings discussion P1)
- AC-2.7: When a local hit is found, resolution commits to the local root: any
  subsequent failure to load, parse, validate, or render the resolved local
  template (read, parse, schema, render, or include error) surfaces as that
  failure's existing error and does not fall through to the global template.
  (findings discussion P1)

**FR-3 — Global-only context; `missing_project_root` relaxation**
- AC-3.1: From a cwd with no local `.jastr` on the upward walk but with an
  existing global root that contains the ref, `run`, `generate`, and `validate`
  succeed using the global root. (P2, Fork A)
- AC-3.2: `missing_project_root` is raised only when neither a local `.jastr` nor
  the global root exists. (P2, Fork A)

**FR-4 — Same-realpath collapse**
- AC-4.1: When the upward walk resolves to the same realpath as the global root,
  templates and `config.yml` are applied exactly once — a ref defined there is
  not reported or treated as shadowing itself, and its config is not merged with
  itself. (P2)

**FR-5 — Config two-layer composition (inputs)**
- AC-5.1: Both the global-root and local-root `config.yml` are consulted for a
  ref regardless of which root the template body resolved from. (P3)
- AC-5.2: For a bare named run, effective input values follow the per-key
  precedence CLI flags > local config > global config > template defaults. (P3)
- AC-5.3: A key present only in global config takes the global value; a key in
  both takes the local value; a key in neither takes the template default. (P3)
- AC-5.4: If the merged effective input map contains a key the resolved template
  does not declare, the run fails with `unknown_input`. (P3)

**FR-6 — Variant composition (unit shadowing)**
- AC-6.1: A `#<variant-id>` ref selects `variants.<ref>.<id>` from local config
  if present, otherwise from global config; the whole variant entry is taken from
  one config — `locked-inputs` are not merged across the two. (P3)
- AC-6.2: The selected variant's `locked-inputs` apply over CLI flags, layered
  config values, and template defaults, and a CLI flag naming a locked input is
  rejected. (P3 + existing contract)

**FR-7 — Per-root include containment; no cross-boundary include**
- AC-7.1: A global template's includes resolve within the global template/group
  root by final realpath; a local template's within the local root; the existing
  containment check applies unchanged per resolved root. (P1)
- AC-7.2: An include resolving outside its own root fails with the existing
  boundary error; no include resolves across into the other root. (P1)

**FR-8 — Path display**
- AC-8.1: A globally-resolved template's path is rendered as its real absolute
  (realpath-resolved) path in the render `sourceId` constructed by `run`,
  `generate`, and `validate`, in the `generate` success message, and in any other
  present-day template-path output. (P4; sites enumerated per findings discussion
  P3)
- AC-8.2: A locally-resolved template's path is rendered cwd-relative, unchanged.
  (P4)
- AC-8.3: A file included by a globally-resolved template has its displayed path
  (the include `id`) rendered as its real absolute (realpath-resolved) path; a
  file included by a locally-resolved template has its displayed path rendered
  cwd-relative, unchanged. (findings discussion P2, extending P4)

**FR-9 — `template_not_found` names both roots**
- AC-9.1: When a ref is absent from both roots, the `template_not_found` message
  names both searched locations: the local one as a cwd-relative path and the
  global one as an absolute path. (P4)

**FR-10 — Uniform application across commands**
- AC-10.1: `run`, `generate agent-skill` (including `--check`), and `validate`
  resolve a global ref through the same layered mechanism and behave identically
  with respect to which root supplies the template. (seed scope; shared
  resolution)
- AC-10.2: Direct `.md` runs bypass `.jastr` discovery, read no `config.yml`, and
  support no variants — unchanged. (existing contract)

**FR-11 — Test substitute token for the global root**
- AC-11.1: The e2e harness exposes one new closed-set `substitute` token that
  resolves to the global root used by the case, mirroring the existing
  `projectRoot` token, so cases asserting global absolute paths remain
  machine-independent. (P4)

## Unresolved questions

None block emission. The three future-feature ideas raised in discussion
(a `~/.jastr` scaffolding subcommand, shadowing/override diagnostics, and
migration tooling) were deferred deliberately and are listed under Non-scope
rather than left open here.

## Degrees of freedom

The *what* above is pinned. The following *hows* are explicitly left to the
implementer:

- **DoF-1 — Malformed `JASTR_HOME` normalization.** Only the core contract is
  pinned: unset → `os.homedir()/.jastr`; set to an absolute path →
  `$JASTR_HOME/.jastr`. How an empty, whitespace-only, or relative `JASTR_HOME`
  value is handled (treat-as-unset, resolve-against-cwd, or reject) is the
  implementer's choice, as the decision log did not settle it.
- **DoF-2 — Exact message wording.** The required *content* of the relaxed
  `missing_project_root` message and the extended `template_not_found` message is
  pinned (AC-3.2, AC-9.1); the exact phrasing is open.
- **DoF-3 — Substitute token identity.** The name of the new e2e token (FR-11)
  and the precise value it binds (e.g. the global-root realpath) are open within
  the existing closed-set mechanism.
- **DoF-4 — Internal code structure.** How the global root is located and threaded
  into resolution and config loading (a new function, an extra parameter on the
  existing discovery code, or a new module) is open, provided the engine stays
  filesystem-free and the observable ACs hold.
- **DoF-5 — Informational output beyond what is pinned.** Whether the resolved
  root is surfaced in informational (non-error) output not covered by FR-8/FR-9
  — for example `validate`'s success line — is open; existing informational
  messages may be left unchanged. This latitude does **not** extend to the
  deferred partial-local-footprint diagnostic or the broader `validate` redesign
  (see Non-scope); those stay out of scope here regardless of how this DoF is
  exercised.
