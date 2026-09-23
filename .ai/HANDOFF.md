# HANDOFF — retorno ao Codex Work

Data: 2026-09-22

## Estado exato
- Branch ativa: `codex/m4-content-model`
- HEAD antes deste handoff: `5807e79 test(core): reforca invariantes de dominio`
- GitHub Actions do commit `5807e79`: Rust = SUCCESS; Web = SUCCESS.
- Worktree antes deste handoff: apenas `.ai/TASK_PACKET.md` e `.ai/WORKLOG.md` tinham registros ainda não commitados.

## Decisão arquitetural discutida
Foi revisado o peso de TypeScript versus Rust. A conclusão não é maximizar a porcentagem de Rust, e sim garantir ownership correto:
- Rust/`audiobook-core`: domínio canônico, invariantes, DocumentIR, migrações, ContentModel, SemanticOutline, NarrativeMemory, Narrative QA determinístico, provenance/source validation, state machines, cache/dependency rules e transforms determinísticos.
- TypeScript: React/UI, PDF.js, Web Workers, IndexedDB, OPFS, Web Locks, WebGPU/browser APIs e adapters de LLM/TTS.
- Schemas TS podem espelhar contratos Rust na fronteira, mas não devem virar uma segunda fonte de verdade.
- Regra persistida em `AGENTS.md` e `docs/adr/0010-rust-core-ownership.md`.

## Entregue nesta branch
- `crates/core/src/document_v2.rs`: DocumentIR v2 canônico + validações + migração v1→v2.
- `crates/core/src/content.rs`: ContentModel + SemanticOutline + invariantes.
- `crates/core/src/narrative.rs`: validação NarrativePlan, deduplicação heading↔body, memória narrativa, formulaic opener detection e Narration QA determinístico.
- `crates/core/tests/domain_v2.rs`: testes de contrato/invariantes.
- `crates/wasm/src/lib.rs`: fachada fina para validar DocumentIR v2, construir ContentModel/SemanticOutline e validar NarrativePlan.
- Removida a implementação canônica de Narrative Quality em TypeScript.
- Removida a migração DocumentIR v1→v2 do TypeScript.
- `apps/web/src/schemas/content_model.ts` permanece apenas como contrato de fronteira.
- Fixtures compartilhadas: `tests/fixtures/content_model_v1.json` e `semantic_outline_v1.json`.
- CI Rust foi corrigida para instalar `rustfmt, clippy` corretamente.

## Evidência
- Busca em `apps/web/src` por `migrateDocumentV1ToV2`, `buildNarrationQa`, `compareHeadingToBody` e `reduceNarrativeMemory` retornou vazio.
- Web STANDARD local passou antes da mudança final: typecheck + testes + build.
- Gate final confiável: GitHub Actions no commit `5807e79`, jobs Rust e Web ambos verdes.
- O PC local ainda não possui `cargo/rustc` no PATH; não declarar teste Rust local como executado.

## Onde continuar
Próxima etapa recomendada, sem ampliar ainda o planner/IA:
1. Integrar de verdade o `audiobook-wasm` no runtime Web.
2. Criar adapter TS fino para chamar WASM, sem duplicar regras.
3. Adicionar parity/contract tests Rust↔TS usando fixtures compartilhadas.
4. Validar DocumentIR v2 → ContentModel → SemanticOutline pelo WASM em teste de integração.
5. Só depois seguir para Narrative Planner/model adapter/structured output.
6. Manter TTS fora desta etapa.

## Restrições
- Não mover novamente regras de domínio para TypeScript sem ADR explícito.
- Não reescrever IndexedDB/OPFS/Web Locks em Rust apenas para aumentar métricas de linguagem.
- Não inventar disponibilidade de modelo ou teste.
- Preservar local-first, provenance e unknown/review states.
- Não iniciar TTS antes de fechar o wiring do core Rust/WASM.

## Comando mental para o próximo agente
Leia primeiro `AGENTS.md`, `docs/CONTEXT_INDEX.md`, `docs/adr/0010-rust-core-ownership.md`, `.ai/TASK_PACKET.md`, `.ai/WORKLOG.md` e este arquivo. Inspecione o estado real do branch antes de modificar qualquer coisa.

