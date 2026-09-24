import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const output = join(root, "public", "ocr-runtime");
const worker = require.resolve("tesseract.js/dist/worker.min.js");
const coreRoot = dirname(require.resolve("tesseract.js-core/package.json"));
const language = require.resolve("@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz");
const coreVariants = ["tesseract-core-lstm", "tesseract-core-simd-lstm", "tesseract-core-relaxedsimd-lstm"];

await mkdir(join(output, "core"), { recursive: true });
await mkdir(join(output, "lang"), { recursive: true });
await copyFile(worker, join(output, "worker.min.js"));
await copyFile(language, join(output, "lang", "por.traineddata.gz"));
for (const variant of coreVariants) {
  for (const suffix of [".wasm.js", ".wasm"]) {
    await copyFile(join(coreRoot, `${variant}${suffix}`), join(output, "core", `${variant}${suffix}`));
  }
}
