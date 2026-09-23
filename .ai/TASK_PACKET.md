# TASK PACKET — Audiobook Studio

## PRE-FLIGHT — validação real e persistência WAV literal (2026-09-23)
- Base: `codex/m4-content-model`, HEAD `bbb8b15`, worktree limpa; CI `quality` do commit passou.
- Evidência: em navegador integrado, o PDF local importou, a sessão Rust/WASM da página 10 passou, o motor Piper baixou o modelo e gerou WAV de 105,53 s. Fixture pública de 2 páginas gerou WAV de 3,15 s. A aba caiu ao acionar reprodução em ambos; causa não isolada.
- Objetivo: salvar o WAV literal gerado no projeto local e recuperá-lo após recarga, com integridade e vínculo à fonte; registrar o teste real sem alegar qualidade auditiva.
- Restrições: não marcar áudio literal como `final_audio` narrativo; manter Rust canônico para sessão, TS para OPFS/IndexedDB/UI. Sem backend ou upload de texto.
- Desconhecidos: causa da queda do navegador integrado, quota do OPFS, reprodução em Chrome/Edge externo, qualidade auditiva.
- Riscos: publicar manifest sem arquivo, exibir WAV de outro documento, perder áudio salvo ao trocar projeto, quota cheia, sobrescrever artefato válido.
- Plano: usar infraestrutura de persistência existente com artefato não final e metadata validada; recuperar somente quando fonte e sessão conferirem; testes unitários e gates; atualizar ADR/handoff/worklog.
- Verificação: testes de armazenamento/recuperação, Rust fmt/test/clippy, Web STANDARD/audit, diff, CI. Não repetir clique que derrubou o navegador integrado.
- Risco: alto; um writer, revisão final conservadora.

## PRE-FLIGHT — exportação de leitura literal (2026-09-23)
- Base: `codex/m4-content-model`, HEAD `4560aa7`, worktree limpa. A sessão Rust/WASM de 1–10 páginas já exige revisão; Web Speech não fornece bytes exportáveis.
- Objetivo: gerar, reproduzir e baixar WAV local de uma sessão literal conferida, sem confundir com audiobook narrativo final.
- Evidência: Piper Web documenta `predict` retornando Blob WAV e cache de modelo em OPFS; voz pt-BR existe no catálogo Piper. Contrato, licença específica e runtime devem ser verificados antes da integração.
- Restrições: Rust conserva sessão/invariantes; TS limita-se a adapter TTS, UI e Web APIs. Não enviar texto/PDF ao servidor, não marcar QA narrativo `pass`, sem backend.
- Desconhecidos: suporte real a WASM/ONNX/OPFS no navegador do usuário, qualidade acústica e licença/termos da voz escolhida. Sem teste auditivo, não declarar qualidade aprovada.
- Riscos: modelo grande, falha parcial, WAV inválido/omissão, corrida ao trocar documento, memória e download incompleto.
- Plano: verificar dependência/voz; implementar geração fail-closed em lote curto, validar saída/ordem, tocar e baixar; testes de adapter e gates; registrar limites em ADR/worklog.
- Verificação: testes Web e Rust, typecheck/build, auditoria, diff, teste real de navegador apenas se viável sem avaliação visual.
- Risco: alto; um writer, revisão independente quando disponível.

## PRE-FLIGHT — leitura local verificável de PDF nativo (2026-09-23)
- Base: `codex/m4-content-model`, HEAD `2e28a7e`, worktree limpa. O app importa PDF e exibe texto, sem reprodução.
- Objetivo: fechar fluxo visível importar PDF de texto selecionável, selecionar página, conferir texto e ouvir com voz local do navegador; parar/cancelar com segurança.
- Evidência: DocumentIR v2 vem do Rust/WASM; páginas com PUA são `corrupted` e regiões afetadas `unusable`. `speechSynthesis` ainda não está ligado à UI.
- Escopo: modo de leitura fiel à extração nativa, distinto do audiobook narrativo. Seleção, limites e chunks canônicos no Rust; TS apenas UI e Web Speech adapter. Sem OCR, modelo, QA `pass`, export ou backend.
- Desconhecidos: disponibilidade de voz com `localService=true` no navegador do usuário; fidelidade do PDF não pode ser provada por teste automático. Sem voz local, falhar fechado.
- Riscos: ler fonte corrompida, omitir texto silenciosamente, trocar PDF enquanto áudio toca, divergência WASM/TS, prometer áudio exportável inexistente.
- Plano: contrato Rust de preview limitado por página com testes; export WASM e adapter Web; UI de revisão/controles acessíveis; testes de adapter e gates completos; ADR e worklog factuais.
- Verificação: Rust fmt/test/clippy, build WASM, Web typecheck/test/build, teste de fronteira real, diff check. Sem alegar teste auditivo/visual não executado.
- Risco: alto; um writer e revisão independente se disponível.

## PRE-FLIGHT — M4.5D candidato OCR vinculado à fonte (2026-09-23)
- Base: `codex/m4-content-model` limpa em `e185a2f`; CI de M4.5C passou. Handoff pede contrato Rust para OCR sem promoção automática.
- Objetivo: validar no core um candidato OCR de região contra documento/fonte/página/região e hash do texto nativo; devolver pacote de revisão `pending` com sinais mensurados e hashes, sem alterar DocumentIR ou ContentModel.
- Evidência: DocumentIR v2 tem camadas OCR, mas não há engine nem golden aprovado. O manual real apresenta PUA e exige reconciliação, não substituição cega.
- Restrições: domínio/hash em Rust; WASM fachada; TS schema/adapter de fronteira com paridade real. Sem persistência, engine OCR, UI, QA pass ou TTS. Escopo somente regiões existentes, não páginas `no_text`.
- Desconhecidos: qualidade do OCR real, vínculo verificável entre pixels renderizados e região, política de revisão humana. `imageHash` fornecido pelo adapter não prova captura correta.
- Riscos: candidato de documento errado, fonte obsoleta, texto vazio/enorme, glifos privados no OCR, confusão entre redução de PUA e fidelidade, status `pending` tratado como aprovação.
- Plano: contrato/erro tipado e testes Rust; export WASM; schema/adapter TS com teste WASM real; ADR de limites; gates completos, diff, revisão e publicação se verdes.
- Verificação: Rust fmt/test/clippy, WASM build, Web STANDARD/audit e teste dirigido, diff check, CI remoto. Resultados no worklog.
- Risco: alto; um writer.

## PRE-FLIGHT — M4.5C goldens locais e ingestão real (2026-09-23)
- Objetivo: conferir visualmente páginas selecionadas do corpus COBOL/CICS, registrar pequenas expectativas de fidelidade fora do repositório público e testar a importação real PDF.js→Rust/WASM com esses PDFs locais.
- Base: branch `codex/m4-content-model` limpa, HEAD `8b40de2`; M4.5B mediu todas as páginas, mas não verificou `DocumentIR`/ContentModel. O manual contém PUA em todas as páginas.
- Restrições: PDFs e transcrições do usuário permanecem locais; Rust é canônico; sem OCR fictício, QA `pass`, TTS ou UI. Não interpretar PUA como transcrição recuperada.
- Desconhecidos: fidelidade visual de trechos selecionados, tempo/memória do pipeline integral e efeito da segmentação no bloqueio de regiões.
- Riscos: publicar conteúdo protegido, validar texto errado por OCR visual incerto, falha de importação em arquivo real, testes dependentes do caminho do usuário, limites de memória.
- Plano: renderizar amostras localmente, inspecionar e registrar expectativas mínimas em arquivo ignorado; executar pipeline real em teste opt-in versionado, sem caminhos fixos ou conteúdo do usuário; agregar métricas e falhas sem publicar texto; documentar fatos/gates e revisar diff.
- Verificação: hash das fontes, inspeção visual, execução real do pipeline, Rust fmt/test e Web STANDARD se houver mudança de código; diff check. Sem claim de OCR.
- Risco: alto; um writer, revisão conservadora.

