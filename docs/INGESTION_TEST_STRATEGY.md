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

## Corpus local fornecido para avaliação (2026-09-23)

- Uma apostila COBOL/ACUCOBOL de 75 páginas foi disponibilizada pelo usuário fora do repositório. SHA-256 do PDF: `34ed666f7e1c8e5291c7a01e4b46db4f869e16620b10568667980f21f2514332`. Não copiar o arquivo nem trechos extensos para o repositório público sem autorização específica.
- Inspeção local por `pdfinfo` e PyMuPDF: PDF A4 não criptografado, com camada de texto nas 75 páginas; amostras das páginas 1, 10, 25, 50 e 75 incluem título, prosa, comandos/código e bibliografia. O terminal exibiu acentos incorretamente, mas a inspeção dos code points da página 10 confirmou caracteres Unicode íntegros; não classificar a camada de texto como corrompida por essa saída.
- Isto demonstra apenas que a fonte está disponível e tem texto extraível. Ainda não há ingestão ponta a ponta, `DocumentIR`, outline, roteiro, comparação semântica ou golden de narração produzidos/validados com esta apostila. Selecionar páginas e expectativas de preservação de código/termos antes de transformá-la em caso de avaliação; manter o corpus local e registrar somente métricas e resultados verificáveis.

- Um segundo manual COBOL/CICS de 105 páginas e 1.066.609 bytes foi disponibilizado pelo usuário fora do repositório. SHA-256: `58b839407977f054bcc36c6ea42d4f423eb73b40c6937c83655420bf654926c8`. O PDF não está criptografado e todas as páginas têm texto extraível, mas PyMuPDF retornou 36.111 caracteres da área privada Unicode (U+E000–U+F8FF), distribuídos pelas 105 páginas, em 488.556 caracteres extraídos. A página 27 renderizada contém prosa e código legíveis, confirmando diferença entre aparência e camada de texto; há também sobreposição visual no rodapé/lista dessa página.
- Classificar o segundo manual como caso local de camada de texto suspeita, ainda não como fixture automatizada. O pipeline deve marcar a qualidade da extração, preservar o original e exigir reconciliação/OCR ou revisão antes de produzir fala. Não substituir glifos privados por palavras imaginadas. Selecionar páginas e transcrição esperada para medir recuperação de prosa e preservação de código COBOL/CICS; nenhum golden ou resultado de OCR foi medido ainda. Não copiar o PDF para o repositório público sem autorização específica.
