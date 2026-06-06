import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // Resolve the workspace engine package to its source during tests so the
      // suite runs against current source without requiring a prior build.
      // (Mirrors the tsconfig `paths` mapping; vite does not read tsconfig paths.)
      "@jastr/engine": path.resolve(root, "packages/engine/src/index.ts"),
    },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
  },
});
