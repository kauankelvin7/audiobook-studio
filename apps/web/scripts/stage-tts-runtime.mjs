import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, "public", "tts-runtime");
await mkdir(target, { recursive: true });

const assets = [
  ["@diffusionstudio/piper-wasm/build/piper_phonemize.data", "piper_phonemize.data"],
  ["@diffusionstudio/piper-wasm/build/piper_phonemize.wasm", "piper_phonemize.wasm"],
  ...["ort-wasm.wasm", "ort-wasm-simd.wasm", "ort-wasm-threaded.wasm", "ort-wasm-simd-threaded.wasm"]
    .map(name => [`onnxruntime-web/dist/${name}`, name]),
];

for (const [source, name] of assets) {
  await copyFile(join(root, "node_modules", source), join(target, name));
}
