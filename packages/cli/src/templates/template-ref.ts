import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import { findProjectRoot } from "../fs/project-root";

const TEMPLATE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export type LoadedTemplateReference = {
  mode: "named" | "direct";
  templateRef: string;
  templatePath: string;
  includeRoot: string;
  includeRootLabel: "project root" | "template directory";
  source: string;
};

export async function loadTemplateReference(options: {
  cwd: string;
  templateRef: string;
}): Promise<LoadedTemplateReference> {
  const { cwd, templateRef } = options;

  if (templateRef.endsWith(".md")) {
    const templatePath = path.resolve(cwd, templateRef);
    return {
      mode: "direct",
      templateRef,
      templatePath,
      includeRoot: path.dirname(templatePath),
      includeRootLabel: "template directory",
      source: await readFile(templatePath, "utf8"),
    };
  }

  if (!TEMPLATE_ID_PATTERN.test(templateRef)) {
    throw new JastrError(
      "invalid_template_reference",
      `Template reference ${templateRef} must be a template id or a .md file path.`,
      { templateRef },
    );
  }

  const projectRoot = await findProjectRoot(cwd);
  const templatePath = path.join(
    projectRoot,
    ".jastr",
    templateRef,
    "template.md",
  );

  try {
    await access(templatePath);
  } catch {
    throw new JastrError(
      "template_not_found",
      `Template ${templateRef} was not found at .jastr/${templateRef}/template.md.`,
      { templateRef },
    );
  }

  return {
    mode: "named",
    templateRef,
    templatePath,
    includeRoot: projectRoot,
    includeRootLabel: "project root",
    source: await readFile(templatePath, "utf8"),
  };
}
