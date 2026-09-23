# Adendo normativo — narração e performance

Fonte: feedback do primeiro audiobook descrito pelo usuário em 2026-09-22. O arquivo de áudio/mainframe não foi disponibilizado; problemas são requisitos reportados, não medições reproduzidas. Este adendo complementa o relatório mestre sem alterar a cópia original. Decisões: ADR 0005 e 0006.

## Pipeline e contratos

`SourceDocument → DocumentIR → ContentModel → SemanticOutline → NarrativePlanner → NarrativeModel → ScriptAdapter → CohesionPass → RedundancyGuard → SpokenHeadingPolicy → GlobalNarrationQA → SpeechModel → PronunciationCompiler → TTS → AudioQA → Packager`.

ContentModel registra conceitos, relações, definições, código, exemplos, tabelas, notas, pré-requisitos, importância, confiança/incerteza e source references; não decide o que será falado. NarrativeModel descreve ordem pedagógica, transições baseadas em relações, seções narrativas e capítulos falados. `displayText` preserva fidelidade técnica; `speechText` é otimizado para síntese e versionado separadamente. Não criar introdução automática para cada heading.

Todo estágio futuro declara `schemaVersion`, `stageId`, versão de implementação, input/output tipados, validator, erro tipado, auditoria, chave de cache/dependências e política de checkpoint/idempotência/fallback. A invalidação é granular: correção em DocumentIR afeta descendentes; mudança em política de heading afeta plano/roteiro/áudio; mudança em pronúncia afeta SpeechModel/áudio, não extração PDF. Persistir manifests com versões e hashes, sem documento completo em logs. Conforme ADR 0010, os modelos canônicos e transforms determinísticos desta cadeia pertencem ao `audiobook-core` em Rust; TypeScript conserva adapters/browser APIs e schemas de fronteira com paridade testada.

## Gates narrativos

Local QA verifica frases completas, consistência técnica, referências, repetição próxima, plano de pronúncia e segurança dos chunks. Global QA verifica definições/aberturas repetidas, sobreposição semântica, ordem conceitual, transições vazias, fragmentação, pendências e continuidade. Deduplicação combina normalização, comparação exata, tokens e similaridade semântica; decisão incerta vai a revisão. Bordões são monitorados por frequência, não proibidos. Remover frase sem conteúdo é preferível a trocar sinônimos. Transições devem expressar relação conceitual, sem inventar claims.

Bloqueios pré-TTS: planner, schema, source mapping, heading duplicado anunciado (=0) e QA crítico precisam passar. `unsupportedClaims=0` é requisito crítico quando houver verificador de fonte. Warning subjetivo pode seguir apenas identificado. Relatório `narration-qa.json` inclui contagens de seções documentais/narrativas/capítulos falados, headings duplicados, repetições, transições, termos indefinidos, claims sem apoio, duração média estimada, cobertura de fonte e `pass | review | fail`, com método/versão de cada métrica. Não transformar estimativa em fato.

## Performance e recuperação

Modo do usuário: `auto` (padrão), `fast` ou `quality`; o router escolhe tier técnico `fast | balanced | quality`. Detectar WebGPU, WASM SIMD/threads, `deviceMemory` quando exposto, `hardwareConcurrency`, cache e runtime; benchmark curto prevalece sobre inferência por user-agent. Ausência de sinal não significa incapacidade. Plano e fallback são versionados e auditados. Não presumir disponibilidade de Kokoro, Piper, Chatterbox ou provider específico. Detalhes e estados separados constam em `docs/PERFORMANCE_REQUIREMENTS.md` e ADR 0007.

TTFA é o indicador primário; medir também carga de modelo, RTF, RAM/VRAM/CPU quando observáveis, cache hit/miss, latência/chunk, encoding, cold/warm e render total. Os buffers são consumidos somente após AudioQA; aplicar backpressure para não lotar memória. Persistir cada chunk validado com chave completa. Browser suspenso/fechado depende de retomada posterior; Service Worker não é daemon TTS. Desktop durável é caminho Tauri/native futuro, não promessa do MVP Web.

## Entregas e testes por milestone

- M3: checkpoints, invalidação de dependências, resume/cancel e tab refresh simulado.
- M4: schemas Rust↔TS, golden de heading/definição/transição/memória, QA local/global e testes de claims. Golden mainframe real aguarda arquivo e licença.
- M5: router com WebGPU ausente/WASM fallback/model load failure, benchmark por perfil, cache resume, geração progressiva, backpressure e TTFA.
- M6: player, status de buffer e opção explícita para render offline completo.
- M7: browser/device matrix, soak/chaos, benchmarks reproduzíveis e regressões de qualidade/latência.

Artefatos de auditoria planejados: `narrative-plan.json`, `narrative-memory.json`, `narration-qa.json`, `performance-profile.json`, `engine-plan.json`, `tts-benchmark.json`. Nenhum deles é gerado pelo produto neste marco de documentação.

M4.4A introduz apenas o `NarrativePlannerPort` Web: o port devolve objeto estruturado não confiável, o adapter verifica o schema e o core Rust/WASM valida proveniência. O retorno é marcado como candidato com QA pendente. Há um fake de fixture para testes; nenhum modelo, prompt, persistência do plano ou caminho para TTS foi conectado nesta fatia.

M4.4B define `NarrativeScript` no core Rust. Cada trecho tem `displayText`, `speechText` e referências de origem próprias. A validação exige todas as seções do plano, na mesma ordem, identificador igual ao plano esperado, trechos não vazios e referências pertencentes à seção ou transição planejada. O QA de roteiro reaproveita a verificação determinística de heading e retorna `review` quando o grounding semântico dos claims não foi avaliado. Uma referência existente comprova vínculo estrutural; não comprova que o texto falado é fiel à fonte. Source mapping inválido rejeita o roteiro. A fronteira WASM/Web e a fixture compartilhada exercitam esse contrato, sem gerar roteiro automaticamente.

M4.4C acrescenta um pacote de revisão construído pelo core Rust após validar roteiro e plano. Cada trecho reúne texto falado, referências e todas as unidades de fonte correspondentes, inclusive texto de análise ausente, incerteza, qualidade, elegibilidade e flags. O pacote inclui hashes do documento original, ContentModel, plano e roteiro; qualquer alteração nesses artefatos exige nova revisão. Todos os trechos saem como `pending`. O pacote prepara uma decisão humana ou de verificador confiável em etapa posterior e não altera o QA atual nem libera TTS. Texto importado permanece dado não confiável e não deve ser registrado integralmente em logs.
