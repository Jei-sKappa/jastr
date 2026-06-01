# BEHAVIOR.md structure polish discussion

Discussing readability changes to the generated `docs/BEHAVIOR.md`: separating
each requirement's definition from its covering cases, restructuring the
per-case header (heading plus an AC-only "covers" line), and separating and
reordering the per-case input, output-files, and CLI-output sections.

## P1: Separator between a requirement's definition and its covering cases

Point: Right now a requirement section flows straight from the AC coverage table into the first case block with no visual break, so there's nothing telling the reader "the definition (title + description + AC table) is finished; what follows are the worked examples."

What you need to know: In `scripts/living-docs.ts`, `renderRequirement` emits, per requirement: the `### <ID> — <title>` heading → description → acceptance table → an optional `> Deferred:` note → then immediately the covering-case blocks. Today each case begins with a bold line `**<title>** — demonstrates <refs>`; there is no heading or rule between the table and the first case. Note this interacts with P2: if we give each case its own `####` heading (next point), that alone adds *some* separation — but you asked specifically for an explicit "definition ends here" marker.

Choice: Option B — a dedicated `#### Cases` sub-heading before the case list. Per-case headings (P2) nest one level deeper at `#####` (h5).

Rationale: A labeled heading is more organized and less generic than a horizontal rule, and crucially avoids a real ambiguity: a bare `---` renders like the setext underline GitHub draws under an H1/H2, so it can read as "a new top-level section started" rather than "this subsection ended." h5 case headings render fine on GitHub (just smaller). I had recommended Option A (horizontal rule) to keep the hierarchy shallow, but the H1-underline-confusion argument is valid, so I aligned with B. Trade-off carried forward: with `#### Cases` at h4 and cases at h5, the heading stack is near Markdown's `######` (h6) floor, so P3's per-case sub-sections must stay bold labels rather than headings.

## P2: Per-case header — heading + AC-only "covers" line

Point: Each case should start with its own heading and a clean covers line, replacing today's single bold line `**<title>** — demonstrates RUN-FR-0001.AC-0001, RUN-FR-0001.AC-0002, RUN-FR-0001.AC-0003`, which has no heading and repeats the full requirement ID on every AC.

What you need to know: With P1 settled, each case heading sits at `#####` (h5) under the `#### Cases` heading. The current line comes from `renderRequirement`: `**${entry.title}** — demonstrates ${refs.join(", ")}`, where `refs` is from `demonstratedRefs` — already scoped to the current requirement's live ACs, but returning full refs like `RUN-FR-0001.AC-0001`. The requirement ID is already in the `### <ID> — <title>` heading two levels up, so the FR prefix on each AC is redundant — `AC-0001, AC-0002` is unambiguous within a case (and for the 3 cross-requirement cases like `help-root`, each section already shows only that requirement's ACs). The description currently follows as a `> <blockquote>`. Some descriptions are long, e.g. `generate-router`: "Shows how generate writes a minimal router skill from a template, creating the missing out/ parent directory."

Choice: Option A with a fixed layout. Each case renders as an `#####` (h5) heading of the title, then a plain `Description: <description>` line (replacing the old `> blockquote`), then a `Covers: <AC-id, …>` line:

```
##### Run a basic skill

Description: Render a minimal template with no inputs.

Covers: AC-0001, AC-0002, AC-0003
```

Order is heading → Description → Covers. Covers shows AC-only IDs (no `<FR>.` prefix). Case headings are NOT added to the TOC (it stays at area + requirement level).

Rationale: Title-only heading stays short and scannable (it's what GitHub's outline shows); folding whole-sentence descriptions into the heading (rejected Option B) would produce long, inconsistent headings and bloated anchors. Description and Covers become parallel labeled lines; AC-only is unambiguous because the requirement ID is in the ancestor `###` heading. User preferred Description before Covers. TOC stays requirement-level to avoid 60+ entries (including the 3 duplicated cross-requirement cases).

## P3: Per-case sub-section separation + ordering

Point: A case body has up to three sub-sections: the input project, the CLI transcript (command + stdout/stderr/exit), and the output files. Today they render input → CLI transcript → output files; the transcript has no label and the sections are only lightly separated. You want clearer separation between them and the CLI output moved to last (below output files).

What you need to know: Current per-case body (after the header), from `renderRequirement` + helpers: (1) `renderInputProject` → a collapsed `<details><summary>Input project — N files, command ran from …</summary>…tree + file contents…</details>`, or, for empty fixtures, a plain italic note; (2) `renderTranscript` → a bare ` ```console ` block (`$ cmd` / stdout / stderr / `# exit N`) — no label, always expanded; (3) `renderOutputFiles` → a collapsed `<details><summary>Output files asserted after the command — N files</summary>…</details>`, only when the case writes files. So input and output-files already carry their label inside the `<details>` summary; the transcript is the one unlabeled, always-open block. Per P1's constraint, sub-sections must stay bold labels / `<details>`, not headings (we're at the h6 floor).

Choice: Four bold-labeled sub-sections, in order **Input project** → **Command** → **Output files** → **CLI output**. The old single transcript is split: the invoked command moves to its own **Command** section (the `$ skillrouter …` line), and stdout/stderr plus the `# exit N` line go under **CLI output**. **Output files** is rendered only when the case writes files (omitted, not shown as "none", otherwise). Section titles are bold; P2's `Description:`/`Covers:` stay plain.

