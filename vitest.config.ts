import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Only run this project's own specs. Without an explicit include, vitest's
    // default `**/*.test.ts` glob also sweeps the vendored reference projects
    // under `.library/sources/`, which are not ours to run.
    include: ["test/**/*.test.ts"],
  },
});
