# Include Group Containment Review Discussion

This discussion resolves the handoff-grade review findings for the include group containment v1 spec.

## P1: Grouped Named Access Scope

Point: Decide whether grouped named access belongs in v1, or whether v1 should only settle containment for direct file paths and existing one-segment named templates.

What you need to know: The review found a contradiction: the spec’s Scope says “a final grammar for named-access addressing” is out of scope, `Command shapes` says the exact named-lookup grammar is open, but `Questions > Resolved` gives an answer: one slash means `group/template-id`, more than one slash is an error.

Current code in `packages/cli/src/templates/template-ref.ts` only accepts named IDs matching `^[a-z0-9][a-z0-9-]*$` and loads `.jastr/<id>/template.md`. So supporting `jastr run my-group/my-template` means changing template-reference validation and named lookup behavior, not just include containment.

Choice: Include grouped named access in v1.

Rationale: This makes the spec's grouped examples executable and gives named templates the same shared-partial path as direct-file group templates. The trade-off is accepting a broader v1 implementation: template-reference validation, lookup, generated wrapper behavior, e2e requirements, and stable errors all need to cover the new two-segment form.

## P2: Grouped Named Reference Grammar

Point: Decide the exact grouped named-reference grammar for v1.

What you need to know: Because P1 puts grouped named access in scope, the spec needs a concrete contract. Existing named template IDs are single lowercase kebab-ish segments. The spec’s draft answer says: if there is one `/`, treat it as `group/template-id`; more than one `/` is an error. That still leaves two important details: whether both segments use the existing ID grammar, and where the grouped template file lives on disk.

Choice: Strict two-segment grammar: `<group>/<template-id>` maps to `<group>/templates/<template-id>/template.md`.

Rationale: This matches the spec's example group layout and keeps the named reference contract simple: one slash means grouped named access, more than one slash is invalid, and both segments should use the existing template-id pattern. The trade-off is introducing a second named-template catalog outside `.jastr/`, which the v1 spec and tests must now describe explicitly.

## P3: Nested Group Discovery

Point: Decide how nested `.jastrgroup` markers behave.

What you need to know: The spec currently conflicts with itself here too. Scope says nested groups are out of scope/deferred, but Questions says discovery starts at the template directory and stops at the first `.jastrgroup`. That answer implies nearest-marker-wins and effectively allows nested groups, because an inner marker shadows the outer one.

There’s an implementation risk: if nesting is allowed accidentally, the boundary for a template can change just by adding a `.jastrgroup` deeper in a tree. That may be acceptable if documented, but it is a real security-boundary behavior.

Choice: Nearest marker wins; v1 does not reject nested `.jastrgroup` markers.

Rationale: Group discovery starts at the top-level template directory and stops at the first `.jastrgroup`. If an outer `.jastrgroup` also exists, it is ignored for that template. This matches the already-written discovery answer while making the observable behavior explicit. The spec should avoid presenting nested groups as a deliberate feature beyond this behavior; the trade-off is that adding an inner marker can change the containment boundary for templates beneath it.

## P4: Include Error Code Strategy

Point: Decide the stable error-code strategy for the new include/group failures.

What you need to know: The review found that v1 says “update the include error contract” but does not define exact replacement codes/messages. Existing v2 pins `include_path_rejected`, `include_outside_root`, `include_not_found`, and `include_read_error`. Current e2e docs assert exact stderr strings, so the spec must choose message templates before implementation.

The new surfaces include at least: invalid `root`, `root="group"` when no group exists, containment escape, invalid grouped template reference shape, grouped template not found, and invalid group marker/layout if we keep those rules.

Choice: Preserve existing codes where semantics remain close; add narrow new codes only for genuinely new failures.

Rationale: This keeps the existing structured error surface stable where the meaning still holds while giving new include/group failures precise codes. `invalid_template_reference`, `template_not_found`, `include_outside_root`, `include_not_found`, and `include_read_error` should continue to carry the nearby failures; narrow new codes such as `invalid_include_root` and `include_group_missing` should cover failures that did not exist before.

## P5: Include Error Message Templates

Point: Decide the exact stable message templates for the include/group failures.

What you need to know: P4 chose the strategy, but the spec still needs concrete messages because CLI e2e cases and `BEHAVIOR.md` pin stderr exactly. The key design choice is whether containment errors expose the current boundary type (`group` vs `template`) or use one generic message for the unified model.

Choice: Use one generic containment message and narrow messages for root/reference failures.

Rationale: This best matches the unified-containment model while still giving users direct fixes for invalid references and invalid roots. The spec should pin these templates: `invalid_template_reference`: `Template reference <template-ref> must be a template id, a group/template id, or a .md file path.`; grouped `template_not_found`: `Template <group>/<template-id> was not found at <group>/templates/<template-id>/template.md.`; `invalid_include_root`: `Include root <root> must be template, group, or file.`; `include_group_missing`: `Include root group requires the template to be inside a .jastrgroup.`; `include_outside_root`: `Include path <include-path> escapes the allowed include boundary.`; `include_not_found` and `include_read_error` remain unchanged.

## P6: Strict Group Classification

