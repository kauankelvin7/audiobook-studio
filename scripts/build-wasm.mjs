import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(root, "apps", "web", "src", "generated", "audiobook_wasm");
const input = join(root, "target", "wasm32-unknown-unknown", "release", "audiobook_wasm.wasm");
const bindgen = process.env.WASM_BINDGEN_CLI || (process.platform === "win32" ? "wasm-bindgen.exe" : "wasm-bindgen");
const cargo = process.platform === "win32" ? "cargo.exe" : "cargo";

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(cargo, ["build", "--locked", "--release", "--target", "wasm32-unknown-unknown", "-p", "audiobook-wasm"]);
if (!existsSync(input)) throw new Error("WASM_BUILD_OUTPUT_MISSING");
mkdirSync(output, { recursive: true });
run(bindgen, ["--target", "web", "--out-dir", output, "--out-name", "audiobook_wasm", input]);
const generatedIgnore = join(output, ".gitignore");
if (existsSync(generatedIgnore)) rmSync(generatedIgnore);
