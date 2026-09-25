import { z } from "zod";
import { artifactManifestRecordSchema, sourceHashSchema, storageIdSchema, type ArtifactManifestRecord } from "../schemas/persistence";
import { ocrCandidateReceiptSchema, ocrCandidateSchema, type OcrCandidate, type OcrCandidateReceipt } from "../schemas/ocr_candidate";
import type { DocumentIrV2 } from "../schemas/ingestion";
import type { LocalOcrCandidateResult } from "./local_ocr_candidate";
import { LocalProjectPersistence } from "./local_project_persistence";
import { buildOcrCandidateReceipt } from "./rust_ocr_candidate";
import { PAGE_OCR_TARGET_ID } from "../schemas/ocr_candidate";
import { readPdfPageCropPlan } from "./pdf_ocr_crop";

const cropMetadataSchema = z.object({
  schemaVersion: z.literal(1), documentId: z.string(), sourceHash: sourceHashSchema,
  pageNumber: z.number().int().positive(), regionId: z.string().min(1),
  nativeTextHash: sourceHashSchema, imageHash: sourceHashSchema,
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  pixelWidth: z.number().int().positive(), pixelHeight: z.number().int().positive(),
  renderScale: z.number().positive(), methodVersion: z.enum(["pdfjs-region-crop-v1", "pdfjs-page-crop-v1"]),
}).strict();

const envelopeSchema = z.object({
  schemaVersion: z.literal(1), crop: cropMetadataSchema,
  candidate: ocrCandidateSchema, receipt: ocrCandidateReceiptSchema,
}).strict();

export type OcrEvidenceErrorCode = "NO_PROJECT" | "SOURCE_CHANGED" | "INVALID_EVIDENCE" | "WRONG_ARTIFACT" | "CHECKPOINT_CHANGED" | "CANCELLED";

export class OcrEvidenceError extends Error {
  constructor(public readonly code: OcrEvidenceErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "OcrEvidenceError";
  }
}

export type SavedOcrEvidence = {
  imageArtifact: ArtifactManifestRecord;
  recordArtifact: ArtifactManifestRecord;
  image: Blob;
  candidate: OcrCandidate;
  receipt: OcrCandidateReceipt;
  currentness: "not_established";
};

function keys(receiptHash: string): { imageKey: string; recordKey: string } {
  const suffix = receiptHash.slice("sha256:".length);
  return {
    imageKey: storageIdSchema.parse(`ocr_${suffix}_image`),
    recordKey: storageIdSchema.parse(`ocr_${suffix}_record`),
  };
}

async function imageHash(image: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await image.arrayBuffer());
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

const PNG_CRC_TABLE = Uint32Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  return crc >>> 0;
});

