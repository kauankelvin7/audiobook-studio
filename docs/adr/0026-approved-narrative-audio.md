# ADR 0026 — Texto aprovado e áudio narrativo no fluxo existente

Status: implementado localmente em 2026-09-24.

## Contexto

O produto já exportava áudio literal completo, mas a revisão OCR `unverified` não promovia texto e o pipeline narrativo ainda não alimentava o TTS. O usuário pediu o mesmo PDF em dois modos, mantendo o player, o gerador WAV, capítulos e exportação existentes.

## Decisão

O `audiobook-core` cria um DocumentIR v2 derivado, preservando as camadas de origem. Correções OCR só são promovidas após submissão `propose_correction`, recomputação do recibo e confirmação local ligada aos hashes da fonte, revisão e texto. Texto nativo só pode ser aprovado quando todas as páginas são `good` e as regiões são de prosa com texto não vazio, sem glifos privados. Essas confirmações são atestações locais do operador; não provam identidade.

O ContentModel narrativo mantém apenas source units `eligible`. O core constrói Outline, Plan e rascunho de Script com IDs e source refs reais, sem inventar conceitos. O rascunho começa literal e deve ser reescrito na interface. Antes da síntese, Rust valida Script, submissão de revisão `supported` para todos os segmentos, hash da aprovação, QA sem `fail` e diferença em relação ao rascunho literal. O resultado é uma lista de SpeechUnits com capítulos e referências.

O Web adapta SpeechUnits às sessões já aceitas pelo `renderLocalWav`. Chunks e WAV narrativos usam o mesmo OPFS/IndexedDB, `joinValidatedWavs`, player e links de exportação do produto. O modo literal continua com seu próprio recibo e smoke de regressão. Reload recalcula a cadeia de revisão e valida áudio e capítulos salvos.

## Limites

- Claim grounding não é decidido automaticamente: o QA devolve `review`. A interface registra uma atestação humana global e marca os segmentos como `supported`; ela não oferece decisões individuais por segmento. Fidelidade factual continua dependendo dessa conferência humana.
- O rascunho não parafraseia automaticamente; a pessoa escreve a narração. Não há LLM ou serviço de geração obrigatório.
- A API de promoção OCR usada pela interface cobre uma revisão por documento derivado e torna as demais regiões inelegíveis. A aprovação narrativa exige conteúdo aprovado em todas as páginas; um PDF parcialmente revisado é bloqueado.
- O core também oferece composição determinística de até oito revisões OCR locais independentes, todas validadas contra o mesmo DocumentIR original. O resultado guarda hashes de revisão/texto e revisão/atestado local por alvo, rejeita duplicatas e mantém regiões não aprovadas inelegíveis. O limite adicional de 128 MB considera uma serialização inicial e três serializações da fonte por revisão; documentos maiores podem aceitar menos revisões até otimização da validação. A fachada WASM expõe esse contrato. O adapter Web persiste um conjunto escolhido explicitamente e revalida suas aprovações históricas; seleção na interface e consumo pela Narrativa ainda não foram integrados. A aprovação narrativa continua exigindo todas as fontes necessárias e revisão semântica explícita.
- O limite de WAV PCM completo permanece em 512 MB. O primeiro uso da voz Piper baixa seu modelo pelos endpoints existentes.
