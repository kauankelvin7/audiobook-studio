# Análise factual de gaps

Classificações: estado `COMPLETE | PARTIAL | NOT STARTED | BLOCKED`; maturidade `DESIGNED | SCAFFOLDED | IMPLEMENTED | TESTED`. Documentação ou schema isolado não equivale a funcionalidade completa.

| Área | Estado | Maturidade atual | Evidência e principal pendência |
|---|---|---|---|
| Requisitos e governança | PARTIAL | IMPLEMENTED | Relatório, ADRs, task packet e worklog existem; rastreabilidade automatizada ainda falta. |
| Arquitetura local-first | PARTIAL | SCAFFOLDED | Workspace, Ports & Adapters e PWA existem; persistência completa não. |
| DocumentIR v1 | PARTIAL | TESTED | Contrato Rust/TS e fixture testados; corpus real amplo ausente. |
| DocumentIR v2/migração | PARTIAL | TESTED | Schema e migração TS testados; paridade Rust e migração persistida faltam. |
| PDF nativo/layout | PARTIAL | TESTED | Extração, agrupamento e margens conservadoras testados; PDFs reais complexos/matriz de browsers faltam. |
| OCR seletivo | PARTIAL | SCAFFOLDED | Policy pura testada; engine, adapter, benchmarks e reconciliação real não iniciados. |
| Conteúdo visual | PARTIAL | SCAFFOLDED | Contratos de disposition/proveniência existem; adapter visual não existe. |
| Código/tabelas/fórmulas | PARTIAL | SCAFFOLDED | Schemas validam forma; extração e validadores reais faltam. |
| Narrative Compiler/IA | PARTIAL | SCAFFOLDED | Contratos, ADR e governança existem; planner/modelo/evals reais não. |
| TTS e áudio | NOT STARTED | DESIGNED | Requisitos e fronteiras documentados; engine, player e export ausentes. |
| Performance adaptativa | PARTIAL | SCAFFOLDED | Schemas/ADRs testados; profiler/router/benchmarks não implementados. |
| Execução em background | PARTIAL | DESIGNED | Limites Web documentados; retomada durável não implementada. |
| Storage e lifecycle | PARTIAL | TESTED | Seleção de eviction testada; IndexedDB/OPFS, quota e proteção física faltam. |
| Cache/modelos | PARTIAL | DESIGNED | Chaves/invalidação descritas; cache real de modelos não existe. |
| Segurança | PARTIAL | IMPLEMENTED | Limites de arquivo/páginas e trust boundaries existem; fuzz/adversarial/CSP hardening faltam. |
| Privacidade | PARTIAL | DESIGNED | Local-first é regra; auditoria de fluxos e controles de export/telemetria faltam. |
| Acessibilidade | PARTIAL | IMPLEMENTED | Semântica inicial e microcopy existem; auditoria WCAG/teclado/screen reader ampla falta. |
| Erros e recuperação | PARTIAL | TESTED | Erros tipados e protocolo Worker testados; checkpoints/resume persistente faltam. |
| Observabilidade/auditoria | PARTIAL | SCAFFOLDED | Worklog e schemas de relatório existem; geração automática e métricas runtime faltam. |
| Testes | PARTIAL | TESTED | Unit/contract/browser smoke existem; golden real, fuzz, fault injection, soak e E2E CI faltam. |
| CI/CD | PARTIAL | IMPLEMENTED | Gates Rust/Web no GitHub Actions; releases, matrizes e nightly ausentes. |
| Supply chain | PARTIAL | IMPLEMENTED | Lockfiles e audit CI existem; SBOM, assinatura e provenance de release faltam. |
| Manutenção/documentação | PARTIAL | IMPLEMENTED | Context index, ADRs e worklog existem; política de depreciação/migração operacional falta. |
| Multiagente | PARTIAL | SCAFFOLDED | Perfis e política criados/testados por parser; descoberta dos perfis exige nova sessão confiável. |

## Ordem recomendada

1. Fechar M2 com corpus PDF real e regressões de layout.
2. Implementar M3: storage físico, checkpoints, quota, retomada e migração versionada.
3. Implementar adapter OCR seletivo atrás de port, começando por fixtures autorizadas e métricas.
4. Só então integrar Narrative Compiler, TTS/player e performance adaptativa com benchmarks.
