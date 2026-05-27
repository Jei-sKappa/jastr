export function validateExampleManifest(
  value: unknown,
  _options?: { filePath: string },
): unknown {
  return value;
}

export async function loadExamples(_root: string): Promise<unknown[]> {
  return [];
}

export async function findExampleReferences(_root: string): Promise<unknown[]> {
  return [];
}
