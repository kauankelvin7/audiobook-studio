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
