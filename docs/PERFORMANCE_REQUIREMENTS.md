# Requisitos e estratégia de performance adaptativa

Status: designed; profiler, router, TTS, player e scheduler não implementados. Complementa `docs/NARRATIVE_AND_PERFORMANCE.md` e ADRs 0006/0007. A cópia do relatório mestre permanece intacta.

## Requisitos verificáveis

| ID | Requisito | Evidência futura |
|---|---|---|
| PERF-01 | Sem servidor, conta, API paga ou GPU própria obrigatórios no MVP | execução local offline em matriz Web |
| PERF-02 | Modo padrão `auto`; UI oferece Automático, Rápido, Alta qualidade; tier técnico fica no diagnóstico | teste de preferência e acessibilidade |
| PERF-03 | Profiler usa sinais disponíveis (WebGPU, WASM SIMD/threads, memória/concurrency quando expostos, cache/runtime), sem fingerprint persistente | testes com sinais ausentes/presentes |
| PERF-04 | Benchmark curto mede load, geração, duração/RTF, falha e estabilidade; não processa livro inteiro | fixtures curta/média/técnica e timeout |
| PERF-05 | Router produz plano auditável de engine/modelo/provider/quantização/concorrência/fallback e motivo | seleção auto/fast/quality com engines falsas |
| PERF-06 | Fallback é finito; mudança perceptível de voz requer confirmação; downgrade preserva chunks válidos | falha de load/geração e voice policy |
| PERF-07 | Primeiros chunks validados liberam playback antes de TRT; render completo é opt-in | producer-consumer e estados independentes |
| PERF-08 | JIT gera apenas janela necessária; buffer adaptativo e backpressure; starvation tem feedback | fila/buffer com relógio simulado |
| PERF-09 | Cache key inclui speechTextHash, voz, engine/model version, quantização, provider relevante, velocidade e versões de pronúncia/pipeline | hit/miss/invalidação granular |
| PERF-10 | Após cada chunk: synthesize→validate→persist→manifest→READY; refresh retoma sem regerar chunks válidos | crash/refresh/corrupção simulados |
| PERF-11 | Web não promete execução com aba fechada; desktop durável é evolução Tauri/native separada | teste de resume Web; futuro teste desktop |
| PERF-12 | TTFA cold/warm e TRT são separados; RTF = generation/audio duration; sem estimativa sem benchmark | relatório com valores medidos e método |

## Contratos e fases

`SpeechEngine` futuro expõe capabilities, load, benchmark, synthesize, cancel e unload. `SpeechResult` futuro inclui artefato validável, duração, tempo, engine/model/provider e warnings. O core e a fila falam somente com a porta; Piper/Kokoro/Chatterbox/ONNX/cloud são candidatos a adapters, não dependências obrigatórias. Não há implementação dessa porta neste marco.

Fase 1 (agora): ADRs, requisitos e schemas iniciais `deviceCapabilityProfile`, `enginePlan`, `ttsBenchmark`, disponibilidade de playback/export. Fase 2: profiler + router determinístico com engines falsas. Fase 3: benchmark curto com RTF e timeout. Fase 4: producer-consumer e primeiro áudio válido. Fase 5: cache/checkpoints/backpressure. Fase 6: fallback/downgrade/concurrency comprovada. Fase 7: UI e player (humanizer para microcopy). Fase 8: preparação do supervisor desktop, sem prometer Tauri pronto.

O scheduler futuro tem `interactive`, `prefetch`, `idle_precompute`, `battery_saver`, `paused`; sinais de energia só entram quando a API realmente os expuser. CPU/GPU, memory e cache são processados localmente; não enviar perfil a servidor. Preparação de roteiro e síntese ocorrem em fases salváveis para limitar pico de memória.

## Matriz e gates

LOW END: sinais ausentes ou benchmark lento; concorrência 1, modo rápido/fallback, starvation visível. MID RANGE: comparar 1 vs 2 inferências por throughput e pico de memória. HIGH END: modo qualidade opcional e voz estável. São cenários de teste, não resultados medidos. CI comum usa fakes e fixtures; GPU real/soak ficam manual/nightly.

Medir cold/warm model load, TTFA, RTF, TRT, cache hit latency, peak memory e assembly por capítulo; VRAM/CPU somente quando observáveis. Guardar baseline e ambiente de medição antes de fixar limiares. Uma mudança só será chamada otimização com antes/depois reproduzível. Fixtures de benchmark: texto curto, médio e técnico sintéticos, ainda a criar na fase 3. O audiobook/mainframe real não foi fornecido para golden.