## PRE-FLIGHT — M4.5B medição integral PDF.js do corpus (2026-09-23)
- Objetivo: medir todas as páginas dos dois PDFs locais com a versão de PDF.js do app, registrar apenas métricas e selecionar páginas candidatas a goldens de fidelidade. Não implementar OCR sem transcrição esperada.
- Base e evidência: branch `codex/m4-content-model` limpa, HEAD `6f1870f`; M4.5A passou testes e foi publicado. Handoff pede medição integral antes de OCR. Amostras anteriores detectaram glifos privados no manual COBOL/CICS.
- Restrições: PDFs permanecem fora do repositório; não registrar texto integral nem nomes locais em logs públicos; Rust mantém regras canônicas. Sem UI, TTS, modelo ou QA automático.
- Desconhecidos: contagens integrais PDF.js, distribuição por página, trechos de código e texto visual correto para goldens. Métricas não equivalem a fidelidade.
- Riscos: confundir caracteres retornados por PDF.js com resultado da segmentação, afirmar recuperação sem OCR, consumir memória com PDF inteiro, copiar conteúdo do usuário para docs.
- Plano: executar análise local página a página com PDF.js; agregar contagens, páginas sem texto, PUA e limites; comparar amostras de controle; documentar seleção de páginas para revisão manual posterior e limitações; rodar gates e revisar diff.
- Verificação: script de análise read-only, hashes/contagem de páginas, testes/gates disponíveis, diff check. Registrar resultados factuais no worklog.
- Risco: médio; writer único.

## PRE-FLIGHT — M4.5A camada de texto PDF suspeita (2026-09-23)
- Objetivo: classificar no Rust a camada nativa com glifos Unicode privados durante a migração DocumentIR v1→v2, preservar texto bruto e exigir recuperação/revisão antes de narração.
- Evidência: HEAD `2143378` limpo em `codex/m4-content-model`; segundo PDF local tem 36.111 caracteres privados entre 488.556 extraídos; hoje `migrate_from_v1` transforma toda página `extracted` em `good`. O conteúdo migrado já é `review_required`, mas não sinaliza defeito nem impede reaproveitamento como análise textual.
- Restrições: Rust canônico, PDF.js/Worker Web como adapter; sem OCR fictício, TTS, backend ou UI. PDFs do usuário não entram no repositório. Preservar schemas existentes.
- Desconhecidos: distribuição dos glifos por bloco via PDF.js, limiar quantitativo para outros defeitos e fidelidade de OCR. Sem limiar especulativo: qualquer caractere de área privada Unicode será sinal de suspeita, não prova de corrupção visual.
- Riscos: falso positivo em fonte iconográfica, texto parcial útil ser bloqueado, divergência Rust/WASM e corpus local não reprodutível em CI.
- Plano: marcar página como `corrupted` e regiões afetadas com flag estável; bloquear elegibilidade dessas regiões no ContentModel sem descartar texto bruto; testar Rust e integração WASM com fixture sintética; documentar limite, rodar gates, revisar diff, registrar resultado e publicar se verde.
- Verificação: fmt/test/clippy Rust, build WASM, Web STANDARD/audit, diff check. Sem claim de OCR ou qualidade semântica.
- Risco: alto; writer único e revisão de diff independente se disponível.

## PRE-FLIGHT atual — M4 Rust/WASM/Web runtime (2026-09-22)
- Objective: ligar a fachada `audiobook-wasm` ao Worker Web para migrar DocumentIR v1, validar DocumentIR v2 e construir ContentModel/SemanticOutline pelo core Rust; comprovar paridade com fixtures compartilhadas e execução real do módulo WASM.
- Evidence: branch `codex/m4-content-model` limpa em `039b982`; handoff indica este passo; `crates/wasm` expõe v2/content/outline, mas falta migração v1 e bundle gerado; o Worker hoje só extrai v1 via PDF.js. CI de `5807e79` passou Rust e Web segundo handoff/worklog.
- Constraints: Rust é fonte canônica; TS apenas fronteiras, Web APIs e adapters; preservar local-first, source/provenance e estados de revisão; sem TTS/planner; não declarar execução WASM apenas por teste de mock; sem texto novo de UI nesta fatia.
- Unknowns: ferramentas `rustup`/`wasm-pack` ausentes neste host; target wasm32 não instalado; build local pode exigir instalação aprovada ou validação pelo CI; comportamento de bundling do Vite Worker deve ser testado de fato.
- Risks: bundle gerado incompatível com versão `wasm-bindgen`, build Web sem artefato, worker falhar no carregamento, drift de contrato Rust/TS, PDF v1 válido que falha migração e persistência de dados parciais.
- Plan: (1) expor migração v1→v2 na fachada Rust; (2) build reproduzível e pinado de WASM; (3) adapter TS fino com validação de fronteira; (4) ligar Worker e protocolo à cadeia v1→v2→ContentModel→SemanticOutline; (5) testes de paridade e integração real WASM; (6) gates, revisão, worklog e CI.
- Verification: Rust fmt/test/clippy quando disponíveis; Web typecheck/test/build; teste que importe o bundle real e compare fixtures; importação PDF via Worker em browser se disponível; diff e CI.

## Controle de execução M4 runtime
- Task Risk: HIGH
- Writer: Lead/Orchestrator.
- Allowed Files: `crates/wasm/`, `apps/web/src/adapters/`, `apps/web/src/workers/`, schemas de fronteira e testes, build scripts/CI/docs M4, `.ai/`; `main.tsx` apenas para consumir resultado sem alterar microcopy.
- Do not touch: TTS, engines externos, backend, regras canônicas duplicadas em TS, relatório mestre preservado.
- Independent Review Required: YES, via revisão de diff e contrato; subagente somente se ferramenta disponível.

## PRE-FLIGHT atual — M3.2 OPFS, coordenação e retenção (2026-09-22)
- Objective: persistir artefatos binários validados no OPFS, impedir writers concorrentes entre abas, coordenar a publicação do manifest/checkpoint e executar limpeza física somente por plano explícito e seguro.
- Evidence: M3.1 está publicado e testado; `docs/PERSISTENCE.md` e ADR 0009 deixam OPFS, locks, órfãos e limpeza física pendentes; `ArtifactStore` ainda é apenas um port mínimo; OPFS e Web Locks estão disponíveis em contextos seguros e workers nos navegadores-alvo atuais.
- Constraints: local-first; sem backend/microserviços; um único writer; APIs Web injetáveis; nomes derivados apenas de IDs/hash validados; nunca sobrescrever corrupção; nenhum dado não regenerável, fixado, final ou do projeto atual é removido automaticamente; metadata só é publicada após escrita e verificação do arquivo.
- Unknowns: quota real e persistência por navegador; falhas de energia entre OPFS e IndexedDB; suporte em browsers embarcados/antigos; matriz E2E real ainda não configurada.
- Risks: arquivo parcial, manifest sem arquivo, órfão após falha de transação, corrida entre abas, remoção indevida, hash de blobs grandes pressionando memória e testes unitários divergirem do browser real.
- Plan: (1) contratos tipados para artefato/lock; (2) adapter Web Locks fail-closed; (3) OPFS com nome imutável, hash e verificação pós-escrita; (4) manifest e checkpoint publicados juntos em uma transação IndexedDB após OPFS; (5) reconciliação/retention explícita; (6) testes unitários, gates, revisão independente, documentação e CI.
- Verification: testes de lock ocupado/indisponível/liberação; OPFS round-trip/idempotência/corrupção/falha parcial; commit e rollback lógico; órfãos e proteção de retention; typecheck, build, audit, Rust gates disponíveis, revisão do diff e CI.

## Controle de execução M3.2
- Task Risk: HIGH
- Writer: Lead/Orchestrator
- Subagents: Explorer e QA Reviewer, ambos read-only.
- Model: Lead definido pelo host; papéis conforme `.codex/agents/`.
- Reasoning: HIGH para consistência entre stores; MEDIUM para exploração e QA.
- Allowed Files: `.ai/`, `apps/web/src/schemas/`, `apps/web/src/adapters/`, testes, `docs/PERSISTENCE.md`, ADR 0009, quality/security/gap docs e workflow apenas se um gate novo for necessário.
- Do not touch: relatório mestre preservado, UI, OCR/TTS, backend/microserviços e domínio Rust fora de fixtures/contratos já existentes.
- Parallelizable: YES, somente exploração e revisão sem escrita.
- Independent Review Required: YES.
- Verification: testes Web, typecheck, build, audit, Rust gates disponíveis, diff e CI.

