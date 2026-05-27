import packageJson from "../../package.json" with { type: "json" };

export const SKILLROUTER_VERSION = packageJson.version;

// SKILLROUTER_GIT_SHA is injected at build time via `bun build --define`.
// When the CLI runs from source (dev, tests), the define is absent and we
// fall back to "dev".
export const SKILLROUTER_GIT_SHA_OR_DEV =
  typeof SKILLROUTER_GIT_SHA === "string" ? SKILLROUTER_GIT_SHA : "dev";
