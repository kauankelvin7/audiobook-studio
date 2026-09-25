import { documentIrSchema, type DocumentIr } from "../schemas/document";
import { contentModelSchema, semanticOutlineSchema, type ContentModel, type SemanticOutline } from "../schemas/content_model";
import { documentIrV2Schema, type DocumentIrV2 } from "../schemas/ingestion";

export type PipelineMessage = { type: "extract"; file: File };
export type PipelineResponse =
  | { type: "result"; document: DocumentIr; documentV2: DocumentIrV2; contentModel: ContentModel | null; semanticOutline: SemanticOutline | null }
  | { type: "error"; code: string; message: string };

export function decodePipelineResponse(value: unknown): PipelineResponse | null {
  if (typeof value !== "object" || value === null || !("type" in value)) return null;
  if (value.type === "error") {
    if (!("code" in value) || typeof value.code !== "string" || !("message" in value) || typeof value.message !== "string") return null;
    return { type: "error", code: value.code, message: value.message };
  }
  if (value.type === "result") {
    const document = documentIrSchema.safeParse("document" in value ? value.document : undefined);
    const documentV2 = documentIrV2Schema.safeParse("documentV2" in value ? value.documentV2 : undefined);
    const contentModel = contentModelSchema.nullable().safeParse("contentModel" in value ? value.contentModel : undefined);
    const semanticOutline = semanticOutlineSchema.nullable().safeParse("semanticOutline" in value ? value.semanticOutline : undefined);
    if (
      document.success && documentV2.success && contentModel.success && semanticOutline.success &&
      ((contentModel.data === null && semanticOutline.data === null) ||
        (contentModel.data !== null && semanticOutline.data !== null)) &&
      document.data.documentId === documentV2.data.documentId &&
      (contentModel.data === null || documentV2.data.documentId === contentModel.data.documentId) &&
      (contentModel.data === null || contentModel.data.documentId === semanticOutline.data?.documentId) &&
      document.data.sourceHash === documentV2.data.sourceHash &&
      (contentModel.data === null || documentV2.data.sourceHash === contentModel.data.sourceHash)
    ) {
      return { type: "result", document: document.data, documentV2: documentV2.data, contentModel: contentModel.data, semanticOutline: semanticOutline.data };
    }
    return { type: "error", code: "INVALID_RESULT", message: "A extração terminou, mas o resultado não passou na validação." };
  }
  return null;
}
