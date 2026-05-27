import type { LoadedExample } from "./example-manifest";

export async function runExample(
  _repoRoot: string,
  _example: LoadedExample,
): Promise<void> {
  throw new Error("runExample is not implemented");
}
