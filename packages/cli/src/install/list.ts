import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { loadProjectConfigVariantIds } from "../config";
import { resolveListRoots } from "../fs/project-root";
import { classifyUnitDir } from "../templates/template-ref";
import { type LockEntry, readLock } from "./lock";
import { listGroupTemplateIds } from "./unit";

export type ExecuteListOptions = {
  /** `true` for `--local`: restrict the inventory to the local root. */
  local: boolean;
  /** `true` for `--global`: restrict the inventory to the global root. */
  global: boolean;
  /** `true` for `--variants`: render config-defined variants under each row. */
  variants: boolean;
  /** The directory the command runs from (for local-root discovery). */
  cwd: string;
};

/** The classification of one rendered row, joining the on-disk unit with the
 * root's lock overlay. */
type RowStatus = "tracked" | "local" | "missing";

type ListRow = {
  id: string;
  status: RowStatus;
  /** The unit's kind (from disk classification, or the lock entry for a missing
   * unit). */
  kind: "standalone" | "group";
  /** The recorded `source@ref` for a tracked or missing row; absent for a local
   * (authored, unlocked) unit. */
  sourceRef?: string;
  /** The short commit for a tracked or missing row, when the lock recorded one. */
  shortCommit?: string;
  /** A group row's member template ids (sorted), rendered as a tree under the
   * row. Absent for standalone rows and for a `missing` group (its dir is gone). */
  members?: string[];
  /** A standalone row's sorted config-defined variant ids. Populated only under
   * `--variants`. */
  variants?: string[];
  /** A group row's member id → sorted variant ids (only members with ≥1
   * variant). Populated only under `--variants`. */
  memberVariants?: Map<string, string[]>;
};

type RootInventory = {
  label: "Local" | "Global";
  rows: ListRow[];
};

/** Length of the short commit rendered in a row (full SHAs are 40 chars). */
const SHORT_COMMIT_LENGTH = 12;

/**
 * Render the install inventory across one or both roots. `list` is folder-first
 * with a lock overlay: for each in-scope root that exists it enumerates the
 * actual unit directories under `.jastr/` (skipping non-directories and the
 * `config.yml` / `lock.json` files so they never read as a unit) and joins each
 * against that root's lock — a unit with a lock entry is `tracked`, a unit with
 * no entry is `local` (authored), and a lock entry whose unit dir is gone is
 * `missing` (drift). Roots render as labeled sections, each shown only if it has
 * rows, with entries sorted by id. An empty in-scope inventory prints the
 * `No templates installed.` line. The command mutates nothing and exits 0.
 */
export async function executeList(opts: ExecuteListOptions): Promise<string> {
  const scope: "local" | "global" | "both" = opts.local
    ? "local"
    : opts.global
      ? "global"
      : "both";
  const roots = await resolveListRoots(opts.cwd, scope);

  const inventories: RootInventory[] = [];
  for (const root of roots) {
    const rows = await inventoryRoot(root.projectRoot, opts.variants);
    if (rows.length > 0) {
      inventories.push({
        label: root.kind === "global" ? "Global" : "Local",
        rows,
      });
    }
  }

  if (inventories.length === 0) {
    return "No templates installed.\n";
  }

  const sections = inventories.map((inventory) => {
    const lines = [`${inventory.label}:`];
    for (const row of inventory.rows) {
      lines.push(`  ${formatRow(row)}`);
      lines.push(...formatStandaloneVariants(row));
      lines.push(...formatMemberTree(row));
    }
    return lines.join("\n");
  });
  return `${sections.join("\n\n")}\n`;
}

/**
 * Build the joined inventory for a single root: enumerate the on-disk unit
 * directories under `<root>/.jastr/`, read the root's lock, and produce one row
 * per disk unit (tracked or local) plus one row per lock entry whose unit dir is
 * gone (missing). Rows are sorted by id.
 */
async function inventoryRoot(
  projectRoot: string,
  includeVariants: boolean,
): Promise<ListRow[]> {
  const jastrDir = path.join(projectRoot, ".jastr");
  const unitKinds = await enumerateUnits(jastrDir);
  const lock = await readLock(projectRoot);

  const rows: ListRow[] = [];

  for (const [id, kind] of unitKinds) {
    const entry = lock.templates[id];
    const row: ListRow =
      entry !== undefined
        ? trackedRow(id, kind, entry)
        : { id, status: "local", kind };
    if (kind === "group") {
      row.members = await listGroupTemplateIds(path.join(jastrDir, id));
    }
    rows.push(row);
  }

  for (const [id, entry] of Object.entries(lock.templates)) {
    if (!unitKinds.has(id) && entry !== undefined) {
      rows.push(missingRow(id, entry));
    }
  }

  rows.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (includeVariants) await attachVariants(projectRoot, rows);
  return rows;
}

/**
 * Under `--variants`, read this root's own `config.yml` and attach each present,
 * runnable row's config-defined variant ids. The ref set is built strictly from
 * present runnable rows — a standalone row's id, and each on-disk member of a
 * group row — so the config reader is only ever asked about refs that have a row.
 * A root with no present runnable rows builds an empty ref set and returns before
 * any config read, so its `config.yml` is never parsed.
 */
