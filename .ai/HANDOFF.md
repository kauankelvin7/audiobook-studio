# HANDOFF — retorno ao Codex Work

## Estado do redesign Dark/Glass após implementação estrutural
- `b3c3bee`: tokens e CSS Studio Dark/Glass aplicados sem alteração de domínio.
- `cee7e78`: DESIGN_SYSTEM e PRODUCT_UX_BASELINE alinhados à nova decisão.
- `da73c7a`: leitor ganhou modos Texto/Original; Original usa o `source_pdf` persistido e `pdfjs-dist` em chunk lazy.
- `79b3a3d`: `motion.css` adiciona feedback/transições preservando reduced-motion e forced-colors.
- `88868d0`: contrato do seletor do leitor e correção de warning dark adicionados.
- CI dos quatro primeiros commits do redesign concluiu com sucesso; validar o HEAD mais recente antes de nova edição.

## Redesign Studio Dark/Glass — 2026-09-24
- Decisão explícita do autor: Studio & Paper foi substituído por tema escuro iOS/glass. Não reverter para paleta clara.
- Canvas/sidebar: `#0B0D12`; surface: `#14171E`; accent: `#3F8CFF`; glass e hairlines translúcidos definidos em `tokens.css`.
- Glass é aplicado a project bar, sidebar project card, review dock, navegação móvel e diálogos; documento/roteiro usam superfícies escuras opacas para legibilidade.
- Acessibilidade anterior permanece obrigatória: foco, 44 px touch, tabs por teclado, reduced-motion e forced-colors.
- Referência visual de aceite passa a ser a imagem escura iOS/glass da tarefa atual.

## Frontend Studio & Paper — refatoração estrutural (2026-09-24)

- Base funcional preservada: importação PDF, revisão OCR, aprovação nativa/canônica, narrativa aprovada, áudio literal/narrativo, capítulos, exportação e reload continuam no mesmo pipeline. Esta rodada alterou UI/estrutura React, não domínio Rust, schemas canônicos ou persistência.
- A tela de Revisão agora usa um `ReviewBottomDock` próprio. Narrativa, Áudio e Exportar não são mais painéis completos comprimidos por CSS.
- Narrativa foi separada em outline, editor, fonte/proveniência e conferência. A microcopy não expõe `SpeechUnits`, claims/headings ou códigos de QA como linguagem principal.
- OCR foi separado em target picker, comparação, memória local, formulário de decisão, conteúdo Nativo/Reconciliado e histórico. `unknown` continua no domínio e aparece na UI como “Texto não classificado”.
- As abas Nativo/OCR/Reconciliado/Histórico agora são tabs semânticas, com `aria-selected`, `aria-controls`, roving tabindex e teclado Left/Right/Home/End.
- Áudio foi dividido em `AudioWorkspace`, `AudioHistory`, `CompleteAudiobookPanel`, `LiteralReadingPanel`, `AudioPlayer` e `ChapterList`.
- `main.tsx` contém apenas bootstrap React/fontes/CSS; orquestração está em `App.tsx`. Hooks independentes: `useLocalSpeechPlayer` e `useApprovedNarrativeRecord`.
- CSS novo está separado em `review.css`, `narrative.css` e `accessibility.css`; `shell.css` mantém o layout legado/base. Não fazer nova pilha de overrides com `!important`.
- Acessibilidade: foco visível global, targets de 44 px para pointer coarse, reduced motion reforçado, forced-colors básico e estados sempre acompanhados de texto.
- Testes de contrato de UI em `ui_contracts.test.tsx` cobrem tablist/ARIA, linguagem de OCR, dock e capítulo ativo. `presentation_labels.test.ts` protege o mapeamento `unknown -> Texto não classificado`.
- Gates verdes confirmados nos commits intermediários até `acf4c63`: Rust fmt/test/clippy e Web wasm build/audit/typecheck/tests/build. Os commits de microcopy/a11y posteriores devem ser considerados pendentes até o workflow do HEAD concluir.
- NÃO foi feita comparação visual real 1440×960/390×844 nesta sessão porque o Desktop Commander estava offline e não havia projeto Vercel importado. Não declarar fidelidade visual final.
- Próxima ação recomendada: abrir a branch no navegador, comparar `#review` com a referência aprovada, ajustar somente proporções/density/spacing que divergirem e então repetir em 390×844. Evitar reabrir core/backend sem bug funcional reproduzido.

## Product UX — foundations e shell (2026-09-24)
- Baseline funcional: literal e narrativo E2E, capítulos, player, download, reload e bloqueio OCR aprovados no checkpoint anterior; ver `docs/PRODUCT_UX_BASELINE.md`.
- Batch atual: tokens Studio & Paper, shell desktop/mobile, estados vazios e mensagens de erro em português. Core, TTS e player preservados.
- Validação em andamento: typecheck passou; shell sem overflow em 1440, 390 e 320 px. Repetir suíte Web, build e smokes após ajustes de texto.
- Próxima ação: aprofundar Projeto/Documento e Revisão com dados reais; empacotar fontes locais e completar acessibilidade.

