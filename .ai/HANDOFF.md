# Handoff — Audiobook Studio

> Estado operacional curto. Histórico detalhado: `.ai/WORKLOG.md` somente quando necessário.

## Estado atual

- Data: 2026-09-24.
- Branch esperada para retomada: `main`.
- Milestone: M4 — Narrative Compiler.
- Última fatia: **M4.2a — contratos semânticos + planner boundary**.
- Baseline funcional no `main`: `fc1989c71843175bcb703d6bf3b70b5ef0945b59`.
- Status: **IMPLEMENTED/TESTED no escopo determinístico**; não existe planner/LLM real ainda.

## Entregue

- M1/M2: DocumentIR e importação PDF local testados.
- M3: IndexedDB, OPFS, locks, recuperação e retenção local testados.
- M4.1: guards narrativos, memória compacta, source refs e QA determinístico.
- M4.2a: `ContentModel`, `SemanticOutline`, fixtures e validação fail-closed de structured output.

A fronteira do planner rejeita schema inválido, documento divergente, conceito fora do contexto aprovado e source ref desconhecida.

## Validação mais recente

- Web: **95/95 testes PASS**.
- Typecheck: PASS.
- Build: PASS.
- Audit: **0 vulnerabilidades**.
- Rust CI: fmt, `cargo test --workspace` e clippy `-D warnings` PASS.
- Evidência final do PR: workflow `quality` run `35979886840` — Web e Rust PASS.

## Próximo passo

### M4.2b — paridade Rust/TS + port provider-neutral do planner

1. espelhar contratos semânticos necessários no domínio Rust;
2. criar fixture/paridade Rust↔TypeScript;
3. definir port do planner sem escolher provider/modelo;
4. manter validação structured-output antes de persistência/uso;
5. adicionar eval harness determinístico antes de integrar modelo real.

Não integrar TTS nesta fatia.

## Pendências

- provider/modelo real, prompts e evals semânticos;
- golden/mainframe real não fornecido;
- similaridade semântica/model judge;
- OCR/visão reais;
- TTS, router, profiler, player e benchmarks;
- browser/device matrix e hardening amplo.

## Retomada mínima

1. `AGENTS.md`
2. `.ai/HANDOFF.md`
3. `.ai/TASK_PACKET.md`
4. rota relevante em `docs/CONTEXT_INDEX.md`
5. arquivos diretamente relacionados

Use `.ai/WORKLOG.md` apenas para recuperar evidência histórica específica.
