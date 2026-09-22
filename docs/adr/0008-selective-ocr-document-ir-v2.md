# ADR 0008 — OCR seletivo e DocumentIR v2

Status: accepted (contratos e políticas puros implementados; engines pendentes)

## Contexto

DocumentIR v1 preserva texto nativo, páginas e blocos, mas não separa texto original, OCR e reconstrução. Também não representa tabelas, fórmulas e conteúdo visual com payload estruturado. Alterar v1 silenciosamente quebraria snapshots e cache existentes.

## Decisão

DocumentIR v1 permanece legível. DocumentIR v2 adiciona regiões, qualidade de extração (`good | partial | no_text | corrupted`), camadas `rawText`, `ocrText` e `reconstructedText`, estado de qualidade e política de incerteza. A migração v1→v2 é explícita. Como v1 não prova a origem de cada bloco, regiões migradas usam `uncertain`, `review_required` e `legacy_text`; nenhuma migração inventa estrutura.

OCR segue decisão por página/região: `good` usa texto nativo; `partial` exige regiões identificadas; `no_text` permite OCR da página; `corrupted` exige OCR e reconciliação. A política decide trabalho, mas não avalia qualidade. O futuro `ExtractionQualityAnalyzer` combinará sinais medidos e terá política/versionamento próprios. OCR nunca substitui a fonte.

Regiões suportam texto, código, tabela, fórmula, visual e conteúdo legado. Código guarda texto fonte e tokens suspeitos; correções exigem revisão. Tabelas preservam células. Fórmulas separam fonte, exibição e fala. Visuais guardam tipo, hash e disposição. Interpretação visual só é aceita com evidência confirmada. `unknown`, `uncertain` e `unsupported` são estados válidos; conteúdo `unsupported` não pode ser aceito como fato.

## Consequências

O adapter PDF atual continua emitindo v1 até segmentação e validação v2 estarem integradas. Contrato v2 e migração TypeScript estão testados; paridade Rust, persistência, engines OCR/visão e UI de revisão são pendentes. A adoção de v2 no pipeline exige cache versionado, fixture Rust↔TypeScript e migração de manifest antes de produção.