## PRE-FLIGHT atual — M3.1 persistence core (2026-09-22)
- Objective: persistir projetos e checkpoints versionados em IndexedDB, restaurar o último checkpoint válido e expor quota sem backend; manter OPFS/binários para uma fatia seguinte.
- Evidence: ADR 0009 aceita storage local e eviction segura; `GenerationJob` Rust já serializa snapshots; GAP_ANALYSIS marca IndexedDB/OPFS e retomada durável como pendentes; Web ainda não possui storage adapter.
- Constraints: local-first; um único writer; conteúdo persistido é não confiável e deve passar por schema; sem exclusão silenciosa; sem migração destrutiva; APIs Web injetáveis para teste; nenhum backend obrigatório.
- Unknowns: comportamento real de quota por navegador, persistência do site negada pelo usuário, atomicidade entre IndexedDB e OPFS e estratégia final de binários grandes.
- Risks: checkpoint corrompido, upgrade parcial, perda de dados, uso excessivo de quota, concorrência entre abas e testes que apenas simulam IndexedDB.
- Plan: (1) definir schemas/erros/ports; (2) implementar adapter IndexedDB versionado e repository de checkpoint; (3) quota/persistência best-effort; (4) testes com implementação IndexedDB compatível; (5) QA independente, gates e ADR/worklog; (6) OPFS e locks ficam na M3.2.
- Verification: contract tests de round-trip, idempotência/conflito, corrupção, migração/upgrade, retomada e quota indisponível; typecheck/build/audit; rustfmt e CI Rust; revisão de diff.

## Controle de execução M3.1
- Task Risk: HIGH
- Writer: Lead/Orchestrator
- Subagents: Explorer e QA Reviewer, ambos read-only.
- Model: Lead definido pelo host; Explorer/QA em `gpt-5.6-terra` medium.
- Reasoning: HIGH para desenho transacional; MEDIUM para exploração e revisão.
- Allowed Files: `.ai/`, `apps/web/src/schemas/`, `apps/web/src/adapters/`, testes, ADR 0009, quality/security/gap docs e lockfile se dependência de teste for necessária.
- Do not touch: relatório mestre preservado, UI, OCR/TTS, backend/microserviços e schemas centrais fora da persistência.
- Parallelizable: YES, somente exploração e revisão sem escrita.
- Independent Review Required: YES.
- Verification: testes Web, typecheck, build, audit, Rust gates disponíveis, diff e CI.

## Controle de execução
- Task Risk: HIGH
- Writer: Lead/Orchestrator desta tarefa
- Subagents: `explorer` e `qa-reviewer`, ambos read-only; especialistas adicionais somente se um risco concreto exigir.
- Model: Lead definido pelo host; papéis do projeto usam os modelos fixados em `.codex/agents/`.
- Reasoning: HIGH para arquitetura/ingestão; MEDIUM para exploração e QA desta validação.
- Allowed Files: ingestão/contratos/testes/documentação e configuração `.codex/` listados no plano atual.
- Do not touch: relatório mestre preservado, backend/microserviços e arquivos sem relação com esta etapa.
- Parallelizable: YES, apenas exploração e revisão sem escrita concorrente.
- Independent Review Required: YES.
- Verification: TOML parseável; agentes reconhecíveis após nova sessão confiável; testes Web, typecheck, build, audit, Rust gates disponíveis, diff e CI.

## PRE-FLIGHT atual — configuração multiagente (2026-09-22)
- Objective: configurar papéis especializados do Codex com limite de três subagentes, propriedade única de escrita e política Plus-first, sem criar agentes permanentes em execução.
- Evidence: solicitação anexada; suporte oficial atual a `.codex/agents/*.toml` e `.codex/config.toml`; ferramentas de subagente disponíveis nesta sessão.
- Constraints: AGENTS enxuto; contexto sob demanda; modelos/effort suportados; um writer; nenhuma alegação de reconhecimento sem validação.
- Unknowns: configurações de projeto são carregadas somente em repositórios confiáveis e podem exigir uma nova sessão; limites reais do plano não são expostos pelo repositório.
- Risks: custo por paralelismo, writers sobrepostos, configuração aceita por parser mas ainda não recarregada pelo host.
- Plan: criar política e perfis oficiais; validar TOML; executar exploração e QA read-only como teste pequeno; registrar resultado factual.
- Verification: parser TOML, inspeção dos dez perfis, respostas reais dos dois subagentes e revisão final pelo Lead.

## PRE-FLIGHT atual — ingestão, OCR e conteúdo complexo (2026-09-22)
- Objective: fechar arquitetura e contratos versionados para ingestão híbrida, OCR seletivo, regiões complexas, incerteza, storage e migração; integrar ao M2 sem inventar engines ou declarar OCR funcional.
- Evidence: especificação anexada pelo usuário; M2 local já extrai texto, agrupa linhas e preserva `unknown`; DocumentIR v1/ADR 0004; schemas narrativos/performance; relatório mestre §§4, 11–13, 23, 28, 62.
- Constraints: local-first; documento não confiável; OCR/visual adapters ausentes; preservar fonte; sem backend obrigatório; mudanças pequenas; publicar estado real `DESIGNED/SCAFFOLDED/IMPLEMENTED/TESTED`.
- Unknowns: engine OCR/visual, formatos de tabela/fórmula, métricas e limiares de qualidade, storage browser real, fixtures reais/maliciosas não fornecidas.
- Risks: quebrar DocumentIR v1, confiança falsa, corrigir código silenciosamente, interpretar visual sem evidência, explosão de storage/memória e escopo gigante.
- Plan: (1) fechar e testar correção M2 atual; (2) ADR de DocumentIR v2/migração e OCR seletivo; (3) schemas/fixtures/testes puros de decisão, incerteza e migração; (4) estratégia storage/segurança/testes; (5) GAP ANALYSIS global factual; (6) gates, commits e CI; implementação de engines fica em fatias posteriores.
- Verification: 23 testes Web existentes, novos contract tests, typecheck/build/audit, Rust gates em CI, browser smoke, diff review e WORKLOG.

## PRE-FLIGHT atual — layout/ruído conservadores (2026-09-22)
- Objective: melhorar o DocumentIR extraído com blocos de linha e candidatos a cabeçalho/rodapé repetidos, sem apagar texto; validar importação no navegador se a ferramenta permitir.
- Evidence: `main` limpo em `844cc48`, CI `quality` verde; parser PDF.js 5.4.296 já testado com PDF real; relatório mestre RF-STR-007 e M2; ADR 0004 exige proveniência e `unknown` para incerteza.
- Constraints: local-first, sem OCR/IA/backend; texto bruto e IDs estáveis preservados; apenas heurísticas determinísticas auditáveis; nenhuma nova dependência.
- Unknowns: comportamento da automação de browser neste host e PDFs reais com múltiplas colunas; sem fixtures reais do usuário.
- Risks: falso positivo em cabeçalhos, geometria PDF inconsistente, perda/reordenação ao agrupar itens e API de browser indisponível.
- Plan: extrair agrupamento geométrico pequeno em função pura; marcar repetição apenas com evidência entre páginas; testes de casos positivos/negativos; gates e smoke possível; revisar diff.
- Verification: Vitest, typecheck, build, audit, CI Rust/Web e comparação de contagem/texto preservado; registrar limites e resultados no WORKLOG.

## PRE-FLIGHT
- Objetivo verificável: importar PDF local em Web Worker, produzir DocumentIR v1 validado e mostrar páginas/blocos com proveniência em interface acessível.
- Evidências: `main` limpo em `a0de960`; CI `quality` M1 verde; contrato Rust/TS e fixture compartilhada; relatório mestre §62 (M2); ADRs 0002/0004; API oficial PDF.js.
- Restrições: MVP local-first, sem backend ou IA; conteúdo PDF é dado não confiável; não descartar blocos incertos; preservar o relatório mestre original; usar a skill `humanizer` ao criar textos da interface.
- Desconhecidos: comportamento do PDF.js 6.3.289 com worker Vite e teste Node a confirmar experimentalmente; testes Rust locais bloqueados pela ausência do linker MSVC.
- Riscos: PDFs enormes, PDFs protegidos/corrompidos, texto sem leitura ordenada, páginas de imagem sem OCR, renderização de texto não confiável.
- Plano: (1) instalar versão fixada de PDF.js e isolar adapter; (2) teste de extração real e falhas; (3) conectar worker e viewer com microcopy revisada pela skill humanizer; (4) gates, revisão e CI antes de encerrar M2.
- Verificação: testes Web com fixture PDF, typecheck, build, audit, smoke de browser se disponível, Rust gates no CI e revisão do diff.

