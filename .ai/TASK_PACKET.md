# TASK PACKET — M4.2a: contratos semânticos e fronteira estruturada do planner

> Este arquivo contém somente a tarefa ativa. Histórico encerrado fica em `.ai/WORKLOG.md` e no Git.

## PRE-FLIGHT — 2026-09-24

- Objective: implementar contratos versionados de `ContentModel` e `SemanticOutline` e uma fronteira determinística que valide structured output do futuro planner antes de produzir `NarrativePlan`.
- Evidence: M4.1 está IMPLEMENTED/TESTED; ADR 0005 e `docs/NARRATIVE_AND_PERFORMANCE.md` definem `DocumentIR → ContentModel → SemanticOutline → NarrativePlanner → NarrativeModel`; regras do projeto exigem structured outputs, source mapping e validação antes de persistir.
- Constraints: sem chamada real a LLM/TTS/OCR; documento é dado não confiável; não corrigir fonte silenciosamente; `ContentModel` não decide o que será falado; `SemanticOutline` não cria capítulos falados; rejeitar IDs/source refs fora do conjunto conhecido.
- Unknowns: provider/modelo final do planner, prompt/evals semânticos, corpus real e golden mainframe continuam indefinidos.
- Risks: inventar semântica excessiva no schema, aceitar referência órfã, confundir outline documental com estrutura falada ou marcar scaffold como planner funcional.
- Plan: (1) schemas estritos e invariantes; (2) fixtures; (3) validator do output do planner contra contexto permitido; (4) testes positivos/negativos; (5) gates e CI; (6) atualizar status sem alegar IA funcional.
- Verification: testes focados, `npm run typecheck`, `npm test`, `npm run build`, `npm audit --audit-level=high`, CI Rust/Web e revisão do diff.

## Controle de execução

- Task Risk: MEDIUM.
- Writer: Lead/Orchestrator.
- Branch: `codex/m4-2a-structured-planner-boundary`.
- Allowed Files: `.ai/`, `apps/web/src/schemas/narrative.ts`, adapter/testes narrativos, fixtures, docs narrativos/quality/gap e `apps/web/package.json` somente para tier de teste.
- Do not touch: TTS, OCR engine, UI, backend/microserviços, relatório mestre preservado e integração com provider/modelo real.
- Independent Review Required: YES por diff + CI antes de merge.

## Critérios de aceitação

- `ContentModel` preserva conceitos, relações/evidências, importância, incerteza/confiança e source refs sem decidir fala.
- `SemanticOutline` define unidades/ordem/pré-requisitos sem equivaler a capítulos falados.
- Structured output inválido, documentId divergente, conceptId desconhecido ou sourceRef desconhecida é rejeitado antes de uso.
- Nenhum teste afirma que o planner/LLM real existe.
- Gates Web e CI passam.
