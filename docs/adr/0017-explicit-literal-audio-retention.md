# ADR 0017 — Retenção explícita de WAV literal

Status: accepted

## Contexto

Cada síntese literal cria um WAV e metadata com chaves imutáveis. O checkpoint atual referencia só a gravação mais recente, mas checkpoints históricos ainda podem referenciar gravações anteriores. Apagar apenas o arquivo antigo deixaria checkpoints aparentemente válidos sem artefatos recuperáveis.

## Decisão

A interface permite excluir somente uma gravação histórica escolhida e exige confirmação. Nenhuma gravação é apagada automaticamente por idade ou quota. O serviço Web valida todo o histórico de checkpoints, a fonte ativa, os manifests e a integridade dos artefatos necessários ao checkpoint atual e a um fallback independente da mesma fonte. Histórico corrompido, acima do limite de 1.000 checkpoints, ausência de fallback ou gravação atual bloqueiam a operação.

Sob Web Lock por projeto, uma transação IndexedDB remove os checkpoints que referenciam o par WAV/metadata, remove seus manifests e registra os nomes dos dois arquivos em `pending_file_deletions`. A transação compara o snapshot completo dos checkpoints e o checksum mais recente antes de gravar. Depois do commit, o adapter remove somente esses nomes do OPFS; cada remoção confirmada sai da fila. Falha, fechamento da aba ou queda de energia deixam a intenção persistida para repetição idempotente na próxima abertura. Antes de excluir um arquivo da fila, o serviço confere que nenhum manifest o referencia.

Essa é uma política de manutenção do armazenamento IndexedDB/OPFS, não uma regra de elegibilidade narrativa. O Rust continua responsável pela sessão canônica usada para vincular a gravação ao documento. A exclusão não altera DocumentIR, ContentModel, QA, revisão ou o áudio atual.

## Consequências

- IndexedDB sobe para a versão 3 e adiciona `pending_file_deletions`; checkpoints e manifests existentes continuam legíveis.
- A exclusão é irreversível para a gravação e os checkpoints que a referenciam. O checkpoint atual e um fallback íntegro permanecem.
- Uma falha física pode deixar espaço ainda ocupado até a próxima tentativa de limpeza. A interface informa essa condição; não promete bytes recuperados antes da confirmação do OPFS.
- Checkpoints históricos excluídos podem carregar estados intermediários além do WAV. A interface confirma a remoção do checkpoint, e outros manifests/arquivos desses estados não são apagados nesta operação.
- Não há compactação global automática de projetos, nem limpeza de arquivos órfãos sem intenção de exclusão persistida.
