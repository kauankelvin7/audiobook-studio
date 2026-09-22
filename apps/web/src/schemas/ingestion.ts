import { z } from "zod";
import type { DocumentIr } from "./document";

const finite = z.number().finite();
const id = z.string().trim().min(1);
const nullableText = z.string().nullable();
const bbox = z.tuple([finite, finite, finite, finite]).nullable().superRefine((box, context) => {
  if (box && (box[0] > box[2] || box[1] > box[3])) context.addIssue({ code: "custom", message: "Bounding box is not ordered" });
});

export const extractionQualitySchema = z.enum(["good", "partial", "no_text", "corrupted"]);
export const regionTypeSchema = z.enum([
  "heading", "paragraph", "list", "code", "table", "formula", "figure", "diagram", "chart", "caption",
  "quote", "toc", "header", "footer", "reference", "metadata", "corrupted", "unknown",
]);
export const uncertaintySchema = z.enum(["source_confirmed", "ocr_confirmed", "reconstructed", "inferred", "uncertain", "unsupported"]);
export const qualityStatusSchema = z.enum(["accepted", "reconciled", "reconstructed", "review_required", "unusable"]);

const sourceLayersSchema = z.object({ rawText: nullableText, ocrText: nullableText, reconstructedText: nullableText }).strict().superRefine((layers, context) => {
  if (![layers.rawText, layers.ocrText, layers.reconstructedText].some(value => value !== null && value.trim().length > 0)) {
    context.addIssue({ code: "custom", message: "At least one source layer is required" });
  }
});

const contentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), displayText: z.string() }).strict(),
  z.object({ kind: z.literal("code"), sourceText: z.string(), detectedLanguage: nullableText, suspiciousTokens: z.array(z.string()) }).strict(),
  z.object({ kind: z.literal("table"), headers: z.array(z.string()), rows: z.array(z.array(z.string())) }).strict(),
  z.object({ kind: z.literal("formula"), sourceRepresentation: z.string(), displayRepresentation: z.string(), speechRepresentation: nullableText }).strict(),
  z.object({
    kind: z.literal("visual"),
    visualType: z.enum(["image", "diagram", "chart", "screenshot", "flowchart", "unknown_visual"]),
    imageHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
    disposition: z.enum(["ignore", "describe", "interpret", "review_required"]),
    description: nullableText,
  }).strict(),
  z.object({ kind: z.literal("legacy_text"), text: z.string(), sourceSchemaVersion: z.literal(1) }).strict(),
]);

export const documentRegionV2Schema = z.object({
  id,
  type: regionTypeSchema,
  bbox,
  language: nullableText,
  sources: sourceLayersSchema,
  content: contentSchema,
  uncertainty: uncertaintySchema,
  qualityStatus: qualityStatusSchema,
  confidence: finite.min(0).max(1).nullable(),
  flags: z.array(id),
}).strict().superRefine((region, context) => {
  const requiredKind = region.type === "code" || region.type === "table" || region.type === "formula"
    ? region.type
    : ["figure", "diagram", "chart"].includes(region.type) ? "visual" : "text";
  if (region.content.kind !== "legacy_text" && region.content.kind !== requiredKind) {
    context.addIssue({ code: "custom", message: `Region type ${region.type} requires ${requiredKind} content` });
  }
  if (region.uncertainty === "unsupported" && region.qualityStatus === "accepted") {
    context.addIssue({ code: "custom", message: "Unsupported content cannot be accepted" });
  }
  if (region.content.kind === "table") {
    const width = region.content.headers.length || region.content.rows[0]?.length || 0;
    if (width === 0 || region.content.rows.some(row => row.length !== width)) context.addIssue({ code: "custom", message: "Table rows must have one stable width" });
  }
  if (region.content.kind === "visual" && region.content.disposition === "interpret" && region.uncertainty !== "source_confirmed" && region.uncertainty !== "ocr_confirmed") {
    context.addIssue({ code: "custom", message: "Visual interpretation requires confirmed evidence" });
  }
});

export const documentIrV2Schema = z.object({
  schemaVersion: z.literal(2),
  documentId: z.string().regex(/^doc_[0-9a-f]{64}$/),
  sourceHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  language: nullableText,
  pages: z.array(z.object({
    number: z.number().int().positive(),
    extractionQuality: extractionQualitySchema,
    rawText: z.string(),
    ocrText: nullableText,
    reconstructedText: nullableText,
    regions: z.array(documentRegionV2Schema),
  }).strict()).min(1),
}).strict().superRefine((document, context) => {
  if (document.documentId !== `doc_${document.sourceHash.slice(7)}`) context.addIssue({ code: "custom", message: "Document ID does not match source hash" });
  const ids = new Set<string>();
  document.pages.forEach((page, index) => {
    if (page.number !== index + 1) context.addIssue({ code: "custom", message: "Page order is invalid" });
    page.regions.forEach(region => {
      if (ids.has(region.id)) context.addIssue({ code: "custom", message: "Duplicate region ID" });
      ids.add(region.id);
    });
  });
});

const count = z.number().int().nonnegative();
export const documentQualityReportSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: id,
  pages: count,
  nativeTextPages: count,
  ocrPages: count,
  partialOcrPages: count,
  visualRegions: count,
  tables: count,
  codeRegions: count,
  formulaRegions: count,
  reconstructedRegions: count,
  reviewRequired: count,
  unsupported: count,
  analyzerVersion: id,
}).strict().superRefine((report, context) => {
  if (report.nativeTextPages > report.pages || report.ocrPages > report.pages || report.partialOcrPages > report.pages) {
    context.addIssue({ code: "custom", message: "Page counts exceed document page count" });
  }
});

export const projectManifestSchema = z.object({
  schemaVersion: z.literal(1),
  projectId: id,
  documentIrVersion: z.union([z.literal(1), z.literal(2)]),
  narrativeModelVersion: z.number().int().positive().nullable(),
  speechModelVersion: z.number().int().positive().nullable(),
  auditManifestVersion: z.literal(1),
  pipelineVersion: id,
}).strict();

export type DocumentIrV2 = z.infer<typeof documentIrV2Schema>;
export type ExtractionQuality = z.infer<typeof extractionQualitySchema>;

export function migrateDocumentV1ToV2(document: DocumentIr): DocumentIrV2 {
  return documentIrV2Schema.parse({
    schemaVersion: 2,
    documentId: document.documentId,
    sourceHash: document.sourceHash,
    language: document.language,
    pages: document.pages.map(page => ({
      number: page.number,
      extractionQuality: page.textQuality === "needs_ocr" ? "no_text" : "good",
      rawText: page.rawText,
      ocrText: null,
      reconstructedText: null,
      regions: page.blocks.map(block => ({
        id: block.id,
        type: block.type,
        bbox: block.bbox,
        language: block.language,
        sources: { rawText: block.text, ocrText: null, reconstructedText: null },
        content: { kind: "legacy_text", text: block.text, sourceSchemaVersion: 1 },
        uncertainty: "uncertain",
        qualityStatus: "review_required",
        confidence: block.confidence,
        flags: [...block.flags, "migrated_from_v1_requires_source_review"],
      })),
    })),
  });
}
