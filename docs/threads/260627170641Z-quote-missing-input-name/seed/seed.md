# Seed: Quote the missing-input name in the error message
External: none — tier 1 patch in a private, single-owner repo; nothing external to drift against.

Running `jastr run <template>` without a required input prints `Error: Required input language is
missing.`, with the input name as bare text. The name should be wrapped in double quotes —
`Required input "language" is missing.` — so it reads as a distinct value and stands out from the
surrounding prose. The message lives in `packages/engine/src/inputs.ts` (the
`missing_required_input` throw); sibling input-name messages stay unquoted for now (tier 1, narrow scope).
