# Worklog

## 2026-09-21 — Milestone 0 bootstrap
- Fato: o repositório de trabalho continha somente `outputs/` e `work/`.
- Fato: os arquivos `MASTER_ENGINEERING_REPORT.md`, `AGENTS.md`, `PROMPT_MESTRE_CODEX.md` e `Audiobook_Studio_Engineering_Package.zip` não foram encontrados no workspace.
- Decisão: inicializar um monorepo local-first mínimo, sem microserviços nem backend obrigatório.
- Decisão: manter `AGENTS.md` enxuto e usar `docs/CONTEXT_INDEX.md` para roteamento de contexto.
- Alterações: adicionados workspace Cargo, crate de domínio, crate WASM, PWA React/Vite, schemas, workers, adapters, tokens, ADRs, hooks e CI.
- Verificação: `git init` executado somente neste diretório porque não havia repositório local.
- Verificação inicial: Node `v24.0.2` e npm `11.19.1` disponíveis; Cargo/Rust não estavam no PATH. A inspeção posterior encontrou Cargo em `.rustup/toolchains/`.
- Verificação inicial: gates Rust não foram executados; gates Web dependiam de instalação e lockfile. O estado foi atualizado na seção de publicação abaixo.
- Verificação: `npm install` gerou `apps/web/package-lock.json`; instalação reportou vulnerabilidades transitórias, e `npm audit --audit-level=high` subsequente retornou 0 vulnerabilidades.
- Verificação: `npm run typecheck` passou.
- Verificação: `npm run build` passou após execução fora do sandbox; a primeira tentativa falhou com `spawn EPERM` do esbuild no sandbox.
- Verificação: revisão do estado local confirmou somente arquivos do projeto como não rastreados; nenhum arquivo pessoal fora do workspace foi alterado.
- Risco: o bootstrap contém contratos mínimos, não implementa parsing PDF, IA, TTS, persistência ou backend.
- Próximo passo registrado no bootstrap: preparar toolchain Rust, dependências Web e DocumentIR com fixtures reais. Dependências e lockfile Web foram preparados depois.

## 2026-09-22 — Publicação do Milestone 0
- Fato: os anexos originais chegaram após o bootstrap. SHA-256: relatório `AB266DE588DC388FA214526829BCD0A7813A3C20E871278B8492C2F73708A1FF`; AGENTS original `295BEC9DF5B5FE88C0A9D8CB26D2E2DFF00C2CE631FA4FA14F8A00D8C10DDAEC`; prompt `EA2932481C16434D54EAEC5109B235D9B87990D020B0858D84E6B41464091085`.
- Fato: `git ls-remote` do repositório informado retornou sem referências; publicação inicial pode usar `main`.
- Decisão: preservar os três arquivos originais em `audiobook_studio_engineering/`, com `AGENTS_SOURCE.md` para evitar instrução automática duplicada; manter `AGENTS.md` da raiz enxuto.
- Decisão: CI Web usa `npm ci` e cache baseado no lockfile.
- Fato corrigido: Cargo 1.94.1 está instalado no toolchain, mas fora do PATH. `cargo fmt` não está disponível e `cargo test --workspace` baixou dependências, gerou `Cargo.lock`, mas parou por falta do linker MSVC `link.exe`.
- Correção de contrato: schema TypeScript aceita `title: null`, como o `Option<String>` serializado pelo Rust; worker responde erro explícito enquanto não houver adapter PDF.
- Verificação: `npm run typecheck` passou em 2026-09-22.
- Verificação: `npm run build` passou em 2026-09-22.
- Verificação: `npm audit --audit-level=high` retornou 0 vulnerabilidades.
- Verificação Rust: `cargo fmt` indisponível (componente rustfmt ausente); `cargo test --workspace` parou antes dos testes por falta do linker MSVC `link.exe`. O lockfile Rust foi gerado e deve ser versionado.
- Publicação: commit inicial `48c79cc54d74681e2523308537c6f9e490fde461` enviado para `origin/main`; `git ls-remote` confirmou o mesmo hash no remoto.

## 2026-09-22 — Correção do CI inicial
- Fato: o workflow `quality` falhou em `npm audit --audit-level=high` e `cargo fmt --all -- --check` nos primeiros dois commits publicados.
- Causa Web: Vite 5.4.10 e esbuild transitivo tinham avisos ativos no npm registry. O audit local anterior em sandbox havia retornado 0 sem refletir esses avisos; a consulta com rede confirmou as vulnerabilidades.
- Correção Web: Vite 8.3.0 e `@vitejs/plugin-react` 6.1.1, com lockfile atualizado. Os peers opcionais do plugin foram conferidos no registro npm.
- Correção Rust: formatados os arquivos com rustfmt 1.94.1 oficial; pacote baixado para `work/` e verificado por SHA-256 antes do uso.
- Verificações locais: `npm ci`, `npm audit --audit-level=high`, `npm run typecheck`, `npm run build` e rustfmt `--check` passaram.
- Limite local: `cargo test --workspace` continua bloqueado pela ausência de `link.exe`; o job Rust do GitHub Actions deve executar os testes após a correção de formatação.

