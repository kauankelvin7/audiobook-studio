import { z } from "zod";
import type { DocumentIrV2 } from "../schemas/ingestion";
import type { ArtifactManifestRecord } from "../schemas/persistence";
import type { ArtifactWrite } from "./ports";
import type { LocalProjectPersistence } from "./local_project_persistence";
import { buildReadingSession, type ReadingSession } from "./rust_reading_preview";
import { joinValidatedWavs, validateWav } from "./local_wav";

const VOICE_ID = "pt_BR-faber-medium";
const KEY_PREFIX = "literal_wav_";
const metaSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: z.string().min(1),
  sourceHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  startPage: z.number().int().positive(),
  endPage: z.number().int().positive(),
  sessionHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  voiceId: z.literal(VOICE_ID),
  createdAtMs: z.number().int().nonnegative(),
}).strict();

export type SavedLiteralAudio = { blob: Blob; startPage: number; endPage: number; createdAtMs: number };
export type LiteralAudioEntry = { artifactKey: string; startPage: number; endPage: number; createdAtMs: number; sizeBytes: number };
type Store = Pick<LocalProjectPersistence, "loadLatest" | "persistNext" | "loadArtifactRecord" | "readArtifact">;
type CatalogStore = Store & Pick<LocalProjectPersistence, "listArtifactRecords">;
type MaintenanceStore = CatalogStore & Pick<LocalProjectPersistence, "compactHistoricalLiteralAudio">;
const AUDIO_KEY = /^literal_wav_[0-9a-f]{32}$/;
const COMPLETE_KEY = /^complete_wav_[0-9a-f]{32}$/;
const completeSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: z.string().min(1),
  sourceHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  documentHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  voiceId: z.literal(VOICE_ID),
  format: z.literal("audio/wav"),
  pipelineVersion: z.string().min(1),
  createdAtMs: z.number().int().nonnegative(),
  chapters: z.array(z.object({ pageNumber: z.number().int().positive(), audioKey: z.string().regex(AUDIO_KEY),
    startSeconds: z.number().nonnegative().finite(), durationSeconds: z.number().positive().finite() }).strict()).min(1),
}).strict();
export type CompleteLiteralAudio = { blob: Blob; artifactKey: string; audioHash: string;
  sourceHash: string; documentHash: string; pipelineVersion: string; chapters: z.infer<typeof completeSchema>["chapters"] };

export class SavedLiteralAudioError extends Error {
  constructor(public readonly code: "NOT_FOUND", message: string) {
    super(message);
    this.name = "SavedLiteralAudioError";
  }
}

async function sessionHash(session: ReadingSession): Promise<string> {
  return await jsonHash(session);
}

async function jsonHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function saveLiteralAudio(store: Store, document: DocumentIrV2, session: ReadingSession, wav: Blob): Promise<string> {
  await validateWav(wav);
  if (document.documentId !== session.documentId || document.sourceHash !== session.sourceHash) {
    throw new Error("A sessão não pertence ao documento atual.");
  }
  const canonical = await buildReadingSession(document, session.startPage, session.endPage);
  if (JSON.stringify(canonical) !== JSON.stringify(session)) {
    throw new Error("A sessão mudou desde a validação pelo domínio Rust.");
  }
  const latest = await store.loadLatest(document.documentId);
  if (!latest || latest.sourceHash !== document.sourceHash) throw new Error("O projeto local não corresponde ao áudio.");
  const createdAtMs = Date.now();
  const id = crypto.randomUUID().replaceAll("-", "");
  const audioKey = `${KEY_PREFIX}${id}`;
  const metaKey = `${audioKey}_meta`;
  const metadata = metaSchema.parse({
    schemaVersion: 1, documentId: session.documentId, sourceHash: session.sourceHash,
    startPage: session.startPage, endPage: session.endPage,
    sessionHash: await sessionHash(canonical), voiceId: VOICE_ID, createdAtMs,
  });
  const writes: ArtifactWrite[] = [
    { projectId: document.documentId, artifactKey: audioKey, kind: "audio_chunk", value: wav,
      mediaType: "audio/wav", createdAtMs, regenerable: false, pinned: true, finalArtifact: false, expiresAtMs: null },
    { projectId: document.documentId, artifactKey: metaKey, kind: "audio_metadata",
      value: new Blob([JSON.stringify(metadata)], { type: "application/json" }),
      mediaType: "application/json", createdAtMs, regenerable: false, pinned: true, finalArtifact: false, expiresAtMs: null },
  ];
  const hasComplete = latest.artifactKeys.some(key => COMPLETE_KEY.test(key));
  const previousKeys = hasComplete ? latest.artifactKeys : latest.artifactKeys.filter(key => !key.startsWith(KEY_PREFIX));
  await store.persistNext({
    schemaVersion: 1, projectId: latest.projectId, createdAtMs,
    pipelineVersion: latest.pipelineVersion, sourceHash: latest.sourceHash, job: latest.job,
    artifactKeys: [...previousKeys, audioKey, metaKey],
  }, writes, latest.checksum);
  return audioKey;
}