## Release vertical — narrativa aprovada no mesmo caminho de áudio (2026-09-24)
- PDF de duas páginas gerou dois modos no Chrome: literal e narrativo, ambos com capítulos, player, download e reload. A saída narrativa deriva de texto nativo aprovado, ContentModel/Outline/Plan/Script/QA, revisão de todas as fontes e SpeechUnits validados em Rust; TTS e player são os mesmos do modo literal. Correção OCR de região também percorreu até WAV e reload.
- Artefatos do smoke narrativo estão em `pros/outputs` da tarefa atual: WAV, manifesto, roteiro/source mapping/QA. Gates locais: Rust fmt/49 testes, Web typecheck/157 testes/build, ambos os smokes passaram. O modelo Piper é baixado dos endpoints existentes no primeiro uso.
- Limites remanescentes: a redação narrativa é editada e confirmada por humano; o rascunho inicial é literal. `QA=review` por grounding não avaliado automaticamente; o operador atesta localmente, sem autenticação de identidade. OCR de várias regiões aprovadas ainda não se compõe numa revisão canônica única. Não declarar o sistema pronto para produção sobre documentos reais sem golden e escuta humana.

## Release closure — exportação integral literal (2026-09-24)
- Produto gerou WAV único de PDF de duas páginas no Chrome, tocou, navegou capítulos, baixou WAV + manifesto e reabriu após reload. O arquivo exportado está em `pros/outputs` da tarefa atual. Chunks por página reutilizam OPFS/checkpoints existentes; páginas sem leitura Rust válida bloqueiam a síntese antes do primeiro chunk.
- Gates: Rust fmt/47 testes, Web typecheck/157 testes/build e smoke Chromium passaram. Próximo elo: revisão OCR atestada, reconciliação canônica e ligação de ContentModel/roteiro ao TTS. O WAV atual é leitura literal; não declarar narrativa final ou OCR reconciliado.

## M4.5O — memória local de ambiguidades OCR (2026-09-24)
- Correções explícitas podem criar regras locais para tokens técnicos nos pares `0/O`, `1/I/L`, `5/S` e `8/B`. Rust deriva e valida o registro; IndexedDB guarda apenas hashes e pares de tokens. Três evidências OCR distintas, sem empate, são necessárias para uma sugestão `review_required`.
- A tela atualiza um modelo determinístico em lote, persistido com hashes das evidências e `modelHash`; OCR consulta somente esse snapshot. O smoke Chromium cria os registros, salva/relê o modelo e confirma sugestão sem rede externa.
- A interface exige ação explícita para usar o texto sugerido e para salvar uma correção na memória. Nenhuma sugestão muda candidato, DocumentIR, leitura ou TTS. ADR 0025 e estratégia de teste registram o contrato e os limites.
- Gates: Rust 47/fmt, WASM, Web typecheck/155 testes/build e smoke Chromium Rust/WASM/IndexedDB sem rede externa passaram. Três revisões da mesma evidência não contam para o limiar; limpeza total confirmada e remoção por hash existem. Próximo marco: corpus público em português, goldens revisados, métricas de falso positivo e retenção da memória; não avaliar ONNX/fine-tuning antes dessas evidências.

## M4.5M — OCR de página sem texto nativo (2026-09-24)
- Página `no_text` sem regiões ou texto usa alvo reservado `__page__` validado pelo Rust. PDF.js captura página inteira sob limites; evidência salva e relida confere geometria, dimensões e fonte PDF. UI permite revisar o OCR como `unverified`, sem `keep_native`, sem alterar DocumentIR ou liberar TTS. ADR 0024.
- Smoke funcional Chromium com PDF sintético só de imagem cobriu captura, Tesseract, recibo Rust/WASM, persistência, recarga e revisão histórica, sem requisições externas observadas. Verificações completas e publicação estão registradas no WORKLOG.
- Próximo marco: goldens reais revisados para prosa/código, política de identidade/atestação e reconciliação canônica Rust antes de qualquer promoção de OCR para narração. Não declarar conteúdo digitalizado como aprovado por este smoke.

## M4.5L — interface local de revisão OCR (2026-09-24)
- O app permite escolher uma região com texto nativo e bbox, gerar OCR local a partir do PDF salvo (até 8 MB), comparar recorte/nativo/candidato/tokens, registrar decisão `unverified` e reabrir o histórico validado após recarga. Texto original permanece intacto e OCR não habilita leitura/TTS.
- Cancelamento vale até o commit da evidência; durante a publicação OPFS/IndexedDB, a UI bloqueia cancelamento/importação. Caracteres de controle invisíveis são marcados na tela sem mudar bytes/hashes. O fluxo OCR é carregado sob demanda para preservar o bundle inicial.
- Gates locais: Rust fmt/45 testes/Clippy, Web 148 testes/typecheck/build, smoke Chromium de UI com 0 requisições externas. QA e segurança aprovaram sem P0–P2. Próximos marcos: goldens reais revisados, política de atestação/reconciliação e suporte a páginas sem região nativa; publicação/CI deste commit no WORKLOG.

