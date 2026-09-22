export type StoredArtifact = {
  id: string;
  sizeBytes: number;
  lastAccessedAt: number;
  regenerable: boolean;
  pinned: boolean;
  currentProject: boolean;
  finalArtifact: boolean;
};

export function evictionCandidates(artifacts: StoredArtifact[], bytesNeeded: number): StoredArtifact[] {
  if (!Number.isSafeInteger(bytesNeeded) || bytesNeeded <= 0) return [];
  for (const artifact of artifacts) {
    if (!artifact.id.trim() || !Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0 || !Number.isFinite(artifact.lastAccessedAt) || artifact.lastAccessedAt < 0) {
      throw new RangeError("INVALID_STORED_ARTIFACT");
    }
  }
  const candidates = artifacts
    .filter(artifact => artifact.regenerable && !artifact.pinned && !artifact.currentProject && !artifact.finalArtifact)
    .sort((left, right) => left.lastAccessedAt - right.lastAccessedAt || left.id.localeCompare(right.id));
  const selected: StoredArtifact[] = [];
  let freed = 0;
  for (const artifact of candidates) {
    if (freed >= bytesNeeded) break;
    selected.push(artifact);
    freed += artifact.sizeBytes;
  }
  return freed >= bytesNeeded ? selected : [];
}
