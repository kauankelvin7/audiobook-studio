import { AudioPlayer } from "./AudioPlayer";
import { StudioIcon } from "./StudioIcon";
import type { SpeechState } from "./adapters/local_speech";
import type { WavProgress } from "./adapters/local_wav";
import type { ReadingSession } from "./adapters/rust_reading_preview";
import type { DocumentIr } from "./schemas/document";
import type { DocumentIrV2 } from "./schemas/ingestion";

export function LiteralReadingPanel({
  document,
  documentV2,
  pageNumber,
  endPage,
  preview,
  reviewed,
  speechState,
  voices,
  voiceURI,
  wavBusy,
  wavProgress,
  wavUrl,
  busy,
  audioMaintenanceBusy,
  onStartPageChange,
  onEndPageChange,
  onPrepareReading,
  onReviewedChange,
  onVoiceChange,
  onStartReading,
  onPauseReading,
  onResumeReading,
  onStopReading,
  onGenerateWav,
  onCancelWav,
}: {
  document: DocumentIr;
  documentV2: DocumentIrV2 | null;
  pageNumber: number;
  endPage: number;
  preview: ReadingSession | null;
  reviewed: boolean;
  speechState: SpeechState;
  voices: SpeechSynthesisVoice[];
  voiceURI: string;
  wavBusy: boolean;
  wavProgress: WavProgress | null;
  wavUrl: string | null;
  busy: boolean;
  audioMaintenanceBusy: boolean;
  onStartPageChange: (pageNumber: number) => void;
  onEndPageChange: (pageNumber: number) => void;
  onPrepareReading: () => void | Promise<void>;
  onReviewedChange: (reviewed: boolean) => void;
  onVoiceChange: (voiceURI: string) => void;
  onStartReading: () => void;
  onPauseReading: () => void;
  onResumeReading: () => void;
  onStopReading: () => void;
  onGenerateWav: () => void | Promise<void>;
  onCancelWav: () => void;
}) {
  const pageSpan = Math.max(1, endPage - pageNumber + 1);
  const percentWav = wavProgress && wavProgress.total > 0
    ? Math.min(100, Math.round((wavProgress.loaded / wavProgress.total) * 100))
    : 0;

  return (
    <section className="panel literal-reading-panel" aria-labelledby="reading-title">
      <div className="section-heading compact-heading">
        <span className="section-number">05A</span>
        <div>
          <p className="section-kicker">ÁUDIO LITERAL</p>
          <h2 id="reading-title">Ouvir o texto do PDF</h2>
        </div>
      </div>
      <p className="panel-lead">
        Selecione até dez páginas consecutivas para conferir e sintetizar sem reescrita narrativa.
      </p>

      <div className="card-box reading-selection-card">
        <div className="selection-grid">
          <div className="field-group">
            <label htmlFor="reading-page">Primeira página</label>
            <select
              id="reading-page"
              value={pageNumber}
              onChange={event => onStartPageChange(Number(event.target.value))}
            >
              {document.pages.map(page => (
                <option key={page.number} value={page.number}>
                  Página {page.number}
                </option>
              ))}
            </select>
          </div>

          <div className="field-group">
            <label htmlFor="reading-end-page">Última página</label>
            <select
              id="reading-end-page"
              value={endPage}
              onChange={event => onEndPageChange(Number(event.target.value))}
            >
              {document.pages
                .filter(page => page.number >= pageNumber && page.number < pageNumber + 10)
                .map(page => (
                  <option key={page.number} value={page.number}>
                    Página {page.number}
                  </option>
                ))}
            </select>
          </div>
        </div>

        <div className="selection-actions">
          <span className="selection-badge">
            {pageSpan} {pageSpan === 1 ? "página selecionada" : "páginas selecionadas"}
          </span>
          <button
            type="button"
            className="primary"
            onClick={() => void onPrepareReading()}
            disabled={!documentV2 || busy}
          >
            {busy ? "Preparando…" : "Preparar leitura das páginas"}
          </button>
        </div>
      </div>

      {preview && (
        <div className="reading-review animate-fade-in">
          <div className="card-box reading-preview-card">
            <div className="card-header-row">
              <h3>Texto para conferir</h3>
              <span className="tag-badge">{preview.pages.length} páginas no buffer</span>
            </div>
            <div className="reading-text">
              {preview.pages.map(page => (
                <section key={page.pageNumber} aria-label={`Página ${page.pageNumber}`} className="preview-page-block">
                  <h4>Página {page.pageNumber}</h4>
                  {page.chunks.map(chunk => (
                    <p key={chunk.regionId}>{chunk.text}</p>
                  ))}
                </section>
              ))}
            </div>

            <label className="check-label conference-checkbox">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={event => onReviewedChange(event.target.checked)}
              />
              <span>Conferi o texto de todas as páginas selecionadas com o PDF.</span>
            </label>
          </div>

          <div className="card-box speech-control-card">
            <div className="card-header-row">
              <h3>Ouvir com a voz do navegador</h3>
              <span className={`status-pill ${speechState !== "idle" ? "active" : ""}`}>
                {speechState === "playing" ? "Reproduzindo" : speechState === "paused" ? "Pausado" : "Disponível"}
              </span>
            </div>

            <div className="field-group">
              <label htmlFor="reading-voice">Voz instalada no sistema</label>
              <select
                id="reading-voice"
                value={voiceURI}
                onChange={event => onVoiceChange(event.target.value)}
                disabled={voices.length === 0}
              >
                {voices.length === 0 ? (
                  <option value="">Nenhuma voz local disponível</option>
                ) : (
                  voices.map(voice => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="reading-actions-bar">
              <button
                type="button"
                className="btn-action play-btn"
                onClick={onStartReading}
                disabled={!reviewed || !voiceURI || speechState !== "idle"}
              >
                <StudioIcon name="play" size={16} />
                <span>Ouvir</span>
              </button>
              <button
                type="button"
                className="btn-action"
                onClick={onPauseReading}
                disabled={speechState !== "playing"}
              >
                <StudioIcon name="pause" size={16} />
                <span>Pausar</span>
              </button>
              <button
                type="button"
                className="btn-action"
                onClick={onResumeReading}
                disabled={speechState !== "paused"}
              >
                <StudioIcon name="play" size={16} />
                <span>Retomar</span>
              </button>
              <button
                type="button"
                className="btn-action stop-btn"
                onClick={onStopReading}
                disabled={speechState === "idle"}
              >
                <StudioIcon name="stop" size={16} />
                <span>Parar</span>
              </button>
            </div>
            <p role="status" aria-live="polite" className="speech-status-msg">
              {speechState === "playing"
                ? "Lendo o texto selecionado pelo sintetizador."
                : speechState === "paused"
                  ? "Leitura pausada."
                  : "Pronto para iniciar leitura falada."}
            </p>
          </div>

          <div className="card-box wav-generation-card">
            <div className="card-header-row">
              <h3>Gerar arquivo de áudio WAV (Voz Faber)</h3>
              <span className="tag-badge">Local-first</span>
            </div>
            <p className="wav-desc">
              Usa a rede neural local Faber (pt-BR). Limite de 12 mil caracteres por arquivo gerado.
            </p>

            <div className="reading-actions-bar">
              <button
                type="button"
                className="primary"
                onClick={() => void onGenerateWav()}
                disabled={!reviewed || wavBusy || audioMaintenanceBusy}
              >
                {wavBusy ? "Gerando áudio WAV…" : "Gerar arquivo WAV"}
              </button>
              <button type="button" onClick={onCancelWav} disabled={!wavBusy}>
                Cancelar geração
              </button>
            </div>

            {wavBusy && (
              <div className="wav-progress-box animate-fade-in" role="status" aria-live="polite">
                <div className="progress-labels">
                  <span>Sintetizando áudio neural local…</span>
                  <strong>{percentWav}%</strong>
                </div>
                <div className="custom-progress-track">
                  <div className="custom-progress-fill" style={{ width: `${percentWav}%` }} />
                </div>
              </div>
            )}

            {wavUrl && (
              <div className="wav-result card-highlight animate-fade-in">
                <div className="wav-result-header">
                  <strong>Áudio das páginas {pageNumber} a {endPage} gerado com sucesso</strong>
                </div>
                <AudioPlayer src={wavUrl} label="Prévia do WAV gerado" />
                <div className="wav-download-action">
                  <a
                    className="button-link primary"
                    href={wavUrl}
                    download={`audiobook-studio-paginas-${pageNumber}-${endPage}.wav`}
                  >
                    <StudioIcon name="download" size={16} />
                    <span>Salvar arquivo WAV</span>
                  </a>
                </div>
              </div>
            )}

            <p className="footnote">
              Esta é uma leitura literal do texto extraído. Para narração com adaptação de capítulos e QA de fidelidade, use a etapa Roteiro Narrativo.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