## M4.5K — revisão OCR histórica persistente (2026-09-24)
- `OcrReviewPersistence` salva uma submissão/recibo `unverified` em artefato OPFS fixado e checkpoint IndexedDB com CAS. Exige evidência PNG/candidato/recibo verificada, fonte ativa na gravação e trio de chaves em um checkpoint histórico na leitura. Retry é idempotente; resultado histórico segue `not_established`.
- Testes de storage falso com WASM real cobrem round-trip, fonte trocada, manifesto/bytes inválidos, órfão e corridas; smoke Chromium validou gravação, retry e recuperação após reload sem rede externa. Rust fmt/45 testes/Clippy; Web 146 testes/typecheck/build. Revisão independente final sem P0–P2. ADR 0023 registra decisão.
- Próximo marco: interface de revisão e política de atestação/reconciliação, com goldens visuais revisados antes de promover texto. PDFs privados continuam pendentes. Publicação e CI desta etapa estão no WORKLOG.

## M4.5J — submissão de revisão OCR sem atestação (2026-09-24)
- Rust/WASM registra escolha explícita `keep_native`, `retain_candidate_for_review` ou `propose_correction` com justificativa e, na última opção, texto proposto. Recalcula recibo/comparação e emite `reviewHash` determinístico sempre `unverified`; não altera DocumentIR nem libera fala.
- Gate local: Rust fmt/45 testes/Clippy; Web 141 testes/typecheck/build; paridade WASM real. Revisão independente sem P0–P2. ADR 0022 e arquitetura OCR atualizadas. Próximo marco: persistir submissão junto à evidência verificada e resolver atestação/reconciliação antes de alterar camadas do documento.
- Os PDFs/goldens privados permanecem indisponíveis, então não há aprovação de fidelidade de prosa ou código real. Publicação e CI desta etapa são registrados no WORKLOG.

## M4.5I — comparação OCR canônica (2026-09-23)
- Rust/WASM compara tokens ASCII entre texto nativo e candidato OCR, vinculado ao recibo e sempre `review_required`. Diferenças omitidas são marcadas `truncated`, e a contagem publicada é apenas limite inferior. O caso público `SAMPLE01`/`SAMPLEO1` continua sem aprovação automática.
- Limites: texto da região e OCR de 1 MB, documento canônico de 32 MB, candidato JSON de 8 MB, 4.096 tokens únicos por lado e 256 diferenças exibidas. Testes incluem documento grande fora da região e controles JSON. Corpus privado e goldens revisados continuam pendentes.
- Gates locais: Rust fmt, 44 testes e Clippy; Web 140 testes, typecheck/build; Chromium OCR, persistência/recarga e comparação passaram com 0 requisições externas. Revisão independente final aprovou sem P0–P2. Os quatro commits M4.5E–I foram publicados; workflow do HEAD está em verificação no WORKLOG.

## M4.5H — medição sintética de código (2026-09-23)
- Usuário confirmou indisponibilidade temporária dos PDFs/goldens privados e autorizou exemplos públicos. Caso COBOL sintético no smoke Chromium preservou 7/8 tokens; `SAMPLE01` foi lido como `SAMPLEO1`. O candidato OCR permanece `pending`, sem promoção de código.
- O observador de rede foi ampliado ao BrowserContext e repetiu 0 requisições externas. Gates locais: Rust fmt/43 testes, Web 137 testes, typecheck/build/diff check. Revisão independente final sem P0/P1/P2.
- Commits anteriores `d4ed6ac` e `a13b337` estão locais; push HTTPS falhou por credenciais GitHub ausentes. Usuário autorizou publicação recorrente, mas autenticação ainda falta. Próximo marco: goldens públicos mais variados e reconciliação Rust conservadora, sem liberar narração de OCR.

## M4.5G — evidência OCR local em validação (2026-09-23)
- PNG, candidato e recibo OCR `pending` passam a ter persistência histórica OPFS/IndexedDB com revalidação de integridade e contexto Rust/WASM. Retry do mesmo recibo é idempotente; artefatos sem checkpoint não são apresentados como histórico.
- Corpus COBOL/CICS privado não está neste checkout, então não há medição de fidelidade nem golden novo. Próxima etapa: fornecer/reencontrar corpus, revisar recortes de prosa e código, medir recuperação antes de qualquer reconciliação/promocão.
- Gates locais passaram: Rust fmt/43 testes; Web 137 testes (2 opt-in ignorados), typecheck/build e diff check. Chromium validou OCR, persistência real, retry e recuperação após reload. Revisão independente final sem P0/P1/P2. Usuário autorizou publicação recorrente, mas pediu concluir esta etapa antes do push.

