import { z } from "zod";
import type { DocumentIrV2 } from "../schemas/ingestion";
import type { ArtifactManifestRecord } from "../schemas/persistence";
import type { ArtifactWrite } from "./ports";
import type { LocalProjectPersistence } from "./local_project_persistence";
import { buildReadingSession, type ReadingSession } from "./rust_reading_preview";
import { validateWav } from "./local_wav";

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

export class SavedLiteralAudioError extends Error {
  constructor(public readonly code: "NOT_FOUND", message: string) {
    super(message);
    this.name = "SavedLiteralAudioError";
  }
}

async function sessionHash(session: ReadingSession): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(session));
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
  const previousKeys = latest.artifactKeys.filter(key => !key.startsWith(KEY_PREFIX));
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
  const audioKey = latest.artifactKeys.find(key => AUDIO_KEY.test(key));
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
