import { z } from "zod";
import type { DocumentIrV2 } from "../schemas/ingestion";
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
type Store = Pick<LocalProjectPersistence, "loadLatest" | "persistNext" | "loadArtifactRecord" | "readArtifact">;

async function sessionHash(session: ReadingSession): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(session));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

export async function saveLiteralAudio(store: Store, document: DocumentIrV2, session: ReadingSession, wav: Blob): Promise<void> {
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
}

export async function loadLiteralAudio(store: Store, document: DocumentIrV2): Promise<SavedLiteralAudio | null> {
  const latest = await store.loadLatest(document.documentId);
  if (!latest || latest.sourceHash !== document.sourceHash) return null;
  const audioKey = latest.artifactKeys.find(key => /^literal_wav_[0-9a-f]{32}$/.test(key));
  if (!audioKey || !latest.artifactKeys.includes(`${audioKey}_meta`)) return null;
  const [audioRecord, metaRecord] = await Promise.all([
    store.loadArtifactRecord(document.documentId, audioKey),
    store.loadArtifactRecord(document.documentId, `${audioKey}_meta`),
  ]);
  if (!audioRecord || !metaRecord || audioRecord.kind !== "audio_chunk" || metaRecord.kind !== "audio_metadata"
    || audioRecord.mediaType !== "audio/wav" || metaRecord.mediaType !== "application/json") return null;
  const metaBlob = await store.readArtifact(metaRecord);
  let metadata: ReturnType<typeof metaSchema.safeParse>;
  try {
    metadata = metaSchema.safeParse(JSON.parse(await metaBlob.text()));
  } catch {
    return null;
  }
  if (!metadata.success || metadata.data.documentId !== document.documentId || metadata.data.sourceHash !== document.sourceHash) return null;
  const session = await buildReadingSession(document, metadata.data.startPage, metadata.data.endPage);
  if (await sessionHash(session) !== metadata.data.sessionHash) return null;
  const wav = await store.readArtifact(audioRecord);
  await validateWav(wav);
  return { blob: wav, startPage: metadata.data.startPage, endPage: metadata.data.endPage,
    createdAtMs: metadata.data.createdAtMs };
}