## M4.5F — engine OCR local validada (2026-09-23)
- Tesseract.js e idioma português fixados no lockfile. Worker/core/modelo servidos localmente; nenhuma requisição externa no smoke Chromium da fixture. Texto foi reconhecido e recebido pelo Rust/WASM como candidato `pending`.
- Gates locais: Rust fmt/43 testes; Web 131 testes, typecheck/build; audit 0 vulnerabilidades; diff check. Não há golden real COBOL/CICS nem interface OCR. Assets adicionam cerca de 21 MB ao build.
- Próximo marco linear: recortes/goldens locais revisados e medição de fidelidade; persistência da evidência OCR; reconciliação canônica Rust. Depois retomar atestação/QA narrativo e áudio por capítulos.

## M4.5E — encadeamento OCR local (2026-09-23)
- Checkout atualizado por fast-forward até `9f7e683`. Adapter novo encadeia captura PDF verificada, port de engine local e recibo Rust/WASM `pending`; ainda não existe engine OCR empacotada nem promoção de texto.
- Testes locais: Rust fmt/43 testes, Web 131 testes (2 opt-in ignorados), typecheck/build e diff check passaram. Teste da nova ligação usa engine falsa e WASM real; não mede qualidade de OCR.
- Próxima etapa linear: engine OCR executável no navegador, goldens de recortes e comparação mensurada; depois reconciliação Rust e revisão humana. Atestação narrativa, QA semântico e audiobook final seguem pendentes.

## Checkpoint — síntese real e persistência WAV (2026-09-23)
- CI `quality` de `bbb8b15` passou. Piper gerou WAV de 105,53 s com PDF real e 3,15 s com fixture pública no navegador integrado. Ambas as abas caíram ao acionar reprodução nativa; nenhuma escuta foi concluída. Não declarar áudio auditivamente aprovado.
- Salvamento no OPFS com metadata vinculada a fonte/sessão Rust/WASM foi testado com fixture; recarga recuperou WAV e documento. Web STANDARD 119 testes, Rust 43 e audit 0 passaram. Falta validar reprodução/download em navegador externo e política de retenção. Não confundir com audiobook narrativo final.

## Checkpoint em andamento — WAV local (2026-09-23)
- Partindo do commit `4560aa7`, foi integrado caminho de geração de WAV literal com Piper Web, runtime local no build e modelo Faber pt-BR sob download explícito. Há testes unitários de fronteira e build Web; validação real da inferência/escuta em navegador ainda falta.
- Não confundir WAV literal com audiobook narrativo final. Próximo passo após gates/CI: testar uma sessão real curta em navegador suportado sem avaliar visualmente; medir download, inferência, reprodução e áudio salvo. Persistência automática e QA auditivo ainda pendentes.

## Checkpoint atual — leitura local verificável (2026-09-23)
- A prioridade passou de microcontratos para fluxo vertical visível. O app importa PDF nativo, mostra texto, prepara sessão Rust/WASM de até dez páginas, exige conferência do usuário e reproduz com Web Speech apenas em voz declarada local. Há controles de pausa/retomada/parada; nada é exportado ou marcado QA `pass`.
- ADR 0015 delimita esse modo literal. OCR, planner/modelo real, narração editorial e áudio persistente continuam pendentes. O manual COBOL/CICS com PUA é recusado; a apostila de controle gerou sessão na página 10 em teste local opt-in. PDFs seguem fora do Git.
- Rust fmt/test/clippy (43 testes), WASM build, Web STANDARD (114 testes/typecheck/build), corpus opt-in 2/2 e audit 0 vulnerabilidades passaram. Revisão independente corrigiu cobertura do texto e corrida de recuperação; rechecagem do trecho sem P0–P2. Não houve teste auditivo/visual em navegador real.
- Próximo marco recomendado: validar voz e controles em navegador/dispositivo real, então planejar áudio persistido/exportável e QA correspondente. Não tratar esta prévia como audiobook final nem permitir que ela aprove roteiro narrativo pendente.

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

## M4.4A concluído — 2026-09-22
- Commit `f74229f42b54f32c4b0e471f66d0ca3e4c847208` publicado; workflow `quality` run `35804071973` concluiu com sucesso nos jobs Rust e Web.
- Port Web recebe saída estruturada não confiável, valida schema/provenance pelo core Rust e devolve somente candidato com QA pendente. Fake determinístico existe apenas em suporte de testes. Sem modelo real, prompt, persistência de plano ou TTS.
- Próximo batch seguro: contrato de roteiro/source mapping e QA crítico com estado explícito de revisão; buscar golden mainframe real e avaliar modelo local somente depois. TTS segue bloqueado até planner, source mapping e QA crítico passarem.

