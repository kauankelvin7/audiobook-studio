import { z } from "zod";
import type { DocumentIrV2 } from "../schemas/ingestion";
import type { ReadingSession } from "./rust_reading_preview";
import { joinValidatedWavs, validateWav } from "./local_wav";
import { loadLatestApprovedNarrative, type ApprovedNarrativeRecord } from "./approved_narrative";
import type { LocalProjectPersistence } from "./local_project_persistence";

const hash = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const chunkKey = /^narrative_wav_[0-9a-f]{32}$/;
const finalKey = /^narrative_complete_[0-9a-f]{32}$/;
const chapterSchema = z.object({ pageNumber: z.number().int().positive(), audioKey: z.string().regex(chunkKey),
  startSeconds: z.number().nonnegative().finite(), durationSeconds: z.number().positive().finite() }).strict();
const chunkMetaSchema = z.object({ schemaVersion: z.literal(1), sourceHash: hash, canonicalDocumentHash: hash,
  scriptHash: hash, submissionHash: hash, chapterNumber: z.number().int().positive(),
  createdAtMs: z.number().int().nonnegative() }).strict();
const finalMetaSchema = z.object({ schemaVersion: z.literal(1), sourceHash: hash, documentHash: hash,
  scriptHash: hash, submissionHash: hash, voiceId: z.literal("pt_BR-faber-medium"),
  pipelineVersion: z.string().min(1), createdAtMs: z.number().int().nonnegative(),
  chapters: z.array(chapterSchema).min(1) }).strict();
export type CompleteNarrativeAudio = { blob: Blob; artifactKey: string; audioHash: string;
  sourceHash: string; documentHash: string; pipelineVersion: string;
  chapters: z.infer<typeof finalMetaSchema>["chapters"]; mode: "narrative"; scriptHash: string };

function chapterUnits(approved: ApprovedNarrativeRecord, chapterNumber: number) {
  const chapter = approved.approved.plan.spokenChapters[chapterNumber - 1];
  if (!chapter) throw new Error("Capítulo narrativo desconhecido.");
  const units = approved.approved.speechUnits.filter(unit => unit.chapterId === chapter.id);
  if (units.length === 0) throw new Error("O capítulo não contém fala aprovada.");
  return units;
}

export function narrativeReadingSession(source: DocumentIrV2, approved: ApprovedNarrativeRecord,
  chapterNumber: number): ReadingSession {
  const units = chapterUnits(approved, chapterNumber);
  return { documentId: source.documentId, sourceHash: source.sourceHash,
    startPage: chapterNumber, endPage: chapterNumber, pages: [{ documentId: source.documentId,
      sourceHash: source.sourceHash, pageNumber: chapterNumber,
      chunks: units.map(unit => ({ regionId: unit.id, text: unit.speechText })) }] };
}

async function confirmApproval(store: LocalProjectPersistence, source: DocumentIrV2,
  expected: ApprovedNarrativeRecord) {
  const current = await loadLatestApprovedNarrative(store, source);
  if (!current || JSON.stringify(current) !== JSON.stringify(expected))
    throw new Error("O roteiro aprovado mudou antes da geração de áudio.");
}

export async function saveNarrativeChapter(store: LocalProjectPersistence, source: DocumentIrV2,
  approved: ApprovedNarrativeRecord, chapterNumber: number, wav: Blob): Promise<string> {
  await validateWav(wav);
  chapterUnits(approved, chapterNumber);
  await confirmApproval(store, source, approved);
  const latest = await store.loadLatest(source.documentId);
  if (!latest || latest.sourceHash !== source.sourceHash) throw new Error("O projeto mudou durante a síntese.");
  const createdAtMs = Date.now();
  const key = `narrative_wav_${crypto.randomUUID().replaceAll("-", "")}`;
  const meta = chunkMetaSchema.parse({ schemaVersion: 1, sourceHash: source.sourceHash,
    canonicalDocumentHash: approved.approved.canonicalDocumentHash,
    scriptHash: approved.approved.approval.scriptHash,
    submissionHash: approved.approved.reviewReceipt.submissionHash,
    chapterNumber, createdAtMs });
  await store.persistNext({ schemaVersion: 1, projectId: latest.projectId, createdAtMs,
    pipelineVersion: latest.pipelineVersion, sourceHash: latest.sourceHash, job: latest.job,
    artifactKeys: [...new Set([...latest.artifactKeys, key, `${key}_meta`])],
  }, [
    { projectId: latest.projectId, artifactKey: key, kind: "audio_chunk", value: wav,
      mediaType: "audio/wav", createdAtMs, regenerable: false, pinned: true, finalArtifact: false, expiresAtMs: null },
    { projectId: latest.projectId, artifactKey: `${key}_meta`, kind: "audio_metadata",
      value: new Blob([JSON.stringify(meta)], { type: "application/json" }), mediaType: "application/json",
      createdAtMs, regenerable: false, pinned: true, finalArtifact: false, expiresAtMs: null },
  ], latest.checksum);
  return key;
}

