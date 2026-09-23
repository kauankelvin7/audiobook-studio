import { build_script_qa_json, build_script_review_packet_json, validate_script_review_submission_json } from "../generated/audiobook_wasm/audiobook_wasm.js";
import { contentModelSchema, semanticOutlineSchema } from "../schemas/content_model";
import { narrativePlanSchema, narrativeScriptSchema, narrationQaSchema, type NarrationQa } from "../schemas/narrative";
import { scriptReviewPacketSchema, scriptReviewReceiptSchema, scriptReviewSubmissionSchema, type ScriptReviewPacket, type ScriptReviewReceipt, type ScriptReviewSubmission } from "../schemas/review";
import { RustNarrativeError } from "./rust_narrative_pipeline";
import { ensureRustWasm } from "./rust_wasm_runtime";

type ScriptWasmPort = {
  initialize(): Promise<void>;
  buildQa(expectedPlanId: string, script: string, plan: string, content: string, outline: string): string;
};

const wasmPort: ScriptWasmPort = {
  initialize: ensureRustWasm,
  buildQa: build_script_qa_json,
};

type ReviewWasmPort = {
  initialize(): Promise<void>;
  buildPacket(expectedPlanId: string, script: string, plan: string, content: string, outline: string): string;
};

const reviewWasmPort: ReviewWasmPort = {
  initialize: ensureRustWasm,
  buildPacket: build_script_review_packet_json,
};

type SubmissionWasmPort = {
  initialize(): Promise<void>;
  recordSubmission(expectedPlanId: string, script: string, plan: string, content: string, outline: string, submission: string): string;
};

const submissionWasmPort: SubmissionWasmPort = {
  initialize: ensureRustWasm,
  recordSubmission: validate_script_review_submission_json,
};

export async function buildScriptQa(
  expectedPlanId: string,
  script: unknown,
  plan: unknown,
  content: unknown,
  outline: unknown,
  port: ScriptWasmPort = wasmPort,
): Promise<NarrationQa> {
  let input: [string, string, string, string];
  try {
    if (typeof expectedPlanId !== "string" || !expectedPlanId.trim()) throw new Error("invalid plan ID");
    input = [
      JSON.stringify(narrativeScriptSchema.parse(script)),
      JSON.stringify(narrativePlanSchema.parse(plan)),
      JSON.stringify(contentModelSchema.parse(content)),
      JSON.stringify(semanticOutlineSchema.parse(outline)),
    ];
  } catch (error) {
    throw new RustNarrativeError("INVALID_INPUT", "O roteiro não passou na validação de fronteira.", { cause: error });
  }
  try {
    await port.initialize();
  } catch (error) {
    throw new RustNarrativeError("WASM_INIT_FAILED", "O núcleo Rust/WASM não pôde ser carregado.", { cause: error });
  }
  let output: string;
  try {
    output = port.buildQa(expectedPlanId, ...input);
  } catch (error) {
    throw new RustNarrativeError("CORE_REJECTED", "O núcleo Rust rejeitou o roteiro.", { cause: error });
  }
  try {
    return narrationQaSchema.parse(JSON.parse(output));
  } catch (error) {
    throw new RustNarrativeError("INVALID_CORE_OUTPUT", "O QA do roteiro retornou dados inválidos.", { cause: error });
  }
}

export async function buildScriptReviewPacket(
  expectedPlanId: string,
  script: unknown,
  plan: unknown,
  content: unknown,
  outline: unknown,
  port: ReviewWasmPort = reviewWasmPort,
): Promise<ScriptReviewPacket> {
  let input: [string, string, string, string];
  try {
    if (typeof expectedPlanId !== "string" || !expectedPlanId.trim()) throw new Error("invalid plan ID");
    input = [
      JSON.stringify(narrativeScriptSchema.parse(script)),
      JSON.stringify(narrativePlanSchema.parse(plan)),
      JSON.stringify(contentModelSchema.parse(content)),
      JSON.stringify(semanticOutlineSchema.parse(outline)),
    ];
  } catch (error) {
    throw new RustNarrativeError("INVALID_INPUT", "Os dados para revisão do roteiro são inválidos.", { cause: error });
  }
  try {
    await port.initialize();
  } catch (error) {
    throw new RustNarrativeError("WASM_INIT_FAILED", "O núcleo Rust/WASM não pôde ser carregado.", { cause: error });
  }
  let output: string;
  try {
    output = port.buildPacket(expectedPlanId, ...input);
  } catch (error) {
    throw new RustNarrativeError("CORE_REJECTED", "O núcleo Rust rejeitou o pacote de revisão.", { cause: error });
  }
  try {
    return scriptReviewPacketSchema.parse(JSON.parse(output));
  } catch (error) {
    throw new RustNarrativeError("INVALID_CORE_OUTPUT", "O pacote de revisão retornou dados inválidos.", { cause: error });
  }
}

export async function validateScriptReviewSubmission(
  expectedPlanId: string,
  script: unknown,
  plan: unknown,
  content: unknown,
  outline: unknown,
  submission: unknown,
  port: SubmissionWasmPort = submissionWasmPort,
): Promise<ScriptReviewReceipt> {
  let input: [string, string, string, string, string];
  let expectedSubmission: ScriptReviewSubmission;
  try {
    if (typeof expectedPlanId !== "string" || !expectedPlanId.trim()) throw new Error("invalid plan ID");
    expectedSubmission = scriptReviewSubmissionSchema.parse(submission);
    input = [
      JSON.stringify(narrativeScriptSchema.parse(script)),
      JSON.stringify(narrativePlanSchema.parse(plan)),
      JSON.stringify(contentModelSchema.parse(content)),
      JSON.stringify(semanticOutlineSchema.parse(outline)),
      JSON.stringify(expectedSubmission),
    ];
  } catch (error) {
    throw new RustNarrativeError("INVALID_INPUT", "Os dados da revisão são inválidos.", { cause: error });
  }
  try {
    await port.initialize();
  } catch (error) {
    throw new RustNarrativeError("WASM_INIT_FAILED", "O núcleo Rust/WASM não pôde ser carregado.", { cause: error });
  }
  let output: string;
  try {
    output = port.recordSubmission(expectedPlanId, ...input);
  } catch (error) {
    throw new RustNarrativeError("CORE_REJECTED", "O núcleo Rust rejeitou a revisão.", { cause: error });
  }
  try {
    const receipt = scriptReviewReceiptSchema.parse(JSON.parse(output));
    if (receipt.planId !== expectedSubmission.planId
      || receipt.documentId !== expectedSubmission.documentId
      || receipt.sourceHash !== expectedSubmission.sourceHash
      || receipt.contentHash !== expectedSubmission.contentHash
      || receipt.planHash !== expectedSubmission.planHash
      || receipt.scriptHash !== expectedSubmission.scriptHash) {
      throw new Error("review receipt identity mismatch");
    }
    return receipt;
  } catch (error) {
    throw new RustNarrativeError("INVALID_CORE_OUTPUT", "O registro da revisão retornou dados inválidos.", { cause: error });
  }
}