## M4.4B validado localmente — 2026-09-22
- Base: branch `codex/m4-content-model` limpa em `122e9b2`; CI `quality` desse HEAD passou (run `35804316448`). PRE-FLIGHT registrado antes do código.
- `NarrativeScript` canônico no Rust mapeia cada trecho falado a source refs da seção ou transição do plano; exige cobertura/ordem, `planId` esperado e estrutura válida. WASM exporta QA de roteiro; TS só espelha schema e chama o core. Fixture compartilhada testa WASM real.
- QA estrutural/heading rejeita mapeamento inválido e falha heading anunciado duplicado. Grounding semântico segue não avaliado: relatório fica em `review`; não liberar TTS com esse estado.
- Revisão independente encontrou dois P1, ambos corrigidos; segunda revisão sem P0/P1. Gates locais finais: Rust fmt/test (28)/clippy, WASM build, Web STANDARD (88/typecheck/build), diff check passaram.
- Publicação e CI M4.4B ainda pendentes neste checkpoint. Depois do CI verde: definir evidência e contrato de revisão semântica e avaliar modelo local real em batch separado, com corpus/golden quando disponível. TTS permanece bloqueado. Futuro plano persistido precisa vincular ID a conteúdo/provenance imutáveis.

## CHECKPOINT M4.4B — bloqueio de publicação (2026-09-22)
- Commit local `19d76931762f9e8ab20bc792e769ada29f5dfffc` criado após todos os gates locais e revisão independente. Branch local está à frente de `origin/codex/m4-content-model`.
- Push HTTPS falhou por ausência de credencial (`could not read Username for 'https://github.com'`). O sandbox foi liberado para a tentativa, mas o Git não dispõe de autenticação. Não afirmar CI verde para M4.4B.
- Não avançar para modelo real ou TTS. Retomar com autenticação GitHub disponível: publicar commits locais, verificar Rust/Web do workflow `quality`, registrar resultado e só então planejar o próximo batch.

## M4.4B concluído e M4.4C validado localmente — 2026-09-23
- M4.4B foi publicado em `codex/m4-content-model`; HEAD remoto/local `2aaa73124d52f6fda6e388a495529525e661cfe1`, workflow `quality` run `35806473115` com `success`. A antiga nota de bloqueio SSH é histórica.
- PRE-FLIGHT M4.4C registrado. Core Rust agora produz `ScriptReviewPacket` por trecho, com texto falado, refs e todas as unidades de fonte correspondentes, estados de qualidade e hashes de fonte/ContentModel/plano/roteiro. Cada trecho sai como `pending`; nenhuma aprovação ou TTS é possível por esse contrato.
- QA independente identificou vínculo ausente entre `documentId` e `sourceHash` no ContentModel; corrigido e coberto em Rust e WASM real. Texto de análise vazio e refs duplicadas foram rejeitados. Segunda revisão sem P0/P1.
- Gates locais M4.4C: Rust fmt/test (30)/clippy, WASM build, Web STANDARD (90/typecheck/build) e diff check passaram. Publicação/CI do novo commit ainda pendentes neste checkpoint.
- Após CI verde: contrato de decisão explícita de revisão semântica vinculado aos hashes, com tratamento de fonte sem texto e revisão humana/verificador confiável; corpus/golden mainframe real ainda não está no repo. TTS segue bloqueado.

## M4.4C concluído — 2026-09-23
- Commit `1c5394d1d5e783872502598955c5eef0d40dca36` publicado em `codex/m4-content-model`; workflow `quality` run `35834617808` concluiu com `success` para Rust e Web.
- Pacote de revisão por trecho está implementado e TESTED via Rust/WASM real. Todas as fontes correspondentes são exibidas com texto/qualidade/flags e hashes de identidade; estado permanece `pending`. Nenhuma decisão de aprovação, modelo real, persistência de revisão ou TTS foi introduzida.
- Próximo batch seguro: contrato canônico de decisão de revisão no Rust, vinculado a `sourceHash`, `contentHash`, `planHash`, `scriptHash` e IDs de todos os trechos. Definir tratamento explícito de evidência sem texto e verificador/revisor confiável; não tratar output do modelo como atestação. Buscar golden mainframe real para avaliação posterior. TTS continua bloqueado.

## M4.4D validado localmente — 2026-09-23
- Base remota `88af119`, workflow `quality` run `35834973158` verde. A branch local limpa foi atualizada por fast-forward antes do PRE-FLIGHT.
- Rust valida submissão de decisões por trecho contra o pacote recalculado, incluindo hashes, cobertura de trechos e evidência textual por referência. Fonte ausente ou bloqueada não sustenta `supported`. WASM/TS preservam apenas a fronteira; recibo usa `attestationStatus: unverified` e hash da submissão. Nenhuma atestação, persistência, aprovação QA ou TTS foi implementada.
- QA independente encontrou cobertura parcial P2 e a correção passou em Rust/WASM real. Segunda revisão confirmou correção, sem P0/P1. Gates locais: 33 testes Rust, fmt, clippy, build WASM, 93 testes Web, typecheck, build, audit 0 vulnerabilidades e diff check. Publicação e CI ainda pendentes neste checkpoint.
- Próximo passo imediato: commit/push e CI. Depois definir mecanismo confiável de atestação e corpus real de avaliação; não liberar TTS com recibo `unverified`.

