import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { JastrError } from "@jastr/engine";
import { afterEach, describe, expect, it } from "vitest";
import {
  validateStagedUnit,
  validateStagedUnitForInstall,
} from "../../src/install/validate-unit";

const temps: string[] = [];

async function makeStage(prefix: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}

/** Write a file, creating parent dirs as needed. */
async function writeAt(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
}

/** Capture the error code a rejected `validateStagedUnit` carries. */
async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(JastrError);
    return (error as JastrError).code;
  }
  throw new Error("expected validateStagedUnit to reject");
}

afterEach(async () => {
  await Promise.all(
    temps.splice(0).map((d) => rm(d, { recursive: true, force: true })),
  );
});

describe("validateStagedUnit (standalone)", () => {
  it("passes a clean standalone template", async () => {
    const stageDir = await makeStage("jastr-validate-ok-");
    await writeAt(
      path.join(stageDir, "TEMPLATE.md"),
      '---\nname: demo\ndescription: Demo\n---\n# Demo\n::include{path="frag.md"}\n',
    );
    await writeAt(path.join(stageDir, "frag.md"), "fragment\n");

    await expect(
      validateStagedUnit({ stageDir, kind: "standalone" }),
    ).resolves.toBeUndefined();
  });

  it("rejects bad frontmatter with invalid_frontmatter", async () => {
    const stageDir = await makeStage("jastr-validate-fm-");
    await writeAt(
      path.join(stageDir, "TEMPLATE.md"),
      "---\nname: demo\n  bad: : indentation\n---\nbody\n",
    );

    expect(
      await codeOf(validateStagedUnit({ stageDir, kind: "standalone" })),
    ).toBe("invalid_frontmatter");
  });

  it("rejects a missing include with include_not_found", async () => {
    const stageDir = await makeStage("jastr-validate-missing-");
    await writeAt(
      path.join(stageDir, "TEMPLATE.md"),
      '---\nname: demo\n---\n::include{path="absent.md"}\n',
    );

    expect(
      await codeOf(validateStagedUnit({ stageDir, kind: "standalone" })),
    ).toBe("include_not_found");
  });

  it("rejects an include cycle with include_cycle", async () => {
    const stageDir = await makeStage("jastr-validate-cycle-");
    await writeAt(
      path.join(stageDir, "TEMPLATE.md"),
      '---\nname: demo\n---\n::include{path="a.md"}\n',
    );
    await writeAt(path.join(stageDir, "a.md"), 'A\n::include{path="b.md"}\n');
    await writeAt(path.join(stageDir, "b.md"), 'B\n::include{path="a.md"}\n');

    expect(
      await codeOf(validateStagedUnit({ stageDir, kind: "standalone" })),
    ).toBe("include_cycle");
  });
});

describe("validateStagedUnit (group)", () => {
  /** Stage a group with the marker and two good templates. */
  async function makeGoodGroup(): Promise<string> {
    const stageDir = await makeStage("jastr-validate-group-");
    await writeAt(path.join(stageDir, ".jastrgroup"), "");
    await writeAt(
      path.join(stageDir, "templates", "one", "TEMPLATE.md"),
      "---\nname: one\n---\n# One\n",
    );
    await writeAt(
      path.join(stageDir, "templates", "two", "TEMPLATE.md"),
      '---\nname: two\n---\n# Two\n::include{root="group", path="shared/x.md"}\n',
    );
    await writeAt(path.join(stageDir, "shared", "x.md"), "shared\n");
    return stageDir;
  }

  it("passes a group whose templates are all valid", async () => {
    const stageDir = await makeGoodGroup();

    await expect(
      validateStagedUnit({ stageDir, kind: "group" }),
    ).resolves.toBeUndefined();
  });

  it("fails the whole group when any one template is broken", async () => {
    const stageDir = await makeGoodGroup();
    // Corrupt the second template with a missing include; one bad template must
    // abort the whole unit.
    await writeAt(
      path.join(stageDir, "templates", "two", "TEMPLATE.md"),
      '---\nname: two\n---\n::include{path="absent.md"}\n',
    );

    expect(await codeOf(validateStagedUnit({ stageDir, kind: "group" }))).toBe(
      "include_not_found",
    );
  });
});

describe("validateStagedUnitForInstall (operation context)", () => {
  /** Capture the rejected JastrError so its code and message can be asserted. */
  async function rejection(promise: Promise<unknown>): Promise<JastrError> {
    try {
      await promise;
    } catch (error) {
      expect(error).toBeInstanceOf(JastrError);
      return error as JastrError;
    }
    throw new Error("expected validateStagedUnitForInstall to reject");
  }

  it("resolves for a clean unit", async () => {
    const stageDir = await makeStage("jastr-ctx-ok-");
    await writeAt(
      path.join(stageDir, "TEMPLATE.md"),
      "---\nname: demo\n---\n# Demo\n",
    );

    await expect(
      validateStagedUnitForInstall({
        stageDir,
        kind: "standalone",
        operation: "add",
        id: "demo",
      }),
    ).resolves.toBeUndefined();
  });

  it("wraps a standalone defect with add context, preserving the engine code", async () => {
    const stageDir = await makeStage("jastr-ctx-add-");
    await writeAt(
      path.join(stageDir, "TEMPLATE.md"),
      '---\nname: demo\n---\n::include{path="absent.md"}\n',
    );

    const error = await rejection(
      validateStagedUnitForInstall({
        stageDir,
        kind: "standalone",
        operation: "add",
        id: "demo",
      }),
    );
    // Code is the engine's, unchanged (AC-ADD.17); only the message gains context.
    expect(error.code).toBe("include_not_found");
    expect(
      error.message.startsWith(
        "Unable to add `demo`: the template failed validation. ",
      ),
    ).toBe(true);
  });

  it("uses the update verb when the operation is update", async () => {
    const stageDir = await makeStage("jastr-ctx-update-");
    await writeAt(
      path.join(stageDir, "TEMPLATE.md"),
      '---\nname: demo\n---\n::include{path="absent.md"}\n',
    );

    const error = await rejection(
      validateStagedUnitForInstall({
        stageDir,
        kind: "standalone",
        operation: "update",
        id: "demo",
      }),
    );
    expect(
      error.message.startsWith(
        "Unable to update `demo`: the template failed validation. ",
      ),
    ).toBe(true);
  });

  it("names a group defect as a template in the group", async () => {
    const stageDir = await makeStage("jastr-ctx-group-");
    await writeAt(path.join(stageDir, ".jastrgroup"), "");
    await writeAt(
      path.join(stageDir, "templates", "one", "TEMPLATE.md"),
      '---\nname: one\n---\n::include{path="absent.md"}\n',
    );

    const error = await rejection(
      validateStagedUnitForInstall({
        stageDir,
        kind: "group",
        operation: "add",
        id: "grp",
      }),
    );
    expect(error.code).toBe("include_not_found");
    expect(
      error.message.startsWith(
        "Unable to add `grp`: a template in the group failed validation. ",
      ),
    ).toBe(true);
  });
});
