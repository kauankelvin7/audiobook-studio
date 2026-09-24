# Arquitetura de ingestão, OCR e conteúdo complexo

Status geral: `DESIGNED`; extração nativa, captura limitada e engine OCR local `IMPLEMENTED/TESTED` em Chromium; evidência OCR histórica e comparação Rust `IMPLEMENTED/TESTED`; visão e reconciliação aplicada `NOT STARTED`.

M4.5D–J vinculam candidato, crop PNG e fonte (ADRs 0014/0018), executam Tesseract local, preservam evidência em OPFS/IndexedDB (ADR 0020), comparam tokens no Rust (ADR 0021) e registram submissão de revisão não atestada (ADR 0022). Não há reconciliação aplicada nem promoção de qualidade. A correção semântica da bbox não foi validada por revisão humana.

## Pipeline

Cada página passa por extração nativa, segmentação em regiões e análise de qualidade. O resultado `good` usa texto nativo. `partial` envia somente regiões ruins ao OCR. `no_text` permite OCR da página. `corrupted` executa OCR e reconciliação. O scheduler futuro prioriza páginas necessárias ao próximo `NarrativeSection`; processamento integral não bloqueia TTFA.

`ExtractionQualityAnalyzer` produzirá estado e evidências mensuradas. Confidence da engine é só um sinal. Outros sinais previstos: caracteres inválidos, continuidade, repetição suspeita, consistência de layout, comparação nativo/OCR e integridade de tokens técnicos. Limiar nenhum foi definido sem corpus. A política pura atual recebe o estado já analisado e decide o escopo do OCR.

## Fonte, reconciliação e incerteza

DocumentIR v2 preserva `rawText`, `ocrText` e `reconstructedText` em página/região. `OCRReconciler` futuro compara versões por região e registra evidência; não troca página inteira quando o defeito é local. Estados: `source_confirmed`, `ocr_confirmed`, `reconstructed`, `inferred`, `uncertain`, `unsupported`. Narrative Compiler pode citar incerteza, pedir revisão ou omitir afirmação. Nunca promove `uncertain` a fato; `unsupported` não vira afirmação factual.

Code validator preserva whitespace e marca tokens suspeitos sem correção silenciosa. Tabela mantém headers/rows/cells. Fórmula mantém fonte/exibição/fala. Visual adapter classifica `image | diagram | chart | screenshot | flowchart | unknown_visual` e escolhe `ignore | describe | interpret | review_required`; interpretação exige evidência confirmada. Toda região mantém página, bbox e, para visual, hash da imagem.

## Segurança e recursos

Limites atuais: PDF 32 MB e 500 páginas; captura OCR limitada por tamanho do PDF, pixels e prazo; engine local por região com cancelamento. Concorrência global e memória total ainda exigem medição. Conteúdo importado nunca executa script, HTML ou comandos. UI renderiza texto, não HTML. Formatos futuros com arquivo compactado exigem limite de expansão e path traversal guard. Logs não contêm texto integral.

## Revisão humana e auditoria

M4.5L oferece comparação local para uma região existente com bbox e texto nativo: seleciona página/região, lê o PDF salvo, gera candidato, mostra recorte, texto nativo/OCR, diferenças do Rust e registra uma escolha `unverified` em histórico. O limite da captura é PDF de 8 MB. Página sem região nativa, atestação, aplicação da correção e ações sobre o texto do documento continuam pendentes. Região pequena não bloqueia o livro quando política futura permitir `COMPLETED_WITH_WARNINGS`; uma decisão local ainda não altera QA ou descendentes.

A interface escapa caracteres invisíveis de controle apenas na exibição e mantém os bytes originais para hashes. O cancelamento interrompe captura/OCR e aborta a validação de evidência até o início de `persistNext`. Durante o commit OPFS/IndexedDB, a interface desabilita cancelamento e nova importação; uma recarga do navegador nesse intervalo pode concluir a gravação histórica no projeto anterior. O checkpoint com CAS preserva consistência da fonte.

Relatórios planejados: `ocr-report.json`, `visual-analysis.json` e `document-quality.json`, versionados e derivados de manifests. Contagens não provam qualidade. Nesta fase existem schemas, não geração/persistência dos relatórios.
