# Persistência local e retomada

Status: M3.1 `IMPLEMENTED/TESTED`; M3.2 `IMPLEMENTED/TESTED` no escopo Web, incluindo smoke real em Chrome local. Edge/Firefox e matriz ampla permanecem pendentes.

## Arquitetura atual

- `IndexedDbCheckpointRepository`: checkpoints, manifests de artefatos, listagem de projetos e commit transacional de metadata.
- `OpfsArtifactStore`: blobs imutáveis no OPFS por hash, verificação pós-escrita, leitura com validação e remoção explícita.
- `WebLocksProjectLock`: exclusão mútua por projeto entre contextos Web; falha fechada quando lock não está disponível.
- `LocalProjectPersistence`: coordena OPFS -> validação -> metadata/checkpoint, recuperação, reconciliação e eviction física segura.
- `createBrowserLocalPersistence`: wiring das APIs reais do navegador.

## Ordem de publicação

A publicação durável segue:

```text
artifact bytes -> OPFS write -> OPFS verify -> IndexedDB manifest + checkpoint
```

O checkpoint não é publicado quando a escrita do artefato falha. IndexedDB armazena manifest e checkpoint na mesma transação. Como não existe transação ACID compartilhada entre OPFS e IndexedDB, uma queda de energia entre stores ainda pode deixar órfão ou manifest sem arquivo; `reconcileStorage()` identifica ambos sem apagar silenciosamente.

## Recuperação

`recoverLatest` devolve o checkpoint válido mais recente e lista registros rejeitados. `inspectResume` valida também cada artefato referenciado no OPFS; retomada só é marcada como segura quando todos estão disponíveis e íntegros.

A tela inicial tenta recuperar o projeto local mais recente que possua `document_ir` válido. Importações novas persistem o PDF original, o DocumentIR e um checkpoint sequencial.

## Concorrência

`persistNext` adquire o lock do projeto antes de ler a última sequência e publicar a seguinte. Falhas produzidas pela operação protegida são preservadas; falhas do gerenciador de locks são convertidas em erro tipado.

## Retenção e quota

A política LRU só seleciona artefatos regeneráveis, não fixados, não finais e fora do projeto atual. `cleanupRegenerableArtifacts` materializa esse plano fisicamente e remove metadata somente depois da remoção do arquivo. Se não houver candidatos seguros suficientes, nada é apagado.

PDF original, edição humana, artefato final e dados não regeneráveis nunca são removidos automaticamente. Quota continua best-effort via `navigator.storage`.

## Schema e migração

- IndexedDB v1: store `checkpoints`.
- IndexedDB v2: adiciona store `artifacts` e índice `by_project`, preservando checkpoints existentes.
- Checkpoints e manifests mantêm `schemaVersion: 1` no wire format; schema futuro incompatível falha explicitamente.

## Test tiers

- `npm run test:fast`: persistência/OPFS/locks focados.
- `npm run test:standard`: typecheck + suíte Web + build.
- `npm run test:full`: standard + audit de dependências.

Fuzz, browser matrix, soak e hardware/performance continuam como gates futuros/nightly; não são simulados como concluídos.

## Pendências pós-M3.2

M4.4F adiciona um artefato não regenerável `active_narrative`. O core Rust calcula sua identidade; o checkpoint referencia somente a versão ativa. O adapter verifica OPFS, manifest e hashes na leitura. A integração com edição de plano/roteiro e invalidação de áudio ainda está pendente (ADR 0012).

M4.4G mantém revisões históricas v1 legíveis e com atualidade `not_established`. `saveForActive` grava revisão v2 fixada com hash de vínculo calculado pelo Rust a partir da identidade narrativa completa e da submissão. A chave do artefato deriva desse vínculo, evitando colisão entre a mesma submissão salva sob outlines diferentes. O avaliador verifica os dois artefatos e relê o checksum do checkpoint; `bound_unverified` não é atestação nem liberação de áudio (ADR 0013).

- browser matrix Chrome/Edge/Firefox conforme suporte real;
- UI específica para escolha/retomada de múltiplos projetos;
- integração do checkpoint com a máquina de estados Rust/WASM;
- política de temporários por expiração;
- hardening de falha de energia entre OPFS e IndexedDB.
