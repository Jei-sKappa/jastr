# Seed: `validate` multi-root setup checks (root-scope flags, doctor scan, CI gate)
External: none — private, single-owner personal tool; the repo is the sole owner and there is nothing external to drift against.

Spun off from the home-global `.jastr` thread (docs/threads/260621200326Z-home-global-jastr-dir/)
while disposing its handoff-review Finding 1. With layered local+global resolution landing,
`jastr validate` needs to grow beyond "is the single resolved template valid?": add `--local`/`--global`
(`-l`/`-g`) to scope which root is validated, a ref-less mode that scans the whole `.jastr` setup, a
partial-local-footprint diagnostic (a local `<id>` dir/group present but missing its `TEMPLATE.md`/marker,
silently bypassed at run time), and a flag that exits non-zero for CI gating. Open question the thread will
resolve: the default root scope, given FR-10 requires validate to mirror what `run` resolves — so a
local-only default would contradict the layered model.
