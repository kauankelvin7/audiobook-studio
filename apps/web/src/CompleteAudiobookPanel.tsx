import type { MutableRefObject } from "react";
import { AudioPlayer } from "./AudioPlayer";
import { ChapterList } from "./ChapterList";
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
  return <section className="panel complete-audiobook-panel" aria-labelledby="complete-audio-title">
    <h2 id="complete-audio-title">Gerar audiobook completo</h2>
    <p>Escolha leitura literal ou narração aprovada. Páginas sem texto aprovado bloqueiam a geração.</p>
    <div className="audio-generation-actions">
      <button type="button" onClick={() => void onGenerateLiteral()} disabled={wavBusy || busy || ocrCommitBusy}>
        {wavBusy ? "Gerando áudio…" : "Gerar audiobook completo em WAV"}
      </button>
      <button type="button" onClick={() => void onGenerateNarrative()} disabled={wavBusy || busy || ocrCommitBusy}>
        {wavBusy ? "Gerando áudio…" : "Gerar audiobook narrativo em WAV"}
      </button>
      {wavBusy && <button type="button" onClick={onCancel}>Cancelar geração</button>}
    </div>

    {completeProgress !== null && <p role="status" aria-live="polite">{completeProgress} de {completeTotal} capítulos processados.</p>}

    {completeWav && <div className="wav-result">
      <p>Modo: {"mode" in completeWav && completeWav.mode === "narrative" ? "Narrativo" : "Literal"}.</p>
      <AudioPlayer src={completeWav.url} label="Audiobook completo" audioRef={completeAudioRef} onTimeUpdate={onTimeUpdate} />
      <div className="reading-actions">
        <button type="button" onClick={() => onSeek(currentChapter - 1)} disabled={currentChapter === 0}>Capítulo anterior</button>
        <button type="button" onClick={() => onSeek(currentChapter + 1)}
          disabled={currentChapter >= completeWav.chapters.length - 1}>Próximo capítulo</button>
      </div>
      <ChapterList completeWav={completeWav} currentChapter={currentChapter} onSeek={onSeek} />
    </div>}
  </section>;
}
