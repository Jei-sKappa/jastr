import { describe, expect, it } from "vitest";
import configExport from "../../docs/site/.vitepress/config";

type ResolvedConfig = {
  markdown?: {
    config?: (md: unknown) => void | Promise<void>;
  };
};

describe("VitePress config", () => {
  it("marks inline code as v-pre so docs can show {{placeholders}} literally", async () => {
    const config = configExport as ResolvedConfig;
    const md = {
      renderer: {
        rules: {} as Record<
          string,
          (tokens: { content: string }[], index: number) => string
        >,
      },
      block: {
        ruler: {
          before() {},
        },
      },
      use(plugin: (md: unknown) => void) {
        plugin(this);
        return this;
      },
    };

    await config.markdown?.config?.(md);

    expect(
      md.renderer.rules.code_inline?.([{ content: "{{target-file}}" }], 0),
    ).toBe("<code v-pre>{{target-file}}</code>");
  });
});
