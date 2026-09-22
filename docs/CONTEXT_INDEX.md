# Context Index

Carregue somente o contexto necessário para a tarefa.

| Tarefa | Fontes obrigatórias |
|---|---|
| Governança | `AGENTS.md`, `.ai/TASK_PACKET.md`, `.ai/WORKLOG.md`, `docs/CODE_REVIEW.md` |
| Orquestração multiagente | `docs/AI_AGENT_POLICY.md`, `.codex/config.toml`, papel necessário em `.codex/agents/` |
| Rust/domínio | `docs/adr/0001-local-first.md`, `docs/adr/0004-document-ir-v1.md`, `crates/core/`, schemas em `apps/web/src/schemas/` |
| Ingestão/OCR/storage | `docs/INGESTION_OCR_ARCHITECTURE.md`, `docs/INGESTION_TEST_STRATEGY.md`, ADRs 0008–0009, `schemas/ingestion.ts`, policies em `adapters/` |
| PWA/UI | `apps/web/`, `docs/adr/0002-ports-adapters.md`, skill `humanizer` para textos da interface |
| Narrativa/QA/performance | `docs/NARRATIVE_AND_PERFORMANCE.md`, `docs/PERFORMANCE_REQUIREMENTS.md`, ADRs 0005–0007, schemas `narrative.ts`/`performance.ts` |
| IA/segurança | `docs/SECURITY.md`, `docs/AI_GOVERNANCE.md` |
| CI/release | `.github/workflows/`, `docs/QUALITY_GATES.md` |
| Escopo/arquitetura transversal | `audiobook_studio_engineering/MASTER_ENGINEERING_REPORT.md` (seções relevantes), `audiobook_studio_engineering/AGENTS_SOURCE.md` |
| Início de milestone grande | `audiobook_studio_engineering/PROMPT_MESTRE_CODEX.md` |
| Saídas/análises extensas | skills `context-mode` e `caveman`; `caveman` vale só para comunicação, não para artefatos persistidos |

As três fontes originais em `audiobook_studio_engineering/` foram copiadas dos anexos fornecidos após o bootstrap. O ZIP não foi fornecido. O `AGENTS.md` da raiz permanece enxuto e operacional; `AGENTS_SOURCE.md` preserva o texto original sem atuar como instrução automática de diretório.
