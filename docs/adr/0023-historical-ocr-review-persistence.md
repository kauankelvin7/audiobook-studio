# ADR 0023 — Persistência histórica de revisão OCR

Status: accepted

## Contexto

O core Rust emite `OcrReviewReceipt` sem atestação, ligado ao candidato e à comparação, mas a decisão se perde ao fechar a aba. A imagem, o candidato e o recibo OCR já são evidência imutável em OPFS/IndexedDB (ADR 0020).

## Decisão

Salvar a submissão e o recibo de revisão em um único artefato `ocr_review_submission` fixado e não regenerável. Sua chave deriva de `reviewHash`. O envelope v1 contém as chaves dos manifests de imagem e registro OCR; não duplica a imagem. Antes de gravar, reler a evidência completa, incluindo PNG, hashes, bbox, candidato e recibo Rust; exigir fonte ativa e os dois manifests no checkpoint atual. Recalcular `OcrReviewReceipt` no Rust/WASM e publicar artefato, manifest e checkpoint por `persistNext` com CAS do checksum inicial.

Na leitura histórica, exigir manifest exato, bytes OPFS íntegros, envelope estrito, vínculo das três chaves em um mesmo checkpoint, evidência relida e recibo Rust recalculado idêntico. Conferir o checksum do checkpoint no fim. Retry do mesmo `reviewHash` relê tudo e não cria checkpoint. O retorno permanece `currentness: not_established`, inclusive quando a fonte ativa muda.

O limite do envelope é 8 MB. Um artefato órfão, truncado ou corrompido falha fechado. A persistência local não autentica revisor e não promove o texto a `ocr_confirmed` ou `reconciled`; não altera DocumentIR, QA ou elegibilidade narrativa.

## Consequências

A interface futura pode mostrar decisões históricas com proveniência verificável, sem afirmar atualidade. Atestação, aplicação da reconciliação e política de retenção das revisões continuam separadas. Testes de storage falso e smoke Chromium cobrem recuperação após reload, retry, corrupção e corrida.
