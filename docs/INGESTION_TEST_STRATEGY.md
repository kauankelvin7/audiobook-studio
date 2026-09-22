# Estratégia de testes de ingestão

## Estado atual

- `text_and_blank.pdf`: fixture sintética real, texto nativo + página sem texto; testada em Vitest e Chrome local.
- `document_ir_v1.json`: contrato v1 compartilhado Rust/TypeScript.
- `document_ir_v2.json`: contrato v2 com código corrompido e três camadas; TypeScript testado.
- Testes puros: OCR seletivo, migração segura, tabela/fórmula/visual, incerteza, eviction e protocolo Worker.

## Fixtures pendentes

`native-text.pdf`, `scanned.pdf`, `mixed.pdf`, `broken-text-layer.pdf`, `code.pdf`, `tables.pdf`, `formulas.pdf`, `charts.pdf`, `diagrams.pdf`, `two-column.pdf`, `rotated-pages.pdf`, `mixed-language.pdf`, `huge-page.pdf` e `malicious.pdf` serão adicionados quando cada adapter existir. Fixtures maliciosas devem ser produzidas em ambiente isolado e conter expectativa explícita; não criar arquivos perigosos apenas para preencher nomes.

## Gates por fase

1. Contratos: schema, round-trip/migração, preservação de fonte, `unknown` e incompatibilidade explícita.
2. OCR: seletividade por região, timeout, cancelamento, cache key, reconciliação e código suspeito.
3. Conteúdo complexo: células, fórmula fonte/exibição/fala, hash visual e baixa confiança.
4. Storage: quota, eviction segura, corrupção, transação, refresh/resume e invalidação granular.
5. Hardening: corpus multicoluna/rotação/idioma, fuzz PDF, memory bombs, browser matrix, soak e performance.

Resultados de GPU, OCR, visão, storage e hardware permanecem `NOT TESTED` até existirem adapters e ambientes correspondentes.
