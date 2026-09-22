# TASK PACKET — Milestone 2: PDF sem IA

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

## Resultados
- Alterações: adapter PDF.js 5.4.296 em Worker, viewer inicial, fixture real; M2 ainda não cobre classificação de layout/noise. Adendo de narração/performance em ADRs 0005/0006, contratos e testes iniciais.
- Verificações: fixture PDF de duas páginas; 16 testes Web, typecheck, build e audit (0 vulnerabilidades) passaram após os contratos finais. Rust sem alterações nesta etapa, gates cobertos na CI após publicação.
- Pendências: browser smoke M2 bloqueado pelo navegador integrado (timeout), heurísticas layout/noise, golden mainframe real e implementação M3–M5.
- Próximo passo: concluir gates/revisão, depois avançar M2 com layout/noise detection sem perder texto.

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
