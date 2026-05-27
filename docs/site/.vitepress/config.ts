import path from "node:path";
import { defineConfig } from "vitepress";
import { createExampleMarkdownPlugin } from "../../../test/docs/example-markdown-plugin";

const repoRoot = path.resolve(__dirname, "../../..");

export default defineConfig(async () => {
  const examplePlugin = await createExampleMarkdownPlugin(repoRoot);

  return {
    title: "Skillrouter",
    description: "Deterministic AI-agent skill specialization",
    markdown: {
      config(md) {
        md.use(examplePlugin);
      },
    },
    themeConfig: {
      search: {
        provider: "local",
      },
      nav: [
        { text: "Guide", link: "/guide/getting-started" },
        { text: "Reference", link: "/reference/cli" },
        { text: "Examples", link: "/examples/complete-language-router" },
      ],
      sidebar: [
        {
          text: "Guide",
          items: [
            { text: "Getting Started", link: "/guide/getting-started" },
            { text: "Authoring Templates", link: "/guide/authoring-templates" },
            { text: "Running Skills", link: "/guide/running-skills" },
            {
              text: "Generating Router Skills",
              link: "/guide/generating-router-skills",
            },
            { text: "Inputs and Flags", link: "/guide/inputs-and-flags" },
            { text: "Conditionals", link: "/guide/conditionals" },
            { text: "Includes", link: "/guide/includes" },
            { text: "Errors", link: "/guide/errors" },
          ],
        },
        {
          text: "Reference",
          items: [
            { text: "CLI", link: "/reference/cli" },
            { text: "Template Syntax", link: "/reference/template-syntax" },
            { text: "Frontmatter Schema", link: "/reference/frontmatter-schema" },
          ],
        },
        {
          text: "Examples",
          items: [
            {
              text: "Complete Language Router",
              link: "/examples/complete-language-router",
            },
          ],
        },
      ],
    },
  };
});