## Atualização M4 runtime (2026-09-22)
- A etapa acima foi executada em `codex/m4-content-model` a partir de `039b982`. O Worker usa o módulo `audiobook-wasm` real para migrar DocumentIR v1, validar v2 e construir ContentModel/SemanticOutline quando há unidades de fonte.
- O bundle gerado e o script de regeneração estão versionados. Testes de integração carregam o `.wasm` real, inclusive o caso de página sem texto. Web STANDARD passou com 78/78 testes, typecheck e build. Rust fmt/test/clippy passaram localmente usando toolchain GNU de 32 bits. O gate de comparação byte a byte entre hosts foi ajustado; o workflow `quality` do commit `6b91326` concluiu com sucesso (run `35776236399`).
- Próximo passo após CI verde: planejar adapter estruturado do Narrative Planner no M4, com provenance e QA pelo core Rust. TTS permanece fora do escopo até esse fluxo estar validado.

## CHECKPOINT ATUAL — 2026-09-22 17:06 BRT
- Fonte de verdade verificada no GitHub: branch `codex/m4-content-model`, HEAD `4fbb97159ed4963cec00e6364ecbb5a18673b1a5` (`docs(m4): registra CI verde da integracao WASM`).
- Workflow `quality` do HEAD `4fbb971` concluiu com sucesso; o commit anterior `6b91326` também passou após corrigir o gate de paridade WASM entre hosts.
- M4 runtime Rust/WASM/Web está integrado: PDF.js produz DocumentIR v1; o Worker chama o WASM real para migrar/validar DocumentIR v2 e construir ContentModel/SemanticOutline quando há source units.
- Rust continua fonte canônica do domínio; TypeScript permanece em UI/Web APIs/adapters e schemas de fronteira.
- TTS, OCR engine real e modelo/planner real continuam fora do escopo neste ponto.
- O Remote Desktop Commander não estava disponível nesta sessão; nenhuma afirmação de estado do worktree local foi feita. GitHub foi usado como fonte de verdade.

### Próxima sequência segura
1. M4.3A — fechar a fronteira narrativa Rust/WASM sem modelo externo: exportar QA narrativo pelo core/WASM e validar plano contra ContentModel/SemanticOutline.
2. M4.3B — criar adapter TypeScript fino para plano/QA, sem regra de domínio duplicada.
3. M4.3C — adicionar fixture de NarrativePlan compatível com o ContentModel atual e teste de integração contra o WASM real.
4. Rodar `cargo fmt/test/clippy`, `npm run test:standard`, regeneração WASM e CI. Não avançar se qualquer gate falhar.
5. Só após M4.3 verde: introduzir `NarrativePlannerPort`/adapter de modelo com fake determinístico e structured output; ainda sem TTS.
6. Depois: avaliar modelo local real/golden mainframe; TTS continua bloqueado até planner + source mapping + QA crítico passarem.

### Regra de retomada
Ao iniciar nova sessão, ler este CHECKPOINT primeiro, confirmar branch/HEAD/CI reais e registrar novo PRE-FLIGHT antes de escrever código. Após cada batch concluído, atualizar `.ai/WORKLOG.md` e este handoff com commit, testes executados, resultado, riscos e próximo passo. Não declarar `TESTED` sem comando/CI correspondente.

## CHECKPOINT LOCAL — M4.3A retomado (2026-09-22)
- Checkout: `codex/m4-content-model` em `c671945b303036314221c6ebb6eefffa2f822a7e`; workflow `quality` desse commit passou (run `35778466312`).
- A toolchain foi instalada. Core/WASM agora expõe QA contextual com validação de provenance e fala por seção; claims não avaliados mantêm status `REVIEW`. Bindings WASM foram regenerados.
- Gates locais: Rust fmt, 25 testes e clippy passaram; `npm run wasm:build` e Web STANDARD (78/78, typecheck, build) passaram; `git diff --check` passou. O teste de Web Locks foi ajustado para simular API ausente no Node 24.
- Mudanças ainda locais e sem CI do novo commit. Próximo passo: revisão independente, commit/push de M4.3A e CI `quality`. Não iniciar M4.3B se CI falhar; planner/modelo e TTS seguem fora desta etapa.
- Revisão QA independente não encontrou P0/P1. Inputs vazios e seção extra ganharam cobertura Rust; o teste de integração do export WASM permanece para M4.3C. Rust fmt/test/clippy passaram novamente após esses testes.