Point: Decide how a template is classified as grouped or standalone under the strict group-layout rule.

What you need to know: The earlier P3 decision used nearest-marker discovery for nested `.jastrgroup` markers. The refined rule replaces upward discovery with exact group classification. Direct access and named access need separate treatment because direct file paths may point anywhere, while slash-based named references intentionally request grouped lookup.

Choice: Strict group classification supersedes P3. For direct access, a template is grouped iff the top-level template realpath is exactly `<group>/templates/<template-id>/template.md` and `<group>/.jastrgroup` exists; otherwise it is standalone. For named access, `jastr run <group>/<template-id>` is grouped iff both segments are valid ids, `<group>/.jastrgroup` exists, and `<group>/templates/<template-id>/template.md` exists; grouped named access never falls back to standalone lookup. One-segment `jastr run <template-id>` remains the existing `.jastr/<template-id>/template.md` named-template path. No ancestor scanning is performed for misplaced `.jastrgroup` markers; markers outside the exact group-root position are irrelevant to the run.

Rationale: This preserves standalone templates while making grouped templates explicit and mechanically clear. It also gives named grouped access a hard failure mode instead of surprising fallback behavior. This supersedes P3 because group classification no longer uses nearest-marker discovery. The spec should state that these conditions must be implemented in clear, explicit code so future readers can re-audit the grouped-vs-standalone decision without inferring behavior from incidental path manipulation.

## P7: Standalone Group Root Includes

Point: Decide whether `root="group"` on standalone templates remains an error under the strict classification rule.

What you need to know: Earlier the spec’s Questions section answered this as “it’s an error.” P6 makes this sharper: direct access can be standalone even if its path looks group-ish but lacks `<group>/.jastrgroup`; one-segment named access is also standalone. In those cases there is no group boundary.

Choice: Keep `root="group"` on standalone templates as an error.

Rationale: `root="group"` should mean a real grouped template only. Under P6, grouped status is explicit and does not fall back, so a standalone template has no group root to resolve from. This catches layout/source mistakes instead of silently treating `group` as `template`.

## P8: Group Marker Contents

Point: Decide whether `.jastrgroup` file contents are validated.

What you need to know: The v1 spec currently calls `.jastrgroup` an “empty marker file.” With P6, the marker has exactly one structural role: opt a template into the strict grouped layout when it exists at `<group>/.jastrgroup`. We still need to decide whether non-empty marker content is invalid or ignored.

Choice: Only require `.jastrgroup` to exist as a file; ignore contents.

Rationale: The security and classification model depends on marker placement, not marker bytes. Existence-only keeps the implementation and error surface smaller. The spec should replace "empty marker file" wording with "marker file" so users do not infer that marker contents are validated.

## P9: Group Root Template File

Point: Decide whether group root `template.md` is invalid.

What you need to know: The v1 spec currently says “Having `.jastrgroup` with `template.md` is an error.” Under P6/P8, group classification only cares whether the top-level template is exactly `<group>/templates/<template-id>/template.md` and whether `<group>/.jastrgroup` exists. A `template.md` directly in `<group>/` would not be the grouped template being run unless the user directly runs that file.

If we make root-level `template.md` invalid just because `.jastrgroup` exists beside it, then a group folder cannot also contain a standalone direct-file template named `template.md`.

Choice: Do not reject group-root `template.md`; it is just not a grouped template.

Rationale: This matches P6's strict classification rule and avoids sibling-file validation. The exact-layout rule remains the contract: if a top-level template is not exactly `<group>/templates/<template-id>/template.md` with `<group>/.jastrgroup`, it is standalone. A root-level `template.md` is therefore standalone if directly run and irrelevant otherwise.

## P10: Boundary-Only Security Wording

Point: Decide how to resolve the intended-outcome security wording about `.env` and other secrets.

What you need to know: The review found that the spec opens with a broad guarantee that includes cannot read `.env`, SSH keys, or arbitrary files, but later decisions intentionally remove the `.env` denylist and rely on containment only. Under the current decisions, a `.env` physically inside the allowed boundary is includable. That is not a bug; it is author responsibility.

Choice: Rewrite the guarantee as boundary-only.

Rationale: The spec should promise only that includes cannot read files outside the allowed template/group boundary. Files intentionally placed inside that boundary, including `.env`-style files, are includable and are the author's responsibility. This avoids reintroducing a secrets denylist by implication.

## P11: Unresolved Questions Status

Point: Decide whether any unresolved questions remain in the next spec version.

What you need to know: The review flagged the current `## Questions` section because it is labeled as resolved but still contains language like “must be settled,” “undefined,” and “presumably.” The discussion has now settled the major items: grouped named access, grammar, group classification, standalone `root="group"`, marker contents, group-root `template.md`, error strategy/messages, and security wording.

A handoff-grade spec can either have a clear `## Unresolved Questions` section with real non-blocking open questions, or explicitly say none remain. Leaving old question prose mixed with answers will recreate the same review issue.

Choice: State that no unresolved questions remain.

Rationale: The next spec should inline these decisions into the operative sections and say `## Unresolved Questions` / `None.` Design history belongs in references or the discussion log, not as stale question prompts inside the spec body.