## Critérios de aceitação
- M1: concluído em `a0de960`; CI `quality` passou.
- M2: PDF válido extrai texto por página sem rede/backend; PDF inválido retorna erro claro; página sem camada textual permanece representada e sinaliza OCR; usuário vê resultado e origem por página.

## Resultados históricos da etapa inicial
- Alterações: adapter PDF.js 5.4.296 em Worker, viewer inicial, fixture real; layout/noise ainda pendentes naquele commit. Adendo de narração/performance em ADRs 0005/0006, contratos e testes iniciais.
- Verificações: fixture PDF de duas páginas; 16 testes Web, typecheck, build e audit (0 vulnerabilidades) passaram naquela etapa. Rust sem alterações, coberto pela CI.
- Pendências então: browser smoke, heurísticas layout/noise, golden mainframe real e implementação M3–M5.

## Resultados da etapa atual
- Alterações: agrupamento determinístico de itens em linhas; flags de candidatos a margens repetidas sem descarte; decoder de mensagens do Worker para isolar protocolo PDF.js.
- Verificações: 23 testes Web, typecheck e build passaram; browser real importou PDF sintético de duas páginas e exibiu `needs_ocr` na segunda; arquivo inválido retornou erro claro; sessão limpa sem erros JS.
- Pendências: PDFs reais complexos/multicoluna e matriz de browsers ficam para hardening; golden mainframe real não fornecido. Audit e CI finais aguardam publicação.
- Próximo passo: M3 checkpoints/persistência/retomada em fatia pequena, depois capability profiler conforme fases documentadas.

## PRE-FLIGHT complementar — revisão de narração e performance (2026-09-22)
- Objective: formalizar o pipeline narrativo, QA pré-TTS e execução adaptativa/durável como requisitos, contratos e ADRs; criar testes de schema, sem antecipar implementação M4/M5.
- Evidence: pedido colado pelo usuário; relatório mestre §§4.6, 21, 23, 62; ADRs 0001–0004; código atual só possui core DocumentIR/job e adapter PDF inicial.
- Constraints: local-first; sem backend obrigatório; documentos são entrada não confiável; humanizer para futura microcopy de UI; não prometer inferência Web com aba fechada.
- Unknowns: engines, benchmarks e limiares de hardware ainda não medidos; audiobook/mainframe real e golden não foram fornecidos.
- Risks: inflar pipeline sem evidência; scores subjetivos apresentados como certeza; duplicar contratos Rust/TS; degradar tempo até primeiro áudio.
- Plan: mapear gaps, criar ADRs e especificação de estágios/qualidade/performance, declarar schemas de fronteira e fixtures/testes iniciais; implementação funcional apenas em milestones posteriores.
- Verification: testes dos contratos novos, gates Web e Rust disponíveis, revisão do diff e CI.

## PRE-FLIGHT complementar — arquitetura adaptativa, primeira execução (2026-09-22)
- Objective: consolidar requisitos de TTFA/geração progressiva/JIT, contratos e estados separados sem afirmar que TTS já funciona; entregar desenho e fases verificáveis.
- Evidence: segundo pedido colado pelo usuário; `main` em `827056a` com PDF inicial; adendo e ADR 0006 ainda staged; relatório mestre §§21, 23, 62; `GenerationJob` Rust possui estados lineares, Web só importa PDF.
- Constraints: primeira execução prioriza análise/contratos; local-first e sem conta/backend/cloud obrigatório; não mutar o relatório original preservado; não alegar background Web durável.
- Unknowns: engines/modelos/benchmarks e hardware real não testados, política de voz perceptivelmente diferente não decidida, browser smoke indisponível neste host.
- Risks: conflitar `AUTO` da UI com `balanced` técnico; usar estado único para playback e export; falsa precisão de TTFA; esconder falha de buffer ou trocar voz silenciosamente.
- Plan: alinhar ADR 0006 com `auto | fast | quality`, criar ADR de estados independentes, requisitos/estratégia de testes e ajustar contratos/fixtures; não implementar profiler/router/producer ainda.
- Verification: testes de schema, typecheck, build, audit, diff; Rust via CI após push.

## RESULT M3.2 — 2026-09-22
- Status: IMPLEMENTED/TESTED no escopo Web, incluindo smoke real em Chrome local.
- Entregue: OPFS, Web Locks, metadata transacional IndexedDB v2, coordenação local, sequência sob lock, retomada validada, reconciliação e eviction física segura, wiring do navegador e test tiers.
- FAST: 27/27 testes focados, 0,84 s; typecheck final também passou.
- STANDARD: typecheck + 74/74 testes + build, 14,74 s.
- Não executado nesta fatia: browser matrix real, fuzz/soak, Rust local (sem mudança Rust; linker MSVC segue ausente).
- Próximo passo: revisão final de diff, commit/push/CI; depois iniciar M4 Narrative Compiler em fatia pequena, sem integrar TTS real ainda.

## PRE-FLIGHT M4.1 — Narrative Quality determinístico (2026-09-22)
- Objective: implementar a primeira fatia executável do Narrative Compiler sem LLM/TTS: deduplicação de heading falado, memória narrativa compacta e detector de aberturas formulaicas.
- Evidence: ADR 0005 e `docs/NARRATIVE_AND_PERFORMANCE.md`; schemas narrativos v1 já existem e são testados; o problema prioritário reportado pelo usuário é repetição de títulos/subtítulos e frases de abertura.
- Constraints: sem modelo externo nesta fatia; nenhuma remoção silenciosa; source refs continuam obrigatórias; heurísticas devem retornar sinal/review, não fingir semântica perfeita; golden mainframe real ainda não está disponível.
- Unknowns: limiares ideais de similaridade e lista final de bordões serão calibrados com corpus real.
- Risks: falso positivo em headings curtos, normalização apagar distinção técnica, regras linguísticas rígidas demais.
- Plan: (1) funções puras de normalização/overlap; (2) guard de heading anunciado vs início do corpo; (3) reducer de memória narrativa; (4) detector de aberturas repetidas; (5) testes focused; (6) docs/status.
- Verification: `npm run test:fast` não cobre M4, então executar teste focado novo + typecheck; STANDARD apenas ao fechar a fatia.

## Controle de execução M4.1
- Task Risk: MEDIUM.
- Writer: Lead/Orchestrator.
- Allowed Files: `.ai/`, `apps/web/src/schemas/`, novo módulo/testes narrativos, docs narrativos/gap.
- Do not touch: TTS, OCR engine, backend, modelos reais.
- Independent Review Required: YES antes de merge; nesta sessão o review será diff/test evidence, sem alegar subagente se não houver ferramenta disponível.

## RESULT M4.1 — 2026-09-22
- Status: IMPLEMENTED/TESTED para guards determinísticos e QA básico.
- Entregue: heading dedup/prefix/token overlap, memória narrativa, formulaic opener frequency, source-ref validation e `buildNarrationQa`.
- Focused: 9/9 + typecheck PASS.
- STANDARD: 83/83 + typecheck + build PASS (16,94 s).
- Deferred: semantic similarity/model judge, ContentModel, SemanticOutline, planner/model adapter, golden mainframe real.
- Próximo passo: M4.2 ContentModel/SemanticOutline e adapter de planner com structured output, sem TTS.

## PRE-FLIGHT M4.2 — ContentModel, SemanticOutline e Planner Port (2026-09-22)
- Objective: criar a ponte tipada e executável DocumentIR v2 → ContentModel → SemanticOutline, preservando toda região/proveniência, e definir a fronteira do futuro Narrative Planner sem integrar LLM.
- Evidence: M4.1 está em `main` no commit `8bbf505`; ADR 0005 exige ContentModel/SemanticOutline antes do planner; DocumentIR v2 já representa incerteza, qualidade e conteúdo complexo.
- Constraints: nenhuma inferência conceitual inventada; regiões uncertain/review/unsupported permanecem representadas; planner externo só entra por port e saída será validada por schema; sem TTS/OCR engine.
- Unknowns: ontologia de conceitos e relações será calibrada com golden real; o manual mainframe ainda não está disponível neste repo.
- Risks: transformar layout em semântica cedo demais, omitir regiões não narráveis, duplicar IDs ou perder source refs.
- Plan: (1) schemas ContentModel/Outline; (2) builder determinístico source-safe; (3) outline skeleton por headings sem inferir conceitos; (4) PlannerPort + boundary validator; (5) testes focados; (6) STANDARD e docs.
- Verification: novos testes de preservação 1:1, incerteza, seções, schema e saída inválida do planner; typecheck; STANDARD ao fechar.