export async function loadNarrativeChapter(store: LocalProjectPersistence, source: DocumentIrV2,
  approved: ApprovedNarrativeRecord, key: string, chapterNumber: number): Promise<Blob | null> {
  if (!chunkKey.test(key)) return null;
  const [record, metaRecord] = await Promise.all([
    store.loadArtifactRecord(source.documentId, key), store.loadArtifactRecord(source.documentId, `${key}_meta`)]);
  if (!record || !metaRecord || record.kind !== "audio_chunk" || record.mediaType !== "audio/wav"
    || metaRecord.kind !== "audio_metadata" || metaRecord.mediaType !== "application/json"
    || metaRecord.sizeBytes > 16_000) return null;
  const meta = chunkMetaSchema.safeParse(JSON.parse(await (await store.readArtifact(metaRecord)).text()));
  if (!meta.success || meta.data.sourceHash !== source.sourceHash
    || meta.data.canonicalDocumentHash !== approved.approved.canonicalDocumentHash
    || meta.data.scriptHash !== approved.approved.approval.scriptHash
    || meta.data.submissionHash !== approved.approved.reviewReceipt.submissionHash
    || meta.data.chapterNumber !== chapterNumber) return null;
  const wav = await store.readArtifact(record);
  await validateWav(wav);
  return wav;
}

export async function listNarrativeChapters(store: LocalProjectPersistence, source: DocumentIrV2,
  approved: ApprovedNarrativeRecord): Promise<Map<number, string>> {
  await confirmApproval(store, source, approved);
  const latest = await store.loadLatest(source.documentId);
  const found = new Map<number, string>();
  if (!latest) return found;
  for (const key of [...latest.artifactKeys].reverse()) {
    if (!chunkKey.test(key)) continue;
    const metaRecord = await store.loadArtifactRecord(source.documentId, `${key}_meta`);
    if (!metaRecord || metaRecord.kind !== "audio_metadata" || metaRecord.sizeBytes > 16_000) continue;
    let number = 0;
    try {
      const meta = chunkMetaSchema.safeParse(JSON.parse(await (await store.readArtifact(metaRecord)).text()));
      if (meta.success) number = meta.data.chapterNumber;
    } catch { continue; }
    if (number > 0 && number <= approved.approved.plan.spokenChapters.length
      && !found.has(number) && await loadNarrativeChapter(store, source, approved, key, number)) found.set(number, key);
  }
  return found;
}

