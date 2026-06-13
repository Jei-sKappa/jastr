# Input defaults: template-author defaults and user config values

## Intent

Let templates declare fallback values for optional inputs, and let users
pre-supply standing input values in a project config file, so running a
multi-input template no longer requires retyping every flag on every
`jastr run`. The proposal is worth shipping when a template like a review
skill with `depth` and `output` inputs can be run bare (`jastr run review`)
by a user who has recorded their preferences once.

## Context

Real-world friction: templates in actual use (e.g. a review template with
`depth: quick | standard | deep` and `output: file | chat`) force the same
input values to be retyped on every invocation. Today the schema has no
`default` field at all — inputs are `string | boolean | enum` with a
mandatory explicit `required: true|false` (`packages/engine/src/schema.ts`),
and the CLI has no config-file concept; `.jastr/` holds only template
directories.

## Rough shape

Two distinct concepts, deliberately not merged:

1. **Template-author defaults (frontmatter).** An input definition may add
   `default: <value>`, valid **only** alongside `required: false`. It is the
   template author's statement of what an omitted optional input means.
   Declaring `default` on a `required: true` input is a schema error — it
   would silently make `required: true` a lie.

2. **User config values (project config file).** A YAML config at the
   project's `.jastr` root (working name `.jastr/config.yml`), keyed by
   template-id, holding the user's standing input values:

   ```yaml
   # section name tentative — these are pre-supplied values, not defaults
   inputs:
     review:
       depth: standard
       output: chat
   ```

   These are *pre-supplied input values* — persisted CLI flags, not schema
   defaults. They apply to any input, including `required: true` ones:
   `required` keeps meaning "a value must arrive from somewhere", and config
   is another somewhere. Project-level (not user-home) so the file is
   versionable with the project and two people running the same template get
   the same output, preserving jastr's determinism story.

Precedence: **CLI flag > config value > frontmatter default**. Config values
go through the same type/enum validation as flag values.

## Open questions

1. **Config terminology and shape.** Final file name (`.jastr/config.yml`?),
   top-level key, and section naming — `inputs` (truer to "standing values")
   vs `defaults` (collides with the frontmatter concept).
2. **Stale/unknown config entries.** Config names an input the template does
   not declare (e.g. the template evolved). Error (strict, consistent with
   current `unknown_input` UX) or ignore (config survives template drift)?
3. **Invalid-but-overridden config values.** Config holds a bad enum value
   but a CLI flag supplies a valid one. Validate the whole config entry, or
   only values that actually win precedence?
4. **Template identity for config keying.** Named templates have IDs; direct
   `.md` path templates do not; grouped templates live at
   `<group>/templates/<id>`. Likely v1 scope: named (and grouped?) templates
   only — direct-path templates out of scope for config values.
5. **Engine/CLI split.** Frontmatter `default:` belongs in the engine schema
   (`validateTemplateSchema` / `validateTemplateInputs`); config reading and
   merging belong in the CLI. Does the engine apply defaults inside
   `validateTemplateInputs`, or does the CLI pre-merge before calling? The
   engine API surface is pinned by the package-split v2 spec, so this
   touches that contract.
6. **Agent-skill wrapper messaging.** Wrappers currently say "run bare" only
   when a template declares no inputs. With config, a template whose
   required inputs are all config-satisfied could also run bare — but the
   wrapper cannot know the user's config at generation time. Does
   `generate agent-skill` messaging change?