function validPngStructure(bytes: Uint8Array, width: number, height: number): boolean {
  if (bytes.length < 57 || ![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let chunks = 0;
  let hasImageData = false;
  let imageDataEnded = false;
  while (offset + 12 <= bytes.length) {
    if (chunks >= 4_096) return false;
    const length = view.getUint32(offset);
    if (length > bytes.length - offset - 12) return false;
    const typeStart = offset + 4;
    const type = String.fromCharCode(...bytes.subarray(typeStart, typeStart + 4));
    if (chunks === 0 && (type !== "IHDR" || length !== 13
      || view.getUint32(offset + 8) !== width || view.getUint32(offset + 12) !== height
      || bytes[offset + 16] !== 8 || ![2, 6].includes(bytes[offset + 17])
      || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] !== 0)) return false;
    if (type === "IHDR" && chunks !== 0) return false;
    if (hasImageData && type !== "IDAT") imageDataEnded = true;
    if (type === "IDAT") {
      if (imageDataEnded || length === 0) return false;
      hasImageData = true;
    }
    if (!["IHDR", "IDAT", "IEND"].includes(type) && type[0] === type[0].toUpperCase()) return false;
    const crcOffset = offset + 8 + length;
    let crc = 0xffffffff;
    for (let index = typeStart; index < crcOffset; index++) {
      crc = (crc >>> 8) ^ PNG_CRC_TABLE[(crc ^ bytes[index]) & 0xff];
    }
    if (((crc ^ 0xffffffff) >>> 0) !== view.getUint32(crcOffset)) return false;
    offset = crcOffset + 4;
    chunks += 1;
    if (type === "IEND") return length === 0 && hasImageData && offset === bytes.length;
  }
  return false;
}

async function validateEvidence(document: DocumentIrV2, input: LocalOcrCandidateResult,
  pagePlan?: { bbox: [number, number, number, number]; pixelWidth: number; pixelHeight: number }): Promise<ReturnType<typeof envelopeSchema.parse>> {
  const { image, ...metadata } = input.crop;
  const parsed = envelopeSchema.parse({ schemaVersion: 1, crop: metadata, candidate: input.candidate, receipt: input.receipt });
  if (image.type !== "image/png" || image.size < 57 || image.size > 16_000_000) {
    throw new OcrEvidenceError("INVALID_EVIDENCE", "A imagem OCR não é um PNG válido.");
  }
  if (parsed.crop.pixelWidth > 4_096 || parsed.crop.pixelHeight > 4_096
    || parsed.crop.pixelWidth * parsed.crop.pixelHeight > 4_000_000) {
    throw new OcrEvidenceError("INVALID_EVIDENCE", "A imagem OCR excede o limite seguro de pixels.");
  }
  const bytes = new Uint8Array(await image.arrayBuffer());
  if (!validPngStructure(bytes, parsed.crop.pixelWidth, parsed.crop.pixelHeight)
    || await imageHash(image) !== parsed.crop.imageHash) {
    throw new OcrEvidenceError("INVALID_EVIDENCE", "A imagem OCR não confere com o hash registrado.");
  }
  if (typeof window !== "undefined") {
    if (typeof createImageBitmap !== "function") {
      throw new OcrEvidenceError("INVALID_EVIDENCE", "O navegador não consegue conferir a imagem OCR.");
    }
    let decoded: ImageBitmap;
    try { decoded = await createImageBitmap(image); }
    catch (error) { throw new OcrEvidenceError("INVALID_EVIDENCE", "A imagem OCR não pode ser decodificada.", { cause: error }); }
    try {
      if (decoded.width !== parsed.crop.pixelWidth || decoded.height !== parsed.crop.pixelHeight) {
        throw new OcrEvidenceError("INVALID_EVIDENCE", "As dimensões decodificadas da imagem OCR divergem.");
      }
    } finally { decoded.close(); }
  }
  const candidate = parsed.candidate;
  const crop = parsed.crop;
  if (candidate.documentId !== crop.documentId || candidate.sourceHash !== crop.sourceHash
    || candidate.pageNumber !== crop.pageNumber || candidate.regionId !== crop.regionId
    || candidate.nativeTextHash !== crop.nativeTextHash || candidate.imageHash !== crop.imageHash) {
    throw new OcrEvidenceError("INVALID_EVIDENCE", "O candidato OCR não corresponde à captura.");
  }
  const page = document.pages.find(item => item.number === crop.pageNumber);
  const region = page?.regions.find(item => item.id === crop.regionId);
  const validTarget = crop.regionId === PAGE_OCR_TARGET_ID && !region
    ? crop.methodVersion === "pdfjs-page-crop-v1" && page?.extractionQuality === "no_text"
      && page.regions.length === 0 && page.rawText.length === 0 && !!pagePlan
      && JSON.stringify(pagePlan.bbox) === JSON.stringify(crop.bbox)
      && pagePlan.pixelWidth === crop.pixelWidth && pagePlan.pixelHeight === crop.pixelHeight
    : crop.methodVersion === "pdfjs-region-crop-v1" && !!region?.bbox
      && JSON.stringify(region.bbox) === JSON.stringify(crop.bbox);
  if (crop.documentId !== document.documentId || crop.sourceHash !== document.sourceHash
    || !validTarget
    || crop.renderScale !== 2) {
    throw new OcrEvidenceError("INVALID_EVIDENCE", "A captura OCR não corresponde à região do documento.");
  }
  const fresh = await buildOcrCandidateReceipt(document, candidate);
  if (JSON.stringify(fresh) !== JSON.stringify(parsed.receipt)) {
    throw new OcrEvidenceError("INVALID_EVIDENCE", "O recibo OCR não confere com o documento.");
  }
  return parsed;
}

export class OcrEvidencePersistence {
  constructor(private readonly persistence: LocalProjectPersistence) {}

  private async pagePlan(projectId: string, document: DocumentIrV2, regionId: string,
    pageNumber: number): Promise<{ bbox: [number, number, number, number]; pixelWidth: number; pixelHeight: number } | undefined> {
    if (regionId !== PAGE_OCR_TARGET_ID || document.pages.find(page => page.number === pageNumber)
      ?.regions.some(region => region.id === regionId)) return undefined;
    const source = await this.persistence.loadArtifactRecord(projectId, "source_pdf");
    if (!source || source.kind !== "source_pdf" || source.contentHash !== document.sourceHash) {
      throw new OcrEvidenceError("SOURCE_CHANGED", "O PDF de origem da página OCR não está disponível.");
    }
    const blob = await this.persistence.readArtifact(source);
    return readPdfPageCropPlan(new Uint8Array(await blob.arrayBuffer()), document.sourceHash, pageNumber);
  }

  async save(projectIdInput: string, document: DocumentIrV2, input: LocalOcrCandidateResult,
    signal?: AbortSignal): Promise<SavedOcrEvidence> {
    const requireActive = () => {
      if (signal?.aborted) throw new OcrEvidenceError("CANCELLED", "A gravação OCR foi cancelada antes do commit.");
    };
    requireActive();
    const projectId = storageIdSchema.parse(projectIdInput);
    const envelope = await validateEvidence(document, input,
      await this.pagePlan(projectId, document, input.candidate.regionId, input.candidate.pageNumber));
    requireActive();
    const latest = await this.persistence.loadLatest(projectId);
    requireActive();
    if (!latest) throw new OcrEvidenceError("NO_PROJECT", "O projeto não tem checkpoint local.");
    if (latest.sourceHash !== envelope.candidate.sourceHash) {
      throw new OcrEvidenceError("SOURCE_CHANGED", "A fonte ativa mudou antes de salvar o OCR.");
    }
    const { imageKey, recordKey } = keys(envelope.receipt.receiptHash);
    const [existingImage, existingRecord] = await Promise.all([
      this.persistence.loadArtifactRecord(projectId, imageKey),
      this.persistence.loadArtifactRecord(projectId, recordKey),
    ]);
    if (existingImage && existingRecord) {
      const saved = await this.readHistorical(projectId, document, existingImage, existingRecord);
      requireActive();
      if ((await this.persistence.loadLatest(projectId))?.checksum !== latest.checksum) {
        throw new OcrEvidenceError("CHECKPOINT_CHANGED", "O projeto mudou durante a retomada do OCR.");
      }
      return saved;
    }
    if (existingImage || existingRecord) {
      throw new OcrEvidenceError("INVALID_EVIDENCE", "A evidência OCR existente está incompleta.");
    }
    const createdAtMs = Date.now();
    requireActive();
    const stored = await this.persistence.persistNext({
      schemaVersion: 1, projectId, createdAtMs, pipelineVersion: latest.pipelineVersion,
      sourceHash: latest.sourceHash, job: latest.job,
      artifactKeys: [...new Set([...latest.artifactKeys, imageKey, recordKey])],
    }, [
      { projectId, artifactKey: imageKey, kind: "ocr_evidence", value: input.crop.image,
        mediaType: "image/png", createdAtMs, regenerable: false, pinned: true, finalArtifact: false, expiresAtMs: null },
      { projectId, artifactKey: recordKey, kind: "ocr_evidence",
        value: new Blob([JSON.stringify(envelope)], { type: "application/json" }),
        mediaType: "application/json", createdAtMs, regenerable: false, pinned: true, finalArtifact: false, expiresAtMs: null },
    ], latest.checksum);
    const imageArtifact = stored.artifacts.find(item => item.artifactKey === imageKey);
    const recordArtifact = stored.artifacts.find(item => item.artifactKey === recordKey);
    if (!imageArtifact || !recordArtifact) throw new OcrEvidenceError("INVALID_EVIDENCE", "Os manifests OCR não foram confirmados.");
    return { imageArtifact, recordArtifact, image: input.crop.image,
      candidate: envelope.candidate, receipt: envelope.receipt, currentness: "not_established" };
  }

  async readHistorical(projectIdInput: string, document: DocumentIrV2, imageInput: ArtifactManifestRecord,
    recordInput: ArtifactManifestRecord): Promise<SavedOcrEvidence> {
    const projectId = storageIdSchema.parse(projectIdInput);
    const imageArtifact = artifactManifestRecordSchema.parse(imageInput);
    const recordArtifact = artifactManifestRecordSchema.parse(recordInput);
    if (imageArtifact.projectId !== projectId || recordArtifact.projectId !== projectId
      || imageArtifact.kind !== "ocr_evidence" || recordArtifact.kind !== "ocr_evidence"
      || imageArtifact.mediaType !== "image/png" || recordArtifact.mediaType !== "application/json"
      || !imageArtifact.pinned || !recordArtifact.pinned || imageArtifact.regenerable || recordArtifact.regenerable) {
      throw new OcrEvidenceError("WRONG_ARTIFACT", "Os manifests não são evidência OCR deste projeto.");
    }
    const latest = await this.persistence.loadLatest(projectId);
    if (!latest) throw new OcrEvidenceError("NO_PROJECT", "O projeto não tem checkpoint local.");
    const manifests = await Promise.all([
      this.persistence.loadArtifactRecord(projectId, imageArtifact.artifactKey),
      this.persistence.loadArtifactRecord(projectId, recordArtifact.artifactKey),
    ]);
    if (JSON.stringify(manifests[0]) !== JSON.stringify(imageArtifact)
      || JSON.stringify(manifests[1]) !== JSON.stringify(recordArtifact)) {
      throw new OcrEvidenceError("WRONG_ARTIFACT", "Os manifests OCR não conferem com o projeto.");
    }
    const [image, record] = await Promise.all([
      this.persistence.readArtifact(imageArtifact), this.persistence.readArtifact(recordArtifact),
    ]);
    let envelope: z.infer<typeof envelopeSchema>;
    try { envelope = envelopeSchema.parse(JSON.parse(await record.text())); }
    catch (error) { throw new OcrEvidenceError("INVALID_EVIDENCE", "O registro OCR está inválido.", { cause: error }); }
    const expected = keys(envelope.receipt.receiptHash);
    if (imageArtifact.artifactKey !== expected.imageKey || recordArtifact.artifactKey !== expected.recordKey) {
      throw new OcrEvidenceError("WRONG_ARTIFACT", "As chaves OCR não correspondem ao recibo.");
    }
    const typedImage = new Blob([image], { type: "image/png" });
    await validateEvidence(document, { crop: { ...envelope.crop, image: typedImage }, candidate: envelope.candidate, receipt: envelope.receipt },
      await this.pagePlan(projectId, document, envelope.candidate.regionId, envelope.candidate.pageNumber));
    if ((await this.persistence.loadLatest(projectId))?.checksum !== latest?.checksum) {
      throw new OcrEvidenceError("CHECKPOINT_CHANGED", "O projeto mudou durante a leitura OCR.");
    }
    return { imageArtifact, recordArtifact, image: typedImage, candidate: envelope.candidate,
      receipt: envelope.receipt, currentness: "not_established" };
  }
}
