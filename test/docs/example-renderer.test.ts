import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { LoadedExample } from "./example-manifest";
import { renderExampleHtml } from "./example-renderer";

describe("renderExampleHtml", () => {
  it("marks code blocks as v-pre so Skillrouter placeholders render literally", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "skillrouter-docs-"));
    try {
      const dirPath = path.join(root, "docs/examples/include-raw");
      await mkdir(dirPath, { recursive: true });

      const example: LoadedExample = {
        dirPath,
        filePath: "docs/examples/include-raw/example.yml",
        manifest: {
          id: "include-raw",
          title: "Include raw content",
          description: "Shows raw include output.",
          cwd: "project",
          command: ["run", "demo"],
          expect: {
            exitCode: 0,
            stdout: "Raw {{language}}\n",
            stderr: "",
          },
          render: {
            show: [{ kind: "stdout" }],
          },
        },
      };

      expect(renderExampleHtml(example)).toContain(
        '<pre v-pre><code class="language-txt">Raw {{language}}\n</code></pre>',
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
