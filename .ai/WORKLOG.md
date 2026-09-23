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
- Publicação: commits `827056a` e `e6097de` enviados a `origin/main`. GitHub Actions `quality` run `35730730855` do commit `e6097de` concluiu com sucesso (jobs Rust e Web definidos em `.github/workflows/quality.yml`). Estado local limpo antes deste registro.

## 2026-09-22 — M2 layout/ruído e verificação de browser
- PRE-FLIGHT atual registrado no TASK_PACKET com `main` limpo em `844cc48`; relatório RF-STR-007/M2 e ADR 0004 consultados.
- Decisão: agrupar runs adjacentes por EOL/posição, preservar `rawText` e ordem; marcar apenas candidatos de cabeçalho/rodapé quando texto exato se repetir em margens de pelo menos três páginas e 60% do total. Nenhum trecho é removido, confiança continua `null` e tipo incerto permanece `unknown`.
- Teste inicial: 20/20 Vitest, typecheck e build passaram (build exigiu repetição fora do sandbox por `spawn EPERM`).
- Browser real via agent-browser temporário revelou bug não coberto: mensagens internas PDF.js (`sourceName`, `targetName`, `action`, `data`) eram tratadas como erro, apagando status e encerrando Worker. Decoder de fronteira adicionado; três testes de regressão.
- Verificação após correção: 23/23 Vitest, typecheck e build passaram. Em sessão Chrome limpa, PDF sintético mostrou duas páginas e aviso `needs_ocr`; JSON enviado como entrada inválida mostrou erro tipado e não manteve prévia anterior. Screenshot completo inspecionado; `errors --json` retornou lista vazia na sessão limpa. Erros históricos anteriores eram da instrumentação temporária inválida e do HMR durante edição, não do fluxo final.
- Limites: página rotacionada não é classificada por margem; texto de documento real multicoluna e browser matrix não foram testados. PDF.js usa fake worker interno dentro do Worker do aplicativo; UI ficou responsiva no teste curto, sem benchmark de documentos grandes.

## 2026-09-22 — Ingestão v2 e política multiagente
- PRE-FLIGHT: ingestão/OCR e multiagente registrados no TASK_PACKET. O Lead permaneceu único writer; Explorer e QA atuaram read-only.
- Ingestão: adicionados DocumentIR v2 TS, migração explícita v1→v2, camadas `rawText`/`ocrText`/`reconstructedText`, proveniência/incerteza, conteúdo tipado para código/tabela/fórmula/visual, audit/project manifests e fixture v2.
- Policies testadas: OCR seletivo com escopo explícito e IDs normalizados; eviction LRU apenas de artefatos regeneráveis/desprotegidos, com validação numérica.
- PDF hardening: decoder separa mensagens internas do PDF.js do protocolo do aplicativo; limites de texto expandido e cancelamento cooperativo foram adicionados. Limite conhecido: `getTextContent()` pode alocar memória antes do corte e o `AbortSignal` não interrompe internamente o PDF.js.
- Arquitetura: ADRs 0008/0009, estratégia de testes, segurança e `GAP_ANALYSIS` classificam engines OCR/visual, storage físico, TTS e runtime narrativo como pendentes; schemas não foram descritos como engines funcionais.
- Multiagente: documentação oficial confirmou `.codex/agents/*.toml`; Codex CLI local `0.155.0-alpha.9.2` reportou `multi_agent` estável. Criados dez perfis e limite de três subagentes. Onze TOMLs parsearam com `tomllib`.
- Teste multiagente real: Explorer Terra/medium auditou configuração; QA Terra/medium revisou o change set; Lead integrou. QA encontrou incompatibilidade `region.type/content.kind`, fonte vazia, IDs OCR não normalizados e accounting inválido de eviction; todos foram corrigidos e rechecados. O risco de expansão PDF antes do limite permanece documentado.
- Limite de validação: perfis foram criados durante a sessão atual; descoberta automática pelo cliente requer nova sessão com o repositório confiável e não foi alegada como confirmada.
- Verificações Web finais: 41/41 Vitest, `npm run typecheck`, `npm run build` e `npm audit --audit-level=high` passaram; audit encontrou 0 vulnerabilidades.
- Verificações Rust: rustfmt 1.94.1 `--check` passou. `cargo test --workspace` baixou dependências, mas permanece `BLOCKED_TOOLING` por ausência local de `link.exe`; CI Linux é o gate executável após publicação.
- Publicação: commits `fb204ee`, `c7ab1dc` e `61c8d8e` enviados para `origin/main`; `git ls-remote` confirmou `61c8d8e3d2b60db9bcb78fb72ca34fe185442730` no remoto.
- CI: workflow `quality` run `35742455205` concluiu com `success` para `61c8d8e`, cobrindo os gates Rust e Web definidos no repositório.

