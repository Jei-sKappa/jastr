import packageJson from "../package.json" with { type: "json" };

export const JASTR_VERSION = packageJson.version;

export const JASTR_GIT_SHA_OR_DEV =
  typeof JASTR_GIT_SHA === "string" ? JASTR_GIT_SHA : "dev";
