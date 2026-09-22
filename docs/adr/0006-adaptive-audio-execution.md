# ADR 0006 — Seleção adaptativa e áudio progressivo

Status: accepted (contrato arquitetural; motores pendentes)

## Contexto

O relatório mestre usa Kokoro local/browser como baseline, mas um motor pesado único não cobre dispositivos fracos nem garante tempo aceitável até o primeiro áudio. Web Workers não garantem inferência contínua após fechar/suspender a aba.

## Decisão

Um capability router independente de provedor recebe o modo do usuário `auto | fast | quality` (padrão `auto`) e escolhe um tier técnico `fast | balanced | quality` em um `EnginePlan`, usando recursos detectados, idioma/voz, cache e benchmark curto. User-agent isolado não decide. O plano registra engine/modelo/versão/quantização/provider/concorrência/janela de avanço/fallback e motivo; qualquer estimativa de performance é classe, não promessa. Kokoro e outras engines são adapters possíveis, não dependências do domínio.

Prioridade de UX: TTFA (confirmação do usuário até primeiro áudio suficiente e validado, cold/warm separados), além de TRT para render total. RTF = tempo de geração / duração do áudio; menor que 1 indica geração mais rápida que a reprodução. Geração é producer-consumer por chunks validados e persistidos; player pode iniciar quando o primeiro buffer é seguro. Buffer-alvo inicial de 120–300 s é parâmetro a medir, com backpressure quando cheio e feedback de starvation. Por padrão, gerar sob demanda; render completo offline exige opção explícita. Concorrência de inferência começa em 1 e aumenta apenas com benchmark demonstrando ganho, separada de encoding/IO. Cache key inclui hash do texto falado, voz, engine/model version, quantização, execution provider quando relevante, velocidade, versão de pronúncia e pipeline.

No navegador: checkpoint e retomada; sem promessa de trabalho com aba fechada. Desktop Tauri/native poderá ter orchestrator Rust e worker durável independente da janela, mas é evolução posterior. Cloud é opcional e requer opt-in. Falha de motor deve ter fallback finito/tipado e registro auditável; se mudar perceptivelmente a voz, requer confirmação. Downgrade preserva chunks válidos; upgrade automático durante reprodução é proibido. Chunk não validado não entra no player/cache. Perfil de hardware permanece local e efêmero, sem fingerprint persistente.

## Consequências

M3 precisa de persistência/checkpoint/cancelamento; M5 precisa de capability benchmark, router, cache, fila com backpressure e player progressivo; M6 apresenta escolha entre ouvir logo e preparar tudo offline; M7 mede cold/warm TTFA, RTF, RAM/VRAM/CPU quando acessíveis. Limiares e escolhas concretas só serão definidos após benchmark em dispositivos reais. Estados de playback e export são separados no ADR 0007.
