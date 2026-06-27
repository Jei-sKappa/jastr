# Seed: `jastr list --variants` — render config-defined variants in the inventory
External: none — personal, private, high-development project; the repo is the sole owner and there is nothing external to drift against.

`jastr list` shows the installed/authored template inventory with provenance,
already rendering a group row's member templates beneath it as a sorted tree.
The idea: add a `--variants` mode so `list` also surfaces the config-defined
variants (`variants.<template-ref>.<variant-id>`) that exist over named and
grouped templates, the same `<ref>#<variant-id>` form `run`/`generate`/`validate`
accept. Today variants are invisible in the inventory, so an author has no
single command that answers "what can I actually run, including every variant?"
Open questions to settle downstream: exact flag spelling/semantics
(`--variants` opt-in vs. default), how variant rows nest under their template in
the existing tree, sorting/labeling, how the dual-root local/global config
composition is reflected, and whether provenance applies to variants.
