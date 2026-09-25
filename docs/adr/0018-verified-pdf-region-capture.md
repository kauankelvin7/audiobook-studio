# ADR 0018 — Captura limitada de região PDF para OCR

Status: accepted (captura de pixels; engine local na ADR 0019; persistência de candidato pendente)

## Contexto

O recibo OCR da ADR 0014 aceita um hash de imagem declarado, mas o projeto ainda não capturava pixels vinculados à fonte PDF. Um hash arbitrário não demonstra de qual página ou região vieram os pixels.

## Decisão

O adapter Web recebe bytes do PDF original e DocumentIR v2, recalcula o SHA-256 da fonte e exige correspondência antes de renderizar. Seleciona apenas uma região existente com `rawText` e bbox dentro dos limites da página. PDF.js transforma a bbox do espaço PDF para viewport; o canvas é limitado à região, com renderização deslocada. Saída PNG inclui hash dos bytes, dimensões, bbox, página, região, documento/fonte, hash do texto nativo, escala e versão do método. Anotações são desativadas. Limites iniciais: PDF de até 8 MB para captura OCR, imagem de até 4 milhões de pixels, imagem embutida PDF limitada a 4 milhões de pixels, 4.096 pixels por lado, PNG de até 16 MB e prazo best-effort de 15 segundos para abertura, renderização e codificação. O limite geral de importação PDF continua 32 MB. Trabalho síncrono extremo de PDF.js ainda pode bloquear o event loop antes que o timer execute.

Essa proveniência prova que o adapter produziu os bytes a partir da fonte fornecida durante a chamada, mas não prova que a bbox representa o trecho correto ao olho humano, nem qualidade de OCR. O hash do PNG pode alimentar o candidato Rust da ADR 0014; o recibo continua `pending`. Nada substitui texto nativo, altera elegibilidade ou libera narração.

## Consequências

- O primeiro smoke usa PDF de fixture pública, PDF.js e Rust/WASM reais no Chrome headless e confirma PNG com pixels não brancos, além da recusa de uma fonte divergente.
- Rotação e geometrias variadas ainda exigem corpus e inspeção de crops; uma única fixture não valida fidelidade de todos os PDFs.
- Persistência da imagem/candidato/recibo, engine OCR local, reconciliação Rust e revisão humana seguem pendentes. Dados de PDFs privados não entram em fixtures versionadas.