export async function saveCompleteNarrativeAudio(store: LocalProjectPersistence, source: DocumentIrV2,
  approved: ApprovedNarrativeRecord, keys: string[]): Promise<CompleteNarrativeAudio> {
  const chapterCount = approved.approved.plan.spokenChapters.length;
  if (keys.length !== chapterCount || new Set(keys).size !== keys.length) throw new Error("Faltam capítulos narrativos.");
  await confirmApproval(store, source, approved);
  const latest = await store.loadLatest(source.documentId);
  if (!latest || latest.sourceHash !== source.sourceHash) throw new Error("O projeto mudou durante a montagem.");
  const chunks: Blob[] = [];
  const chapters: z.infer<typeof finalMetaSchema>["chapters"] = [];
  let startSeconds = 0;
  for (const [index, key] of keys.entries()) {
    if (!latest.artifactKeys.includes(key) || !latest.artifactKeys.includes(`${key}_meta`)) throw new Error("O capítulo não pertence ao checkpoint atual.");
    const wav = await loadNarrativeChapter(store, source, approved, key, index + 1);
    if (!wav) throw new Error(`O capítulo ${index + 1} não passou na validação.`);
    const durationSeconds = (wav.size - 44) / 44_100;
    chapters.push({ pageNumber: index + 1, audioKey: key, startSeconds, durationSeconds });
    startSeconds += durationSeconds;
    chunks.push(wav);
  }
  const blob = await joinValidatedWavs(chunks);
  if ((await store.loadLatest(source.documentId))?.checksum !== latest.checksum) throw new Error("O projeto mudou durante a exportação.");
  const createdAtMs = Date.now();
  const artifactKey = `narrative_complete_${crypto.randomUUID().replaceAll("-", "")}`;
  const meta = finalMetaSchema.parse({ schemaVersion: 1, sourceHash: source.sourceHash,
    documentHash: approved.approved.canonicalDocumentHash,
    scriptHash: approved.approved.approval.scriptHash,
    submissionHash: approved.approved.reviewReceipt.submissionHash,
    voiceId: "pt_BR-faber-medium", pipelineVersion: latest.pipelineVersion, createdAtMs, chapters });
  const stored = await store.persistNext({ schemaVersion: 1, projectId: latest.projectId, createdAtMs,
    pipelineVersion: latest.pipelineVersion, sourceHash: latest.sourceHash, job: latest.job,
    artifactKeys: [...new Set([...latest.artifactKeys.filter(key => !finalKey.test(key)
      && !/^narrative_complete_[0-9a-f]{32}_meta$/.test(key)), artifactKey, `${artifactKey}_meta`])],
  }, [
    { projectId: latest.projectId, artifactKey, kind: "final_audio", value: blob,
      mediaType: "audio/wav", createdAtMs, regenerable: false, pinned: true, finalArtifact: true, expiresAtMs: null },
    { projectId: latest.projectId, artifactKey: `${artifactKey}_meta`, kind: "audio_metadata",
      value: new Blob([JSON.stringify(meta)], { type: "application/json" }), mediaType: "application/json",
      createdAtMs, regenerable: false, pinned: true, finalArtifact: false, expiresAtMs: null },
  ], latest.checksum);
  const record = stored.artifacts.find(item => item.artifactKey === artifactKey);
  if (!record) throw new Error("O WAV narrativo não foi confirmado.");
  return { blob, artifactKey, audioHash: record.contentHash, sourceHash: source.sourceHash,
    documentHash: meta.documentHash, pipelineVersion: meta.pipelineVersion, chapters,
    mode: "narrative", scriptHash: meta.scriptHash };
}

export async function loadCompleteNarrativeAudio(store: LocalProjectPersistence,
  source: DocumentIrV2): Promise<CompleteNarrativeAudio | null> {
  const approved = await loadLatestApprovedNarrative(store, source);
  if (!approved) return null;
  const latest = await store.loadLatest(source.documentId);
  if (!latest) return null;
  const artifactKey = [...latest.artifactKeys].reverse().find(key => finalKey.test(key));
  if (!artifactKey || !latest.artifactKeys.includes(`${artifactKey}_meta`)) return null;
  const [record, metaRecord] = await Promise.all([
    store.loadArtifactRecord(source.documentId, artifactKey),
    store.loadArtifactRecord(source.documentId, `${artifactKey}_meta`)]);
  if (!record || !metaRecord || record.kind !== "final_audio" || !record.finalArtifact
    || metaRecord.kind !== "audio_metadata" || metaRecord.sizeBytes > 64_000)
    throw new Error("O WAV narrativo salvo tem manifests inválidos.");
  const meta = finalMetaSchema.parse(JSON.parse(await (await store.readArtifact(metaRecord)).text()));
  if (meta.sourceHash !== source.sourceHash || meta.documentHash !== approved.approved.canonicalDocumentHash
    || meta.scriptHash !== approved.approved.approval.scriptHash
    || meta.submissionHash !== approved.approved.reviewReceipt.submissionHash
    || meta.chapters.length !== approved.approved.plan.spokenChapters.length)
    throw new Error("O WAV narrativo não corresponde ao roteiro aprovado.");
  let expectedSeconds = 0;
  for (const [index, chapter] of meta.chapters.entries()) {
    if (chapter.pageNumber !== index + 1 || Math.abs(chapter.startSeconds - expectedSeconds) > 0.001
      || !latest.artifactKeys.includes(chapter.audioKey)) throw new Error("Índice de capítulos inválido.");
    const chunk = await loadNarrativeChapter(store, source, approved, chapter.audioKey, index + 1);
    if (!chunk || Math.abs((chunk.size - 44) / 44_100 - chapter.durationSeconds) > 0.001)
      throw new Error("O capítulo narrativo salvo não confere.");
    expectedSeconds += chapter.durationSeconds;
  }
  const blob = await store.readArtifact(record);
  await validateWav(blob, 512 * 1024 * 1024);
  if (Math.abs((blob.size - 44) / 44_100 - expectedSeconds) > 0.001)
    throw new Error("A duração do WAV narrativo não confere.");
  return { blob, artifactKey, audioHash: record.contentHash, sourceHash: source.sourceHash,
    documentHash: meta.documentHash, pipelineVersion: meta.pipelineVersion,
    chapters: meta.chapters, mode: "narrative", scriptHash: meta.scriptHash };
}
