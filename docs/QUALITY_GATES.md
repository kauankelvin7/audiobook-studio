# Quality gates

Gates obrigatórios quando as ferramentas existirem no ambiente:

```text
cargo fmt --all -- --check
cargo test --workspace
cargo clippy --workspace --all-targets -- -D warnings
cd apps/web && npm run typecheck
cd apps/web && npm test
cd apps/web && npm run build
```

Falhas de ferramenta ausente devem ser registradas como `BLOCKED_TOOLING`, não convertidas em sucesso.

Ingestão v2 exige contract tests para preservação das camadas `rawText`/`ocrText`/`reconstructedText`, proveniência/incerteza, tabelas, fórmulas, conteúdo visual, migração v1→v2, decisão de OCR seletivo e eviction sem perda de artefatos protegidos. Engines ausentes permanecem `SCAFFOLDED`, mesmo com schemas aprovados.

Configuração multiagente exige TOML parseável, limite máximo de três subagentes e perfis read-only para exploração/revisão. A descoberta de novos perfis pelo cliente só pode ser marcada como confirmada após uma nova sessão confiável carregar `.codex/config.toml`.

Contratos narrativos/performance v1 possuem fixtures e testes de schema em `apps/web/src/schemas/architecture.test.ts`; isto não comprova planner, QA ou TTS funcional. Quando implementados em M4/M5, os gates adicionais incluem `duplicated_spoken_heading_count = 0`, source mapping e claims críticos, relatório QA local/global, fallback testado, resume/cache e TTFA/RTF medidos em perfis de dispositivo. Limiares de performance só serão fixados com benchmarks reproduzíveis; não usar score subjetivo como prova.
