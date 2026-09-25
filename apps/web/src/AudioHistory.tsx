import type { LiteralAudioEntry } from "./adapters/saved_literal_audio";
import { AudioPlayer } from "./AudioPlayer";
import { StudioIcon } from "./StudioIcon";
import type { CompleteAudioWithUrl, SavedWavWithUrl } from "./audio_types";

export function AudioHistory({
  entries,
  savedWav,
  selectedAudioKey,
  opening,
  maintenanceBusy,
  currentAudioKey,
  completeWav,
  wavBusy,
  onOpen,
  onRemove,
}: {
  entries: LiteralAudioEntry[];
  savedWav: SavedWavWithUrl | null;
  selectedAudioKey: string | null;
  opening: boolean;
  maintenanceBusy: boolean;
  currentAudioKey: string | null;
  completeWav: CompleteAudioWithUrl | null;
  wavBusy: boolean;
  onOpen: (entry: LiteralAudioEntry) => void | Promise<void>;
  onRemove: (entry: LiteralAudioEntry) => void | Promise<void>;
}) {
  if (entries.length === 0) return null;

  return (
    <section className="panel audio-history-panel" aria-labelledby="saved-audio-title">
      <div className="section-heading compact-heading">
        <span className="section-number">05C</span>
        <div>
          <p className="section-kicker">MEMÓRIA LOCAL</p>
          <h2 id="saved-audio-title">Gravações neste dispositivo</h2>
        </div>
      </div>
      <p className="panel-lead">
        Arquivos WAV intermediários gerados e salvos localmente. Cada gravação corresponde ao intervalo indicado.
      </p>

      <div className="audio-history-list">
        {entries.map(entry => {
          const isSelected = selectedAudioKey === entry.artifactKey;
          const isCurrent = entry.artifactKey === currentAudioKey;
          const isInComplete = completeWav?.chapters.some(ch => ch.audioKey === entry.artifactKey);
          const canDelete = !isCurrent && !isInComplete;

          return (
            <div
              key={entry.artifactKey}
              className={`audio-history-item${isSelected ? " is-selected" : ""}`}
            >
              <div className="history-item-main">
                <span className="history-item-icon">
                  <StudioIcon name="audio" size={18} />
                </span>
                <div className="history-item-copy">
                  <strong className="history-page-range">
                    Páginas {entry.startPage} a {entry.endPage}
                  </strong>
                  <div className="history-item-meta">
                    <span className="meta-tag date-tag">
                      {new Date(entry.createdAtMs).toLocaleString("pt-BR")}
                    </span>
                    <span className="meta-tag size-tag">
                      {(entry.sizeBytes / 1024 / 1024).toFixed(1)} MB
                    </span>
                    {isCurrent && <span className="meta-tag current-tag">Ativo</span>}
                  </div>
                </div>
              </div>

              <div className="history-item-actions">
                <button
                  type="button"
                  className={`btn-action-sm${isSelected ? " primary" : ""}`}
                  onClick={() => void onOpen(entry)}
                  disabled={opening}
                  aria-label={`Abrir gravação das páginas ${entry.startPage} a ${entry.endPage}, salva em ${new Date(entry.createdAtMs).toLocaleString("pt-BR")}`}
                >
                  <StudioIcon name="play" size={13} />
                  <span>{isSelected ? "Reabrir" : "Abrir"}</span>
                </button>

                {canDelete && (
                  <button
                    type="button"
                    className="btn-action-sm danger-ghost"
                    onClick={() => void onRemove(entry)}
                    disabled={maintenanceBusy || opening || wavBusy}
                    aria-label={`Excluir gravação das páginas ${entry.startPage} a ${entry.endPage}, salva em ${new Date(entry.createdAtMs).toLocaleString("pt-BR")}`}
                    title="Excluir gravação antiga deste dispositivo"
                  >
                    <StudioIcon name="trash" size={13} />
                    <span>Excluir</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {savedWav && (
        <div className="saved-wav-preview-box animate-fade-in">
          <div className="saved-wav-header">
            <strong>
              Gravação aberta: Páginas {savedWav.startPage} a {savedWav.endPage}
            </strong>
          </div>
          <AudioPlayer src={savedWav.url} label="Gravação WAV selecionada" />
          <div className="saved-wav-download">
            <a
              className="button-link primary"
              href={savedWav.url}
              download={`audiobook-studio-paginas-${savedWav.startPage}-${savedWav.endPage}.wav`}
            >
              <StudioIcon name="download" size={15} />
              <span>Baixar WAV selecionado</span>
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