## M4.4D concluído — 2026-09-23
- Commit de código `28658f67c945ef7b9b450160e04beebd433b5e9f` publicado em `codex/m4-content-model`; workflow `quality` run `35856262003` concluiu com sucesso.
- O contrato de revisão estrutural está testado no core e no WASM real. `supported` exige evidência textual não bloqueada para todas as source refs do trecho. O recibo continua `unverified`; não há persistência, atestação de revisor, liberação por QA ou TTS.
- Próximo batch: especificar mecanismo de atestação confiável e vínculo persistente ao hash da submissão. Obter corpus/golden mainframe real para avaliação semântica antes de qualquer claim `pass`. Não usar veredito enviado por modelo como prova de revisão humana.

## M4.4E validado localmente — 2026-09-23
- Submissão e recibo Rust/WASM agora podem ser preservados localmente em artefato OPFS fixado e não regenerável, com manifest/checkpoint IndexedDB e chave derivada de `submissionHash`. A leitura reconfere integridade e identidade contra o contexto fornecido, com checagem de mudança concorrente do checkpoint.
- ADR 0011 explicita a fronteira: o checkpoint não guarda ainda a identidade de plano/roteiro ativos; a API é histórica e retorna `currentness: not_established`. Nenhuma atestação, QA `pass` ou TTS foi habilitada.
- Rust fmt/test (33)/clippy, Web STANDARD final (97 testes/typecheck/build) e audit 0 vulnerabilidades passaram localmente. Revisão independente inicial teve P1/P2, corrigidos por contrato histórico explícito e rechecagem; segunda revisão apontou inacessibilidade após mudança da fonte ativa, corrigida e coberta no gate rápido (31/31). Publicação e CI ainda pendentes neste checkpoint.
- Próximo passo após CI verde: persistir identidade canônica de plano/roteiro ativo, estabelecer política e mecanismo de atestação confiável vinculado ao `submissionHash`, e obter golden mainframe real para avaliação semântica. Não avançar para TTS.

## M4.4E concluído — 2026-09-23
- Commit `c513744` publicado em `codex/m4-content-model`; GitHub Actions `quality` run `35860380680` concluiu com sucesso.
- Persistência histórica local de submissões está validada. `currentness: not_established` e `attestationStatus: unverified` continuam explícitos. Próximo batch: identidade ativa de plano/roteiro e desenho de atestação confiável; corpus/golden real ainda necessário antes de QA `pass`. TTS bloqueado.

## M4.4F validado localmente — 2026-09-23
- `ActiveNarrativeIdentity` é calculada pelo Rust, com fonte, conteúdo, outline, plano e roteiro. WASM e adapter Web publicam um ponteiro ativo OPFS/IndexedDB por checkpoint; histórico permanece. Troca exige estado `VERIFYING` validado pelo Rust e ausência de referências a áudio no checkpoint; não carrega `READY_FOR_AUDIO` nem artefatos de áudio de uma narrativa antiga.
- Revisão independente inicial encontrou a retenção de estado/áudio; correção e regressões aplicadas. Rust fmt/test (35)/clippy, WASM build, Web STANDARD (103/typecheck/build), audit 0 vulnerabilidades e diff check passaram localmente. Publicação e CI ainda pendentes neste checkpoint.
- Usuário forneceu apostila COBOL de 75 páginas para corpus local. Texto é extraível, mas nenhum golden semântico/narrativo foi definido; arquivo não foi publicado. Próximo passo: commit/push, verificar workflow `quality`, então integrar revisão histórica com o ponteiro ativo e definir atestação confiável. TTS só depois desse vínculo e avaliação semântica com casos esperados; não existe data estimada nem motivo para iniciar síntese agora.
- Segunda revisão independente read-only após a correção confirmou o P2 resolvido e nenhum novo P0/P1/P2.

## M4.4G validado localmente — 2026-09-23
- Revisão ativa agora possui vínculo v2 persistido ao `identityHash` completo, incluindo outline, e ao `submissionHash`. Rust calcula o hash do vínculo e revalida a submissão; WASM/TS apenas cruzam a fronteira e operam storage. Revisões históricas v1 ficam `not_established`; v2 vinculada retorna `bound_unverified`, sem atestação ou QA `pass`.
- QA independente encontrou e ajudou a fechar lacuna de outline, colisão de chave e corrida. Revisão final read-only sem P0/P1/P2. Gates locais: Rust fmt/test (36)/clippy, WASM build, Web STANDARD (107/typecheck/build), audit 0 vulnerabilidades e diff check. Publicação/CI pendentes neste checkpoint.
- Segundo PDF COBOL/CICS fornecido pelo usuário permanece local. Tem 105 páginas com texto extraível, mas 36.111 caracteres privados Unicode, presentes em todas; página renderizada mostra conteúdo legível. Não tratar essa extração como pronta para fala. Próximo passo: commit/push e CI; depois desenhar atestação confiável e goldens semânticos, além de avaliação/recuperação da extração suspeita. TTS segue pendente até essas verificações.