## 2026-09-22 — M3.1 checkpoints IndexedDB e quota
- PRE-FLIGHT M3.1 registrado no TASK_PACKET. Lead foi o único writer; Explorer e QA atuaram read-only.
- Dependência de teste: `fake-indexeddb` 6.2.5 adicionada com versão exata; `npm audit --audit-level=high` retornou 0 vulnerabilidades.
- Contrato: schema v1 de checkpoint valida IDs, sequence, timestamps, pipeline, source hash, estados do `GenerationJob` e artifact keys. Fixture compartilhada confirma o wire format Web/Rust.
- Adapter: `IndexedDbCheckpointRepository` persiste por chave composta `projectId + sequence`, calcula checksum SHA-256, isola projetos, aceita repetição idempotente e rejeita conflito com conteúdo diferente.
- Recovery: `loadLatest` é estrito; `recoverLatest` devolve o checkpoint válido mais recente e lista registros rejeitados sem apagá-los. Busca é limitada a 1.000 candidatos; o limite só falha quando toda a janela é inválida e há histórico mais antigo.
- Resiliência: falha transitória de abertura limpa a conexão em cache e permite retry; `versionchange` fecha/invalida a conexão. Quota e pedido de persistência degradam para `unavailable`/`denied` sem bloquear leitura.
- Revisão independente encontrou dois P1: recovery bloqueava histórico grande e conexão rejeitada/fechada ficava cacheada. Ambos foram corrigidos. Last-write-wins também foi substituído por `CHECKPOINT_CONFLICT`.
- Limites: sem OPFS, lock/lease entre abas, retenção/limpeza física, integração runtime Rust/WASM, UI ou matriz real de browsers. Checksum detecta corrupção acidental, não adulteração same-origin.
- Verificações finais: 54/54 testes Web, typecheck, build, audit e rustfmt passaram. `cargo test --workspace` local continua `BLOCKED_TOOLING` por `link.exe`; CI Linux validará o fixture Rust após publicação.
- Publicação: commit `53d1418ed27b258601ff9e874d766b3a5da52b28` enviado para `origin/main`.
- CI: workflow `quality` run `35747894619` concluiu com `success`, incluindo testes Rust do fixture compartilhado e gates Web.

## 2026-09-22 — M3.2 OPFS, locks e retomada Web
- Retomada local preservou trabalho inacabado da sessão anterior em `codex/m3-persistence-resume`; nenhum reset foi necessário.
- OPFS: artefatos são nomeados por hash, verificados após escrita, validados na leitura, listados por namespace seguro e removidos explicitamente.
- Concorrência: `WebLocksProjectLock` usa lock exclusivo por projeto e preserva erros da operação protegida; lock ocupado/indisponível falha de forma tipada.
- IndexedDB foi elevado para versão 2, preservando `checkpoints` v1 e adicionando `artifacts`; manifests + checkpoint são publicados na mesma transação após OPFS validado.
- `LocalProjectPersistence` coordena persistência, sequência sob lock, inspeção de retomada, reconciliação de órfãos/ausentes e eviction física somente de artefatos regeneráveis/desprotegidos fora do projeto atual.
- Runtime Web passou a salvar PDF original + DocumentIR + checkpoint e tenta recuperar o projeto local mais recente com DocumentIR íntegro.
- Test tiers adicionados: `test:fast`, `test:standard`, `test:full`. FAST final passou 27/27 em 0,84 s; STANDARD final passou typecheck + 74/74 testes + build em 14,74 s.
- Nenhuma dependência mudou nesta fatia; audit completo não foi repetido localmente por política de risco. CI continua executando `npm audit --audit-level=high`.
- Browser smoke real: Chrome local importou a fixture PDF, persistiu PDF + DocumentIR, recarregou a página e exibiu “Seu último projeto foi recuperado neste dispositivo.” sem erros de página. O primeiro smoke revelou uma corrida de leitura com Web Locks sob React StrictMode; `inspectResume` foi tornado read-only sem lock exclusivo e o reload passou na repetição.
- Limites declarados: Edge/Firefox e matriz ampla, UI de seleção de múltiplos projetos, temporários por expiração e atomicidade cross-store sob queda de energia permanecem para hardening posterior.

