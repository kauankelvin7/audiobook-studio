# Runtime Rust/WASM no Web

Status: M4 integração implementada e testada com o módulo WASM real na branch `codex/m4-content-model`; workflow `quality` verde no commit M4.4D `28658f6`.

O Worker extrai DocumentIR v1 com PDF.js. O adapter `rust_content_pipeline.ts` inicializa o módulo `audiobook-wasm` gerado, valida a entrada na fronteira TS e chama, em ordem, `migrate_document_v1_to_v2_json`, `validate_document_v2_json`, `document_v2_has_source_units_json` e, quando há unidades, `build_content_model_json` e `build_semantic_outline_json`. O `audiobook-core` define migração, invariantes e transformações. TS valida o JSON que cruza a fronteira e o protocolo do Worker confere a identidade do documento e o hash da fonte.

O resultado só é enviado à UI depois de toda a cadeia aplicável concluir. A persistência local mantém o PDF original e DocumentIR v1 para retomada existente, além de DocumentIR v2 e, quando disponíveis, ContentModel e SemanticOutline como artefatos regeneráveis no OPFS. O checkpoint referencia apenas os artefatos produzidos. PDF sem texto mantém a página para revisão/OCR, sem fabricar Outline vazio. Falha no carregamento WASM ou rejeição pelo core retorna erro tipado; nenhum checkpoint novo é gravado para aquela importação.

## Build reproduzível

O repositório fixa Rust 1.94.1 em `rust-toolchain.toml` e `wasm-bindgen` 0.2.128 em `Cargo.lock`. Instale `wasm-bindgen-cli` 0.2.128 com Cargo, e execute `npm run wasm:build` em `apps/web`. O script compila `audiobook-wasm` para `wasm32-unknown-unknown` e gera bindings `--target web` em `apps/web/src/generated/audiobook_wasm`. Esses arquivos são versionados para permitir `npm run build` sem toolchain Rust no consumidor. A CI regenera o módulo e verifica paridade dos bindings JS/TypeScript; o binário gerado pode variar entre hosts e é exercitado pelos testes Web com WASM real.

O teste `rust_content_pipeline.test.ts` carrega o arquivo `.wasm` real, executa a migração v1, preserva uma página sem texto e compara DocumentIR v2, ContentModel e SemanticOutline às fixtures compartilhadas. Testes Rust verificam as mesmas fixtures no core. O build Vite inclui o `.wasm` como asset do Worker. Teste visual não foi executado nesta etapa, conforme orientação do usuário.

Na etapa M4.3, o core também valida NarrativePlan contra ContentModel/Outline e produz NarrationQA determinístico. O adapter `rust_narrative_pipeline.ts` valida contratos na fronteira e chama os exports WASM; a fixture `narrative_plan_content_v1.json` é verificada por Rust e por teste Vitest com o binário real. Como claim grounding ainda não foi implementado, esse QA retorna `review` mesmo quando os checks determinísticos não encontram falha. O adapter narrativo ainda não está ligado à UI ou a um modelo de planner.

Em M4.4C, `build_script_review_packet_json` reúne evidência de fonte por trecho do roteiro validado. O adapter Web valida apenas o contrato de entrada/saída e testes executam o WASM real. O pacote permanece com revisão `pending`; não há decisão de aprovação, persistência ou liberação de TTS.

Em M4.4D, `validate_script_review_submission_json` valida no core uma submissão contra o roteiro, plano, conteúdo e outline atuais. A fronteira Web confere o contrato e a identidade dos hashes devolvidos. O recibo inclui o hash da submissão e status `unverified`. O export não autentica o autor, não persiste o resultado e não aprova claims ou TTS.

Em M4.4F, `build_active_narrative_identity_json` expõe hashes canônicos de fonte, conteúdo, plano e roteiro, além de `identityHash`. O adapter Web pode publicar essa identidade no checkpoint local. O ponteiro ativo não aprova a revisão nem altera o estado de QA; a integração ao fluxo de edição segue pendente (ADR 0012).

Limites: PDF.js permanece responsável por extração v1; páginas sem texto seguem como `no_text`/revisão. O skeleton de outline não é um planner semântico. Nenhum modelo, TTS ou geração de áudio é iniciado nesta etapa.