## M4.5A — camada de texto suspeita (2026-09-23)
- Base publicada M4.4G `2143378`, workflow `quality` run `35868591143` verde. PRE-FLIGHT e resultado em `.ai/TASK_PACKET.md` e `.ai/WORKLOG.md`.
- Rust sinaliza caracteres de área privada Unicode na migração v1→v2, conserva fonte e bloqueia apenas regiões afetadas. Teste Rust e integração WASM/Web real passaram. PDF.js local confirmou sinal em amostras do manual COBOL/CICS, sem publicar PDF.
- Gates locais verdes: 37 testes Rust, fmt/clippy, build WASM, 108 testes Web/typecheck/build, audit sem vulnerabilidades, diff check. Revisão independente não ocorreu por limite de uso; diff revisado pelo Lead. Commit/push/CI deste batch ainda pendentes neste checkpoint.
- Próximo passo: medir PDF.js no corpus local inteiro, definir goldens de fidelidade (prosa e código), implementar OCR/reconciliação verificável; em paralelo, especificar identidade/atestação confiável de revisão sem confundir vínculo criptográfico com aprovação semântica. Sem TTS, UI ou QA pass automático.

## M4.5B — medição integral PDF.js (2026-09-23)
- M4.5A publicado no commit `6f1870f`; workflow `quality` run `35872207447` concluiu com sucesso. Base limpa antes da medição.
- PDF.js do projeto mediu todas as páginas dos dois PDFs locais: apostila 75 páginas/0 PUA; manual COBOL/CICS 105 páginas/36.774 PUA, presente em todas. Métricas, método, hashes, avisos e páginas candidatas estão em `docs/INGESTION_TEST_STRATEGY.md`. PDFs e texto não foram publicados.
- Rust fmt/test (37) e Web STANDARD (108/typecheck/build) passaram. Primeira tentativa de build no sandbox falhou com `spawn EPERM`, repetição permitida passou. Diff/commit/push/CI desta etapa ainda pendentes neste checkpoint.
- Próximo batch: criar goldens locais de prosa e código para páginas selecionadas, com revisão humana do visual; só então medir OCR/reconciliação por região. Alternativamente avançar em contrato de atestação confiável independente. TTS e QA semântico `pass` permanecem bloqueados; não interpretar contagens PUA como recuperação de texto.

## M4.5C — teste opt-in do corpus real (2026-09-23)
- Base `8b40de2` limpa; workflow M4.5B `quality` run `35873228079` verde. PRE-FLIGHT/resultado em `.ai/TASK_PACKET.md` e `.ai/WORKLOG.md`.
- Páginas 1 e 27 do manual renderizadas/inspecionadas. Referência candidata curta em `work/goldens/cobol-cics-v1.local.json`, ignorada pelo Git; página 27 tem sobreposição visual. Ainda não é golden aprovado nem métrica de OCR.
- Teste opt-in Web executa os dois PDFs locais por PDF.js→Rust/WASM. 2/2 passaram: manual 105 páginas `corrupted` e unidades PUA `blocked`; apostila 75 páginas `good`. CI ignora casos sem variáveis de ambiente. Nenhum PDF/texto publicado.
- Gates locais: teste opt-in 2/2; Rust fmt/test (37)/clippy; Web STANDARD 108 testes, 2 opt-in ignorados sem corpus, typecheck/build; audit 0 vulnerabilidades; diff check. Referência local confirmada ignorada pelo Git. Sem revisão independente nesta etapa. Próximo passo: revisão humana de recortes com coordenadas e expectativas de código/prosa; implementar OCR local limitado e reconciliador canônico Rust com comparação mensurada, sem substituir fonte automaticamente. Em paralelo, definir atestação confiável e avaliação semântica. Não liberar TTS. Publicação/CI deste batch pendentes neste checkpoint.

## M4.5C publicado — 2026-09-23
- Commit `2978278463139fa7d6567725c86a77c68bf09366` publicado em `codex/m4-content-model`; workflow `quality` run `35874469086` concluiu com sucesso. A referência local permanece ignorada pelo Git.
- Próxima etapa autorizada: contrato Rust para candidato OCR vinculado a fonte/região, sem promover texto automaticamente; engine/recuperação real dependem de golden local revisado. Não iniciar TTS.

## M4.5D — contrato OCR em validação (2026-09-23)
- Base limpa `e185a2f`; PRE-FLIGHT registrado. Core Rust valida identidade do candidato OCR e devolve recibo `pending` com hashes/sinais; não modifica DocumentIR, ContentModel ou elegibilidade. WASM/TS apenas fronteira; ADR 0014.
- Gates locais: Rust 38 testes, fmt/clippy; build WASM; Web STANDARD 110 testes/typecheck/build (2 opt-in ignorados); audit 0 vulnerabilidades. Revisão independente inicial encontrou dois P2 de integridade, corrigidos e gates repetidos; segunda revisão read-only confirmou sem novo P0/P1/P2. Diff check passou; publicação/CI pendentes neste checkpoint.
- Próximo passo após CI: definir captura limitada de pixels/região e provar vínculo entre crop e documento; avaliar engine OCR local com goldens revisados. Páginas sem região nativa continuam fora do contrato v1. Sem promoção automática de OCR, QA pass ou TTS.