export async function loadLiteralAudio(store: Store, document: DocumentIrV2): Promise<SavedLiteralAudio | null> {
  const latest = await store.loadLatest(document.documentId);
  if (!latest || latest.sourceHash !== document.sourceHash) return null;
  const audioKey = [...latest.artifactKeys].reverse().find(key => AUDIO_KEY.test(key));
  if (!audioKey || !latest.artifactKeys.includes(`${audioKey}_meta`)) return null;
  return await loadLiteralAudioByKey(store, document, audioKey);
}

async function validMetadata(store: Store, document: DocumentIrV2, audioKey: string,
  records?: Map<string, ArtifactManifestRecord>) {
  if (!AUDIO_KEY.test(audioKey)) return null;
  const [audioRecord, metaRecord] = records
    ? [records.get(audioKey), records.get(`${audioKey}_meta`)]
    : await Promise.all([
      store.loadArtifactRecord(document.documentId, audioKey),
      store.loadArtifactRecord(document.documentId, `${audioKey}_meta`),
    ]);
  if (!audioRecord || !metaRecord || audioRecord.kind !== "audio_chunk" || metaRecord.kind !== "audio_metadata"
    || audioRecord.mediaType !== "audio/wav" || metaRecord.mediaType !== "application/json"
    || metaRecord.sizeBytes > 16 * 1024) return null;
  let metadata: ReturnType<typeof metaSchema.safeParse>;
  try {
    metadata = metaSchema.safeParse(JSON.parse(await (await store.readArtifact(metaRecord)).text()));
  } catch {
    return null;
  }
  if (!metadata.success || metadata.data.documentId !== document.documentId || metadata.data.sourceHash !== document.sourceHash) return null;
  try {
    const session = await buildReadingSession(document, metadata.data.startPage, metadata.data.endPage);
    if (await sessionHash(session) !== metadata.data.sessionHash) return null;
  } catch {
    return null;
  }
  return { audioRecord, metadata: metadata.data };
}

export async function listLiteralAudios(store: CatalogStore, document: DocumentIrV2): Promise<LiteralAudioEntry[]> {
  const records = await store.listArtifactRecords(document.documentId);
  const byKey = new Map(records.map(record => [record.artifactKey, record]));
  const keys = records.filter(record => record.kind === "audio_chunk" && AUDIO_KEY.test(record.artifactKey))
    .map(record => record.artifactKey);
  const entries = await Promise.all(keys.map(async artifactKey => {
    const valid = await validMetadata(store, document, artifactKey, byKey);
    if (!valid) return null;
    return { artifactKey, startPage: valid.metadata.startPage, endPage: valid.metadata.endPage,
      createdAtMs: valid.metadata.createdAtMs, sizeBytes: valid.audioRecord.sizeBytes };
  }));
  return entries.filter((entry): entry is LiteralAudioEntry => entry !== null)
    .sort((left, right) => right.createdAtMs - left.createdAtMs || right.artifactKey.localeCompare(left.artifactKey));
}

export async function loadLiteralAudioByKey(store: Store, document: DocumentIrV2, audioKey: string): Promise<SavedLiteralAudio | null> {
  const valid = await validMetadata(store, document, audioKey);
  if (!valid) return null;
  const wav = await store.readArtifact(valid.audioRecord);
  await validateWav(wav);
  return { blob: wav, startPage: valid.metadata.startPage, endPage: valid.metadata.endPage,
    createdAtMs: valid.metadata.createdAtMs };
}

export async function removeHistoricalLiteralAudio(store: MaintenanceStore, document: DocumentIrV2, audioKey: string) {
  const entries = await listLiteralAudios(store, document);
  if (!entries.some(entry => entry.artifactKey === audioKey)) {
    throw new SavedLiteralAudioError("NOT_FOUND", "A gravação não pertence ao documento atual.");
  }
  return await store.compactHistoricalLiteralAudio(document.documentId, document.sourceHash, audioKey);
}

