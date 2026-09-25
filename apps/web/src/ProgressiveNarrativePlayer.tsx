import { useEffect, useMemo, useRef, useState } from "react";
import type { WavProgress } from "./adapters/local_wav";
import type { NarrativeGenerationState } from "./audio_types";
import { StudioIcon } from "./StudioIcon";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

function phaseLabel(generation: NarrativeGenerationState) {
  switch (generation.phase) {
    case "preparing": return "Preparando a fila de narração";
    case "generating": return generation.currentChapter
      ? `Gerando capítulo ${generation.currentChapter} de ${generation.chapters.length}`
      : "Gerando capítulos";
    case "assembling": return "Montando o audiobook final";
    case "complete": return "Audiobook completo";
    case "cancelled": return "Geração interrompida";
    case "error": return "A geração encontrou um problema";
  }
}

export function ProgressiveNarrativePlayer({
  generation,
  voiceProgress,
}: {
  generation: NarrativeGenerationState;
  voiceProgress: WavProgress | null;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const continuePlaybackRef = useRef(false);
  const [activeChapter, setActiveChapter] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const readyCount = generation.chapters.filter(chapter => chapter.status === "ready").length;
  const active = generation.chapters.find(chapter => chapter.chapterNumber === activeChapter)
    ?? generation.chapters[0] ?? null;
  const overallPercent = generation.chapters.length
    ? Math.round((readyCount / generation.chapters.length) * 100)
    : 0;
  const voicePercent = voiceProgress && voiceProgress.total > 0
    ? Math.min(100, Math.round((voiceProgress.loaded / voiceProgress.total) * 100))
    : null;

  const nextChapter = useMemo(() =>
    generation.chapters.find(chapter => chapter.chapterNumber === activeChapter + 1) ?? null,
  [generation.chapters, activeChapter]);

  useEffect(() => {
    if (!active?.url || !continuePlaybackRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    audio.load();
    void audio.play().catch(() => { continuePlaybackRef.current = false; });
  }, [active?.url, activeChapter]);

  useEffect(() => {
    if (generation.chapters.some(chapter => chapter.chapterNumber === activeChapter)) return;
    setActiveChapter(generation.chapters[0]?.chapterNumber ?? 1);
  }, [generation.chapters, activeChapter]);

  function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !active?.url) return;
    if (audio.paused) {
      continuePlaybackRef.current = true;
      void audio.play().catch(() => { continuePlaybackRef.current = false; });
    } else {
      continuePlaybackRef.current = false;
      audio.pause();
    }
  }

  function selectChapter(chapterNumber: number) {
    const chapter = generation.chapters.find(item => item.chapterNumber === chapterNumber);
    if (!chapter?.url) return;
    continuePlaybackRef.current = false;
    setPlaying(false);
    setTime(0);
    setDuration(chapter.durationSeconds ?? 0);
    setActiveChapter(chapterNumber);
  }

  return <section className="progressive-audio" aria-labelledby="progressive-audio-title">
    <header className="progressive-audio-header">
      <div>
        <p className="summary-kicker">PLAYER EM TEMPO REAL</p>
        <h3 id="progressive-audio-title">{readyCount > 0 ? "Ouça enquanto o restante é gerado" : "Preparando o primeiro áudio"}</h3>
        <p>{generation.message}</p>
      </div>
      <span className={"generation-state " + generation.phase}>{phaseLabel(generation)}</span>
    </header>

    <div className="generation-overview" role="status" aria-live="polite">
      <div className="generation-progress-copy">
        <span>{readyCount} de {generation.chapters.length} capítulos disponíveis</span>
        <strong>{overallPercent}%</strong>
      </div>
      <progress value={readyCount} max={Math.max(1, generation.chapters.length)} />
      {voicePercent !== null && generation.phase === "generating" && <div className="voice-progress">
        <span>{voicePercent < 100 ? "Preparando arquivos da voz" : "Voz pronta · sintetizando capítulo"}</span>
        <span>{voicePercent}%</span>
      </div>}
    </div>

    {active && <div className="progressive-player-layout">
      <section className="progressive-player-card">
        <div className="now-playing">
          <span className={"now-playing-mark " + (playing ? "playing" : "")}><StudioIcon name="audio" size={20} /></span>
          <div>
            <small>{active.url ? `Capítulo ${active.chapterNumber}` : "Aguardando áudio"}</small>
            <strong>{active.title}</strong>
          </div>
        </div>

        <audio
          ref={audioRef}
          src={active.url ?? undefined}
          preload="metadata"
          aria-label={`Capítulo ${active.chapterNumber}: ${active.title}`}
          onLoadedMetadata={event => {
            setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : active.durationSeconds ?? 0);
            setTime(event.currentTarget.currentTime);
          }}
          onTimeUpdate={event => setTime(event.currentTarget.currentTime)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            if (!nextChapter) {
              continuePlaybackRef.current = false;
              return;
            }
            continuePlaybackRef.current = true;
            setTime(0);
            setDuration(nextChapter.durationSeconds ?? 0);
            setActiveChapter(nextChapter.chapterNumber);
          }}
        />

        <div className="progressive-controls">
          <button type="button" className="player-icon-button" aria-label="Capítulo anterior"
            disabled={activeChapter <= 1 || !generation.chapters[activeChapter - 2]?.url}
            onClick={() => selectChapter(activeChapter - 1)}>
            <StudioIcon name="previous" size={18} />
          </button>
          <button type="button" className="player-play-button"
            disabled={!active.url}
            aria-label={playing ? "Pausar capítulo" : active.url ? "Ouvir capítulo" : "Capítulo ainda não disponível"}
            onClick={togglePlayback}>
            <StudioIcon name={playing ? "pause" : "play"} size={20} />
          </button>
          <button type="button" className="player-icon-button" aria-label="Próximo capítulo"
            disabled={!nextChapter?.url}
            onClick={() => nextChapter && selectChapter(nextChapter.chapterNumber)}>
            <StudioIcon name="next" size={18} />
          </button>
          <span className="player-time">{formatTime(time)}</span>
          <input type="range" min="0" max={Math.max(0.01, duration)} step="0.1" value={Math.min(time, Math.max(0.01, duration))}
            disabled={!active.url || duration <= 0} aria-label="Posição no capítulo"
            onChange={event => {
              const audio = audioRef.current;
              if (!audio) return;
              const value = Number(event.target.value);
              audio.currentTime = value;
              setTime(value);
            }} />
          <span className="player-time">{formatTime(duration)}</span>
        </div>

        {!active.url && <div className="player-waiting"><span className="loading-ring" aria-hidden="true" />
          <span>{active.status === "generating" ? "Este capítulo está sendo sintetizado agora." : "Aguardando este capítulo entrar na fila."}</span>
        </div>}

        <div className="read-along">
          <div className="read-along-heading"><span>Texto do capítulo</span><small>Acompanhe a narração enquanto os próximos capítulos são preparados.</small></div>
          <p>{active.text}</p>
        </div>
      </section>

      <aside className="generation-queue" aria-label="Fila de capítulos">
        <div className="queue-heading"><span>Fila</span><small>{readyCount}/{generation.chapters.length} prontos</small></div>
        <ol>
          {generation.chapters.map(chapter => <li key={chapter.chapterNumber}>
            <button type="button" disabled={!chapter.url}
              aria-current={activeChapter === chapter.chapterNumber ? "true" : undefined}
              onClick={() => selectChapter(chapter.chapterNumber)}>
              <span className={"chapter-state-dot " + chapter.status} aria-hidden="true" />
              <span className="queue-number">{String(chapter.chapterNumber).padStart(2, "0")}</span>
              <span className="queue-copy"><strong>{chapter.title}</strong><small>{
                chapter.status === "ready" ? "Pronto para ouvir"
                  : chapter.status === "generating" ? "Gerando agora"
                    : chapter.status === "error" ? "Falha na geração"
                      : "Na fila"
              }</small></span>
            </button>
          </li>)}
        </ol>
      </aside>
    </div>}
  </section>;
}
