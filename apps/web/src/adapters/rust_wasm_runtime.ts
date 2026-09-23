import initWasm from "../generated/audiobook_wasm/audiobook_wasm.js";
import wasmUrl from "../generated/audiobook_wasm/audiobook_wasm_bg.wasm?url";

let initialization: Promise<void> | null = null;

export async function ensureRustWasm(): Promise<void> {
  if (!initialization) {
    initialization = initWasm({ module_or_path: wasmUrl })
      .then(() => undefined)
      .catch(error => {
        initialization = null;
        throw error;
      });
  }
  await initialization;
}
