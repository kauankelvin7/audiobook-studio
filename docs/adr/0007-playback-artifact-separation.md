# ADR 0007 — Disponibilidade de reprodução independente do artefato final

Status: accepted (contrato arquitetural; migração pendente)

## Contexto

`GenerationJob` v1 no Rust tem estados lineares de pipeline. Um player progressivo precisa estar disponível com chunks suficientes mesmo quando a exportação completa ainda está processando. Acrescentar `STREAMING_READY` ao enum linear não expressa simultaneidade e quebraria snapshots serializados.

## Decisão

Manter o estado do job v1 intacto por enquanto. No contrato futuro de manifest v2, modelar duas dimensões ortogonais: `PlaybackAvailability = unavailable | buffering | available | starved | finished` e `FullArtifactStatus = not_requested | processing | ready | failed`. `available + processing` é válido. Scheduler (`interactive | prefetch | idle_precompute | battery_saver | paused`) é terceira dimensão operacional, não substitui o job. `READY` de um chunk exige síntese → validação → persistência → commit do manifest. Falha de log final não invalida chunk já validado.

## Consequências

M3 precisa de ADR de migração/versionamento e fixture de snapshot v1→v2 antes de modificar `GenerationJob`. M5 precisa testar playback antes de full render, starvation com feedback, cache resume e backpressure. O player não consulta status do MP3 final para decidir se pode tocar. Nenhum dos estados novos está em runtime nesta etapa.
