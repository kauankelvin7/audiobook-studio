import {
  build_content_model_json,
  build_semantic_outline_json,
  document_v2_has_source_units_json,
  migrate_document_v1_to_v2_json,
  validate_document_v2_json,
} from "../generated/audiobook_wasm/audiobook_wasm.js";
import { contentModelSchema, semanticOutlineSchema, type ContentModel, type SemanticOutline } from "../schemas/content_model";
import { documentIrSchema, type DocumentIr } from "../schemas/document";
import { documentIrV2Schema, type DocumentIrV2 } from "../schemas/ingestion";
import { ensureRustWasm } from "./rust_wasm_runtime";

export type RustContentAnalysis = {
  documentV2: DocumentIrV2;
  contentModel: ContentModel | null;
  semanticOutline: SemanticOutline | null;
};

export type RustContentErrorCode = "WASM_INIT_FAILED" | "INVALID_DOCUMENT" | "CORE_REJECTED" | "INVALID_CORE_OUTPUT";

export class RustContentError extends Error {
  constructor(public readonly code: RustContentErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RustContentError";
  }
}

function parseCoreOutput<T>(json: string, schema: { parse: (value: unknown) => T }): T {
  try {
    return schema.parse(JSON.parse(json));
  } catch (error) {
    throw new RustContentError("INVALID_CORE_OUTPUT", "A saída do núcleo Rust não passou na validação de fronteira.", { cause: error });
  }
}

export async function analyzeDocumentV1(input: DocumentIr): Promise<RustContentAnalysis> {
  const parsed = documentIrSchema.safeParse(input);
  if (!parsed.success) {
    throw new RustContentError("INVALID_DOCUMENT", "O DocumentIR v1 não passou na validação de fronteira.", { cause: parsed.error });
  }
  try {
    await ensureRustWasm();
  } catch (error) {
    throw new RustContentError("WASM_INIT_FAILED", "O núcleo Rust/WASM não pôde ser carregado.", { cause: error });
  }

  let documentJson: string;
  let contentJson: string | null;
  let outlineJson: string | null;
  try {
    documentJson = validate_document_v2_json(migrate_document_v1_to_v2_json(JSON.stringify(parsed.data)));
    if (document_v2_has_source_units_json(documentJson)) {
      contentJson = build_content_model_json(documentJson);
      outlineJson = build_semantic_outline_json(contentJson);
    } else {
      contentJson = null;
      outlineJson = null;
    }
  } catch (error) {
    throw new RustContentError("CORE_REJECTED", "O núcleo Rust rejeitou o documento ou a análise.", { cause: error });
  }

  return {
    documentV2: parseCoreOutput(documentJson, documentIrV2Schema),
    contentModel: contentJson === null ? null : parseCoreOutput(contentJson, contentModelSchema),
    semanticOutline: outlineJson === null ? null : parseCoreOutput(outlineJson, semanticOutlineSchema),
  };
}
