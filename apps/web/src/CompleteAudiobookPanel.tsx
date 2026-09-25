import type { MutableRefObject } from "react";
import { AudioPlayer } from "./AudioPlayer";
import { ChapterList } from "./ChapterList";
import { StudioIcon } from "./StudioIcon";
import type { CompleteAudioWithUrl } from "./audio_types";

export function CompleteAudiobookPanel({
  completeWav,
  completeProgress,
  completeTotal,
  currentChapter,
  wavBusy,
  busy,
  ocrCommitBusy,
  completeAudioRef,
  onGenerateLiteral,
  onGenerateNarrative,
  onCancel,
  onSeek,
  onTimeUpdate,
}: {
  completeWav: CompleteAudioWithUrl | null;
  completeProgress: number | null;
  completeTotal: number;
  currentChapter: number;
  wavBusy: boolean;
  busy: boolean;
  ocrCommitBusy: boolean;
  completeAudioRef: MutableRefObject<HTMLAudioElement | null>;
  onGenerateLiteral: () => void | Promise<void>;
  onGenerateNarrative: () => void | Promise<void>;
  onCancel: () => void;
  onSeek: (index: number) => void;
  onTimeUpdate: (timeSeconds: number) => void;
}) {
  const isBusy = wavBusy || busy || ocrCommitBusy;
  const progressPercent = completeProgress !== null && completeTotal > 0
    ? Math.min(100, Math.round((completeProgress / completeTotal) * 100))
    : 0;

  return (
    <section className="panel complete-audiobook-panel" aria-labelledby="complete-audio-title">
      <div className="section-heading compact-heading">
        <span className="section-number">05B</span>
        <div>
          <p className="section-kicker">PRODUÇÃO FINAL</p>
          <h2 id="complete-audio-title">Gerar audiobook completo</h2>
        </div>
      </div>
      <p className="panel-lead">
        Produza o arquivo de áudio WAV unificado do livro inteiro. Escolha entre a narração adaptada ou a leitura literal.
      </p>

      <div className="audio-mode-cards-grid">
        <div className="audio-mode-card narrative-mode">
          <div className="mode-card-header">
            <span className="mode-badge primary-badge">Recomendado</span>
            <h3>Audiobook Narrativo</h3>
          </div>
          <p>
            Usa o roteiro adaptado com pontuação dramática, pausas adequadas e conferência de fidelidade (QA).
          </p>
          <button
            type="button"
            className="primary mode-btn"
            onClick={() => void onGenerateNarrative()}
            disabled={isBusy}
          >
            <StudioIcon name="audio" size={17} />
            <span>{wavBusy ? "Gerando áudio…" : "Gerar audiobook narrativo em WAV"}</span>
          </button>
        </div>

        <div className="audio-mode-card literal-mode">
          <div className="mode-card-header">
            <span className="mode-badge">Leitura Fiel</span>
            <h3>Audiobook Literal</h3>
          </div>
          <p>
            Sintetiza todas as páginas com texto extraído exatamente como aparecem no documento original.
          </p>
          <button
            type="button"
            className="mode-btn"
            onClick={() => void onGenerateLiteral()}
            disabled={isBusy}
          >
            <StudioIcon name="document" size={17} />
            <span>{wavBusy ? "Gerando áudio…" : "Gerar audiobook completo em WAV"}</span>
          </button>
        </div>
      </div>

      {wavBusy && (
        <div className="generation-cancel-row">
          <button type="button" className="btn-cancel-generation" onClick={onCancel}>
            <StudioIcon name="close" size={14} />
            <span>Cancelar geração do audiobook</span>
          </button>
        </div>
      )}

      {completeProgress !== null && (
        <div className="complete-progress-box animate-fade-in">
          <div className="progress-labels">
            <span>Sintetizando e compilando capítulos…</span>
            <strong>{progressPercent}%</strong>
          </div>
          <div className="custom-progress-track">
            <div className="custom-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
          <p role="status" aria-live="polite" className="progress-status-caption">
            {completeProgress} de {completeTotal} capítulos processados.
          </p>
        </div>
      )}

      {completeWav && (
        <div className="complete-wav-result-card animate-fade-in">
          <div className="result-card-banner">
            <div className="banner-left">
              <span className="result-icon-badge">
                <StudioIcon name="check" size={18} />
              </span>
              <div>
                <strong>Audiobook Completo Pronto</strong>
                <p>
                  Modo: {"mode" in completeWav && completeWav.mode === "narrative" ? "Narrativo (roteiro aprovado)" : "Literal (páginas fiéis)"} · {completeWav.chapters.length} capítulos
                </p>
              </div>
            </div>
            <a
              className="button-link primary"
              href={completeWav.url}
              download="audiobook-studio-completo.wav"
            >
              <StudioIcon name="download" size={16} />
              <span>Baixar WAV</span>
            </a>
          </div>

          <div className="complete-player-container">
            <AudioPlayer
              src={completeWav.url}
              label="Audiobook completo"
              audioRef={completeAudioRef}
              onTimeUpdate={onTimeUpdate}
            />
          </div>

          <div className="chapter-seek-bar">
            <button
              type="button"
              className="btn-action"
              onClick={() => onSeek(currentChapter - 1)}
              disabled={currentChapter === 0}
            >
              <StudioIcon name="prev" size={15} />
              <span>Capítulo anterior</span>
            </button>
            <span className="current-chapter-indicator">
              Capítulo {currentChapter + 1} de {completeWav.chapters.length}
            </span>
            <button
              type="button"
              className="btn-action"
              onClick={() => onSeek(currentChapter + 1)}
              disabled={currentChapter >= completeWav.chapters.length - 1}
            >
              <span>Próximo capítulo</span>
              <StudioIcon name="next" size={15} />
            </button>
          </div>

          <ChapterList
            completeWav={completeWav}
            currentChapter={currentChapter}
            onSeek={onSeek}
          />
        </div>
      )}
    </section>
  );
}
