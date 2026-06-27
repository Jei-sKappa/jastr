# Decision log — quote-missing-input-name seed (the seed)

Thread: docs/threads/260627170641Z-quote-missing-input-name/
Target: the seed (seed/seed.md)
Subject: defining the scope and shape of quoting interpolated identifiers in jastr's error messages — a genesis discussion held before any proposal/spec/plan exists.

## P1: How to handle the inconsistency with sibling input-name messages

Point: How to handle the inconsistency this creates with the sibling messages.

What you need to know: After the originally-requested change, the missing-input message is quoted, but ~17 sibling messages that interpolate the same input name stay unquoted — `Input language is not declared.` (`inputs.ts:19`), `Input language must be a boolean.` (`inputs.ts:58`), and similar at `inputs.ts:68,76,84`, plus 12 in `schema.ts` (`:91,99,108,153,175,184,195,202,218,234,241,248`). A user who triggers two different input errors in a row will see one quoted and the rest bare. The Tier 1 choice said siblings stay "as-is for now" — so the question is whether "for now" means silently or tracked.

Options presented:
- A — Quote this one message, do nothing else. Matches the literal ask; simplest; leaves a visible inconsistency with no record of intent.
- B — Quote this one now, capture the convention rollout as a deferred follow-up (new thread seed / ticket). Keeps the change small and Tier 1; makes the inconsistency intentional and tracked.
- C — Expand now to quote all ~17 input-name messages. One consistent convention immediately; bigger blast radius; re-opens the tier.

Recommendation presented: B — honor the small Tier 1 scope while making the deferral durable rather than silent.

Decision: C — expand now to quote every input-name error message and establish a single project-wide quoting convention in one pass, rather than touching only the missing-input message.

Rationale: The user had not realized the unquoted-name pattern was widespread (~17 sibling messages, and further identifier-bearing messages in the CLI layer); given that, fixing it properly in one consistent pass beats leaving a visible inconsistency. Consistency across all input-name errors was judged more valuable than minimizing the diff. I had recommended B to limit blast radius; the user's new information (not having realized the scope) is a sound, fact-based reason to escalate, and C produces the better end state, so this is agreement, not conceded dissent. Note: C escalates beyond the previously-confirmed Tier 1 — a project-wide error-message convention is a design decision (Tier 2), and the thread `ledger.md` should get an appended `tier: 2` line to reflect it.

## P2: The convention's domain — which interpolated tokens get quoted

Point: What is the convention's domain — which interpolated tokens get quoted?

What you need to know: Once we commit to "quote interpolated identifiers," the codebase has several distinct families of them, not one:

1. Bare input names — engine (`inputs.ts`, `schema.ts`, ~18 sites). The original target: `Input language is not declared.`, `Required input language is missing.`, etc. A few of these also interpolate a second value — enum lists (`must be one of: a, b, c`) and type names (`unsupported type foo`).
2. Input names as flags — CLI (`flags.ts`, `variants.ts`, ~5 sites): `Unknown input flag --language.`, `Input --language cannot be empty.`, `Input --language is locked by variant grp/tpl#v.`. These are already `--`-prefixed, so they're partly self-delimiting.
3. Command-parse tokens — CLI (`args.ts`, ~18 sites): `Unknown add option --foo.`, `Invalid flag syntax --x=.`, `Missing value for --bar.`, `Invalid add argument baz.` — raw things the user typed, plus template refs and option names.

The key realization: nothing in the codebase quotes any interpolation today, so whatever we pick is the house rule going forward. And A/B both re-create the exact inconsistency we're killing, just at a different seam — a user who hits `Required input "language" is missing.` and then `Unknown add option --foo.` still sees mixed treatment.

Options presented:
- A — Bare input names only (~18 sites). Surgical; closest to the original ask, but flags, enum values, types, and all command-parse errors stay bare — the inconsistency just moves to the CLI boundary.
- B — All input references (~23 sites): engine bare names + the CLI `--flag` forms; leaves command-parse tokens, enum values, and types bare; requires deciding whether `"--language"` reads well.
- C — Every interpolated value in a user-facing message (~40+ sites): one rule, no exceptions; biggest blast radius and most test churn, but the only stateless rule ("always quote interpolations") rather than a per-site judgment call.

Examples shown (representative before → under-C): `Required input language is missing.` → `Required input "language" is missing.`; `Input language must be one of: en, fr, de.` → `Input "language" must be one of: "en", "fr", "de".`; `Input language uses unsupported type frobnicate.` → `Input "language" uses unsupported type "frobnicate".`; `Unknown input flag --language.` → `Unknown input flag "--language".`; `Input --language is locked by variant docs/spec#v1.` → `Input "--language" is locked by variant "docs/spec#v1".`; `Duplicate flag --verbose.` → `Duplicate flag "--verbose".`; `Invalid add argument extra.` → `Invalid add argument "extra".`. Fixed vocabulary (`required: true`, `true, false`) stays bare because it is not interpolated.

