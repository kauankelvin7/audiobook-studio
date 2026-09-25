import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const dist = join(root, "dist");

const required = [
  "index.html",
  "brand-mark.svg",
  "tts-runtime/piper_phonemize.data",
  "tts-runtime/piper_phonemize.wasm",
  "tts-runtime/ort-wasm.wasm",
  "tts-runtime/ort-wasm-simd.wasm",
  "tts-runtime/ort-wasm-threaded.wasm",
  "tts-runtime/ort-wasm-simd-threaded.wasm",
  "ocr-runtime/worker.min.js",
  "ocr-runtime/lang/por.traineddata.gz",
  "ocr-runtime/core/tesseract-core-lstm.wasm.js",
  "ocr-runtime/core/tesseract-core-lstm.wasm",
  "ocr-runtime/core/tesseract-core-simd-lstm.wasm.js",
  "ocr-runtime/core/tesseract-core-simd-lstm.wasm",
  "ocr-runtime/core/tesseract-core-relaxedsimd-lstm.wasm.js",
  "ocr-runtime/core/tesseract-core-relaxedsimd-lstm.wasm",
];

const missing = [];
for (const path of required) {
  try {
    const info = await stat(join(dist, path));
    if (!info.isFile() || info.size === 0) missing.push(path);
  } catch {
    missing.push(path);
  }
}

const assetDir = join(dist, "assets");
let wasmBundles = [];
try {
  wasmBundles = (await readdir(assetDir)).filter(name => /^audiobook_wasm_bg-.*\.wasm$/.test(name));
} catch {
  missing.push("assets/");
}
if (wasmBundles.length !== 1) missing.push("assets/audiobook_wasm_bg-*.wasm");

if (missing.length) {
  console.error("Deploy output is incomplete:");
  for (const path of missing) console.error(`- ${path}`);
  process.exit(1);
}

const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.isFile()) {
      const info = await stat(full);
      files.push({ path: relative(dist, full).replaceAll("\\", "/"), size: info.size });
    }
  }
}
await walk(dist);
files.sort((a, b) => b.size - a.size);
const total = files.reduce((sum, file) => sum + file.size, 0);
const mb = bytes => (bytes / 1024 / 1024).toFixed(2);

console.log(`Deploy output verified: ${files.length} files, ${mb(total)} MB total.`);
console.log("Largest deployment artifacts:");
for (const file of files.slice(0, 12)) console.log(`- ${file.path}: ${mb(file.size)} MB`);
