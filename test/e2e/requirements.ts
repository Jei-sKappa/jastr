import { readFile } from "node:fs/promises";
import YAML from "yaml";

const REQUIREMENT_ID_PATTERN = /^[A-Z]+-FR-\d{4}$/;
const ACCEPTANCE_ID_PATTERN = /^AC-\d{4}$/;
const REQUIREMENT_STATUSES = new Set(["active", "deferred", "removed"]);
const ACCEPTANCE_STATUSES = new Set(["removed"]);
const REQUIREMENT_FIELDS = new Set([
  "id",
  "title",
  "status",
  "description",
  "acceptance",
  "notes",
  "replacedBy",
  "removedReason",
  "coverage",
]);
const ACCEPTANCE_FIELDS = new Set([
  "id",
  "statement",
  "status",
  "removedReason",
]);

export type AcceptanceCriterion = {
  id: string;
  statement: string;
  status?: "removed";
  removedReason?: string;
};

export type Requirement = {
  id: string;
  title: string;
  status: "active" | "deferred" | "removed";
  description: string;
  acceptance: AcceptanceCriterion[];
  notes?: string;
  replacedBy?: string;
  removedReason?: string;
  coverage?: string;
};

export type RawRequirement = Requirement;

type Source = {
  filePath: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(source: Source, detail: string): never {
  throw new Error(`${source.filePath}: ${detail}`);
}

function rejectUnknownFields(
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
  source: Source,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(source, `unknown ${label} field ${key}`);
  }
}

function requireString(
  value: unknown,
  field: string,
  source: Source,
): string {
  if (typeof value !== "string" || value.length === 0) {
    fail(source, `${field} must be a non-empty string.`);
  }
  return value;
}

function optionalString(
  value: unknown,
  field: string,
  source: Source,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0) {
    fail(source, `${field} must be a non-empty string.`);
  }
  return value;
}

function validateAcceptance(
  value: unknown,
  requirementId: string,
  index: number,
  source: Source,
): AcceptanceCriterion {
  if (!isRecord(value)) {
    fail(source, `${requirementId}.acceptance[${index}] must be a mapping.`);
  }
  rejectUnknownFields(value, ACCEPTANCE_FIELDS, "acceptance", source);
  const id = requireString(
    value.id,
    `${requirementId}.acceptance[${index}].id`,
    source,
  );
  if (!ACCEPTANCE_ID_PATTERN.test(id)) {
    fail(source, `invalid acceptance criterion id ${requirementId}.${id}`);
  }
  const statement = requireString(
    value.statement,
    `${requirementId}.${id}.statement`,
    source,
  );
  const status = optionalString(value.status, `${requirementId}.${id}.status`, source);
  if (status !== undefined && !ACCEPTANCE_STATUSES.has(status)) {
    fail(source, `invalid acceptance criterion status ${requirementId}.${id}: ${status}`);
  }
  const removedReason = optionalString(
    value.removedReason,
    `${requirementId}.${id}.removedReason`,
    source,
  );
  if (status === "removed" && removedReason === undefined) {
    fail(source, `${requirementId}.${id} removed acceptance criterion requires removedReason.`);
  }
  return {
    id,
    statement,
    ...(status === undefined ? {} : { status: status as "removed" }),
    ...(removedReason === undefined ? {} : { removedReason }),
  };
}

export function validateRequirements(
  value: unknown,
  source: Source,
): Requirement[] {
  if (!Array.isArray(value)) fail(source, "requirements file must be a list.");

  const seenRequirements = new Set<string>();
  return value.map((raw, index) => {
    if (!isRecord(raw)) fail(source, `requirements[${index}] must be a mapping.`);
    rejectUnknownFields(raw, REQUIREMENT_FIELDS, "requirement", source);
    const id = requireString(raw.id, `requirements[${index}].id`, source);
    if (!REQUIREMENT_ID_PATTERN.test(id)) fail(source, `invalid requirement id ${id}`);
    if (seenRequirements.has(id)) fail(source, `duplicate requirement id ${id}`);
    seenRequirements.add(id);

    const title = requireString(raw.title, `${id}.title`, source);
    const status = requireString(raw.status, `${id}.status`, source);
    if (!REQUIREMENT_STATUSES.has(status)) {
      fail(source, `invalid requirement status ${id}: ${status}`);
    }
    const description = requireString(raw.description, `${id}.description`, source);
    if (!Array.isArray(raw.acceptance) || raw.acceptance.length === 0) {
      fail(source, `${id}.acceptance must be a non-empty list.`);
    }

    const seenAcceptance = new Set<string>();
    const acceptance = raw.acceptance.map((item, acceptanceIndex) => {
      const criterion = validateAcceptance(item, id, acceptanceIndex, source);
      if (seenAcceptance.has(criterion.id)) {
        fail(source, `duplicate acceptance criterion id ${id}.${criterion.id}`);
      }
      seenAcceptance.add(criterion.id);
      return criterion;
    });

    const removedReason = optionalString(raw.removedReason, `${id}.removedReason`, source);
    const coverage = optionalString(raw.coverage, `${id}.coverage`, source);
    if (status === "removed" && removedReason === undefined) {
      fail(source, `${id} removed requirement requires removedReason.`);
    }
    if (status === "deferred" && coverage === undefined) {
      fail(source, `${id} deferred requirement requires coverage.`);
    }

    return {
      id,
      title,
      status: status as Requirement["status"],
      description,
      acceptance,
      ...(optionalString(raw.notes, `${id}.notes`, source) === undefined
        ? {}
        : { notes: optionalString(raw.notes, `${id}.notes`, source) }),
      ...(optionalString(raw.replacedBy, `${id}.replacedBy`, source) === undefined
        ? {}
        : { replacedBy: optionalString(raw.replacedBy, `${id}.replacedBy`, source) }),
      ...(removedReason === undefined ? {} : { removedReason }),
      ...(coverage === undefined ? {} : { coverage }),
    };
  });
}

export async function loadRequirements(root: string): Promise<Requirement[]> {
  const filePath = "requirements/functional-requirements.yml";
  const source = await readFile(`${root}/${filePath}`, "utf8");
  return validateRequirements(YAML.parse(source), { filePath });
}

export function acceptanceRef(requirementId: string, acId: string): string {
  return `${requirementId}.${acId}`;
}
