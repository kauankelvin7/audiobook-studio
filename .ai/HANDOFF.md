# Handoff — Audiobook Studio

> Documento curto de retomada. Para detalhes, consulte `.ai/TASK_PACKET.md`, `.ai/WORKLOG.md` e `docs/CONTEXT_INDEX.md`.

## Estado atual

- Data do handoff: 2026-09-24.
- Branch de trabalho esperada: `main`.
- Último commit funcional antes deste handoff: `8bbf5055d35ed73eda284f663902cb83c7d1139b` — `feat(narrative): adiciona quality guards deterministas`.
- Milestone atual: M4 — Narrative Compiler.
- Última fatia concluída: **M4.1 Narrative Quality determinístico**.
- Status da M4.1: **IMPLEMENTED/TESTED** no escopo descrito abaixo.

## O que já está concluído

- M1: contratos base e DocumentIR v1.
- M2: importação PDF local, Worker, layout/ruído conservadores e smoke real de browser.
- Ingestão v2: contratos/migração, OCR seletivo desenhado e testado em políticas; engines OCR/visão reais continuam pendentes.
- M3.1: checkpoints, recuperação e quota com IndexedDB.
- M3.2: OPFS, Web Locks, manifests/checkpoints coordenados, retomada local, reconciliação e retenção segura.
- M4.1: normalização narrativa, deduplicação de heading anunciado, overlap determinístico, memória narrativa compacta, detecção de aberturas formulaicas, validação de source refs e QA determinístico.

## Evidência mais recente

M4.1:
- teste focado: 9/9;
- typecheck: PASS;
- STANDARD: 83/83 testes Web + typecheck + build PASS;
- sem dependências novas;
- sem TTS, OCR engine ou modelo externo nesta fatia.

M3.2:
- FAST: 27/27;
- STANDARD: 74/74 + typecheck + build;
- smoke real em Chrome confirmou importação, persistência e recuperação após reload.

Consulte `.ai/WORKLOG.md` para hashes, CI e resultados históricos completos.

## Próximo passo

### M4.2 — ContentModel / SemanticOutline + planner adapter

Objetivo da próxima fatia:
1. definir e validar `ContentModel` e `SemanticOutline`;
2. criar o adapter de planner com structured output;
3. preservar source refs/proveniência;
4. integrar os guards determinísticos da M4.1 ao fluxo do planner;
5. adicionar fixtures e testes de contrato;
6. manter TTS real fora desta fatia.

Antes de implementar:
- ler `AGENTS.md`;
- ler este arquivo;
- ler a seção atual de `.ai/TASK_PACKET.md`;
- consultar a rota **Narrativa/QA/performance** em `docs/CONTEXT_INDEX.md`;
- executar PRE-FLIGHT novo e atualizar `.ai/TASK_PACKET.md`.

## Pendências e bloqueios conhecidos

- Golden/mainframe real ainda não foi fornecido.
- Similaridade semântica/model judge ainda não foi implementada.
- Planner/model adapter ainda não foi implementado.
- TTS real, engine router, profiler, player progressivo e benchmarks reproduzíveis continuam posteriores.
- OCR/visão reais e integração completa do DocumentIR v2 continuam pendentes.
- Matriz ampla de browsers/dispositivos, fuzz/soak e hardening continuam pendentes.
- Testes Rust locais no ambiente Windows usado anteriormente ficaram bloqueados por ausência de `link.exe`; CI Linux cobre os gates publicados.

## Regras para continuar sem perder o estado

- Não repetir trabalho marcado como concluído sem evidência de regressão.
- Não declarar engine/modelo funcional quando existir apenas contrato, schema ou scaffold.
- Manter um único writer por change set.
- Atualizar `.ai/WORKLOG.md` com fatos, alterações e verificações.
- Atualizar este `.ai/HANDOFF.md` ao encerrar uma sessão relevante ou mudar o próximo passo.
- Se uma decisão arquitetural mudar, registrar/atualizar ADR.
- Não alterar o relatório mestre preservado sem necessidade transversal explícita.

## Ordem mínima de leitura para retomada

1. `AGENTS.md`
2. `.ai/HANDOFF.md`
3. `.ai/TASK_PACKET.md`
4. rota relevante em `docs/CONTEXT_INDEX.md`
5. somente então os arquivos de implementação diretamente relacionados

O `.ai/WORKLOG.md` deve ser consultado quando for necessário recuperar evidência histórica, resultados de testes, decisões anteriores ou contexto que não caiba neste resumo.