## 2026-09-22 — M4.1 Narrative Quality determinístico
- Base confirmada: M3.2 foi fast-forward para `main` no commit `915ad6a`; o workflow `quality` em `main` concluiu Web e Rust com sucesso.
- Implementado `narrative_quality.ts` com normalização auditável, comparação heading↔corpo, detecção apenas para headings `announce`, reducer de memória narrativa compacta, detecção por frequência de aberturas formulaicas, validação de source refs e geração de QA determinístico.
- Política: overlap forte vira finding; overlap intermediário vira review; bordão repetido gera warning, não proibição automática; source ref ausente e heading anunciado duplicado impedem `pass`.
- Não foi implementada similaridade semântica por modelo nesta fatia; token overlap é sinal determinístico e casos incertos permanecem para review.
- Teste focado: 9/9 testes do novo módulo passaram; typecheck passou.
- STANDARD final: typecheck + 83/83 testes Web + build passaram em 16,94 s.
- Sem dependências novas e sem TTS/OCR/modelo externo.
- Próxima fatia M4: ContentModel/SemanticOutline + planner adapter estruturado e golden real quando o manual estiver disponível.

## 2026-09-22 — Correção de ownership Rust antes de ampliar M4
- Detectado desvio arquitetural: Rust continha principalmente DocumentIR v1/JobState, enquanto regras determinísticas de M4 estavam sendo implementadas em TypeScript.
- Criado ADR 0010 e regra persistente no AGENTS.md: domínio/invariantes canônicos em Rust; TypeScript para UI, browser APIs e adapters.
- Novos módulos Rust: `document_v2.rs`, `content.rs`, `narrative.rs`; novos testes de contrato em `crates/core/tests/domain_v2.rs`.
- DocumentIR v1→v2 foi retirado do schema TS e portado ao core Rust. Narrative Quality TS foi removido como implementação canônica.
- Fixtures `content_model_v1.json` e `semantic_outline_v1.json` são compartilhadas por Rust e schemas TS para reduzir drift de contrato.
- A fachada WASM agora expõe operações finas do core; wiring JS gerado ainda é etapa posterior.
- Web STANDARD passou: 74/74 testes, typecheck e build. Rust local não foi executado porque rustc/cargo não estão no PATH; CI é o gate real desta fatia.

## 2026-09-22 — M4 Rust ownership validado
- Branch `codex/m4-content-model` passou no GitHub Actions no commit `5807e79`: Rust format/test/clippy = success; Web audit/typecheck/test/build = success.
- O core Rust agora possui DocumentIR v2 e migração v1→v2, ContentModel, SemanticOutline, validação de NarrativePlan, memória/QA narrativos e source/provenance validation.
- Implementações canônicas equivalentes foram removidas do TypeScript; buscas por `migrateDocumentV1ToV2`, `buildNarrationQa`, `compareHeadingToBody` e `reduceNarrativeMemory` em `apps/web/src` retornaram vazio.
- TypeScript mantém schemas Zod de fronteira e adapters de browser; fixtures compartilhadas verificam compatibilidade estrutural.
- A fachada `audiobook-wasm` expõe funções finas do Rust, mas o bundle WASM ainda não está ligado ao runtime React; isso permanece próximo passo antes de ampliar planner/IA.

## 2026-09-22 — M4 integração Rust/WASM/Web
- Estado inicial: `codex/m4-content-model` limpa em `039b982`; handoff e ADR 0010 lidos antes das alterações. PRE-FLIGHT registrado no TASK_PACKET.
- Fachada Rust: exportadas migração v1→v2 e inspeção de unidades de fonte. O core continua responsável por migração, invariantes, ContentModel e SemanticOutline.
- Web: adapter TS fino carrega o módulo WASM real no Worker; protocolo valida os quatro contratos e identidade/hash na fronteira. PDF sem texto preserva DocumentIR v2, sem criar ContentModel/Outline fictícios.
- Persistência: checkpoint M4 referencia PDF, DocumentIR v1/v2 e, quando produzidos, ContentModel/Outline no OPFS. UI mantém a revisão do texto extraído. Nenhum planner, modelo ou TTS foi adicionado.
- Build: Rust 1.94.1 e `wasm-bindgen` 0.2.128 fixados; script regenera bindings Web versionados. CI recebeu gate de regeneração/paridade.
- Verificações locais: `npm run wasm:build` passou com toolchain GNU; `cargo fmt --all -- --check`, `cargo test --workspace --locked` (24 testes Rust) e `cargo clippy --workspace --all-targets -- -D warnings` passaram; `npm run test:standard` passou com 78/78 testes, typecheck e build; `npm audit --audit-level=high` encontrou 0 vulnerabilidades. O build incluiu asset WASM de aproximadamente 450 KB.
- Limite: teste visual não executado por orientação explícita. Browser integrado não acessou o servidor local durante tentativa anterior.
- Publicação: commit `ce48c3a` enviado para `origin/codex/m4-content-model`; `git ls-remote` confirmou o mesmo hash do HEAD local. CI remota ainda não verificada.
- CI dos commits `ce48c3a` e `d202bf8`: job Rust passou; job Web falhou na comparação byte a byte dos artefatos WASM regenerados em Linux com os versionados em Windows. O log público não expôs o arquivo divergente. Ajustado gate para comparar bindings JS/TypeScript, manter compilação e executar testes Web contra o WASM real gerado na CI; o binário permanece sem checagem de reprodutibilidade entre hosts.
- CI do commit `6b91326`: workflow `quality` run `35776236399` concluiu com sucesso após o ajuste. Todos os gates Rust/Web do workflow passaram.

