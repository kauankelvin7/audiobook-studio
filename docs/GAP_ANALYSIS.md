# Análise factual de gaps

Classificações: estado `COMPLETE | PARTIAL | NOT STARTED | BLOCKED`; maturidade `DESIGNED | SCAFFOLDED | IMPLEMENTED | TESTED`. Documentação ou schema isolado não equivale a funcionalidade completa.

| Área | Estado | Maturidade atual | Evidência e principal pendência |
|---|---|---|---|
| Requisitos e governança | PARTIAL | IMPLEMENTED | Relatório, ADRs, task packet e worklog existem; rastreabilidade automatizada ainda falta. |
| Arquitetura local-first | PARTIAL | IMPLEMENTED | Workspace, Ports & Adapters, PWA, IndexedDB e OPFS integrados existem; integração completa com pipeline Rust/IA/TTS ainda não. |
| DocumentIR v1 | PARTIAL | TESTED | Contrato Rust/TS e fixture testados; corpus real amplo ausente. |
| DocumentIR v2/migração | PARTIAL | TESTED | Contrato/migração canônicos em Rust, schemas TS de fronteira e integração Rust/WASM/Web passaram no workflow `quality`; corpus real amplo e migrações futuras ainda faltam. |
| PDF nativo/layout | PARTIAL | TESTED | Extração, agrupamento e margens conservadoras testados; PDFs reais complexos/matriz de browsers faltam. |
| OCR seletivo | PARTIAL | SCAFFOLDED | Policy pura testada; engine, adapter, benchmarks e reconciliação real não iniciados. |
| Conteúdo visual | PARTIAL | SCAFFOLDED | Contratos de disposition/proveniência existem; adapter visual não existe. |
| Código/tabelas/fórmulas | PARTIAL | SCAFFOLDED | Schemas validam forma; extração e validadores reais faltam. |
| Narrative Compiler/IA | PARTIAL | IMPLEMENTED | M4.1/M4.2 movem guards, memória, source validation, ContentModel e SemanticOutline determinísticos para Rust; planner/modelo IA, coesão semântica e evals reais ainda faltam. |
| TTS e áudio | PARTIAL | IMPLEMENTED | Prévia literal de até dez páginas usa voz marcada como local pelo navegador, com revisão explícita e controles de reprodução. Engine neural, arquivo de áudio, export, QA narrativo e player durável continuam ausentes. |
| Performance adaptativa | PARTIAL | SCAFFOLDED | Schemas/ADRs testados; profiler/router/benchmarks não implementados. |
| Execução em background | PARTIAL | IMPLEMENTED | Web persiste e retoma estado após reload; aba fechada continua sem garantia de execução e desktop/Tauri durável ainda não existe. |
| Storage e lifecycle | PARTIAL | TESTED | IndexedDB v2, OPFS, locks, recovery, quota, reconciliação e eviction física foram testados; matriz multi-browser e hardening de queda de energia faltam. |
| Cache/modelos | PARTIAL | DESIGNED | Chaves/invalidação descritas; cache real de modelos não existe. |
| Segurança | PARTIAL | IMPLEMENTED | Limites de arquivo/páginas e trust boundaries existem; fuzz/adversarial/CSP hardening faltam. |
| Privacidade | PARTIAL | DESIGNED | Local-first é regra; auditoria de fluxos e controles de export/telemetria faltam. |
| Acessibilidade | PARTIAL | IMPLEMENTED | Semântica inicial e microcopy existem; auditoria WCAG/teclado/screen reader ampla falta. |
| Erros e recuperação | PARTIAL | TESTED | Erros tipados, Worker, checkpoint recovery e wiring Rust/WASM do pipeline de conteúdo foram testados; recuperação de estágios narrativos/modelos ainda falta. |
| Observabilidade/auditoria | PARTIAL | SCAFFOLDED | Worklog e schemas de relatório existem; geração automática e métricas runtime faltam. |
| Testes | PARTIAL | TESTED | Unit/contract/browser smoke existem; golden real, fuzz, fault injection, soak e E2E CI faltam. |
| CI/CD | PARTIAL | IMPLEMENTED | Gates Rust/Web no GitHub Actions; releases, matrizes e nightly ausentes. |
| Supply chain | PARTIAL | IMPLEMENTED | Lockfiles e audit CI existem; SBOM, assinatura e provenance de release faltam. |
| Manutenção/documentação | PARTIAL | IMPLEMENTED | Context index, ADRs e worklog existem; política de depreciação/migração operacional falta. |
| Multiagente | PARTIAL | SCAFFOLDED | Perfis e política criados/testados por parser; descoberta dos perfis exige nova sessão confiável. |

## Ordem recomendada

1. Fechar M4.3: fronteira NarrativePlan/NarrationQA pelo Rust/WASM, com fixtures/paridade e sem modelo externo.
2. Integrar `NarrativePlannerPort` com fake determinístico + structured output e só depois avaliar modelo local/golden real.
3. Retomar OCR seletivo real com adapter/benchmarks sem bloquear o fluxo narrativo determinístico.
4. TTS/player só entra após planner, source mapping e QA crítico estarem verdes; performance adaptativa entra junto dos benchmarks TTS.
