# Seed: Home-directory (global) `.jastr` support
External: none — private, single-owner personal tool; the repo is the sole owner and there is nothing external to drift against.

Today `.jastr/` is discovered only locally, walking up from the cwd to a project
root. The ask is to also support a `.jastr/` folder in the user's home directory
so jastr can back a "global" install — named/grouped templates, variants, and
config that are available from any project, not just a local one. Open question
the thread will resolve: how a home (global) `.jastr` and a project-local
`.jastr` coexist (lookup order, precedence, and how includes/config compose
across the two).