## 2026-09-22 — checkpoint de retomada após revisão do estado remoto
- Fonte de verdade revisada pelo GitHub porque o Remote Desktop Commander estava offline nesta sessão.
- Branch `codex/m4-content-model` estava em `4fbb971`, com workflow `quality` verde; M4 Rust/WASM/Web já estava mais avançado do que o checkpoint local anterior.
- Confirmado: Worker usa o WASM real para migrar DocumentIR v1→v2 e produzir ContentModel/SemanticOutline; CI cobre Rust/Web e integração do bundle.
- Nenhum código de domínio foi alterado nesta sessão. Foi atualizado o handoff, o task packet seguinte e a gap analysis para impedir retrabalho/reexecução de M3/M4 runtime já concluídos.
- Próximo batch autorizado: M4.3 NarrativePlan/NarrationQA via Rust/WASM, sem LLM/TTS. Regeneração do WASM e todos os gates são obrigatórios antes de avançar.

## 2026-09-22 — M4.3A retomado e validado localmente
- Estado inicial confirmado: checkout local limpo em `codex/m4-content-model`, HEAD `c671945b303036314221c6ebb6eefffa2f822a7e`; GitHub Actions `quality` run `35778466312` concluído com `success` para esse commit.
- PRE-FLIGHT M4.3A registrado antes do código. O core ganhou uma entrada de QA que valida plano contra ContentModel/Outline, exige fala não vazia para cada seção e deriva source refs do ContentModel. A fachada WASM recebeu exportação JSON correspondente; um teste Rust cobre plano válido, fala incompleta e provenance inválida.
- Gate tentado: `cargo fmt --all && cargo fmt --all -- --check && cargo test --workspace --locked && cargo clippy --workspace --all-targets -- -D warnings`. Falhou imediatamente: `zsh: command not found: cargo` (exit 127). Busca nos locais de toolchain conhecidos deste ambiente não encontrou executáveis. Nenhum teste Rust executou.
- A toolchain Rust 1.94.1, target `wasm32-unknown-unknown`, `wasm-bindgen-cli` 0.2.128, Node 24.21.0 e dependências Web foram instaladas neste ambiente. As skills `context-mode`, `caveman` e `humanizer` foram instaladas; o MCP context-mode não aparece nesta sessão, mas seu CLI está disponível.
- Primeiro compile Rust detectou `serde_json` ausente nas dependências diretas da fachada WASM; corrigido `crates/wasm/Cargo.toml` e lockfile. `cargo fmt --all -- --check`, `cargo test --workspace --locked` (25 testes) e clippy com `-D warnings` passaram após a correção.
- A entrada QA contextual agora força `REVIEW` com `CLAIM_GROUNDING_NOT_EVALUATED` quando não há falha determinística, evitando sinalizar como aprovado um claim não analisado. Teste Rust cobre esse caso.
- `npm run wasm:build` regenerou bindings e binário. Primeiro STANDARD Web falhou em teste preexistente de Web Locks porque Node 24 disponibiliza `navigator.locks`; o teste agora remove essa API explicitamente. STANDARD repetido passou: typecheck, 78/78 testes e build.
- `git diff --check` passou. CI da publicação M4.3A ainda pendente; M4.3B, planner/modelo e TTS não iniciados.
- QA independente revisou o diff M4.3A sem achados P0/P1. Casos adicionais de `plan_id` vazio, fala em branco e seção extra foram incorporados; Rust fmt/test/clippy foram repetidos e passaram. Teste do export com WASM real está alocado no M4.3C.
- Publicação M4.3A: commit remoto `9f7aca594121b0488407c41f2b3c376086012c3b` na branch `codex/m4-content-model`; árvore idêntica ao commit local validado. O workflow `quality` run `35802591562` concluiu com `success` nos jobs Rust e Web. O checkout local foi alinhado ao commit remoto e ficou limpo.

