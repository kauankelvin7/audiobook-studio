# Runtime Rust/WASM no Web

Status: M4 integração implementada, testada localmente com o módulo WASM real e publicada na branch `codex/m4-content-model`; workflow `quality` verde no commit `6b91326`.

O Worker extrai DocumentIR v1 com PDF.js. O adapter `rust_content_pipeline.ts` inicializa o módulo `audiobook-wasm` gerado, valida a entrada na fronteira TS e chama, em ordem, `migrate_document_v1_to_v2_json`, `validate_document_v2_json`, `document_v2_has_source_units_json` e, quando há unidades, `build_content_model_json` e `build_semantic_outline_json`. O `audiobook-core` define migração, invariantes e transformações. TS valida o JSON que cruza a fronteira e o protocolo do Worker confere a identidade do documento e o hash da fonte.

O resultado só é enviado à UI depois de toda a cadeia aplicável concluir. A persistência local mantém o PDF original e DocumentIR v1 para retomada existente, além de DocumentIR v2 e, quando disponíveis, ContentModel e SemanticOutline como artefatos regeneráveis no OPFS. O checkpoint referencia apenas os artefatos produzidos. PDF sem texto mantém a página para revisão/OCR, sem fabricar Outline vazio. Falha no carregamento WASM ou rejeição pelo core retorna erro tipado; nenhum checkpoint novo é gravado para aquela importação.

## Build reproduzível

O repositório fixa Rust 1.94.1 em `rust-toolchain.toml` e `wasm-bindgen` 0.2.128 em `Cargo.lock`. Instale `wasm-bindgen-cli` 0.2.128 com Cargo, e execute `npm run wasm:build` em `apps/web`. O script compila `audiobook-wasm` para `wasm32-unknown-unknown` e gera bindings `--target web` em `apps/web/src/generated/audiobook_wasm`. Esses arquivos são versionados para permitir `npm run build` sem toolchain Rust no consumidor. A CI regenera o módulo e verifica paridade dos bindings JS/TypeScript; o binário gerado pode variar entre hosts e é exercitado pelos testes Web com WASM real.

O teste `rust_content_pipeline.test.ts` carrega o arquivo `.wasm` real, executa a migração v1, preserva uma página sem texto e compara DocumentIR v2, ContentModel e SemanticOutline às fixtures compartilhadas. Testes Rust verificam as mesmas fixtures no core. O build Vite inclui o `.wasm` como asset do Worker. Teste visual não foi executado nesta etapa, conforme orientação do usuário.

Limites: PDF.js permanece responsável por extração v1; páginas sem texto seguem como `no_text`/revisão. O skeleton de outline não é um planner semântico. Nenhum modelo, TTS ou geração de áudio é iniciado nesta etapa.
