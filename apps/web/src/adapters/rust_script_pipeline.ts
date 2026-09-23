import { build_script_qa_json } from "../generated/audiobook_wasm/audiobook_wasm.js";
import { contentModelSchema, semanticOutlineSchema } from "../schemas/content_model";
import { narrativePlanSchema, narrativeScriptSchema, narrationQaSchema, type NarrationQa } from "../schemas/narrative";
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
