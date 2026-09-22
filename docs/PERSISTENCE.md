# Persistência local e retomada

Status: M3.1 `IMPLEMENTED/TESTED`; M3.2 `DESIGNED`.

## Escopo M3.1

`IndexedDbCheckpointRepository` implementa o port `CheckpointRepository`. Cada checkpoint usa chave composta `projectId + sequence`, schema v1 estrito e checksum SHA-256. O snapshot do job replica os estados serializados pelo core Rust, mas ainda não representa integração WASM com `GenerationJob`.

`loadLatest` valida o registro mais recente e falha de forma tipada quando encontra corrupção. `recoverLatest` percorre até 1.000 checkpoints do mais novo para o mais antigo, devolve o primeiro válido e lista cada registro rejeitado. Nenhum registro é apagado durante leitura ou recuperação. Exclusão exige chamada explícita.

Escrita repetida do mesmo conteúdo e sequência é idempotente. Conteúdo diferente na mesma sequência retorna `CHECKPOINT_CONFLICT`; o adapter não aplica last-write-wins. Isto reduz perda silenciosa, mas não substitui o lease entre abas planejado para M3.2.

O adapter de quota consulta `navigator.storage.estimate()`, `persisted()` e `persist()` por uma interface injetável. APIs ausentes, negação do usuário ou falha do navegador produzem estado `unavailable`/`denied`; leitura local continua possível.

## Integridade e limites

- IDs aceitam apenas caracteres seguros e têm tamanho máximo.
- Sequence e timestamps exigem inteiros seguros não negativos.
- Artifact keys são únicas e limitadas a 10.000 por checkpoint.
- Recovery processa no máximo 1.000 candidatos por projeto e só retorna `RECOVERY_LIMIT` quando todos forem inválidos e houver histórico mais antigo.
- Schema desconhecido, estrutura inválida, checksum divergente e conflito de writer têm códigos distintos.
- Escrita valida e calcula checksum antes de abrir a transação IndexedDB.

Checksum detecta corrupção acidental. Não autentica dados contra scripts com acesso ao mesmo origin, que também podem recalcular o hash.

## Migração

Banco v1 cria store `checkpoints` e índice composto `by_project_sequence`. Nesta versão não existe formato legado autorizado. Registros com `schemaVersion` desconhecida permanecem intactos e retornam `UNSUPPORTED_SCHEMA`; futura migração exigirá ADR, fixture e teste de rollback.

## Pendente para M3.2

- OPFS para PDF, modelos e áudio binário.
- Commit coordenado entre metadata IndexedDB e arquivo OPFS.
- Lock/lease entre abas e detecção de writer concorrente.
- Política de retenção, temporários órfãos e limpeza física.
- Testes em Chrome, Edge e Firefox conforme suporte real.
- Integração do checkpoint com a máquina de estados Rust/WASM e UI de retomada.
