# Estado real e lacunas de engenharia

> Atualizado em 08/10/2026. O mapa anterior parou antes da integração de Piper, exportação WAV e revisão OCR. **Não use aquela versão para avaliar o produto atual.** Esta avaliação parte dos arquivos existentes e dos testes/smokes registrados; não declara homologação em produção nem validação humana de fidelidade.

**Classificações:** `IMPLEMENTADO` = caminho de código presente; `TESTADO` = há teste ou smoke versionado/registrado para o comportamento; `PARCIAL` = ainda não cobre o cenário fim a fim; `PENDENTE` = contrato/ideia sem funcionalidade integral. É possível ter código e teste e **ainda assim** estar `PARCIAL` para o produto real.

| Capacidade | Situação | Evidência no código | Principal lacuna |
|---|---|---|---|
| Core Rust e ponte WASM | TESTADO / PARCIAL | `crates/core`, `crates/wasm`, `rust_content_pipeline.test.ts` | Regressão e compatibilidade dos contratos quando novas funções forem integradas. |
| PDF nativo e DocumentIR v2 | TESTADO / PARCIAL | `adapters/pdf.ts`, `pdf_layout.ts`, `crates/core/src/document_v2.rs` | Corpus variado com golden humano para ordem de leitura, tabelas e código. |
| Leitor Texto / Original | TESTADO / PARCIAL | `DocumentWorkspace.tsx`, `PdfOriginalPage.tsx`, contratos de UI | Revisão visual e comportamento real em navegadores/dispositivos adicionais. |
| OCR local seletivo | TESTADO / PARCIAL | `tesseract_local_ocr.ts`, `OcrReviewPanel.tsx` e smokes OCR | Métricas CER/WER, documentos difíceis, rotação e critérios de aceitação. |
| OCR em página sem texto | TESTADO / PARCIAL | `smoke-scanned-page-ocr.mjs`, contratos Rust/TS | Goldens e revisões de páginas digitalizadas reais. |
| Memória de ambiguidades OCR | TESTADO / PARCIAL | `ocr_learning_repository.ts`, `ocr_learning_repository.test.ts` | Avaliação de falsos positivos e política operacional de dados locais. |
| Composição canônica de até 8 revisões OCR | IMPLEMENTADO / PARCIAL | `canonical_ocr_batch.ts`, teste WASM e core Rust | **Seleção e consumo explícito do conjunto na UI/narrativa** ainda não integrados. |
| Aprovação de texto e roteiro | TESTADO / PARCIAL | `NativeTextApprovalPanel.tsx`, `NarrativePanel.tsx` | Identidade do revisor não autenticada; qualidade semântica depende de pessoa. |
| Narrativa e QA estrutural | TESTADO / PARCIAL | `crates/core/src/narrative_workflow.rs`, adapters e testes de narrativa | Rascunho inicial não é reescrita automática confiável; faltam goldens de fidelidade. |
| Síntese TTS com Piper/ONNX | TESTADO / PARCIAL | `workers/local_tts.worker.ts`, `adapters/local_wav.ts`, smoke de áudio | Modelo inicial externo, consumo em mobile, escuta humana e benchmarks. |
| WAV literal e narrativo completos | TESTADO / PARCIAL | `narrative_audio.ts`, `CompleteAudiobookPanel.tsx`, `smoke-complete-audio.mjs` | Validar documentos longos, corrupção, grandes volumes e aparelhos reais. |
| Capítulos, player e histórico | TESTADO / PARCIAL | `AudioPlayer.tsx`, `ChapterList.tsx`, `saved_literal_audio.ts` | Matriz real de dispositivos; UX de falha e retenção em ambientes com quota baixa. |
| Persistência local e recovery | TESTADO / PARCIAL | `browser_local_persistence.ts`, `indexeddb_checkpoint_repository.ts`, `opfs_artifact_store.ts` | Navegadores, falhas físicas, origem do site e limite/quota são riscos permanentes. |
| Acessibilidade e UX | IMPLEMENTADO / PARCIAL | `styles/accessibility.css`, `ui_contracts.test.tsx`, `check-product-shell.mjs` | Auditoria WCAG por teclado e leitor de tela com testes manuais. |
| Proteções de conteúdo e privacidade | IMPLEMENTADO / PARCIAL | `docs/SECURITY.md`, limites nos adapters/core, `vercel.json` | Threat model mais amplo, CSP validada, fuzz/adversarial e auditoria de rede real. |
| Testes, CI e deploy | TESTADO / PARCIAL | `.github/workflows/quality.yml`, Vitest, Rust tests e smoke opt-in | Browser E2E em CI, métricas de performance, supply chain/SBOM. |
| Diagramas/tabelas/fórmulas e imagens | PENDENTE / PARCIAL | Contratos e algumas estruturas no core/schemas | Interpretação visual confiável e narração específica de conteúdo não textual. |
| Execução com aba fechada | PENDENTE | Checkpoints recuperáveis existem; Workers vivem no navegador | Processamento durável independente da aba não existe. |

## Prioridades por risco e valor

1. **P1 — Amarrar composição OCR à narrativa:** usuário seleciona aprovações históricas explicitamente; Rust/WASM recalcula composição e evidências; testes rejeitam fontes/versões/recibos divergentes; nenhum texto é promovido em silêncio.
2. **P1 — Golden de fidelidade:** corpus público e corpus do usuário sob armazenamento local autorizado, com texto de referência e verificação humana; medir erros em prosa, código e tabelas antes de anunciar equivalência semântica.
3. **P1 — Runtime Android real:** medir tempo de geração, suspensão do navegador, limite de RAM, Web Locks/OPFS e retomada; declarar claramente recursos indisponíveis.
4. **P2 — Manutenção de fronteiras:** preservar core Rust como único validador, extrair orquestração de `App.tsx` incrementalmente com regressões para abort/reload/URL cleanup, e bloquear regressões nas referências do README/arquitetura.
5. **P2 — Distribuição e segurança:** revisar política de headers/CSP e dependências sem romper o runtime WASM/TTS; acrescentar smoke de rede, orçamento de artefatos, scripts e matriz de navegadores.
6. **P3 — Recursos avançados:** avaliar planejamento local/modelos, tabelas, imagens e execução realmente durável apenas com corpus e limites quantificados.

## Critério para considerar uma etapa encerrada

- Funcionalidade alcançável pela interface, sem endpoint/adapter fictício.
- Regras críticas validadas pelo core, com contratos e testes de paridade WASM quando aplicável.
- Unitários/integração + browser smoke quando o comportamento exige Web APIs.
- Sem alteração silenciosa de texto, fonte, roteiro, aprovações ou bytes de áudio.
- Documentação e limitações atualizadas; avaliações de qualidade humana descritas como **pendentes** até execução real.

Veja [Arquitetura](ARCHITECTURE_OVERVIEW.md), [Mapa por etapa](PRODUCT_STAGE_MAP.md), [Quality gates](QUALITY_GATES.md), [Estratégia de OCR](INGESTION_TEST_STRATEGY.md) e [Hand-off](../.ai/HANDOFF.md).