## M4.5D publicado — 2026-09-23
- Commit `eefd9a7` publicado em `codex/m4-content-model`; workflow `quality` run `35877078233` concluiu com sucesso. OCR candidato permanece `pending`, sem engine ou promoção de texto.
- Próximo batch: capturar e limitar pixels da região via PDF.js, persistir imagem/candidato/recibo com proveniência e revalidar identidade ativa; só depois medir OCR real contra goldens locais revisados. Sem TTS.
## Recuperação WAV literal — 2026-09-23
- Resalvamento testado: checkpoint aponta só para o WAV novo; metadata JSON inválida não quebra recuperação. Gates locais Web/Rust verdes; detalhes em `.ai/WORKLOG.md`.
- Próximo passo: validar reprodução e download em navegador externo automatizável ou manualmente, confirmar CI; em seguida definir retenção/limpeza explícita dos WAVs substituídos. Não chamar o resultado de audiobook final.
## Biblioteca WAV literal — 2026-09-23
- Gravações históricas da mesma fonte agora aparecem no catálogo local; abertura sob demanda revalida sessão Rust/WASM. Smoke real em Chrome e Edge gerou dois WAVs, reabriu o antigo após reload, reproduziu programaticamente e baixou arquivo de SHA-256 idêntico ao Blob. Gates locais verdes; ver `.ai/WORKLOG.md` e ADR 0016.
- Próximo batch de valor: contrato de retenção/compaction de checkpoints e manifests com preservação de recuperação histórica; depois ampliar áudio por capítulos apenas após QA semântico e revisão de texto. Escuta humana, corpus OCR/goldens, atestação de revisão e audiobook narrativo final continuam pendentes. Não confundir WAV literal com exportação final.

## Retenção explícita de WAV literal — 2026-09-23
- Sobre base `eae4ee5`, a exclusão histórica exige confirmação, preserva o checkpoint atual e um fallback íntegro da mesma fonte e usa fila durável IndexedDB v3 para remoção OPFS idempotente. ADR 0017 e worklog detalham contrato e limites. Não há exclusão automática.
- Gates locais verdes: Rust fmt/43 testes/clippy; Web 127 testes, 2 opt-in ignorados, typecheck/build/audit; smoke Chrome headless validou cancelar/confirmar, reload e ausência dos arquivos/manifests excluídos. Edge e escuta humana não foram repetidos nesta execução. Commit remoto e CI ainda pendentes neste checkpoint.
- Próximo passo de valor: retomar a trilha de qualidade do conteúdo (goldens locais revisados, OCR limitado/reconciliação no Rust e atestação), depois narrativa/TTS por capítulos. O WAV literal continua prova de exportação local, não audiobook final.

## Captura de região PDF para OCR — 2026-09-23
- Adapter PDF.js confere fonte e bbox e captura PNG de região com hash e limites. ADR 0018 e worklog registram o contrato. Smoke Chrome compara pixels do crop com página inteira; sem teste visual humano, rotação real ou corpus privado.
- Gates locais: Rust fmt/43 testes/clippy; Web 129 testes, 2 opt-in ignorados, typecheck/build/audit 0; smoke Chrome passou. Revisão independente apontou três riscos e confirmou correções sem P0–P2 remanescentes. Publicação/CI ainda pendentes neste checkpoint.
- Próximo lote: persistir imagem/candidato/recibo `pending` com verificação após retomada, testar PDF real com bbox/rotação e construir goldens locais revisados. Só então avaliar engine OCR e reconciliador Rust; sem TTS narrativo antes de QA semântico.
## M4.5N — avaliação pública de OCR (2026-09-24)
- Manual público GnuCOBOL/C de 29 páginas, SHA-256 `97a8bb7e95ad0538aaced88aba469fae3ba02d8045831538333a57711164ee69`. Páginas 2 (prosa) e 4 (código) conferidas visualmente e medidas em Chromium com Tesseract português local. Script opt-in e resultados em `docs/INGESTION_TEST_STRATEGY.md`.
- Amostra: 4/4 alvos de prosa e 6/7 alvos de código presentes; `STOP RUN RETURNING 0.` virou `STOP RUN RETURNING O.`. Zero requisições externas observadas. PDF fica em `work/`, fora do Git. Não é golden do corpus do usuário nem atesta qualidade semântica.
- Próximo marco: ampliar corpus público com prosa em português e documentos digitalizados variados; depois goldens locais revisados para os PDFs do usuário, atestação e reconciliação Rust. OCR continua sem promoção para narração.
