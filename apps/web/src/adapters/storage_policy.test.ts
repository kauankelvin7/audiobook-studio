import { describe, expect, it } from "vitest";
import { evictionCandidates, type StoredArtifact } from "./storage_policy";

const base: StoredArtifact = { id: "cache", sizeBytes: 100, lastAccessedAt: 1, regenerable: true, pinned: false, currentProject: false, finalArtifact: false };

describe("storage eviction policy", () => {
  it("evicts oldest regenerable artifacts until target is met", () => {
    const artifacts = [{ ...base, id: "old", sizeBytes: 60 }, { ...base, id: "new", sizeBytes: 60, lastAccessedAt: 2 }];
    expect(evictionCandidates(artifacts, 100).map(item => item.id)).toEqual(["old", "new"]);
  });

  it("never proposes current, pinned, final or non-regenerable artifacts", () => {
    const protectedArtifacts = [
      { ...base, id: "current", currentProject: true }, { ...base, id: "pinned", pinned: true },
      { ...base, id: "final", finalArtifact: true }, { ...base, id: "source", regenerable: false },
    ];
    expect(evictionCandidates(protectedArtifacts, 1)).toEqual([]);
  });

  it("returns no partial plan when safe artifacts cannot free enough space", () => {
    expect(evictionCandidates([{ ...base, sizeBytes: 50 }], 100)).toEqual([]);
  });

  it("rejects invalid artifact accounting", () => {
    expect(() => evictionCandidates([{ ...base, sizeBytes: -1 }], 1)).toThrow("INVALID_STORED_ARTIFACT");
    expect(() => evictionCandidates([{ ...base, lastAccessedAt: Number.NaN }], 1)).toThrow("INVALID_STORED_ARTIFACT");
  });
});
