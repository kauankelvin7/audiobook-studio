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
