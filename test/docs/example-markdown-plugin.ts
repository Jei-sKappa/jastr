import type MarkdownIt from "markdown-it";
import { loadExamples } from "./example-manifest";
import { renderExampleHtml } from "./example-renderer";

export async function createExampleMarkdownPlugin(repoRoot: string) {
  const examples = await loadExamples(repoRoot);
  const byId = new Map(
    examples.map((example) => [example.manifest.id, example] as const),
  );

  return function exampleMarkdownPlugin(md: MarkdownIt): void {
    md.block.ruler.before(
      "html_block",
      "skillrouter_example",
      (state, startLine, _endLine, silent) => {
        const start = state.bMarks[startLine] + state.tShift[startLine];
        const max = state.eMarks[startLine];
        const line = state.src.slice(start, max).trim();
        const match = line.match(
          /^<Example\s+id="([a-z][a-z0-9]*(?:-[a-z0-9]+)*)"\s*\/>$/,
        );
        if (match === null) return false;
        if (silent) return true;

        const id = match[1];
        const example = id === undefined ? undefined : byId.get(id);
        if (example === undefined) {
          throw new Error(`Missing docs example ${id ?? "unknown"}`);
        }

        const token = state.push("html_block", "", 0);
        token.map = [startLine, startLine + 1];
        token.content = renderExampleHtml(example);
        state.line = startLine + 1;
        return true;
      },
    );
  };
}