## M4.3A concluído — 2026-09-22
- Commit `9f7aca594121b0488407c41f2b3c376086012c3b` publicado em `codex/m4-content-model`; workflow `quality` run `35802591562` concluiu com sucesso nos jobs Rust e Web.
- Rust fmt/test (25 testes)/clippy, regeneração WASM e Web STANDARD (78 testes/typecheck/build) passaram localmente. QA independente não encontrou P0/P1.
- Core Rust valida NarrativePlan contra ContentModel/Outline e falas completas antes de emitir QA. Claim grounding ainda não é avaliado e força `REVIEW`. Export WASM foi gerado; a execução do export com bundle real está no M4.3C.
- Próximo batch: M4.3B, adapter TS fino para validação de plano e QA, sem lógica de domínio. TTS continua bloqueado.

## M4.3B localmente validado — 2026-09-22
- Adapter narrativo TS e inicialização WASM compartilhada implementados sem regra narrativa nova em TS.
- QA independente encontrou falha P1 na serialização de fala; corrigida e coberta por testes. STANDARD Web final: 80/80 testes, typecheck e build passaram; diff check passou.
- Publicação/CI ainda pendentes. Próximo batch M4.3C só após CI verde do M4.3B; precisa fixture de NarrativePlan e teste contra WASM real. TTS permanece bloqueado.

## M4.3B concluído — 2026-09-22
- Commit `b03bd286aaaa373dcb4ed3e02c0e47bdae4f84df` publicado; workflow `quality` run `35803065588` concluiu com sucesso nos jobs Rust e Web.
- Próximo batch liberado: M4.3C, fixture NarrativePlan compartilhada e integração do adapter com o WASM real. Ainda sem planner/modelo/TTS.

## M4.3C localmente validado — 2026-09-22
- Nova fixture `narrative_plan_content_v1.json` preserva a fixture narrativa histórica e referencia o ContentModel atual sem inventar conceitos.
- Rust fmt/test (26 testes)/clippy e Web STANDARD (82 testes/typecheck/build) passaram. `npm run wasm:build` passou; Vitest executou o WASM real, inclusive rejeição de provenance fabricada. QA independente não encontrou bloqueio.
- Publicação e CI deste batch ainda pendentes. Somente após CI verde iniciar `NarrativePlannerPort`/fake estruturado; TTS continua bloqueado.

## M4.3C concluído — 2026-09-22
- Commit `5b97d1fbcfd27df4a522907679afea9c52eabf18` publicado; workflow `quality` run `35803514527` concluiu com sucesso nos jobs Rust e Web.
- M4.3 A–C fecha plano/QA determinístico via Rust/WASM e adapter TS com fixture compartilhada. Claim grounding ainda requer revisão; QA não aprova claims automaticamente.
- Próximo passo autorizado: `NarrativePlannerPort` com fake determinístico e structured output validado pelo core; avaliar modelo local/golden real depois. TTS continua bloqueado até planner, source mapping e QA crítico passarem.

## M4.4A localmente validado — 2026-09-22
- `NarrativePlannerPort` e fake de fixture foram criados. O adapter valida a saída estruturada com schema e Rust/WASM, e retorna candidato com `qa: pending`; nenhum modelo real ou TTS foi conectado.
- Revisão QA apontou retorno prematuro de plano como P1; wrapper de candidato aplicado. Rust fmt/test (26), Web STANDARD (84 testes/typecheck/build) e diff check passaram.
- Publicação/CI pendentes. Próxima etapa após CI verde: decidir contrato de geração de roteiro/source mapping e QA crítico antes de avaliar modelo local real. Não iniciar TTS.