## 2026-09-22 — M4.3B adapter narrativo Web
- Base: M4.3A no commit `9f7aca5`, CI Rust/Web verde. PRE-FLIGHT registrado no TASK_PACKET antes do código.
- `rust_wasm_runtime.ts` compartilha inicialização WASM entre os adapters de conteúdo e narrativa, com retry após falha. `rust_narrative_pipeline.ts` valida shape na fronteira, encaminha plano e falas ao core e valida o JSON de QA devolvido; não implementa QA ou deduplicação em TypeScript.
- Testes com port injetado cobrem encaminhamento, entrada inválida, rejeição do core, falha de inicialização e saída inválida. QA independente encontrou P1: serialização de fala circular/tipo inválido escapava como erro JS bruto. Corrigido com schema de registro de strings e erro tipado `INVALID_INPUT`; testes de regressão adicionados.
- STANDARD Web final passou: typecheck, 80/80 testes e build. `git diff --check` passou. Integração com bundle WASM real e fixture narrativa está reservada para M4.3C. CI do M4.3B ainda pendente; planner/modelo/TTS não iniciados.
- Publicação M4.3B: commit remoto `b03bd286aaaa373dcb4ed3e02c0e47bdae4f84df` na branch; checkout local alinhado e limpo. Workflow `quality` run `35803065588` concluiu com `success` para Rust e Web.

## 2026-09-22 — M4.3C fixture e integração WASM real
- Base: M4.3B publicado em `b03bd28`, CI Rust/Web verde. PRE-FLIGHT M4.3C registrado antes do código.
- Criada `narrative_plan_content_v1.json` compatível com o ContentModel/Outline compartilhados; contém source ref `r_1_1`, sem conceitos ou relações inventados. A fixture histórica `narrative_plan_v1.json` foi preservada.
- Teste Rust valida a fixture e executa QA contextual. Teste Vitest carrega `audiobook_wasm_bg.wasm` real, chama o adapter de plano/QA e confirma `REVIEW` por claim grounding não avaliado. Source ref fabricada atravessa schema TS e é rejeitada pelo core; o teste verifica a causa com o ref.
- Primeiro STANDARD falhou porque a nova fixture havia substituído a histórica usada por outro teste. Restaurada a original, criado arquivo distinto e repetidos os gates: Rust fmt/test (26 testes)/clippy, `npm run wasm:build`, Web STANDARD (82/82 testes, typecheck, build) e diff check passaram.
- QA independente não encontrou bloqueio; sugeriu assert da causa Rust, incorporado e verificado. CI do M4.3C ainda pendente. Planner/modelo/TTS não iniciados.
- Publicação M4.3C: commit remoto `5b97d1fbcfd27df4a522907679afea9c52eabf18` na branch; checkout local alinhado e limpo. Workflow `quality` run `35803514527` concluiu com `success` para Rust e Web. A fronteira NarrativePlan/QA pelo WASM real está TESTED nesse escopo.

## 2026-09-22 — M4.4A Planner Port com fake estruturado
- Base: M4.3C publicado em `5b97d1f`, workflow `quality` verde. PRE-FLIGHT registrado no TASK_PACKET antes do código.
- Criado `NarrativePlannerPort` Web com saída `unknown` estruturada. O adapter valida ContentModel/Outline e NarrativePlan na fronteira, chama o Rust/WASM real para provenance e devolve apenas `{kind: "candidate", qa: "pending", plan}`. Não existe caminho de TTS a partir desse retorno.
- `FixtureNarrativePlanner` em suporte de testes devolve a mesma fixture por chamada, sem implementar planejamento. Testes cobrem sucesso, contexto inválido, falha de port, shape inválido, source ref fabricada e documentos divergentes.
- QA independente encontrou P1: plano retornado diretamente poderia parecer aprovado antes do QA. Corrigido com wrapper de candidato/QA pendente. Sugestões P2 de fake reutilizável e teste cross-document também incorporadas.
- Gates locais finais: Rust fmt/test (26 testes), Web STANDARD (84/84 testes, typecheck, build) e `git diff --check` passaram. CI do M4.4A pendente; nenhum modelo real, prompt, persistência do plano ou TTS foi iniciado.
- Publicação M4.4A: commit remoto `f74229f42b54f32c4b0e471f66d0ca3e4c847208` na branch; checkout local alinhado e limpo. Workflow `quality` run `35804071973` concluiu com `success` para Rust e Web. O port/fake estruturado está TESTED nesse escopo, sem modelo real.