## CORREÇÃO ARQUITETURAL M4.2 — Rust core ownership (2026-09-22)
- Motivo: revisão confirmou que regras canônicas estavam crescendo em TypeScript apesar dos ADRs 0002/0003 definirem domínio Rust.
- Decisão persistente: ADR 0010 + AGENTS.md. Rust passa a possuir DocumentIR/migrações, ContentModel, SemanticOutline, memória/QA narrativos, provenance/source validation, state machines e transforms determinísticos. TypeScript fica com UI/Web APIs/adapters e schemas espelho de fronteira.
- Portado nesta fatia: DocumentIR v2 + v1→v2, ContentModel, SemanticOutline, NarrativePlan validation, heading overlap, memória narrativa, formulaic opener signal e narration QA para `audiobook-core`.
- `audiobook-wasm` virou fachada fina para validar DocumentIR v2, construir ContentModel/Outline e validar NarrativePlan.
- Removido do TypeScript: implementação canônica de Narrative Quality e migração v1→v2. `content_model.ts` permanece somente como schema Zod de fronteira, com fixtures compartilhadas/paridade estrutural.
- Rust local: toolchain não está no PATH deste PC; validação Rust será feita no GitHub Actions, sem afirmar PASS antes da CI.
- Web STANDARD: typecheck + 74/74 testes + build PASS em 17,73 s.

## RESULT — Rust core ownership
- Status: IMPLEMENTED/TESTED para a fatia de domínio portada.
- CI branch `5807e79`: Rust SUCCESS; Web SUCCESS.
- Fonte canônica: `crates/core` para domínio determinístico; `apps/web` para Web APIs/adapters/UI.
- Regra persistente: AGENTS.md + ADR 0010.
- Próximo passo: wiring real do `audiobook-wasm` no Web e paridade automática Rust↔TS; depois continuar M4 planner/model adapter sem mover lógica canônica de volta ao TypeScript.

## PRE-FLIGHT seguinte — M4.3 fronteira narrativa Rust/WASM (planejado em 2026-09-22)
- Objective: fechar a execução determinística NarrativePlan → validação de provenance → NarrationQA pelo core Rust/WASM, sem integrar LLM/TTS.
- Evidence: integração Rust/WASM/Web já está verde; `validate_narrative_plan_json` existe na fachada WASM; `build_narration_qa` existe no core Rust mas ainda não está exposto/consumido pelo Web.
- Constraints: Rust permanece fonte canônica; TS só adapter/fronteira; usar WASM real nos testes; nenhuma regra de heading/QA em TS; sem modelo externo e sem TTS; generated WASM deve ser regenerado pela toolchain pinada.
- Unknowns: formato mínimo do input de section speech para QA e fixture narrativa compatível com o ContentModel atual; resolver antes de escrever adapter público.
- Risks: drift de bindings gerados, fixture incompatível com sourceRefs, duplicação involuntária de validação no TS, CI host-specific.
- Plan: (1) definir contrato de entrada QA no Rust/WASM; (2) exportar função; (3) regenerar bindings; (4) adapter TS fino; (5) fixtures/parity; (6) focused tests; (7) STANDARD + Rust gates + CI; (8) registrar handoff.
- Verification: cargo fmt/test/clippy; npm wasm:build; teste real do bundle WASM; npm test:standard; npm audit quando dependências mudarem; CI quality.
- Stop condition: se bindings não puderem ser regenerados, toolchain estiver indisponível ou qualquer gate falhar, registrar BLOCKED e não avançar para planner/modelo.

## PRE-FLIGHT de execução — M4.3A (2026-09-22)
- Base: `codex/m4-content-model` limpa em `c671945`; workflow `quality` desse HEAD concluiu com sucesso (run `35778466312`).
- Objective: expor no WASM a validação contextual de NarrativePlan e o NarrationQA determinístico do core, com entrada explícita de falas por seção.
- Evidence: `NarrativePlan::validate_against` e `build_narration_qa` já existem no Rust; `validate_narrative_plan_json` é a única exportação narrativa atual.
- Constraints: único writer Lead; sem modelo, adapter TS ou TTS neste batch; source refs derivados do ContentModel validado; nenhum QA para plano contextual inválido.
- Risks: serialização de fala ausente, contagens arbitrárias, deriva dos bindings gerados.
- Verification: testes Rust de plano válido/inválido e QA; regeneração WASM; fmt/test/clippy; Web STANDARD; CI antes de M4.3B.

## PRE-FLIGHT de execução — M4.3B (2026-09-22)
- Base: M4.3A publicado em `9f7aca5`; workflow `quality` run `35802591562` verde nos jobs Rust e Web.
- Objective: criar adapter TypeScript de fronteira para validar plano e solicitar QA ao WASM real, sem duplicar regras narrativas.
- Evidence: funções `validate_narrative_plan_json` e `build_narration_qa_json` estão nos bindings gerados; `rust_content_pipeline.ts` demonstra o padrão de carregamento/validação de contratos.
- Constraints: TS valida shape de entrada/saída e encaminha ao core; sem planner/modelo/TTS; manter `REVIEW` para claims não avaliados; um writer Lead e QA independente.
- Risks: schema TS divergir do Rust, inicialização WASM em contexto errado, erro WASM perder mensagem, adapter aceitar plano inválido.
- Plan: adapter fino e testes de fronteira com fake injetável para encaminhamento e falhas; deixar fixture completa e execução real do bundle para M4.3C.
- Verification: teste focado, typecheck, Web STANDARD e revisão; CI antes de M4.3C.

## PRE-FLIGHT de execução — M4.3C (2026-09-22)
- Base: M4.3B publicado em `b03bd28`; workflow `quality` run `35803065588` verde em Rust e Web.
- Objective: provar com fixture compartilhada que NarrativePlan e falas atravessam adapter TS → WASM real → core Rust, retornando NarrationQA coerente e erro tipado para provenance inválida.
- Evidence: export `build_narration_qa_json` gerado no M4.3A e adapter TS validado com fake no M4.3B; fixture ContentModel/Outline atual possui a fonte `r_1_1`.
- Constraints: fixture sem inferência semântica inventada; nenhum modelo, planner externo ou TTS; Rust segue autoridade final; não alterar UI.
- Risks: fixture não corresponder aos contratos Rust/TS, inicialização do WASM no teste Node, teste passar sem chamar binário real.
- Plan: criar fixture NarrativePlan v1 compatível com o ContentModel atual sem substituir a fixture narrativa histórica, validá-la no Rust, executar plano e QA por adapter TS com WASM real, cobrir source ref inválida, rodar Rust fmt/test/clippy + Web STANDARD + CI e revisar diff.
- Verification: teste Rust da fixture, teste Vitest com binário `.wasm` real, gates completos, revisão independente e CI.

## PRE-FLIGHT de execução — M4.4A Planner Port com fake (2026-09-22)
- Base: M4.3C publicado em `5b97d1f`; workflow `quality` run `35803514527` verde em Rust e Web.
- Objective: definir port Web para receber NarrativePlan como objeto estruturado de um planner e validá-lo pelo core Rust/WASM antes de disponibilizá-lo; testar com fake determinístico de fixture, sem modelo real.
- Evidence: ADR 0005 e `docs/NARRATIVE_AND_PERFORMANCE.md` exigem saída estruturada, schema, source mapping e QA antes de TTS; M4.3 validou a fronteira Rust/WASM.
- Constraints: nenhuma heurística de plano em TS, nenhuma inferência inventada, entrada do modelo é não confiável; fake usa fixture fixa apenas; sem prompt/modelo/TTS/UI nesta fatia.
- Risks: fake parecer capacidade real, erro de modelo escapar sem tipo, plano estruturalmente válido burlar provenance, port ser usado antes de QA.
- Plan: contrato de port de objeto estruturado, adapter de validação com Rust, fake de fixture para teste, casos de falha de port/shape/provenance, gates e revisão. Não adicionar modelo externo.
- Verification: testes focados e Web STANDARD; Rust gates mínimos; revisão independente; CI antes de ampliar planner.

## RESULT M4.4A — 2026-09-22
- Status: IMPLEMENTED/TESTED para port estruturado com fake de fixture e validação Rust/WASM; nenhum modelo real ou TTS.
- Gates: Rust fmt/test (26 testes), Web STANDARD (84/84 testes/typecheck/build) e workflow `quality` run `35804071973` em `f74229f` passaram.
- Próximo passo: contrato de roteiro/source mapping e QA crítico com revisão explícita antes de avaliar modelo local real. TTS permanece bloqueado.

