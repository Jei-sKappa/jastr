import path from "node:path";
import type { LoadedTemplateReference } from "./template-ref";

// Render a resolved-root path for user-facing output. A globally-resolved
// template (and its included files) shows as an absolute realpath so it is
// unambiguous regardless of cwd; a locally-resolved or direct-mode template
// stays cwd-relative. Only named templates carry resolvedRootKind, so direct
// templates fall through to the cwd-relative default.
export function displayPath(
  template: LoadedTemplateReference,
  absolutePath: string,
): string {
  if (template.mode === "named" && template.resolvedRootKind === "global") {
    return absolutePath;
  }
  return path.relative(template.cwd, absolutePath);
}
