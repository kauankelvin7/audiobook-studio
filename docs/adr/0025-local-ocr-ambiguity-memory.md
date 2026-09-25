# ADR 0025 — Memória local para ambiguidades de OCR

Status: accepted

## Contexto

O OCR local já produz candidato, evidência e revisão humana. A avaliação pública encontrou `STOP RUN RETURNING 0.` reconhecido como `STOP RUN RETURNING O.`. Uma correção isolada não é evidência suficiente para mudar a saída de futuras páginas.

## Decisão

O core Rust extrai regras somente de uma proposta explícita de correção vinculada ao recibo OCR. Cada regra compara tokens técnicos ASCII do mesmo tamanho e aceita apenas substituições nos pares `0/O`, `1/I/L`, `5/S` e `8/B`. Mudanças de prosa, reordenação, inserção, remoção ou substituições fora desses pares não entram na memória.

O navegador salva os registros derivados pelo Rust em IndexedDB, em banco separado do projeto, com máximo de 1.024 registros. O registro contém hashes de fonte, candidato, revisão e as regras; não guarda o texto integral do PDF ou da proposta. A memória é local ao perfil do navegador.

O core agrega registros de evidências OCR distintas, identificadas pelo recibo do candidato. Uma regra precisa de três confirmações sem empate antes de aparecer como sugestão. A saída permanece `review_required` e a interface só preenche o campo de texto proposto depois de uma ação explícita. A sugestão não modifica DocumentIR, evidência, checkpoint, elegibilidade de leitura ou TTS.

O operador aciona a atualização em lote para compilar um `OcrCorrectionModel` determinístico. O modelo contém os hashes dos registros distintos e as regras que atingiram o limiar, recebe `modelHash` e é salvo separadamente no IndexedDB. Uma nova correção não muda o snapshot já publicado; a atualização precisa ser acionada novamente. Apagar a memória remove registros e modelo.

## Consequências

O produto aprende padrões repetidos de ambiguidade técnica de forma reproduzível e auditável. O hash protege consistência do registro, mas não autentica o revisor. Registros locais podem refletir uma correção humana errada; o limiar e a revisão obrigatória reduzem esse risco, sem eliminá-lo.

O operador pode apagar a memória completa mediante confirmação explícita. A limpeza não apaga PDF, evidência, revisão OCR ou checkpoints. A API de persistência também permite remover um registro pelo seu hash para uma futura tela de gerenciamento.

`ort`, `tch-rs`, SQLite e fine-tuning offline ficam fora desta decisão. Uma futura versão desktop pode adotar SQLite. Um classificador ONNX só deve entrar depois de corpus licenciado, baseline de erro, avaliação de falsos positivos, versão de pesos, rollback e política de atualização local.