## PRE-FLIGHT de execução — M4.4B roteiro e source mapping (2026-09-22)
- Base: branch `codex/m4-content-model` limpa em `122e9b2`; workflow `quality` do HEAD, run `35804316448`, concluído com `success` (GitHub API consultada antes de editar).
- Objective: definir contrato canônico de roteiro com texto e referências por trecho, validar alinhamento com NarrativePlan/ContentModel no Rust e produzir QA crítico com revisão explícita para claims não avaliados.
- Evidence: ADR 0005 e adendo narrativo exigem roteiro, source mapping e QA antes de TTS; M4.4A só retorna plano candidato e QA pendente.
- Constraints: Rust possui invariantes e QA; TypeScript apenas espelha fronteira e chama WASM. Sem modelo real, geração automática, OCR ou TTS. Nenhum status `pass` por source refs estruturalmente válidas; grounding semântico segue pendente.
- Unknowns: formato de atestação de revisão humana/verificador e corpus mainframe real; ambos permanecem fora deste batch.
- Risks: aceitar referência válida mas irrelevante como suporte semântico; roteiro omitir seção do plano; heading duplicado; drift Rust/TS/WASM.
- Plan: contrato Rust para roteiro e validação contextual; QA que inclui checks críticos atuais e força revisão de claims; export WASM e adapter TS fino com teste de integração real; gates locais, revisão independente, push e CI. Atualizar WORKLOG/HANDOFF antes do commit e após CI.
- Verification: `cargo fmt --all -- --check`, `cargo test --workspace`, clippy, `npm run wasm:build`, `npm run test:standard`, diff check e workflow `quality` do commit publicado. Não avançar se algum gate falhar.

## RESULT M4.4B — validação local (2026-09-22)
- Status: contrato Rust/WASM/Web implementado e testado localmente; publicação e CI do novo commit ainda pendentes neste registro.
- Entregue: `NarrativeScript` canônico com texto e source refs por trecho; validação de cobertura, ordem, identidade do plano esperada e refs da seção/transição; QA estrutural/heading com claim grounding em `review`; fixture compartilhada e adapter TS fino.
- QA independente encontrou P1 em refs de transição e vínculo de `planId`; ambos corrigidos e cobertos em Rust e WASM real. Segunda revisão sem P0/P1.
- Gates: Rust fmt/test (28 testes)/clippy, `npm run wasm:build`, Web STANDARD (88 testes, typecheck, build) e `git diff --check` passaram.
- Limites: não há geração automática de roteiro, verificador semântico, golden mainframe real ou TTS. Futuro artefato persistido deve vincular plan ID a conteúdo/provenance imutáveis.
- Próximo passo: commit/push/CI. Somente com CI verde iniciar próximo batch de avaliação de modelo local e contrato de revisão semântica; TTS permanece bloqueado.

## CHECKPOINT M4.4B — publicação bloqueada (2026-09-22)
- Commit local: `19d76931762f9e8ab20bc792e769ada29f5dfffc` contém o batch validado.
- `git push origin codex/m4-content-model` alcançou o GitHub fora do sandbox, mas falhou com `could not read Username for 'https://github.com': No such device or address`. Nenhuma credencial/helper GitHub está configurada nesta sessão.
- CI do commit M4.4B não existe enquanto o push não ocorrer. Stop condition aplicada: não iniciar o próximo batch nem TTS. Próxima retomada: configurar autenticação GitHub fora desta sessão, publicar commits locais e verificar workflow `quality` antes de avançar.

## PRE-FLIGHT de execução — M4.4C pacote de revisão semântica (2026-09-23)
- Base: `codex/m4-content-model` limpa em `2aaa731`; remoto alinhado. Workflow `quality` do HEAD run `35806473115` concluído com `success` (GitHub API consultada antes da alteração).
- Objective: produzir no core Rust um pacote de revisão que associe cada trecho do roteiro ao texto e ao estado de qualidade das unidades de fonte referenciadas, com identidade de plano/roteiro/fonte. O estado de revisão permanece pendente.
- Evidence: M4.4B valida apenas source mapping estrutural; ADR 0005 e adendo narrativo exigem revisão semântica e QA crítico antes de TTS. `ContentModel` já fornece `analysisText`, `qualityStatus`, `uncertainty` e `narrationEligibility`.
- Constraints: Rust possui o contrato e a transformação; WASM é fachada; TS apenas valida a fronteira. Texto importado é não confiável e não vira instrução. Sem aprovação automática, modelo real, persistência ou TTS neste batch.
- Unknowns: golden mainframe real e método confiável de atestar revisão humana/verificador. Nenhum deles está disponível neste repositório.
- Risks: tomar vínculo de referência como prova semântica; pacote perder múltiplas unidades com mesma referência; revisão ficar desatualizada após mudança no plano/roteiro/fonte; vazamento de texto em logs.
- Plan: criar pacote canônico com hashes de plano/roteiro/fonte, evidência de todas as unidades correspondentes e status `pending`; expor no WASM, espelhar na fronteira TS, testar fixture e casos sem texto/refs inválidas. Revisão independente, gates completos, WORKLOG/HANDOFF, commit, push e CI.
- Verification: Rust fmt/test/clippy; `npm run wasm:build`; Web STANDARD com WASM real; diff check; workflow `quality` do commit remoto. Não iniciar próximo batch se algum gate falhar.

## RESULT M4.4C — validação local (2026-09-23)
- Status: pacote de revisão implementado e validado localmente. Publicação e CI do novo commit pendentes neste registro.
- Entregue: `ScriptReviewPacket` canônico em Rust, com evidência por trecho, texto e qualidade das unidades de fonte, estado `pending` e hashes de fonte, ContentModel, plano e roteiro. WASM exporta pacote; TS espelha contrato e classifica falhas da fronteira. Nenhuma decisão de aprovação é aceita neste batch.
- QA independente encontrou P1: `ContentModel` aceitava `documentId` e `sourceHash` incongruentes. Corrigido no core, com regressão Rust e WASM real. P2 de texto de análise vazio e refs duplicadas também corrigidos. Segunda revisão sem P0/P1.
- Gates finais: `cargo fmt --all -- --check`, `cargo test --workspace --locked` (30 testes), clippy `-D warnings`, `npm run wasm:build`, Web STANDARD (90 testes, typecheck, build), `git diff --check` passaram.
- Limites: pacote não decide fidelidade semântica, não persiste revisão e não libera TTS. Golden mainframe real e método de atestação ainda indisponíveis. Próximo passo após CI verde: contrato de decisão explícita com vínculo aos hashes e revisão humana/verificador confiável.

## RESULT M4.4C — publicação e CI (2026-09-23)
- Commit `1c5394d1d5e783872502598955c5eef0d40dca36` publicado em `origin/codex/m4-content-model`; workflow `quality` run `35834617808` concluiu com `success` nos jobs Rust e Web.
- Batch concluído no escopo do pacote de evidência. Próximo batch: decisão de revisão explícita vinculada aos hashes, mantendo TTS bloqueado até aprovação confiável e QA crítico.

## PRE-FLIGHT de execução — M4.4D contrato de decisão de revisão (2026-09-23)
- Base: checkout local limpo atualizado por fast-forward para `88af119` em `codex/m4-content-model`; workflow `quality` run `35834973158` do HEAD remoto concluiu com sucesso.
- Objective: criar contrato canônico Rust para submissão de decisões por trecho, vinculado ao pacote de revisão atual e a seus hashes; rejeitar revisão incompleta, stale, evidência ausente ou sem texto. Entregar somente validação estrutural: nenhuma decisão equivale a atestação confiável ou libera TTS.
- Evidence: M4.4C fornece `ScriptReviewPacket` com IDs de trechos, unidades de fonte e hashes; ADR 0010 mantém invariantes no core; QA atual mantém claims em `review`.
- Constraints: Rust é fonte de verdade; WASM/TS somente fronteira se incluídos nesta fatia. Sem UI, modelo real, credencial/identidade de revisor, persistência de revisão, OCR ou TTS. Entrada de documento/modelo é não confiável; não registrar texto de fonte em logs.
- Unknowns: como autenticar revisor humano ou verificador confiável; corpus/golden mainframe real e política final de aprovação. Não inferir confiança a partir de campos enviados pelo cliente.
- Risks: decisão stale após mudança de fonte/plano/roteiro, trechos omitidos/duplicados, evidência fabricada ou sem texto, `supported` ser interpretado como QA `pass`.
- Plan: (1) contrato e validação Rust contra pacote recalculado; (2) testes de hashes, cobertura, evidência e fonte sem texto; (3) fachada WASM e adapter TS fino com paridade real, se o contrato estiver estável; (4) gates, revisão independente, WORKLOG/HANDOFF e CI. Não avançar a TTS.
- Verification: `cargo fmt --all -- --check`, `cargo test --workspace --locked`, clippy `-D warnings`, `npm run wasm:build`, Web STANDARD, diff check e workflow `quality` após publicação. Distinguir teste local de CI.
- Task Risk: HIGH. Writer: Lead. Revisão independente obrigatória, read-only, após implementação.