## 2026-09-22 — M4.4B contrato de roteiro e source mapping
- Base confirmada antes de editar: `codex/m4-content-model` limpa em `122e9b2`; GitHub Actions `quality` run `35804316448` concluído com `success` nesse HEAD. PRE-FLIGHT registrado no TASK_PACKET.
- Core Rust recebeu `NarrativeScript`, com seções e trechos ordenados, `displayText`, `speechText` e source refs por trecho. `from_json` valida estrutura; validação contextual exige o `planId` esperado, cobertura/ordem de seções e refs pertencentes à seção ou transição do plano, após validar plano e ContentModel/Outline.
- QA de roteiro agrega fala por seção e usa o QA determinístico existente. Heading anunciado duplicado resulta em `fail`; source mapping inválido é rejeitado. Claim grounding não foi avaliado e mantém `review` com aviso explícito. Referência estrutural não prova fidelidade semântica.
- WASM expõe `build_script_qa_json`; adapter TS espelha schema e classifica erros de entrada, inicialização, rejeição do core e saída inválida. Fixture e testes exercitam binário WASM real, incluindo ref de transição, ref fabricada e ID de plano divergente.
- Primeira revisão QA independente encontrou P1 na rejeição de refs de transição e no `planId` sem vínculo ao ID esperado. Ambos corrigidos. Segunda revisão não encontrou P0/P1; P2 futuro: vincular ID do plano persistido a conteúdo/provenance imutáveis.
- Gates locais finais: `cargo fmt --all -- --check`, `cargo test --workspace --locked` (28 testes), clippy com `-D warnings`, `npm run wasm:build`, `npm run test:standard` (88 testes, typecheck, build) e `git diff --check` passaram. CI após publicação ainda pendente neste registro.
- Sem modelo real, verificador semântico, golden mainframe real, geração de roteiro ou TTS. Próximo batch só após CI verde.
- Publicação: commit local `19d7693` criado; `git push` falhou por falta de autenticação HTTPS (`could not read Username for 'https://github.com'`). Não há `gh`, credential helper, token de ambiente ou sessão de navegador disponível. CI deste commit não executou. Stop condition aplicada; próximo batch não iniciado.

## 2026-09-23 — M4.4B publicado e CI verde
- Após configuração SSH pelo usuário, branch `codex/m4-content-model` e `origin/codex/m4-content-model` ficaram alinhados em `2aaa73124d52f6fda6e388a495529525e661cfe1`. GitHub Actions `quality` run `35806473115` concluiu com `success` nesse HEAD. O bloqueio de publicação anterior foi resolvido; M4.4C liberado.

## 2026-09-23 — M4.4C pacote de revisão por trecho
- PRE-FLIGHT registrado antes do código. `audiobook-core` constrói `ScriptReviewPacket` após validação de roteiro/plano/conteúdo: cada trecho recebe todas as unidades que correspondem às suas refs, preservando texto de análise opcional, incerteza, qualidade, elegibilidade e flags. Estado de cada trecho é `pending`; não há decisão automática.
- Pacote inclui `sourceHash` do documento e hashes SHA-256 de ContentModel, plano e roteiro serializados para detectar revisão desatualizada. Indexação por ref preserva ordem das unidades de fonte e evita varredura completa por trecho.
- WASM recebeu `build_script_review_packet_json`. Schema/adapter TS validam apenas a fronteira; testes Vitest usam WASM real e verificam texto, qualidade, hashes, alteração de roteiro e rejeição de ID de plano/fonte forjados. Texto importado não entra em logs.
- Primeira revisão independente encontrou P1: `ContentModel` aceitava `documentId` e `sourceHash` sem vínculo. Core agora exige `documentId == doc_<digest>`; regressões Rust/WASM cobrem hash divergente. Texto de análise vazio é rejeitado pelo Rust, e refs repetidas no mesmo segmento também. Segunda revisão não encontrou P0/P1.
- Gates locais finais: Rust fmt, `cargo test --workspace --locked` (30 testes), clippy `-D warnings`, regeneração WASM, Web STANDARD (90 testes/typecheck/build), `git diff --check`. Publicação/CI do M4.4C ainda pendentes neste registro. TTS continua bloqueado.
- Publicação M4.4C: commit `1c5394d1d5e783872502598955c5eef0d40dca36` enviado para `origin/codex/m4-content-model`. GitHub Actions `quality` run `35834617808` concluiu com `success`; jobs Rust e Web passaram. Branch local e remoto ficaram alinhados.
- Operação Git: `ssh-agent.socket` do usuário foi ativado e habilitado; `~/.ssh/config` aponta `IdentityAgent` ao socket. A chave foi desbloqueada pelo diálogo local e o push passou. A senha da chave não foi recebida pelo agente Codex nem registrada no repositório.

