# ADR 0022 — Submissão OCR sem atestação

Status: accepted

## Contexto

Imagem, candidato e recibo OCR são evidência histórica; o comparador Rust expõe diferenças de tokens e mantém `review_required`. Falta uma forma canônica de registrar uma escolha explícita sobre uma região sem confundir um formulário local com identidade de revisor ou aprovação de fidelidade.

## Decisão

`OcrReviewSubmission` contém `receiptHash`, disposição (`keep_native`, `retain_candidate_for_review` ou `propose_correction`), justificativa e texto proposto somente na terceira opção. Rust recalcula o recibo e a comparação contra o DocumentIR e candidato atuais antes de emitir `OcrReviewReceipt`. O recibo vincula documento, fonte, página, região, candidato, hash da comparação, disposição, justificativa e texto proposto em `reviewHash` determinístico. O estado é sempre `unverified`.

Justificativa não vazia tem até 2.000 bytes; texto proposto não vazio tem até 1 MB. A fronteira WASM limita os JSONs de documento, candidato e submissão a 32, 8 e 8 MB. O texto proposto é declaração auditável, não fonte confirmada. Nenhuma opção altera DocumentIR, camadas, qualidade, ContentModel, checkpoint ou elegibilidade.

## Consequências

O registro permite futura persistência, interface de revisão e política de atestação. Uma decisão local isolada não autentica quem a forneceu e não libera fala. Aplicação de reconciliação exigirá regra explícita de revisão confiável, proveniência e invalidacão de derivados. Goldens de prosa/código do corpus privado permanecem pendentes.
