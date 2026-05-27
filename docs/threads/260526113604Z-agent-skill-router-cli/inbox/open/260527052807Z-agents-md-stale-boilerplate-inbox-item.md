**Why:** `AGENTS.md`/`CLAUDE.md` carry stale boilerplate from another project template that no longer matches Skillrouter's structure; surfaced during the v1 implementation (Task 15) but rewriting those sections was out of the plan's scope.

The file's own "Update rule" treats every claim as currently true, yet several sections describe a different project:

- **Test Layout** section describes a `packages/<name>/test/**` layout and "LAW author tests" under `laws/<law-name>/tests/...`, run via `bun packages/cli/src/index.ts test laws`. Skillrouter actually uses root-level `src/` and `test/`, has no `packages/` and no "laws", and runs tests with `bun run test` (vitest).
- **Documents** section says to `tree documents` (the folder is `docs/`) and that "Specs live under `docs/superpowers/specs/` and are named `YYYY-MM-DD-<slug>-design.md`." Actual specs live under `docs/threads/<thread>/specs/` with `YYMMDDHHMMSSZ-...` names.
- **Playground** section mentions using it "to actually test bylaw for real" — "bylaw" is from a different project.

Task 15 deliberately made only the two AGENTS.md edits the plan specified (project status + the v1 contract bullet) and left the rest untouched per surgical-change discipline. A focused cleanup pass to reconcile these sections with Skillrouter's real layout would make the contract accurate again.
