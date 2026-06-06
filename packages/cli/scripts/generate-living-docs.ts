import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadAreas,
  loadRenderCases,
  OUTPUT_PATH,
  renderDocument,
} from "./living-docs";

async function readIfExists(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const check = process.argv.slice(2).includes("--check");

  const [areas, cases] = await Promise.all([
    loadAreas(root),
    loadRenderCases(root),
  ]);
  const document = renderDocument(areas, cases);
  const absolutePath = path.join(root, OUTPUT_PATH);

  if (check) {
    const current = await readIfExists(absolutePath);
    if (current !== document) {
      throw new Error(
        `${OUTPUT_PATH} is out of date. Run \`bun run docs:living\` to regenerate.`,
      );
    }
    process.stdout.write(`${OUTPUT_PATH} is up to date.\n`);
    return;
  }

  await writeFile(absolutePath, document, "utf8");
  process.stdout.write(`Wrote ${OUTPUT_PATH}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Error: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