## RESULT M4.4D — validação local (2026-09-23)
- Status: contrato de submissão implementado em Rust/WASM/Web, sem atestação ou persistência. Publicação e CI deste batch pendentes neste registro.
- Entregue: validação contra hashes/IDs recalculados, cobertura exata de trechos, rationale e evidência por source ref para `supported`; rejeição de fonte sem texto ou bloqueada. Recibo contém hash da submissão e `attestationStatus: unverified`.
- Revisão independente encontrou P2: uma decisão `supported` podia citar só parte das referências do trecho. Corrigido com cobertura por referência e regressões Rust/WASM real; segunda revisão confirmou correção e não encontrou P0/P1.
- Gates locais: Rust fmt/test (33 testes)/clippy passaram; `npm run wasm:build` passou; Web STANDARD passou com 93 testes, typecheck e build; `npm audit --audit-level=high` encontrou 0 vulnerabilidades; `git diff --check` passou. CI após publicação ainda pendente.
- Limites: não há identidade confiável de revisor, atestação, golden mainframe real, persistência de decisão, QA `pass` ou TTS. Próximo batch seguro: definir confiança e assinatura/identidade de revisão antes de qualquer liberação por QA; obter corpus real para avaliar claims.

## RESULT M4.4D — publicação e CI (2026-09-23)
- Commit de código `28658f67c945ef7b9b450160e04beebd433b5e9f` publicado em `origin/codex/m4-content-model`; `git ls-remote` confirmou o mesmo hash local e remoto, com árvore limpa.
- Workflow `quality` run `35856262003` desse commit concluiu com sucesso. Contrato estrutural validado; atestação confiável e TTS permanecem fora do escopo.

## PRE-FLIGHT — M4.4E vínculo persistente de revisão (2026-09-23)
- Base: `codex/m4-content-model` limpa em `47fbcda6`; handoff M4.4D e ADR 0010 lidos. Sem mudança remota observada neste checkout.
- Objetivo: persistir submissão e recibo `unverified` como artefato local não regenerável, vinculado ao hash da submissão, e revalidar contra o estado Rust/WASM atual na leitura.
- Evidência: M4.4D produz recibo canônico, mas não persiste revisão; storage atual usa OPFS + manifest/checkpoint IDB e lock por projeto.
- Restrições: Rust segue canônico; TS faz só Web storage e validação de fronteira. Não criar atestação, QA `pass`, modelo, UI ou TTS. Checksum local não prova identidade humana nem resiste a código de mesma origem comprometido.
- Desconhecidos: identidade/credencial confiável do revisor, política de aprovação e corpus mainframe real. Registrar proposta/limites em ADR, sem inventar implementação de WebAuthn.
- Riscos: revisão obsoleta, troca de submissão/recibo, corrida com checkpoint, perda por limpeza automática, confusão entre persistência e confiança.
- Plano: acrescentar tipo de artefato de revisão, adapter pequeno de gravação/leitura usando persistência existente e validação WASM, testes de integridade/stale, ADR; rodar gates, revisar diff e registrar resultados.
- Verificação: testes direcionados, Rust fmt/test, build WASM, Web STANDARD, diff check; CI remoto somente se commit/push efetuados.
- Risco: alto; um writer e revisão independente após código.

## RESULT — M4.4E validação local (2026-09-23)
- Artefato de revisão não regenerável e fixado, com submissão e recibo vinculados ao hash calculado pelo Rust. A leitura histórica reconfere integridade e recibo contra o contexto fornecido; `currentness: not_established` preserva o limite de confiança.
- Revisão independente encontrou risco de contexto antigo com mesma fonte e corrida durante a leitura. API histórica explícita e segunda checagem do checkpoint aplicadas. Segunda revisão apontou bloqueio da leitura histórica após troca de fonte ativa; removida a exigência de vínculo com o checkpoint atual, preservando manifest e integridade. Regressões adicionadas.
- Gates após correções: Rust fmt/test (33)/clippy; Web STANDARD (97 testes, typecheck, build); audit 0 vulnerabilidades. Publicação/CI pendentes. Sem atestação, QA `pass` ou TTS.
- Publicação: commit `c513744` no remoto; workflow `quality` run `35860380680` concluído com sucesso. O próximo batch permanece bloqueado para TTS até identidade ativa, atestação e avaliação semântica.

## PRE-FLIGHT — M4.4F identidade ativa de narrativa (2026-09-23)
- Base: branch `codex/m4-content-model` limpa, HEAD local/remoto `cf4d66e9`; handoff, ADRs 0010–0011, contexto Rust/WASM e storage lidos antes de editar.
- Objetivo: definir no Rust a identidade canônica do plano/roteiro validado e publicá-la como ponteiro ativo persistente no checkpoint local. Revisão histórica continua `unverified`; nenhuma liberação de QA/TTS.
- Evidência: M4.4E salva recibo, mas `currentness` permanece `not_established` porque checkpoint não identifica plano/roteiro ativos. O core já calcula hashes de conteúdo, plano e roteiro no pacote de revisão.
- Restrições: Rust calcula hashes/identidade; TS somente valida fronteira e opera IndexedDB/OPFS/Web Locks. Um único writer. Sem UI, modelo real, atestação ou TTS. Mudanças pequenas e com paridade WASM real.
- Desconhecidos: revisor confiável, política de atestação, corpus mainframe real e fluxo de edição de roteiro na UI. O registro ativo não equivale a revisão semântica.
- Riscos: ponteiro stale após troca de fonte, múltiplos ativos, artefato ausente/corrupto, corrida ao publicar checkpoint, reinterpretar identidade ativa como aprovação.
- Plano: contrato Rust e testes; export WASM/schema/adapters Web; persistir ponteiro ativo com troca explícita e teste de recuperação/corrida; revisão independente; gates, worklog/handoff, commit e push após validação.
- Verificação: Rust fmt/test/clippy, build WASM, Web STANDARD e audit, diff check, CI do commit remoto. Não iniciar TTS.
- Risco: HIGH; Lead único writer e QA independente read-only.

## RESULT — M4.4F validação local (2026-09-23)
- Identidade narrativa canônica calculada em Rust, incluindo hash do outline, plano, roteiro, conteúdo e fonte; WASM e schema TS espelham a fronteira. Adapter Web publica um único ponteiro ativo OPFS/IndexedDB e detecta identidade antiga, corrupção e corrida.
- Revisão independente apontou risco de conservar estado `READY_FOR_AUDIO` e referências a áudio após troca. Rust agora só permite ativação em `VERIFYING`; adapter rejeita áudio referenciado ou manifest ausente. Regressões Web/Rust adicionadas.
- Apostila COBOL do usuário inspecionada apenas localmente; 75 páginas com texto. Não há golden semântico nem execução do pipeline nessa fonte. A primeira aparência de acentos quebrados foi erro de exibição do terminal, não evidência de corrupção do PDF.
- Gates: Rust 35 testes, fmt check e clippy `-D warnings`; build WASM; Web STANDARD 103 testes/typecheck/build; `npm audit --audit-level=high` sem vulnerabilidades; `git diff --check` passaram. O primeiro Vitest no sandbox falhou com `spawn EPERM`; a repetição com permissão para subprocessos passou. Publicação/CI ainda pendentes neste registro. Não há atestação, QA `pass` ou TTS.
- Segunda revisão independente read-only confirmou a correção do P2 de estado/áudio e não encontrou novo P0/P1/P2. O revisor inspecionou testes; execução dos gates foi feita pelo Lead.