Recommendation presented: C — counter-intuitively the simplest convention (a stateless "always quote interpolations" rule a reviewer can enforce mechanically), and the only option consistent with the P1 motivation of eliminating the inconsistency rather than relocating it.

Decision: C — every interpolated value in a user-facing message is quoted, across engine and CLI.

Rationale: Picking C in P1 was about killing the inconsistency, not moving it; A and B both leave a bare/quoted split at the engine↔CLI seam, so only C is internally consistent with that goal. C is also the cheapest rule to maintain — "quote every interpolation" needs no per-site judgment — which matters for a convention future contributors must apply without re-deriving it. Accepted costs: ~40 edit sites, broader test churn, and two ride-along boundary sub-questions (how to quote list/enum values, and how to quote the composite `--flag` token) to be settled next.

## P3: The quoted unit when a value is not a single bare token

Point: What's the quoted unit when a value isn't a single bare token?

What you need to know: Two shapes have no obvious boundary:

1. Joined lists — `${definition.values.join(", ")}` emits `en, fr, de` as one string.
2. Composite tokens with literal affixes — `--${flag.name}` (the `--` is literal text, not interpolated) and `${templateRef}#${variantId}` (two interpolations joined by a literal `#`).

If we quote the raw interpolation mechanically, we get `"en, fr, de"` (one blob), `--"language"`, and `"docs/spec"#"v1"` — the last two are plainly wrong. So "quote the interpolation" isn't a complete rule; we need to say what the unit is.

Proposed solution presented: quote the complete logical token a reader recognizes as one value, not the raw `${…}` span. Lists → quote each item (`must be one of: "en", "fr", "de".`); flags → quote the whole token including `--` (`"--language"`); refs → quote the whole ref (`is locked by variant "docs/spec#v1".`); usage hints → one unit (`Input "--language" requires "--language=value".`).

Decision: accepted as proposed — the quoted unit is the complete logical token the user would recognize as one value (per-item for lists, whole-token for flags/refs/usage-hints).

Rationale: It is the only reading that looks correct at every site (the mechanical alternatives produce `--"language"` / `"docs/spec"#"v1"`), and it keeps the convention statable for future contributors as "quote each complete value as the user would recognize it." Practically a forced move. Minor implementation cost: list sites use `.map(quote)` rather than a bare interpolation, and composite sites must include the literal affix inside the quotes.

## P4: The quote character for the convention

Point: Which quote character is the convention — double quotes (as originally stated), or the backticks already in the tree?

What you need to know: Correction surfaced here — during P2 it was stated that "nothing in the codebase quotes any interpolation today." That was based on a double-quote-only search and was wrong. A backtick quoting style already exists in CLI output: `commands.ts:203` (`` Generated `<path>` from template `<path>` ``), `install/add.ts:183` (`` run `jastr update <id>` to refresh it ``), and `install/update.ts:190` (`` re-add it with `jastr add` ``). Separately, `targets/agent-skill.ts` uses backticks heavily, but that is generating Markdown for skill files (backticks = code spans there) — a different surface, to be excluded when the boundary is settled. The true message surface is also far larger than the ~40 sites scoped at P2: ~154 `JastrError` throw sites and ~190 interpolated message lines. A convention must pick one quote character; shipping both just relocates the inconsistency C set out to remove, and the chosen character gets applied across all ~150+ sites with the minority style converted to match.

Options presented:
- A — Double quotes everywhere. The originally stated preference; most legible in a plain terminal; convention most users expect. Cost: convert the 3 existing backtick CLI messages to double quotes for uniformity (trivial).
- B — Backticks everywhere. Matches existing precedent (no conversion of those 3); backticks semantically read as "literal/code token," fitting paths, flags, refs; cost: contradicts the originally stated double-quote preference and backticks render faintly in some terminals/fonts.
- (noted) Single quotes — git-style `'…'`; no precedent here and not requested; flagged only.

Recommendation presented: A — double quotes (stated preference, most visible, 3-line conversion cost).

Decision: B — backticks everywhere. This supersedes the working assumption from the opening exchange that the convention would use double quotes.

Rationale: The user chose backticks to match the existing (if accidental) precedent — no conversion of the 3 current sites — and for the semantic "this is a literal token" reading that fits names/paths/flags/refs. A further merit, surfaced after the choice: backticks align the CLI messages with the backtick style the generated agent-skill Markdown already uses, so the whole project converges on one quoting character. I had recommended A on terminal-legibility grounds; B is a legitimate values call (precedent + semantic fit + project-wide single character over maximal legibility), well-grounded, so logged without dissent. Also records the correction above: the earlier "nothing is quoted today" claim was incomplete — backtick-quoting already existed.

