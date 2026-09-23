# HANDOFF — retorno ao Codex Work

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
