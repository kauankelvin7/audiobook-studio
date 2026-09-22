# Arquitetura de ingestão, OCR e conteúdo complexo

Status geral: `DESIGNED`; contratos centrais `SCAFFOLDED/TESTED`; extração nativa `IMPLEMENTED/TESTED`; OCR e visão `NOT STARTED`.

## Pipeline

Cada página passa por extração nativa, segmentação em regiões e análise de qualidade. O resultado `good` usa texto nativo. `partial` envia somente regiões ruins ao OCR. `no_text` permite OCR da página. `corrupted` executa OCR e reconciliação. O scheduler futuro prioriza páginas necessárias ao próximo `NarrativeSection`; processamento integral não bloqueia TTFA.

`ExtractionQualityAnalyzer` produzirá estado e evidências mensuradas. Confidence da engine é só um sinal. Outros sinais previstos: caracteres inválidos, continuidade, repetição suspeita, consistência de layout, comparação nativo/OCR e integridade de tokens técnicos. Limiar nenhum foi definido sem corpus. A política pura atual recebe o estado já analisado e decide o escopo do OCR.

## Fonte, reconciliação e incerteza

DocumentIR v2 preserva `rawText`, `ocrText` e `reconstructedText` em página/região. `OCRReconciler` futuro compara versões por região e registra evidência; não troca página inteira quando o defeito é local. Estados: `source_confirmed`, `ocr_confirmed`, `reconstructed`, `inferred`, `uncertain`, `unsupported`. Narrative Compiler pode citar incerteza, pedir revisão ou omitir afirmação. Nunca promove `uncertain` a fato; `unsupported` não vira afirmação factual.

Code validator preserva whitespace e marca tokens suspeitos sem correção silenciosa. Tabela mantém headers/rows/cells. Fórmula mantém fonte/exibição/fala. Visual adapter classifica `image | diagram | chart | screenshot | flowchart | unknown_visual` e escolhe `ignore | describe | interpret | review_required`; interpretação exige evidência confirmada. Toda região mantém página, bbox e, para visual, hash da imagem.

## Segurança e recursos

Limites atuais: PDF 32 MB e 500 páginas. Antes de OCR real, adicionar limite de pixels por página/região, resolução, dimensões, timeout, concorrência e memória. Conteúdo importado nunca executa script, HTML ou comandos. UI renderiza texto, não HTML. Formatos futuros com arquivo compactado exigem limite de expansão e path traversal guard. Logs não contêm texto integral.

## Revisão humana e auditoria

UI futura lista página/região, original, OCR/reconstrução, confiança medida e ações `ver original`, `editar`, `ignorar`, `aceitar`. Região pequena não bloqueia o livro quando política permite `COMPLETED_WITH_WARNINGS`; decisões humanas entram no audit log e invalidam só descendentes.

Relatórios planejados: `ocr-report.json`, `visual-analysis.json` e `document-quality.json`, versionados e derivados de manifests. Contagens não provam qualidade. Nesta fase existem schemas, não geração/persistência dos relatórios.
