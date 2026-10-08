import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDocumentation, localReferences } from "./check-documentation.mjs";

test("separa destinos internos de URLs remotas e âncoras", () => {
  assert.deepEqual(new Set(localReferences([
    "[local](docs/guia.md#secao)",
    "[remoto](https://example.org/doc)",
    "<a href='docs/guia.md'>docs</a>",
    "![captura](assets/banner.png)",
    "[âncora](#inicio)",
  ].join("\n"))), new Set(["docs/guia.md#secao", "docs/guia.md", "assets/banner.png"]));
});

test("valida arquivos e pastas existentes", async () => {
  const base = await mkdtemp(join(tmpdir(), "audiobook-docs-"));
  try {
    await mkdir(join(base, "docs"));
    await writeFile(join(base, "README.md"), "[guia](docs/guia.md)\n[folder](docs/)\n");
    await writeFile(join(base, "docs", "guia.md"), "# Guia\n");
    const result = await checkDocumentation(base, ["README.md"]);
    assert.deepEqual(result, { checked: 2, errors: [] });
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test("recusa links quebrados, URI inválida e fuga do projeto", async () => {
  const base = await mkdtemp(join(tmpdir(), "audiobook-docs-"));
  try {
    await mkdir(join(base, "docs"));
    await writeFile(join(base, "docs", "index.md"),
      "[quebrado](faltando.md)\n[fora](../../outra-coisa.md)\n[uri](%GG.md)\n");
    const result = await checkDocumentation(base, ["docs/index.md"]);
    assert.equal(result.checked, 3);
    assert.equal(result.errors.length, 3);
    assert.ok(result.errors.some(error => error.includes("inexistente")));
    assert.ok(result.errors.some(error => error.includes("fora do repositório")));
    assert.ok(result.errors.some(error => error.includes("URI inválida")));
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
