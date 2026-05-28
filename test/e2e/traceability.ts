import type { CaseManifest } from "./case-manifest";
import { acceptanceRef, type Requirement } from "./requirements";

function splitRef(ref: string): {
  requirementId: string;
  acceptanceId: string;
} {
  const [requirementId, acceptanceId] = ref.split(".");
  if (requirementId === undefined || acceptanceId === undefined) {
    throw new Error(`invalid acceptance criterion ref ${ref}`);
  }
  return { requirementId, acceptanceId };
}

export function validateTraceability(
  requirements: Requirement[],
  cases: CaseManifest[],
): void {
  const requirementsById = new Map(requirements.map((item) => [item.id, item]));
  const acceptanceByRef = new Map<
    string,
    { requirement: Requirement; removed: boolean }
  >();

  for (const requirement of requirements) {
    for (const ac of requirement.acceptance) {
      acceptanceByRef.set(acceptanceRef(requirement.id, ac.id), {
        requirement,
        removed: ac.status === "removed",
      });
    }
  }

  const covered = new Set<string>();
  for (const testCase of cases) {
    for (const ref of testCase.covers) {
      const { requirementId, acceptanceId } = splitRef(ref);
      const requirement = requirementsById.get(requirementId);
      if (requirement === undefined) {
        throw new Error(
          `${testCase.id}: covers missing requirement ${requirementId}`,
        );
      }
      if (requirement.status === "removed") {
        throw new Error(
          `${testCase.id}: covers removed requirement ${requirementId}`,
        );
      }
      const acceptance = acceptanceByRef.get(ref);
      if (acceptance === undefined) {
        throw new Error(
          `${testCase.id}: covers missing acceptance criterion ${ref}`,
        );
      }
      if (acceptance.removed) {
        throw new Error(
          `${testCase.id}: covers removed acceptance criterion ${ref}`,
        );
      }
      if (acceptanceId.length === 0) {
        throw new Error(
          `${testCase.id}: covers invalid acceptance criterion ref ${ref}`,
        );
      }
      covered.add(ref);
    }
  }

  for (const requirement of requirements) {
    if (requirement.status !== "active") continue;
    for (const ac of requirement.acceptance) {
      if (ac.status === "removed") continue;
      const ref = acceptanceRef(requirement.id, ac.id);
      if (!covered.has(ref)) {
        throw new Error(`uncovered acceptance criterion ${ref}`);
      }
    }
  }
}