## 2026-09-22 — M1/M2 em andamento
- Estado inicial: `main` limpo em `54b2c59`; CI do bootstrap concluído com sucesso.
- PRE-FLIGHT: registrado em `.ai/TASK_PACKET.md`; M1 será validado antes da implementação do M2.
- Diretriz do usuário: a skill `humanizer` passa a ser obrigatória para textos do frontend; layout segue design tokens e acessibilidade.
- M1 implementado: DocumentIR v1 com páginas/blocos/unknown/OCR, SHA-256 e ID de documento derivados da fonte, validação de integridade, manifest/cache key, job com transições e retomada explícitas, fixture compartilhado e ADR 0004.
- Verificações locais M1: rustfmt `--check`, `npm test` (4 testes), `npm run typecheck`, `npm run build` e `npm audit --audit-level=high` (0 vulnerabilidades) passaram. Testes Rust e clippy aguardam CI por falta de `link.exe` local.
- Revisão: confiança é `null` quando não medida, `documentId` usa o digest SHA-256 completo e páginas com blocos exigem texto bruto para auditoria.
- CI M1: workflow `quality` do commit `a0de960` concluiu com sucesso, incluindo os gates Rust em Linux.

## 2026-09-22 — M2 inicial e adendo de narração/performance
- Evidência M2: PDF.js oficial `getDocument`/`getTextContent`; npm registry confirmou versões/engines. A 6.3.289 falhou no teste Node local por `Uint8Array.toHex`; 5.4.296 com build legacy passou em fixture real de duas páginas. A correção foi escolher versão compatível, sem polyfill artificial.
- Decisão M2: manter extração local em Worker, limite 32 MB/500 páginas, hash fonte, blocos `unknown` e confiança `null`; página sem texto permanece `needs_ocr`. Heurísticas de layout/noise e OCR ainda pendentes.
- Fixture PDF sintético foi gerado com reportlab, inspecionado via `pdfinfo`/render; primeira página contém texto legível e segunda é vazia. Renderização teve avisos de fontes opcionais Symbol/ArialUnicode, sem defeito visível na página 1.
- Diretriz humanizer aplicada à microcopy da tela de importação; o conteúdo PDF é mostrado como texto React, não HTML.
- Pedido complementar do usuário: problemas narrativos/performance reportados do primeiro audiobook, sem áudio/mainframe anexado. PRE-FLIGHT em TASK_PACKET; identificados gaps entre DocumentIR→ScriptAdapter e seleção fixa de TTS.
- Decisão: ADRs 0005/0006 e adendo normativo formalizam planner, memória, políticas de heading, QA pré-TTS, engine router, TTFA, geração progressiva/lazy e limites reais de background Web. Contratos/fixtures iniciais testam fronteiras, não funcionalidades ainda inexistentes.
- Pendências: teste de browser end-to-end, heurísticas PDF M2, golden mainframe real (arquivo não recebido), implementação M3–M5 e benchmarks/dispositivos.
- Browser smoke tentado: servidor Vite subiu em `localhost:5173`, mas `agent-browser` não está instalado e a aba do navegador integrado não anexou (timeout). Não há evidência de importação end-to-end no browser; servidor local foi encerrado.
- Verificações finais: `npm test` (14/14), `npm run typecheck`, `npm run build`, `npm audit --audit-level=high` (0 vulnerabilidades) e `git diff --cached --check` passaram. PDF fixture foi marcado binário em `.gitattributes` para impedir conversão CRLF.
- Commit da importação inicial: `827056a` (`feat(pdf)`). O M2 ainda não está concluído; classificação layout/noise e smoke de navegador faltam.
- Segundo pedido de performance: especificou `auto | fast | quality` na UI, tier técnico `balanced` interno, RTF com convenção geração/duração, TTFA cold/warm, estados independentes playback/export, política de voz para fallback, JIT/backpressure e fases. A arquitetura staged foi alinhada; ADR 0006 atualizado e ADR 0007 criado sem alterar snapshots Rust v1.
- `docs/PERFORMANCE_REQUIREMENTS.md` enumera requisitos PERF-01..12, estratégia de fakes/benchmark/matriz e o que ainda é apenas designed. Contratos `EnginePlan`/benchmark/estados foram ampliados; profiler/router/TTS/player não foram implementados nesta execução.
- Gates após o segundo pedido: `npm test` 16/16, `npm run typecheck`, `npm run build` e `npm audit --audit-level=high` (0 vulnerabilidades) passaram. Rust não mudou e seguirá validado no CI Linux; teste local ainda depende de linker MSVC ausente.