Rationale: Splitting the command into its own section ahead of the outputs resolves the cause-before-effect concern raised against putting the full transcript last — the command now precedes the files and console output it produces (Input = given, Command = when, Output files + CLI output = then). Four uniformly bold-labeled sections give the clearer separation requested. This supersedes the earlier Option (a) recommendation (which kept the command inside the transcript at the bottom); the user's command/output split is cleaner. Dependency: whole-case collapsibility is deferred to P4, which may change whether the Input/Output bodies keep their own inner `<details>` (to avoid nested collapsibles).

## P4: Make the whole case body collapsible

Point: After the header (title + `Description:` + `Covers:`), wrap the four sections (Input, Command, Output files, CLI output) in a single `<details>` so that, by default, a requirement shows just its case headers and you expand a case to see its detail.

What you need to know: The doc is large (~3060 lines for 63 cases). Today Input and Output-files are each their own collapsed `<details>` while the Command/CLI output is always open, so every case still takes real vertical space. Wrapping the whole body in one outer `<details>` raises a nesting question: if Input and Output-files keep their *own* `<details>`, you get `<details>` inside `<details>` — GitHub supports it, but it's two clicks and looks heavy. The honest tradeoff of collapsing-by-default: the asserted CLI output is no longer visible at a glance — you must expand to see what a command produced. For a drill-down reference that's usually a good trade (scannability up), but it does lower "proof at a glance."

Choice: Option (a), without `<details open>` — for now. One outer `<details>` per case, collapsed by default, wrapping the four P3 sections. Input and Output-files are flattened to plain bold-labeled blocks (no inner `<details>`), so a single click reveals all four sections with no nesting. Summary is a fixed label (e.g. "Input, command & output").

Rationale: Simplest design that delivers "entire case body collapsible"; one click, no nested collapsibles, straightforward renderer. User accepted the trade that command output is hidden until expanded (explicitly declined `<details open>`), prioritizing scannability of the long document. The synopsis-summary (Option b) was skipped to avoid duplicating the P3 Command section; it can be added later if the collapsed list reads too sparse. "For now" flags this as a try — revisit if it doesn't feel right in practice.

## P5: Drop the "Cases" group heading; promote cases to `#### Case: <title>` (supersedes P1, revises P2)

Point: After implementing P1–P4, remove the `#### Cases` group heading and move each case up one heading level — from `#####` (h5) under a `#### Cases` heading to a `####` (h4) heading whose text is `Case: <existing title>` (e.g. `#### Case: Run a basic skill`), sitting directly under the requirement's `###` heading.

What you need to know: As built, each requirement rendered `### <req>` → description → acceptance table → `#### Cases` → per case `##### <title>` + `Description:`/`Covers:` + the collapsed `<details>` body (P2–P4). The user found the dedicated `#### Cases` grouping node redundant once each case carries its own heading.

Choice: Removed the `#### Cases` heading. Each case is now a `#### Case: <title>` heading (h4, one level under the requirement's h3); the `Description:` line, AC-only `Covers:` line, and the single collapsed `<details>` wrapping the four bold-labelled sections (P2–P4) are unchanged. The `cases.length > 0` guard is gone (the loop simply renders nothing when there are no cases).

Rationale: The first `#### Case:` heading after the acceptance table still cleanly marks "definition finished" — it is a real heading, so it preserves P1's intent (a labelled break, no `---`/H1-underline ambiguity) without the extra grouping node, and it shifts cases one level shallower. The `Case:` prefix keeps the semantic label that the `#### Cases` heading used to provide. Trade-off: GitHub's outline no longer shows one "Cases" node per requirement; instead each case appears directly as "Case: <title>" under the requirement — fine, arguably better, for navigation. No effect on the TOC (still requirement-level; case headings remain excluded). This supersedes P1 (no more `#### Cases` group heading) and revises P2's heading decision (now `#### Case: <title>` at h4, instead of `#####` title-only).

## P6: Move the exit code out of the CLI output code block (revises P3)

Point: In the **CLI output** section the `# exit <code>` line sits inside the ` ```console ` block next to the real stdout/stderr, where it can be misread as a line the command actually printed (a shell-style `#` comment, even) rather than metadata about how the process ended. Move (not remove — the exit code is asserted behaviour, especially for error cases) it out of the block.

What you need to know: As built per P3, `renderCliOutputSection` emitted `**CLI output**` then a console block containing stdout, stderr, and a trailing `# exit N` line. The exit code is part of what the e2e suite asserts (`manifest.expect.exitCode`) and is the key fact for error cases (where stdout is empty), so it must stay visible.

Choice: The exit code moves into the section label, matching the existing `**Input project** — ran from …` style: the label becomes `**CLI output** — exit <code>`, and the ` ```console ` block now contains only the actual stdout/stderr. When a case has neither stdout nor stderr, the block is omitted entirely and replaced with a `_No stdout or stderr._` note under the label. The exit code is deliberately kept out of the outer `<details>` summary (which stays the fixed "Input, command & output" from P4, not the declined synopsis variant).

Rationale: Putting exit status in the label makes the code block contain only what the command printed, removing the misread. It preserves the exit code (asserted behaviour) and surfaces it at the section level. Revises P3's CLI-output rendering (exit line was inside the block); leaves the other three sections and the rest of P1–P5 unchanged.