export async function saveCompleteLiteralAudio(store: Store, document: DocumentIrV2,
  chapterAudioKeys: string[]): Promise<CompleteLiteralAudio> {
  if (chapterAudioKeys.length !== document.pages.length || new Set(chapterAudioKeys).size !== chapterAudioKeys.length) {
    throw new Error("Faltam capítulos para exportar o documento completo.");
  }
  const latest = await store.loadLatest(document.documentId);
  if (!latest || latest.sourceHash !== document.sourceHash) throw new Error("A fonte do projeto mudou durante a exportação.");
  const documentHash = await jsonHash(document);
  const documentRecord = await store.loadArtifactRecord(document.documentId, "document_ir_v2");
  if (!latest.artifactKeys.includes("document_ir_v2") || !documentRecord
    || documentRecord.contentHash !== documentHash) {
    throw new Error("O texto ativo do projeto mudou antes da exportação.");
  }
  const chapters: z.infer<typeof completeSchema>["chapters"] = [];
  const chunks: Blob[] = [];
  let startSeconds = 0;
  for (const [index, key] of chapterAudioKeys.entries()) {
    const saved = await loadLiteralAudioByKey(store, document, key);
    if (!saved || saved.startPage !== index + 1 || saved.endPage !== index + 1) {
      throw new Error(`O áudio da página ${index + 1} não passou na validação.`);
    }
    const durationSeconds = (saved.blob.size - 44) / 44_100;
    chapters.push({ pageNumber: index + 1, audioKey: key, startSeconds, durationSeconds });
    startSeconds += durationSeconds;
    chunks.push(saved.blob);
  }
  const blob = await joinValidatedWavs(chunks);
  const current = await store.loadLatest(document.documentId);
  if (!current || current.checksum !== latest.checksum) throw new Error("O projeto mudou durante a montagem do audiobook.");
  const createdAtMs = Date.now();
  const artifactKey = `complete_wav_${crypto.randomUUID().replaceAll("-", "")}`;
  const metadata = completeSchema.parse({ schemaVersion: 1, documentId: document.documentId,
    sourceHash: document.sourceHash, documentHash, voiceId: VOICE_ID, format: "audio/wav",
    pipelineVersion: current.pipelineVersion, createdAtMs, chapters });
  const metaKey = `${artifactKey}_meta`;
  const stored = await store.persistNext({ schemaVersion: 1, projectId: document.documentId, createdAtMs,
    pipelineVersion: current.pipelineVersion, sourceHash: current.sourceHash, job: current.job,
    artifactKeys: [...new Set([...current.artifactKeys.filter(key => !COMPLETE_KEY.test(key)
      && !/^complete_wav_[0-9a-f]{32}_meta$/.test(key)), ...chapterAudioKeys,
      ...chapterAudioKeys.map(key => `${key}_meta`), artifactKey, metaKey])],
  }, [
    { projectId: document.documentId, artifactKey, kind: "final_audio", value: blob, mediaType: "audio/wav",
      createdAtMs, regenerable: false, pinned: true, finalArtifact: true, expiresAtMs: null },
    { projectId: document.documentId, artifactKey: metaKey, kind: "audio_metadata",
      value: new Blob([JSON.stringify(metadata)], { type: "application/json" }), mediaType: "application/json",
      createdAtMs, regenerable: false, pinned: true, finalArtifact: false, expiresAtMs: null },
  ], current.checksum);
  const audioRecord = stored.artifacts.find(record => record.artifactKey === artifactKey);
  if (!audioRecord) throw new Error("O manifest do audiobook não foi confirmado.");
  return { blob, artifactKey, audioHash: audioRecord.contentHash, sourceHash: document.sourceHash, documentHash,
    pipelineVersion: current.pipelineVersion, chapters };
}

export async function loadCompleteLiteralAudio(store: Store, document: DocumentIrV2): Promise<CompleteLiteralAudio | null> {
  const latest = await store.loadLatest(document.documentId);
  if (!latest || latest.sourceHash !== document.sourceHash) return null;
  const artifactKey = latest.artifactKeys.find(key => COMPLETE_KEY.test(key));
  if (!artifactKey || !latest.artifactKeys.includes(`${artifactKey}_meta`)) return null;
  const [audioRecord, metaRecord] = await Promise.all([
    store.loadArtifactRecord(document.documentId, artifactKey),
    store.loadArtifactRecord(document.documentId, `${artifactKey}_meta`),
  ]);
  if (!audioRecord || !metaRecord || audioRecord.kind !== "final_audio" || !audioRecord.finalArtifact
    || audioRecord.mediaType !== "audio/wav" || metaRecord.kind !== "audio_metadata"
    || metaRecord.mediaType !== "application/json" || metaRecord.sizeBytes > 64_000) {
    throw new Error("O audiobook salvo tem manifests inválidos.");
  }
  const parsed = completeSchema.safeParse(JSON.parse(await (await store.readArtifact(metaRecord)).text()));
  if (!parsed.success || parsed.data.documentId !== document.documentId || parsed.data.sourceHash !== document.sourceHash
    || parsed.data.documentHash !== await jsonHash(document)
    || parsed.data.chapters.length !== document.pages.length || parsed.data.chapters.some((chapter, index) =>
      chapter.pageNumber !== index + 1 || !latest.artifactKeys.includes(chapter.audioKey)
      || !latest.artifactKeys.includes(`${chapter.audioKey}_meta`))) {
    throw new Error("Os capítulos salvos não correspondem ao documento atual.");
  }
  const blob = await store.readArtifact(audioRecord);
  await validateWav(blob, 512 * 1024 * 1024);
  const actualSeconds = (blob.size - 44) / 44_100;
  const expectedSeconds = parsed.data.chapters.reduce((total, chapter) => total + chapter.durationSeconds, 0);
  if (Math.abs(actualSeconds - expectedSeconds) > 0.001) throw new Error("A duração do audiobook não confere com os capítulos.");
  return { blob, artifactKey, audioHash: audioRecord.contentHash, sourceHash: document.sourceHash,
    documentHash: parsed.data.documentHash,
    pipelineVersion: parsed.data.pipelineVersion, chapters: parsed.data.chapters };
}