## PRE-FLIGHT — M4.4G vínculo da revisão ao contexto ativo (2026-09-23)
- Base: branch `codex/m4-content-model` limpa; HEAD local/remoto `a868dc36a48f174496f6961bbbeeee27c9321da7`; CI `quality` desse commit passou no run `35864829680`. `AGENTS.md`, `CONTEXT_INDEX`, handoff, task packet, worklog, ADRs 0010–0012 e adapters de revisão/identidade lidos antes da edição.
- Objetivo: oferecer avaliação explícita e verificável de uma revisão histórica contra a narrativa ativa, sem confundir correspondência estrutural com atestação ou QA semântica. Manter a leitura histórica e o recibo `unverified`.
- Evidência: M4.4F publicou identidade ativa, mas `readHistoricalAgainstContext` continua `currentness: not_established`. O novo PDF do usuário tem 105 páginas com camada de texto; a extração apresenta caracteres da área privada Unicode em todas as páginas, apesar de uma página renderizada legível. Usá-lo como corpus local para qualidade de ingestão; não publicar o arquivo.
- Restrições: Rust detém comparação canônica de identidades/recibos; TS só valida fronteira, lê OPFS/IndexedDB e coordena os adapters. Sem UI, TTS, modelo real, atestação automática ou backend. Um único writer; revisão independente read-only.
- Desconhecidos: política de revisor confiável, golden semântico, integração do fluxo de edição na UI e qualidade de OCR/extração do novo PDF. Correspondência de hashes não prova leitura humana nem fidelidade do texto.
- Riscos: contexto antigo apresentado como atual, corrida entre duas leituras, revisão sem vínculo de outline, corrupção de artefato, caracter privado narrado como texto e classificação prematura como aprovado.
- Plano: contrato de comparação no Rust e WASM, adapter de avaliação conservadora contra identidade ativa, regressões de troca/corrida/ausência/corrupção, nota do corpus local, ADR e worklog. Se a regra exigir expansão de contrato maior, limitar a entrega ao estado explícito `not_established` e documentar.
- Verificação: fmt/test/clippy Rust, build WASM, testes Web com WASM real, typecheck/build, audit, diff check, revisão independente e CI após push se gates verdes. TTS não será iniciado.
- Risco: HIGH.

## RESULT — M4.4G validação local (2026-09-23)
- O primeiro desenho revalidava apenas a revisão antiga; QA independente apontou falta de prova do outline original, risco de corrida e colisão da chave. Contrato revisado: `bindingHash` canônico em Rust inclui a identidade ativa completa e o hash da submissão; envelope v2 usa esse hash como chave. V1 continua `not_established`; v2 válido retorna `bound_unverified`. Recibo permanece `unverified`; nenhuma aprovação de QA/TTS.
- Novo PDF COBOL/CICS examinado apenas localmente: 105 páginas, 1.066.609 bytes, texto extraível em todas, mas 36.111 caracteres de área privada Unicode em 488.556 caracteres extraídos. Página 27 renderizada é legível e mostra sobreposição visual em parte da lista/rodapé. Corpus registrado em `docs/INGESTION_TEST_STRATEGY.md`, sem copiar o PDF para o repositório. OCR e fidelidade não foram medidos.
- Gates finais: Rust fmt, 36 testes workspace e clippy `-D warnings`; WASM regenerado; Web STANDARD 107 testes/typecheck/build; `npm audit --audit-level=high` 0 vulnerabilidades; diff check. O clippy apontou inicialmente oito argumentos no core e depois no export WASM; ambas as APIs foram agrupadas e os gates repetidos. Revisão independente read-only após correção não encontrou P0/P1/P2; Lead executou os testes.
- Publicação e CI do novo commit ainda pendentes neste registro. Próximo batch após CI: política/mecanismo de atestação confiável e avaliação semântica com goldens locais, além de detecção/recuperação de camada de texto suspeita. A UI e o TTS continuam fora desta etapa.
## PRE-FLIGHT — correção de seleção de WAV literal (2026-09-23)
- Base: `codex/m4-content-model`, HEAD `018607192573c121d6a764a556ed514344f8c35f`, árvore limpa. Governança e handoff consultados.
- Objetivo: verificar resalvamento de WAV e tornar recuperação tolerante a metadata JSON danificada, sem reinterpretá-lo como audiobook final.
- Hipótese inicial: possível seleção de gravação antiga por `find`. Teste mostrou que `saveLiteralAudio` remove as chaves antigas do checkpoint; hipótese refutada. Evidência confirmada: `JSON.parse` de metadata danificada lançava erro na leitura.
- Restrições: Rust mantém domínio canônico; TS só corrige seleção no adapter de storage. Sem TTS novo, UI ou backend.
- Risco: regressão de recuperação de WAV e retenção de artefatos antigos. Plano: cobrir resalvamento e corrupção de metadata; gates Web/Rust e revisão do diff.
- Desconhecido: playback/download externos ainda não comprovados; Chrome/Edge não estão expostos à automação desta sessão. CI remoto não pôde ser consultado agora.
## PRE-FLIGHT — biblioteca local de WAV literal (2026-09-23)
- Base: branch `codex/m4-content-model`, HEAD `2a136ec49cb9ba50e87c0baedb68e71851f6bb07`, árvore limpa; AGENTS, CONTEXT_INDEX, handoff, task packet, worklog, ADR 0010/0016 e contratos de persistência consultados.
- Objetivo: disponibilizar gravações literais anteriores já retidas no OPFS, com listagem validada, abertura sob demanda e download por intervalo, após reiniciar a aplicação.
- Evidência: `saveLiteralAudio` cria chaves imutáveis e o checkpoint só aponta para o WAV novo; manifests anteriores continuam no IndexedDB, mas a UI só exibe a gravação atual.
- Restrições: sessão e elegibilidade continuam canônicas em Rust; TS fica em storage/UI. Sem TTS narrativo, QA `pass`, backend, exclusão automática ou alegação de audiobook final.
- Riscos: metadata órfã/corrompida, áudio faltante, sessão antiga após troca da fonte, corrida de importação/abertura, leitura excessiva de arquivos grandes. Listar por metadata pequena; validar WAV no acesso; tratar falha isolada sem perder projeto.
- Plano: adapter de catálogo e testes de múltiplas gravações/corrupção/fonte; integrar lista e abertura sob demanda na UI; ADR, gates, revisão do diff, commit/push. Validação de reprodução auditiva/download fora do navegador integrado permanece separada se ambiente não permitir.
- Verificação: testes Web, typecheck/build, Rust fmt/test/clippy, audit, diff check. Não medir playback visualmente, conforme pedido do usuário.
## PRE-FLIGHT — retenção explícita de WAV literal (2026-09-23)
- Base: `codex/m4-content-model` limpa, HEAD local/remoto `eae4ee5c15856de772e321732259da5ec19d5ba0`. AGENTS, CONTEXT_INDEX, HANDOFF, TASK_PACKET, WORKLOG, ADRs 0001/0002/0009/0010/0016, PERSISTENCE, SECURITY, CODE_REVIEW e contratos Web lidos.
- Objetivo: permitir remover uma gravação literal histórica sob confirmação, liberando OPFS e metadados sem comprometer o checkpoint atual e um fallback íntegro. Entrega única com recuperação de falha e teste browser.
- Evidência: catálogo histórico existe; cada WAV substituído mantém manifest e arquivo; checkpoints antigos podem referenciá-lo. Não existe exclusão segura nem retomada de limpeza interrompida.
- Escopo: storage IndexedDB/OPFS/Web Locks é adapter TS; sessão de leitura/eligibilidade permanece no Rust. Não apagar fontes, revisões, áudio final ou WAV atual. Sem backend, TTS novo ou QA semântico.
- Desconhecidos: checkpoints legados/corrompidos e falhas entre IndexedDB/OPFS. Política conservadora: rejeitar compactação se histórico não for integralmente validável ou fallback não for recuperável. Nenhum dado real do usuário será apagado durante implementação/testes.
- Riscos: perda de recuperação, corrida entre abas, falha parcial de OPFS, retry duplicado, cleanup indevido. Plano: checkpoint inventory validado, transação IDB atômica que remove referências e registra deleção pendente, drenagem idempotente sob lock, UI com confirmação explícita, regressões de falha/corrida/recovery, smoke Chrome/Edge, ADR e worklog.
- Verificação: Rust fmt/test/clippy, Web STANDARD, audit, browser smoke, diff check e revisão independente se slot disponível. Risco HIGH; Lead único writer.
