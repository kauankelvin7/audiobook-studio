import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const primaryDocs = [
  "README.md",
  "docs/ARCHITECTURE_OVERVIEW.md",
  "docs/GAP_ANALYSIS.md",
];

export function localReferences(markdown) {
  // Links externos e fragmentos de página não dependem de arquivos deste repositório.
  const candidates = [];
  const markdownLinks = /!?\[[^\]\n]+\]\(([^\s)]+)(?:\s+["'][^)]*["'])?\)/g;
  const htmlLinks = /\b(?:href|src)=["']([^"']+)["']/g;
  for (const pattern of [markdownLinks, htmlLinks]) {
    for (const match of markdown.matchAll(pattern)) {
      const ref = match[1];
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(ref)) continue;
      candidates.push(ref);
    }
  }
  return [...new Set(candidates)];
}

export async function checkDocumentation(base, paths = primaryDocs) {
  const errors = [];
  let checked = 0;
  for (const path of paths) {
    const documentPath = resolve(base, path);
    const markdown = await readFile(documentPath, "utf8");
    for (const ref of localReferences(markdown)) {
      checked++;
      let pathPart;
      try {
        pathPart = decodeURIComponent(ref.split(/[?#]/, 1)[0]);
      } catch {
        errors.push(`${path}: URI inválida: ${ref}`);
        continue;
      }
      const target = resolve(dirname(documentPath), pathPart);
      const rel = relative(base, target);
      if (isAbsolute(rel) || rel === ".." || rel.startsWith(".." + (process.platform === "win32" ? "\\" : "/"))) {
        errors.push(`${path}: link fora do repositório: ${ref}`);
        continue;
      }
      try {
        await stat(target);
      } catch {
        errors.push(`${path}: destino inexistente: ${ref}`);
      }
    }
  }
  return { checked, errors };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { checked, errors } = await checkDocumentation(root);
  for (const error of errors) console.error(error);
  if (errors.length) {
    console.error(`Documentação: ${errors.length} referência(s) inválida(s).`);
    process.exitCode = 1;
  } else {
    console.log(`Documentação: ${checked} referências locais verificadas.`);
  }
}
