import { z } from "zod";

const sourceHashSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const documentIdSchema = z.string().regex(/^doc_[0-9a-f]{64}$/);
const finiteNumber = z.number().finite();

export const documentBlockSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "heading", "paragraph", "list", "code", "table", "formula", "figure", "caption",
    "quote", "toc", "header", "footer", "reference", "metadata", "corrupted", "unknown",
  ]),
  language: z.string().nullable(),
  text: z.string().min(1),
  confidence: finiteNumber.min(0).max(1).nullable(),
  bbox: z.tuple([finiteNumber, finiteNumber, finiteNumber, finiteNumber]).nullable(),
  flags: z.array(z.string()),
}).strict().superRefine((block, context) => {
  if (!block.id.trim() || !block.text.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Block ID and text must not be blank" });
  }
  if (block.bbox && (block.bbox[0] > block.bbox[2] || block.bbox[1] > block.bbox[3])) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["bbox"], message: "Bounding box is not ordered" });
  }
});

export const documentPageSchema = z.object({
  number: z.number().int().positive().max(4294967295),
  rawText: z.string(),
  textQuality: z.enum(["extracted", "needs_ocr"]),
  blocks: z.array(documentBlockSchema),
}).strict().superRefine((page, context) => {
  if (page.textQuality === "extracted" && page.blocks.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["blocks"], message: "Extracted page has no blocks" });
  }
  if (page.blocks.length > 0 && !page.rawText.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["rawText"], message: "Extracted blocks require raw text" });
  }
});

export const documentIrSchema = z.object({
  schemaVersion: z.literal(1),
  documentId: documentIdSchema,
  sourceHash: sourceHashSchema,
  language: z.string().nullable(),
  pages: z.array(documentPageSchema).min(1),
}).strict().superRefine((document, context) => {
  if (document.documentId !== `doc_${document.sourceHash.slice(7)}`) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["documentId"], message: "Document ID does not match source hash" });
  }
  const ids = new Set<string>();
  document.pages.forEach((page, index) => {
    if (page.number !== index + 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["pages", index, "number"], message: "Page order is invalid" });
    }
    page.blocks.forEach((block, blockIndex) => {
      if (ids.has(block.id)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["pages", index, "blocks", blockIndex, "id"], message: "Duplicate block ID" });
      }
      ids.add(block.id);
    });
  });
});

export type DocumentIr = z.infer<typeof documentIrSchema>;
