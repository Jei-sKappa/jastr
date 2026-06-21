# Seed: Self-contained skill bundle
External: none — private solo project; the repo is the sole owner and there is nothing external to drift against.

Bundle the rendered template (and consider also shipping the jastr runtime itself)
into the generated skill directory so a generated Agent Skill is completely
self-contained — runnable without depending on the surrounding repo's `.jastr/`
templates or a separately installed `jastr` binary. Open question carried by this
thread: bundle only the template, or also ship the runtime alongside it.