## 2026-09-23 — retomada remota e M4.4D local
- `git fetch` encontrou 13 commits novos em `origin/codex/m4-content-model` desde `4fbb971`; checkout limpo avançou por fast-forward até `88af119`. Página pública do GitHub Actions mostrou workflow `quality` run `35834973158` concluído com sucesso para esse HEAD. Handoff, task packet, worklog, ADR 0010 e contexto narrativo lidos antes do código; PRE-FLIGHT registrado.
- Core Rust recebeu submissão de decisão por trecho, validada contra pacote recalculado. IDs e hashes de fonte, conteúdo, plano e roteiro devem coincidir; todos os trechos exigem decisão única. `supported` exige evidência textual não bloqueada para cada source ref. Recibo inclui hash da submissão e `attestationStatus: unverified`; QA existente continua em `review`.
- WASM expõe `validate_script_review_submission_json`; adapter TS valida somente a fronteira e confere identidade dos hashes na resposta. Testes Rust e Vitest com WASM real cobrem submissão válida, stale, evidência fabricada, fonte sem texto e referência parcialmente coberta. Nenhum modelo, UI, persistência ou TTS foi conectado.
- Revisão independente encontrou P2 de cobertura parcial das referências. Corrigido no Rust com teste de evidência mista e no WASM real. Segunda revisão confirmou correção e não encontrou P0/P1; reviewer não executou Rust por ausência de Cargo em seu ambiente, mas o Lead executou Rust fmt/test/clippy localmente.
- Gates após a correção: `cargo fmt --all -- --check`, `cargo test --workspace --locked` (33 testes), clippy com `-D warnings`, `npm run wasm:build`, `npm run test:standard` (93 testes, typecheck, build) passaram. `npm audit --audit-level=high` encontrou 0 vulnerabilidades. Aviso PDF.js sobre `standardFontDataUrl` apareceu nos testes sem falha.
- `git diff --check` passou após a revisão. Publicação e CI M4.4D ainda pendentes neste registro. TTS bloqueado: não existe atestação confiável nem verificação semântica de claims; corpus/golden mainframe real indisponível.
- Publicação M4.4D: commit `28658f67c945ef7b9b450160e04beebd433b5e9f` enviado para `origin/codex/m4-content-model`; `git ls-remote` confirmou o hash. Workflow `quality` run `35856262003` concluiu com sucesso. A nota de pendência acima descreve o checkpoint local anterior.

## 2026-09-23 — M4.4E persistência local de revisão (checkpoint local)
- PRE-FLIGHT registrado antes do código, base limpa `47fbcda6` em `codex/m4-content-model`. ADR 0011 delimita persistência e atestação.
- Adapter Web salva submissão e recibo Rust/WASM em artefato OPFS `review_submission` fixado e não regenerável; manifest e checkpoint são publicados pelo fluxo local existente. Chave deriva do `submissionHash`. Checksum do checkpoint anterior evita gravação sobre mudança concorrente.
- Leitura confere manifest/checkpoint, integridade OPFS e revalida submissão no Rust/WASM contra dados atuais; recibo recalculado deve coincidir. `attestationStatus` continua `unverified`. Sem UI, QA `pass` ou TTS.
- Testes direcionados: 9/9 passaram; gate rápido atualizado: 30/30; Web STANDARD: 96/96, typecheck e build passaram. Rust: 33 testes passaram via toolchain GNU, fmt check e clippy `-D warnings` passaram. `npm audit --audit-level=high`: 0 vulnerabilidades. `git diff --check`: passou. Tentativa inicial Rust pelo PATH falhou por ausência de `cargo`; MSVC não tinha linker; reexecução com toolchain GNU funcionou. Teste inicialmente usou fixture com hash de fonte igual e depois um manifest inválido; corrigidos e reexecutados.
- Revisão independente e publicação/CI ainda pendentes neste checkpoint. Corpus mainframe real e método de atestação confiável seguem indisponíveis.
- Revisão independente apontou P1: contexto antigo poderia coincidir com a fonte sem o checkpoint identificar plano/roteiro ativos; P2: leitura poderia cruzar mudança concorrente de checkpoint. API de leitura passou a ser explicitamente histórica, retorna `currentness: not_established`, e reconsulta checksum antes do retorno. ADR 0011 explicita que aprovação exige persistir identidade ativa de plano/roteiro em etapa futura. Regressão de corrida e de contexto histórico adicionada.
- Após correções: Web STANDARD 97/97, typecheck e build passaram. Segunda revisão independente em andamento neste checkpoint.
- Segunda revisão confirmou a correção de contexto/race e apontou P1: leitura histórica ficava inacessível após troca da fonte ativa. Removida a exigência de presença no checkpoint atual; manifest fixado, integridade OPFS e revalidação contra contexto fornecido continuam obrigatórios. Teste com fonte ativa alterada e chave retirada do checkpoint passou. Gate rápido final: 31/31.
- Gate Web completo final após último ajuste: 97/97 testes, typecheck e build passaram. Rust não mudou neste batch; 33 testes, fmt e clippy já tinham passado. Publicação e CI permanecem para o passo seguinte.
- Commit M4.4E `c513744` publicado em `origin/codex/m4-content-model`; página pública de Actions confirmou `quality` run `35860380680` como `completed successfully`. Limites de atestação permanecem conforme ADR 0011.