## P5: The convention's boundary across the full message surface

Point: Where exactly does the convention's boundary fall?

What you need to know: The ~150 sites aren't homogeneous. They mix:

- Message kinds — errors and success/info (`Template <ref> is valid.`, `Generated <path> from template <path>`, `Removed <id> …`).
- Author/user value tokens — input names, flags, refs, template ids, file paths, URLs, config-key paths (`.jastr/config.yml variants.x.y`), type names, enum values, directive snippets (`Invalid directive syntax <line>`).
- Bare numerics — durations, counts, exit codes (`timed out after 5000ms`, `(exit <code>)`).
- A separate surface — the generated agent-skill Markdown (`targets/agent-skill.ts`), which is content written into skill files, not a terminal message.

Proposed boundary presented:
1. Apply to all user-facing CLI stdout/stderr messages — errors and success/info alike.
2. Backtick the value tokens a user or author supplied or that name a thing: names, flags, refs, paths, URLs, config-key paths, types, enum values (each, per P3), directive snippets.
3. Do not backtick bare numerics (`5000ms`, counts, exit codes); fixed vocabulary like `required: true` also stays bare (per P2).
4. Exclude the generated agent-skill Markdown — Markdown for agents, governed by Markdown's own code-span rules, not this convention.

Two judgment calls flagged: (a) success/info messages — proposed IN; (b) numerics — proposed OUT.

Decision: accepted as proposed — convention covers all CLI stdout/stderr messages (errors + success/info), backticks value tokens, leaves bare numerics and fixed vocabulary unquoted, and excludes the generated agent-skill Markdown surface. Both judgment calls land as proposed: (a) success/info IN, (b) numerics OUT.

Rationale: Applying the convention to every CLI message (not just errors) means a user never sees two formatting styles across a session. Backticking only value tokens targets exactly the prose-ambiguity that motivated the change, while leaving numerics and fixed vocabulary bare avoids noise on tokens that were never ambiguous. The agent-skill Markdown is excluded because it is a different surface with its own (coincidentally identical) backtick semantics; folding it into this convention would conflate "terminal message formatting" with "Markdown authoring."

## P6: How the backtick is applied in code

Point: How is the backtick applied in code — inline at every site, or via a helper?

What you need to know: The messages are themselves template literals delimited by backticks, so a literal backtick inside one must be escaped (`` \` ``). Inline, quoting a value looks like `` `Required input \`${inputName}\` is missing.` `` — and many messages carry two such tokens. Across ~150 sites that is a lot of hand-escaping, easy to get subtly wrong, and impossible to enforce mechanically. A one-line helper removes the escaping from call sites: `const quote = (value: string): string => \`\\\`${value}\\\`\`;` used as `` `Required input ${quote(inputName)} is missing.` ``, `${values.map(quote).join(", ")}`, `` quote(`--${flag.name}`) `` — and it pairs cleanly with P3 (pass the complete logical token to `quote`). Wrinkle: the engine must stay pure and its public API is pinned (`parseTemplateSource`, …, `JastrError`). The engine holds ~42 of the sites, the CLI ~150, so a shared helper is either duplicated per package or added to the engine's public exports.

Options presented:
- A — Inline backticks, no helper. Matches today's style (every message is a plain inline literal); KISS; nothing new. Cost: ~150 hand-escaped sites, fragile, no single enforcement/grep point.
- B — One tiny internal helper per package (engine-internal + cli-internal, neither exported). Clean, mis-escape-proof call sites; one enforcement point per package; engine stays pure, pinned public API untouched. Cost: a trivial one-liner duplicated across two packages.
- C — Export `quote` from the engine's public API, CLI imports it. Zero duplication. Cost: extends the pinned public API for a trivial util and couples the CLI to the engine for string formatting.

Recommendation presented: B.

Decision: B — one tiny internal `quote` helper per package (engine-internal and cli-internal), neither added to the engine's public exports.

Rationale: The helper is what turns this from 150 independent hand-escaped strings into an enforceable convention — one definition per package, greppable, and call sites that cannot mis-escape. Keeping it internal-per-package preserves engine purity and leaves the pinned public API untouched; the duplicated one-liner is a negligible DRY cost that buys clean package decoupling (Law of Demeter over DRY for a trivial util). C was rejected for leaking a formatting helper into the engine's public contract for no real gain; A for scattering fragile escaping across the whole surface with no home for the convention. Refinement noted for the spec: because numerics are never quoted (P5), the helper need only accept `string` (not the `string | number` shown during discussion), and the 3–4 existing backtick sites should be refactored to route through `quote` for uniformity.
