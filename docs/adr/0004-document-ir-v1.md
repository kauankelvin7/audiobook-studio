# ADR 0004 — DocumentIR v1

Status: accepted

O contrato JSON usa `schemaVersion: 1`, `documentId`, `sourceHash`, `language` e `pages`. Cada página guarda número, texto bruto, qualidade da camada textual e blocos em ordem. Cada bloco mantém ID, tipo, texto, confiança opcional, bounding box opcional e flags. `null` em confiança significa que o parser não mediu essa propriedade. `unknown` preserva conteúdo incerto; uma página sem texto permanece no IR com `needs_ocr`.

`sourceHash` é SHA-256 dos bytes originais; `documentId` é `doc_` seguido do digest completo. IDs dos blocos são únicos no documento e devem permanecer estáveis durante classificação/edição. O cache de extração inclui versão do pipeline, hash da fonte e versão do parser, com separadores explícitos para evitar ambiguidade.

Entradas JSON são validadas após desserialização. Versões diferentes de 1 são rejeitadas com erro tipado; uma futura migração exigirá fixture e ADR antes de ser aceita. O fixture em `tests/fixtures/document_ir_v1.json` é consumido por testes Rust e TypeScript.