## 2026-09-23 — M4.4F identidade narrativa ativa e corpus COBOL (validação local)
- Base limpa `cf4d66e9`, branch `codex/m4-content-model`; PRE-FLIGHT registrado antes de alterar código. Rust calcula `ActiveNarrativeIdentity` após validar contexto narrativo; inclui hashes de fonte, conteúdo, outline, plano e roteiro. WASM exporta contrato e validação de estado; TS espelha schema e opera IndexedDB/OPFS.
- Adapter Web publica uma identidade ativa por checkpoint sob checksum condicional, preserva manifests históricos e falha para identidade antiga, bytes corrompidos, múltiplos ativos e alteração concorrente. QA independente encontrou P2: troca podia conservar `READY_FOR_AUDIO` e áudio anterior. Correção: Rust exige `VERIFYING`; adapter rejeita referências a áudio ou manifest ausente antes de publicar; regressões Rust/Web e WASM real.
- Apostila COBOL do usuário: leitura local, 75 páginas A4, 599.696 bytes, texto extraível nas 75 páginas; SHA-256 e limites em `docs/INGESTION_TEST_STRATEGY.md`. Acentos estavam corretos em Unicode; exibição do terminal causou aparência de corrupção. PDF não foi copiado para o repositório. Não há golden narrativo nem avaliação end-to-end desse documento.
- Gates locais finais: `cargo test --workspace --locked` (35 testes), `cargo fmt --all -- --check`, clippy `-D warnings`, `npm run wasm:build`, `npm run test:standard` (103 testes, typecheck e build), `npm audit --audit-level=high` (0 vulnerabilidades) e `git diff --check` passaram. Primeira tentativa de Vitest no sandbox falhou com `spawn EPERM`; repetição autorizada para subprocessos passou. CI remoto não confirmado neste registro.
- Limites: nenhum vínculo de revisão ao ponteiro ativo, nenhuma atestação confiável, nenhuma avaliação semântica com goldens, nenhum TTS ou UI. Próximo batch após publicação/CI: vincular revisão histórica à identidade ativa com invalidação explícita, sem atribuir `verified` automaticamente; definir política de atestação e casos esperados do corpus antes de TTS.
- Segunda revisão independente read-only confirmou a correção da retenção de estado/áudio, sem novo P0/P1/P2; não executou os gates. O Lead executou e conferiu os resultados acima.

## 2026-09-23 — M4.4G vínculo versionado de revisão ativa (validação local)
- Base limpa `a868dc36`, branch `codex/m4-content-model`, remoto alinhado; workflow `quality` run `35864829680` do M4.4F verde. PRE-FLIGHT registrado antes do código. Rust passou a calcular `bindingHash` de identidade ativa completa e `submissionHash`, revalidando a submissão no mesmo contexto. Export WASM usa entrada JSON tipada; schemas e adapters TS permanecem na fronteira.
- `saveForActive` grava envelope de revisão v2 fixado no OPFS, com chave derivada do vínculo. Leitura histórica v1 permanece `not_established`; v2 reconfere vínculo, recibo e integridade. Avaliador separado retorna `bound_unverified` somente quando o vínculo persistido corresponde à narrativa ativa, com segunda checagem do checksum após ler ambos os artefatos. Não há atestação humana, QA `pass`, UI ou TTS.
- Revisão QA independente inicial encontrou falta de vínculo com outline, janela de corrida e colisão de chave para submissão idêntica em outlines diferentes. Corrigidos no contrato v2 e com regressões Rust/WASM/Web. Revisão read-only posterior não encontrou novo P0/P1/P2. O revisor não executou testes.
- Segundo manual COBOL/CICS do usuário: SHA-256 `58b839407977f054bcc36c6ea42d4f423eb73b40c6937c83655420bf654926c8`; 105 páginas, 1.066.609 bytes. PyMuPDF extraiu 488.556 caracteres, incluindo 36.111 na área privada Unicode em todas as páginas. Página 27 renderizada tinha prosa e código legíveis, com sobreposição visual em parte da lista/rodapé. Arquivo mantido fora do repositório; nenhum OCR ou golden semântico foi executado. Registrado como corpus local de texto suspeito.
- Gates finais locais: `cargo fmt --all -- --check`, `cargo test --workspace --locked` (36 testes), clippy `-D warnings`, `npm run wasm:build`, `npm run test:standard` (107 testes, typecheck, build), `npm audit --audit-level=high` (0 vulnerabilidades) e `git diff --check` passaram. Clippy inicialmente rejeitou APIs com oito parâmetros; agrupamentos `ReviewBindingReference` e JSON de fronteira corrigiram o aviso. Publicação e CI ainda não confirmados neste registro.
- Próximo passo após CI verde: definir atestação confiável vinculada ao `bindingHash` e `submissionHash`, sem confundir autenticação com revisão semântica; selecionar páginas/expectativas dos dois PDFs para avaliação de fidelidade e tratar camada de texto suspeita antes de narração. TTS permanece fechado.
