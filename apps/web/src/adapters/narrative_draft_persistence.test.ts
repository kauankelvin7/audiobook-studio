import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentIrV2 } from "../schemas/ingestion";
import type { NarrativeScript } from "../schemas/narrative";
import type { CanonicalText } from "./canonical_native";
import type { LocalProjectPersistence } from "./local_project_persistence";
import { buildScriptQa } from "./rust_script_pipeline";
import { loadNarrativeDraft, saveNarrativeDraft } from "./narrative_draft_persistence";

vi.mock("./rust_script_pipeline", () => ({ buildScriptQa: vi.fn() }));
vi.mock("./canonical_native", () => ({ canonicalArtifactKey: (value: CanonicalText) => "canonical_native_" + value.promotion.reviewHash.slice(7) }));
const digest = (letter: string) => "sha256:" + letter.repeat(64);
const script: NarrativeScript = { schemaVersion: 1, documentId: "document", planId: "plan",
  sections: [{ id: "section", segments: [{ id: "segment", sourceRefs: ["region"], displayText: "Texto", speechText: "Texto" }] }] };
const source = { documentId: "document", sourceHash: digest("a") } as DocumentIrV2;
const canonical = { promotion: { reviewHash: digest("b"), canonicalDocumentHash: digest("c") },
  draft: { script, plan: {}, contentModel: {}, semanticOutline: {} } } as CanonicalText;

function setup() {
  const blobs = new Map<string, Blob>();
  const latest = { projectId: "document", sourceHash: source.sourceHash, artifactKeys: ["canonical_native_" + "b".repeat(64)],
    checksum: "checksum", pipelineVersion: "1", job: {} };
  const fake = {
    loadLatest: vi.fn(async () => latest),
    loadArtifactRecord: vi.fn(async (_project: string, key: string) => blobs.has(key)
      ? { artifactKey: key, kind: "model", mediaType: "application/json", sizeBytes: blobs.get(key)!.size } : null),
    readArtifact: vi.fn(async (record: { artifactKey: string }) => blobs.get(record.artifactKey)!),
    persistNext: vi.fn(async (next: { artifactKeys: string[] }, artifacts: { artifactKey: string; value: Blob }[]) => {
      latest.artifactKeys = next.artifactKeys;
      for (const artifact of artifacts) blobs.set(artifact.artifactKey, artifact.value);
    }),
  };
  return { persistence: fake as unknown as LocalProjectPersistence, fake, blobs, latest };
}
beforeEach(() => { vi.mocked(buildScriptQa).mockReset(); vi.mocked(buildScriptQa).mockResolvedValue({ status: "review" } as never); });

describe("narrative candidate persistence", () => {
  it("saves and reloads a candidate with core validation and canonical binding", async () => {
    const { persistence, fake, latest } = setup();
    await saveNarrativeDraft(persistence, source, canonical, script);
    expect(latest.artifactKeys.at(-1)).toMatch(/^narrative_draft_[0-9a-f]{64}$/);
    expect(await loadNarrativeDraft(persistence, source, canonical)).toEqual(script);
    expect(buildScriptQa).toHaveBeenCalledTimes(2);
    expect(fake.persistNext.mock.calls[0][1][0]).toMatchObject({ kind: "model", pinned: true, finalArtifact: false });
  });
  it("does not return a draft from a different approval", async () => {
    const { persistence, latest } = setup();
    await saveNarrativeDraft(persistence, source, canonical, script);
    const changed = structuredClone(canonical);
    changed.promotion.reviewHash = digest("d");
    latest.artifactKeys.push("canonical_native_" + "d".repeat(64));
    expect(await loadNarrativeDraft(persistence, source, changed)).toBeNull();
    await expect(saveNarrativeDraft(persistence, source, canonical, script)).rejects.toThrow("mudou");
  });
  it("rejects corrupted bytes", async () => {
    const { persistence, latest, blobs } = setup();
    await saveNarrativeDraft(persistence, source, canonical, script);
    blobs.set(latest.artifactKeys.at(-1)!, new Blob(["{}"]));
    await expect(loadNarrativeDraft(persistence, source, canonical)).rejects.toThrow("integridade");
  });
  it("rejects core validation errors before persisting", async () => {
    const { persistence, fake } = setup();
    vi.mocked(buildScriptQa).mockRejectedValueOnce(new Error("invalid source reference"));
    await expect(saveNarrativeDraft(persistence, source, canonical, script)).rejects.toThrow("invalid source");
    expect(fake.persistNext).not.toHaveBeenCalled();
  });
  it("retains a valid candidate with QA findings without granting approval", async () => {
    const { persistence, latest } = setup();
    vi.mocked(buildScriptQa).mockResolvedValue({ status: "fail" } as never);
    await saveNarrativeDraft(persistence, source, canonical, script);
    expect(await loadNarrativeDraft(persistence, source, canonical)).toEqual(script);
    expect(latest.artifactKeys.some(key => key.startsWith("approved_narrative_"))).toBe(false);
  });
  it("restores the most recently saved text even if that draft already exists", async () => {
    const { persistence } = setup();
    await saveNarrativeDraft(persistence, source, canonical, script);
    const edited = structuredClone(script); edited.sections[0].segments[0].speechText = "Outro texto";
    await saveNarrativeDraft(persistence, source, canonical, edited);
    await saveNarrativeDraft(persistence, source, canonical, script);
    expect(await loadNarrativeDraft(persistence, source, canonical)).toEqual(script);
  });
});
