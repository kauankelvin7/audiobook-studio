# TASK PACKET — Milestone 2: PDF sem IA

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
