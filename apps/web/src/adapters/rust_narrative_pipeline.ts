import { z } from "zod";
import { build_narration_qa_json, validate_narrative_plan_json } from "../generated/audiobook_wasm/audiobook_wasm.js";
import { contentModelSchema, semanticOutlineSchema } from "../schemas/content_model";
import { narrativePlanSchema, narrationQaSchema, type NarrationQa } from "../schemas/narrative";
import { ensureRustWasm } from "./rust_wasm_runtime";

type NarrativeWasmPort = {
  initialize(): Promise<void>;
  validate(plan: string, content: string, outline: string): void;
  buildQa(planId: string, plan: string, content: string, outline: string, speech: string): string;
};

const wasmPort: NarrativeWasmPort = {
  initialize: ensureRustWasm,
  validate: validate_narrative_plan_json,
  buildQa: build_narration_qa_json,
};

export type RustNarrativeErrorCode = "INVALID_INPUT" | "WASM_INIT_FAILED" | "CORE_REJECTED" | "INVALID_CORE_OUTPUT";

export class RustNarrativeError extends Error {
  constructor(public readonly code: RustNarrativeErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "RustNarrativeError";
  }
}

function parseInputs(plan: unknown, content: unknown, outline: unknown) {
  try {
    return {
      plan: JSON.stringify(narrativePlanSchema.parse(plan)),
      content: JSON.stringify(contentModelSchema.parse(content)),
      outline: JSON.stringify(semanticOutlineSchema.parse(outline)),
    };
  } catch (error) {
    throw new RustNarrativeError("INVALID_INPUT", "Os dados narrativos não passaram na validação de fronteira.", { cause: error });
  }
}

async function initialize(port: NarrativeWasmPort): Promise<void> {
  try {
    await port.initialize();
  } catch (error) {
    throw new RustNarrativeError("WASM_INIT_FAILED", "O núcleo Rust/WASM não pôde ser carregado.", { cause: error });
  }
}

export async function validateNarrativePlan(
  plan: unknown,
  content: unknown,
  outline: unknown,
  port: NarrativeWasmPort = wasmPort,
): Promise<void> {
  const input = parseInputs(plan, content, outline);
  await initialize(port);
  try {
    port.validate(input.plan, input.content, input.outline);
  } catch (error) {
    throw new RustNarrativeError("CORE_REJECTED", "O núcleo Rust rejeitou o plano narrativo.", { cause: error });
  }
}

export async function buildNarrationQa(
  planId: string,
  plan: unknown,
  content: unknown,
  outline: unknown,
  sectionSpeech: Record<string, string>,
  port: NarrativeWasmPort = wasmPort,
): Promise<NarrationQa> {
  const input = parseInputs(plan, content, outline);
  let speechJson: string;
  try {
    if (typeof planId !== "string" || !planId.trim()) throw new Error("invalid plan ID");
    speechJson = JSON.stringify(z.record(z.string()).parse(sectionSpeech));
  } catch (error) {
    throw new RustNarrativeError("INVALID_INPUT", "O identificador do plano ou as falas por seção são inválidos.", { cause: error });
  }
  await initialize(port);
  let output: string;
  try {
    output = port.buildQa(planId, input.plan, input.content, input.outline, speechJson);
  } catch (error) {
    throw new RustNarrativeError("CORE_REJECTED", "O núcleo Rust rejeitou o QA narrativo.", { cause: error });
  }
  try {
    return narrationQaSchema.parse(JSON.parse(output));
  } catch (error) {
    throw new RustNarrativeError("INVALID_CORE_OUTPUT", "O QA narrativo retornou dados inválidos.", { cause: error });
  }
}
