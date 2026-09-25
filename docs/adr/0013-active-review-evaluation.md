# ADR 0013 — Revalidação de revisão contra narrativa ativa

Status: accepted (avaliação estrutural sem atestação)

## Contexto

ADRs 0011 e 0012 preservam revisões históricas e publicam uma identidade narrativa ativa, respectivamente. A leitura histórica revalida o recibo contra um contexto fornecido, mas não demonstra que esse contexto é o ativo no checkpoint. Um consumidor não deve interpretar `currentness: not_established` como aprovação.

## Decisão

O core Rust expõe `evaluate_review_against_active`: recalcula a identidade de conteúdo, outline, plano e roteiro, exige o hash da identidade ativa esperada, revalida a submissão e calcula `bindingHash` a partir da identidade completa e do `submissionHash`. Sem vínculo salvo, retorna `not_established`. Com vínculo salvo válido, retorna `bound_unverified`. Um vínculo incorreto é rejeitado. O tipo não possui estado `verified` ou `pass`.

O adapter Web mantém a gravação e leitura histórica v1, com `currentness: not_established`. `saveForActive` exige identidade ativa validada e grava envelope v2 com `activeIdentityHash`, `bindingHash`, submissão e recibo. A chave imutável deriva do `bindingHash`, para que a mesma submissão sob outro outline não reutilize a chave anterior. A leitura histórica v2 reconfere o vínculo pelo Rust, mas também permanece histórica. O avaliador lê a identidade ativa e a revisão, compara o `submissionHash` calculado ao recibo salvo e relê o checksum do checkpoint ao final. Ausência de identidade ativa, contexto antigo, artefato alterado e corrida falham explicitamente.

## Limites

`bound_unverified` demonstra somente que a submissão foi salva sob a identidade ativa completa e continua estruturalmente válida contra ela no instante da leitura. Não prova que a pessoa revisou os dados, nem fidelidade semântica, posse de credencial ou autorização para TTS. Revisões v1 nunca são elevadas por comparação de hashes: ficam `not_established`, pois não guardam o outline da época. Uma atestação futura precisará vincular identidade ativa, submissão e identidade do revisor, com política de revogação. Consumidores que avancem estado ou iniciem síntese deverão verificar o checkpoint novamente sob exclusão adequada.
