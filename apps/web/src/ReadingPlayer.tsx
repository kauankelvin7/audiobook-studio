import { useEffect, useRef, useState } from "react";
import { StudioIcon } from "./StudioIcon";
import type { CompleteAudioWithUrl } from "./audio_types";

function formatSeconds(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ReadingPlayer({ audio, pages, onPageChange, onExit }: {
  audio: CompleteAudioWithUrl | null;
  pages: (number | null)[];
  onPageChange: (page: number) => void;
  onExit: () => void;
}) {
  const player = useRef<HTMLAudioElement | null>(null);
  const active = useRef(-1);
  const [chapter, setChapter] = useState(0);
  const [follow, setFollow] = useState(true);
  const [ready, setReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [minimized, setMinimized] = useState(!audio);
  const [rate, setRate] = useState(1);
  const [volume, setVolume] = useState(1);
  const [playbackError, setPlaybackError] = useState("");

  useEffect(() => {
    const element = player.current;
    active.current = -1;
    setChapter(0);
    setCurrentTime(0);
    setDuration(0);
    setReady(false);
    setIsPlaying(false);
    setPlaybackError("");
    if (audio) setMinimized(false);
    if (element) {
      element.pause();
      element.currentTime = 0;
    }
  }, [audio?.url]);

  useEffect(() => {
    const element = player.current;
    if (!element) return;
    element.volume = volume;
    element.playbackRate = rate;
  }, [audio?.url, rate, volume]);

  useEffect(() => {
    const element = player.current;
    if (!element) return;
    const loaded = () => {
      setReady(true);
      setDuration(element.duration || 0);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    const onError = () => {
      setReady(false);
      setIsPlaying(false);
      setPlaybackError("Não foi possível carregar este áudio. Verifique o arquivo e tente novamente.");
    };
    element.addEventListener("loadedmetadata", loaded);
    element.addEventListener("durationchange", loaded);
    element.addEventListener("play", onPlay);
    element.addEventListener("pause", onPause);
    element.addEventListener("ended", onEnded);
    element.addEventListener("error", onError);
    if (element.readyState >= 1) loaded();
    return () => {
      element.removeEventListener("loadedmetadata", loaded);
      element.removeEventListener("durationchange", loaded);
      element.removeEventListener("play", onPlay);
      element.removeEventListener("pause", onPause);
      element.removeEventListener("ended", onEnded);
      element.removeEventListener("error", onError);
    };
  }, [audio?.url]);

  function handleTimeUpdate() {
    const element = player.current;
    if (!element || !audio) return;
    const time = element.currentTime;
    setCurrentTime(time);
    const index = audio.chapters.reduce(
      (last, item, position) => (item.startSeconds <= time + 0.025 ? position : last),
      0,
    );
    setChapter(index);
    if (active.current !== index) {
      active.current = index;
      const page = pages[index];
      if (follow && page !== null && page !== undefined) {
        onPageChange(page);
      }
    }
  }

  function togglePlay() {
    const el = player.current;
    if (!el) return;
    if (el.paused) {
      setPlaybackError("");
      void el.play().catch(() => {
        setIsPlaying(false);
        setPlaybackError("Não foi possível iniciar o áudio. Tente novamente.");
      });
    }
    else el.pause();
  }

  function seekChapter(index: number) {
    if (!audio || !player.current || !audio.chapters[index]) return;
    const target = audio.chapters[index].startSeconds;
    player.current.currentTime = target;
    active.current = -1;
    setChapter(index);
    setCurrentTime(target);
    const page = pages[index];
    if (follow && page !== null && page !== undefined) onPageChange(page);
  }

  function skip(deltaSeconds: number) {
    const el = player.current;
    if (!el) return;
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + deltaSeconds));
  }

  function onSeekSlider(val: number) {
    const el = player.current;
    if (!el) return;
    el.currentTime = val;
    setCurrentTime(val);
  }

  function changeRate(next: number) {
    const element = player.current;
    if (element) element.playbackRate = next;
    setRate(next);
  }

  function changeVolume(next: number) {
    const element = player.current;
    if (element) element.volume = next;
    setVolume(next);
  }

  function changeFollow(enabled: boolean) {
    setFollow(enabled);
    active.current = -1;
    const page = pages[chapter];
    if (enabled && page != null) onPageChange(page);
  }

  if (!audio) {
    if (minimized) {
      return (
        <aside className="reading-player-minimized" aria-label="Aviso de áudio recolhido">
          <button type="button" className="expand-pill" onClick={() => setMinimized(false)}>
            <StudioIcon name="audio" size={15} />
            <span>Áudio</span>
          </button>
        </aside>
      );
    }
    return (
      <section className="reading-player empty-audio" aria-label="Áudio no modo leitura">
        <div className="empty-audio-card">
          <div className="empty-audio-info">
            <span className="audio-badge-icon"><StudioIcon name="audio" size={18} /></span>
            <div>
              <strong>Modo Leitura com Áudio</strong>
              <p>O audiobook completo ainda não foi gerado para este projeto.</p>
            </div>
          </div>
          <div className="empty-audio-actions">
            <a className="button-link primary" href="#audio" onClick={onExit}>
              Gerar Audiobook em Áudio
            </a>
            <button type="button" className="icon-btn-ghost" onClick={() => setMinimized(true)} aria-label="Recolher dica de áudio" title="Recolher dica">
              <StudioIcon name="close" size={14} />
            </button>
          </div>
        </div>
      </section>
    );
  }

  const isNarrative = "mode" in audio && audio.mode === "narrative";
  const currentChapterObj = audio.chapters[chapter];
  const totalChapters = audio.chapters.length;

  return (
    <>
      <audio ref={player} src={audio.url} onTimeUpdate={handleTimeUpdate} preload="metadata" hidden />
      {minimized ? (
        <aside className="reading-player-minimized" aria-label="Tocador recolhido">
          <div className="mini-player-bar">
            <button type="button" className="mini-play-btn" onClick={togglePlay} aria-label={isPlaying ? "Pausar áudio" : "Tocar áudio"} aria-pressed={isPlaying}>
              <StudioIcon name={isPlaying ? "pause" : "play"} size={16} />
            </button>
            <span className="mini-label">
              {isNarrative ? "Capítulo" : "Pág."} {chapter + 1}/{totalChapters} · {formatSeconds(currentTime)}
            </span>
            <button type="button" className="expand-pill" onClick={() => setMinimized(false)}>
              Expandir tocador
            </button>
          </div>
          {playbackError && <p role="alert" className="reading-player-error">{playbackError}</p>}
        </aside>
      ) : (
      <section className="reading-player" aria-label="Tocador de áudio no modo leitura">
      {playbackError && <p role="alert" className="reading-player-error">{playbackError}</p>}

      <div className="reading-player-top">
        <div className="reading-player-track-info">
          <span className="reading-track-tag">
            {isNarrative ? "Narrativo" : "Leitura Literal"}
          </span>
          <strong className="reading-track-title">
            {isNarrative ? "Capítulo" : "Página"} {currentChapterObj?.pageNumber ?? chapter + 1} de {totalChapters}
          </strong>
          <span className="reading-time-display">
            {formatSeconds(currentTime)} / {formatSeconds(duration)}
          </span>
        </div>

        <div className="reading-player-header-actions">
          <label className="follow-page-toggle" title="Mudar a página do documento conforme o áudio avança">
            <input
              type="checkbox"
              checked={follow}
              onChange={e => changeFollow(e.target.checked)}
            />
            <span>Sincronizar página</span>
          </label>
          <button
            type="button"
            className="icon-btn-ghost"
            onClick={() => setMinimized(true)}
            aria-label="Minimizar tocador"
            title="Minimizar"
          >
            _
          </button>
          <button
            type="button"
            className="icon-btn-ghost"
            onClick={onExit}
            aria-label="Sair do modo leitura"
            title="Sair da leitura"
          >
            <StudioIcon name="close" size={15} />
          </button>
        </div>
      </div>

      <div className="reading-player-progress-row">
        <input
          type="range"
          className="reading-seek-slider"
          min={0}
          max={duration || 1}
          step={0.1}
          value={currentTime}
          onChange={e => onSeekSlider(Number(e.target.value))}
          aria-label="Barra de progresso do áudio"
        />
      </div>

      <div className="reading-player-controls-row">
        <label className="reading-player-chapter">
          <span className="sr-only">Capítulo atual</span>
          <select value={chapter} onChange={event => seekChapter(Number(event.target.value))} aria-label="Capítulo atual">
            {audio.chapters.map((item, index) => <option key={`${item.audioKey}-${index}`} value={index}>
              {isNarrative ? `Capítulo ${index + 1}` : `Página ${item.pageNumber}`}
            </option>)}
          </select>
        </label>
        <button
          type="button"
          className="icon-button"
          aria-label="Capítulo anterior"
          title="Capítulo anterior"
          disabled={!ready || chapter === 0}
          onClick={() => seekChapter(chapter - 1)}
        >
          <StudioIcon name="skipBack" size={16} />
        </button>

        <button
          type="button"
          className="icon-button"
          aria-label="Voltar 10 segundos"
          title="Voltar 10s"
          disabled={!ready}
          onClick={() => skip(-10)}
        >
          −10s
        </button>

        <button
          type="button"
          className="main-play-button"
          aria-label={isPlaying ? "Pausar audiobook" : "Tocar audiobook"}
          aria-pressed={isPlaying}
          onClick={togglePlay}
          disabled={!ready}
        >
          <StudioIcon name={isPlaying ? "pause" : "play"} size={22} />
        </button>

        <button
          type="button"
          className="icon-button"
          aria-label="Avançar 10 segundos"
          title="Avançar 10s"
          disabled={!ready}
          onClick={() => skip(10)}
        >
          +10s
        </button>

        <button
          type="button"
          className="icon-button"
          aria-label="Próximo capítulo"
          title="Próximo capítulo"
          disabled={!ready || chapter >= totalChapters - 1}
          onClick={() => seekChapter(chapter + 1)}
        >
          <StudioIcon name="skipForward" size={16} />
        </button>

        <label className="reading-player-rate">
          <span className="sr-only">Velocidade da leitura</span>
          <select value={rate} onChange={event => changeRate(Number(event.target.value))} aria-label="Velocidade da leitura">
            {[0.8, 1, 1.2, 1.5, 2].map(value => <option key={value} value={value}>{value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x</option>)}
          </select>
        </label>
        <label className="reading-player-volume">
          <span className="sr-only">Volume</span>
          <input type="range" min="0" max="1" step="0.05" value={volume} onChange={event => changeVolume(Number(event.target.value))} aria-label="Volume" />
        </label>
      </div>

      {pages[chapter] == null && (
        <p className="footnote sync-notice">
          Este capítulo não tem uma página de origem identificada. Use as setas para navegar manualmente.
        </p>
      )}
      </section>
      )}
    </>
  );
}