async function attachVariants(
  projectRoot: string,
  rows: ListRow[],
): Promise<void> {
  const refs: string[] = [];
  for (const row of rows) {
    if (row.status === "missing") continue;
    if (row.kind === "standalone") {
      refs.push(row.id);
    } else {
      for (const member of row.members ?? []) {
        refs.push(`${row.id}/${member}`);
      }
    }
  }
  if (refs.length === 0) return;

  const variantIds = await loadProjectConfigVariantIds({ projectRoot, refs });

  for (const row of rows) {
    if (row.status === "missing") continue;
    if (row.kind === "standalone") {
      const ids = variantIds.get(row.id);
      if (ids !== undefined && ids.length > 0) {
        row.variants = ids;
      }
    } else {
      const memberVariants = new Map<string, string[]>();
      for (const member of row.members ?? []) {
        const ids = variantIds.get(`${row.id}/${member}`);
        if (ids !== undefined && ids.length > 0) {
          memberVariants.set(member, ids);
        }
      }
      if (memberVariants.size > 0) {
        row.memberVariants = memberVariants;
      }
    }
  }
}

/**
 * Enumerate the unit directories under a root's `.jastr/`: each direct
 * subdirectory that classifies as a standalone template or a group. Files
 * (notably `config.yml` and `lock.json`) and any directory that classifies as
 * neither are skipped, so a root-level file never appears as a unit. A missing
 * `.jastr/` yields an empty inventory.
 */
async function enumerateUnits(
  jastrDir: string,
): Promise<Map<string, "standalone" | "group">> {
  const units = new Map<string, "standalone" | "group">();

  let entries: Dirent[];
  try {
    entries = await readdir(jastrDir, { withFileTypes: true });
  } catch {
    return units;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const kind = await classifyUnitDir(path.join(jastrDir, entry.name));
    if (kind !== undefined) {
      units.set(entry.name, kind);
    }
  }

  return units;
}

/** A tracked row: the disk unit carries a lock entry. */
function trackedRow(
  id: string,
  kind: "standalone" | "group",
  entry: LockEntry,
): ListRow {
  const row: ListRow = {
    id,
    status: "tracked",
    kind,
    sourceRef: sourceRef(entry),
  };
  const short = shortCommit(entry);
  if (short !== undefined) {
    row.shortCommit = short;
  }
  return row;
}

/** A missing row: a lock entry whose unit directory is gone (drift). */
function missingRow(id: string, entry: LockEntry): ListRow {
  const row: ListRow = {
    id,
    status: "missing",
    kind: entry.kind,
    sourceRef: sourceRef(entry),
  };
  const short = shortCommit(entry);
  if (short !== undefined) {
    row.shortCommit = short;
  }
  return row;
}

/** The recorded provenance as `source@ref`, or just `source` when no `ref`. */
function sourceRef(entry: LockEntry): string {
  return entry.ref !== undefined
    ? `${entry.source}@${entry.ref}`
    : entry.source;
}

/** The lock's recorded commit truncated to the short length, or `undefined`. */
function shortCommit(entry: LockEntry): string | undefined {
  if (entry.commit === undefined) {
    return undefined;
  }
  return entry.commit.slice(0, SHORT_COMMIT_LENGTH);
}

/**
 * Render one inventory row deterministically. A tracked/missing row carries the
 * id, its kind, the `source@ref` provenance, and the short commit when present; a
 * `missing` row is flagged `(missing)` and a `local` (authored, unlocked) row is
 * marked `(local)`.
 */
function formatRow(row: ListRow): string {
  const parts = [row.id, `(${row.kind})`];
  if (row.status === "local") {
    parts.push("(local)");
    return parts.join(" ");
  }
  if (row.sourceRef !== undefined) {
    parts.push(row.sourceRef);
  }
  if (row.shortCommit !== undefined) {
    parts.push(`@ ${row.shortCommit}`);
  }
  if (row.status === "missing") {
    parts.push("(missing)");
  }
  return parts.join(" ");
}

/**
 * Render a standalone row's config-defined variants as a tree hanging off the
 * row: each variant on its own line at the row's 2-space indent, prefixed with
 * the box-drawing connector (`├── ` for every variant but the last, `└── ` for
 * the last), followed by the runnable `<id>#<variant>` ref (payload at column 6).
 * A row with no variants contributes no lines.
 */
function formatStandaloneVariants(row: ListRow): string[] {
  const variants = row.variants;
  if (variants === undefined || variants.length === 0) {
    return [];
  }
  return variants.map((variantId, index) => {
    const connector = index === variants.length - 1 ? "└── " : "├── ";
    return `  ${connector}${row.id}#${variantId}`;
  });
}

/**
 * Render a group row's member templates as a tree hanging off the group row: each
 * member on its own line at the row's 2-space indent, prefixed with the
 * box-drawing connector (`├── ` for every member but the last, `└── ` for the
 * last), followed by the runnable `<group-id>/<member-id>` ref. Under `--variants`
 * each member's own config-defined variants nest one level deeper as
 * `<group-id>/<member-id>#<variant>` lines (payload at column 10), with the
 * `  │   ` continuation under a non-last member and a six-space continuation under
 * the last. The member lines carry no provenance (the lock tracks only the
 * group). A standalone row, or a group with no members, contributes no lines.
 */
function formatMemberTree(row: ListRow): string[] {
  const members = row.members;
  if (members === undefined || members.length === 0) {
    return [];
  }
  const lines: string[] = [];
  members.forEach((member, index) => {
    const isLastMember = index === members.length - 1;
    const memberConnector = isLastMember ? "└── " : "├── ";
    lines.push(`  ${memberConnector}${row.id}/${member}`);

    const variants = row.memberVariants?.get(member) ?? [];
    const continuation = isLastMember ? "      " : "  │   ";
    variants.forEach((variantId, variantIndex) => {
      const variantConnector =
        variantIndex === variants.length - 1 ? "└── " : "├── ";
      lines.push(
        `${continuation}${variantConnector}${row.id}/${member}#${variantId}`,
      );
    });
  });
  return lines;
}
