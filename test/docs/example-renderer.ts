import { readFileSync } from "node:fs";
import path from "node:path";
import { expandPlaceholders, type LoadedExample } from "./example-manifest";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function shellArg(value: string): string {
  if (/^[A-Za-z0-9_./:=@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function commandText(example: LoadedExample): string {
  return `skillrouter ${example.manifest.command.map(shellArg).join(" ")}`;
}

function readText(example: LoadedExample, relativePath: string): string {
  return readFileSync(path.join(example.dirPath, relativePath), "utf8");
}

function expectedStdout(example: LoadedExample): string {
  if (example.manifest.expect.stdout !== undefined) {
    return example.manifest.expect.stdout;
  }
  if (example.manifest.expect.stdoutFile !== undefined) {
    return readText(example, example.manifest.expect.stdoutFile);
  }
  return "";
}

function expectedStderr(example: LoadedExample): string {
  if (example.manifest.expect.stderr !== undefined) {
    return example.manifest.expect.stderr;
  }
  if (example.manifest.expect.stderrFile !== undefined) {
    return readText(example, example.manifest.expect.stderrFile);
  }
  return "";
}

function displayText(value: string): string {
  return expandPlaceholders(value, {
    projectRoot: "<project>",
    cwd: "<cwd>",
  });
}

function codeBlock(label: string, language: string, value: string): string {
  return [
    `<section class="example-block">`,
    `<p class="example-label">${escapeHtml(label)}</p>`,
    `<pre v-pre><code class="language-${escapeHtml(language)}">${escapeHtml(value)}</code></pre>`,
    `</section>`,
  ].join("\n");
}

export function renderExampleHtml(example: LoadedExample): string {
  const parts: string[] = [
    `<section class="skillrouter-example" data-example-id="${escapeHtml(example.manifest.id)}">`,
    `<h3>${escapeHtml(example.manifest.title)}</h3>`,
    `<p>${escapeHtml(example.manifest.description)}</p>`,
  ];

  for (const item of example.manifest.render.show) {
    if (item.kind === "file") {
      parts.push(
        codeBlock(
          item.label ?? item.path,
          item.language ?? "md",
          readText(example, item.path),
        ),
      );
    }
    if (item.kind === "command") {
      parts.push(
        codeBlock(
          item.label ?? "Command",
          item.language ?? "bash",
          commandText(example),
        ),
      );
    }
    if (item.kind === "stdout") {
      parts.push(
        codeBlock(
          item.label ?? "Stdout",
          item.language ?? "txt",
          displayText(expectedStdout(example)),
        ),
      );
    }
    if (item.kind === "stderr") {
      parts.push(
        codeBlock(
          item.label ?? "Stderr",
          item.language ?? "txt",
          displayText(expectedStderr(example)),
        ),
      );
    }
    if (item.kind === "generated-file") {
      const expectedPath = example.manifest.expect.files?.[item.path];
      if (expectedPath === undefined) {
        throw new Error(
          `${example.filePath}: render item references generated file ${item.path}, but expect.files does not define it.`,
        );
      }
      parts.push(
        codeBlock(
          item.label ?? item.path,
          item.language ?? "md",
          displayText(readText(example, expectedPath)),
        ),
      );
    }
  }

  parts.push("</section>");
  return parts.join("\n");
}
