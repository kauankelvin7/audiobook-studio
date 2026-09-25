import type { LiteralAudioEntry } from "./adapters/saved_literal_audio";
import { AudioPlayer } from "./AudioPlayer";
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

  return <section className="panel audio-history-panel" aria-labelledby="saved-audio-title">
    <h2 id="saved-audio-title">Gravações neste dispositivo</h2>
    <p>Abra uma gravação para ouvir ou baixar. Cada WAV contém o texto extraído do intervalo indicado.</p>
    <ul className="audio-history">{entries.map(entry => <li key={entry.artifactKey}>
      Páginas {entry.startPage} a {entry.endPage} · {new Date(entry.createdAtMs).toLocaleString("pt-BR")} · {(entry.sizeBytes / 1024 / 1024).toFixed(1)} MB{" "}
      <button type="button" onClick={() => void onOpen(entry)} disabled={opening}
        aria-label={`Abrir gravação das páginas ${entry.startPage} a ${entry.endPage}, salva em ${new Date(entry.createdAtMs).toLocaleString("pt-BR")}`}>
        {selectedAudioKey === entry.artifactKey ? "Reabrir gravação" : "Abrir gravação"}
      </button>
      {entry.artifactKey !== currentAudioKey && !completeWav?.chapters.some(chapter => chapter.audioKey === entry.artifactKey)
        && <button type="button" onClick={() => void onRemove(entry)}
          disabled={maintenanceBusy || opening || wavBusy}
          aria-label={`Excluir gravação das páginas ${entry.startPage} a ${entry.endPage}, salva em ${new Date(entry.createdAtMs).toLocaleString("pt-BR")}`}>
          Excluir gravação antiga
        </button>}
    </li>)}</ul>
    {savedWav && <div className="wav-result">
      <AudioPlayer src={savedWav.url} label="Gravação WAV selecionada" />
      <a href={savedWav.url} download={`audiobook-studio-paginas-${savedWav.startPage}-${savedWav.endPage}.wav`}>Baixar WAV selecionado</a>
    </div>}
  </section>;
}
