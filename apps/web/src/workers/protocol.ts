import { documentIrSchema, type DocumentIr } from "../schemas/document";

export type PipelineMessage = { type: "extract"; file: File };
export type PipelineResponse =
  | { type: "result"; document: DocumentIr }
  | { type: "error"; code: string; message: string };

export function decodePipelineResponse(value: unknown): PipelineResponse | null {
  if (typeof value !== "object" || value === null || !("type" in value)) return null;
  if (value.type === "error") {
    if (!("code" in value) || typeof value.code !== "string" || !("message" in value) || typeof value.message !== "string") return null;
    return { type: "error", code: value.code, message: value.message };
  }
  if (value.type === "result") {
    const parsed = documentIrSchema.safeParse("document" in value ? value.document : undefined);
    return parsed.success
      ? { type: "result", document: parsed.data }
      : { type: "error", code: "INVALID_RESULT", message: "A extração terminou, mas o resultado não passou na validação." };
  }
  return null;
}
