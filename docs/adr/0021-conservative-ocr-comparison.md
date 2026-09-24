# ADR 0021 — Comparação OCR conservadora no Rust

Status: accepted (sinais determinísticos; nenhuma promoção automática)

## Contexto

O recibo OCR vincula fonte, região, pixels e texto, mas só expõe hashes e contagens de glifos privados. No teste público de código, `SAMPLE01` foi lido como `SAMPLEO1`. Uma revisão humana precisa enxergar divergências técnicas sem que o sistema confunda semelhança lexical com fidelidade visual.

## Decisão

O core Rust produz `OcrComparisonReport` a partir de DocumentIR v2 e candidato validado. O relatório fica vinculado ao `receiptHash`, aos hashes dos textos e às contagens PUA. Tokens ASCII alfanuméricos com hífen são convertidos para maiúsculas, contados como multiset e comparados em ordem lexical. Cada diferença mostra token, ocorrências nativas/OCR e presença de dígito. A tokenização é um sinal restrito a código ASCII; não avalia prosa Unicode, pontuação, ordem de linhas, layout ou fidelidade visual.

Os limites são: 1 MB de texto nativo da região, 1 MB de texto OCR pelo contrato existente, 4.096 tokens únicos por lado, 128 caracteres por token e 256 diferenças exibidas. O core limita a serialização canônica do documento a 32 MB antes de construir o recibo, sem alocar uma cópia nesse pré-teste. WASM rejeita JSON de documento maior que 32 MB e candidato maior que 8 MB antes de deserializar; o segundo limite cobre a expansão de caracteres de controle no texto de 1 MB e limita IDs de região anormalmente grandes. `differingTokenLowerBound` conta apenas diferenças observadas; `truncated` marca tokens omitidos ou limite de saída. Zero com `truncated: true` não significa textos iguais. Mesmo sem diferenças e sem truncamento, `status` é sempre `review_required`.

## Consequências

TypeScript valida o schema e encaminha a chamada ao WASM real; não reproduz a regra de comparação. O relatório pode ser recalculado de uma evidência histórica contra o mesmo DocumentIR. Não altera DocumentIR, ContentModel, elegibilidade ou checkpoint, e não autoriza fala. Edição/reconciliação humana e goldens de fidelidade seguem pendentes.
