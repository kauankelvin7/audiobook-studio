import type { MutableRefObject } from "react";
import { AudioPlayer } from "./AudioPlayer";
import { ChapterList } from "./ChapterList";
import { ProgressiveNarrativePlayer } from "./ProgressiveNarrativePlayer";
import type { WavProgress } from "./adapters/local_wav";
import type { CompleteAudioWithUrl, NarrativeGenerationState } from "./audio_types";

export function CompleteAudiobookPanel({
  completeWav,
  completeProgress,
  completeTotal,
  currentChapter,
  wavBusy,
  busy,
  ocrCommitBusy,
  narrativeReady,
  narrativeAudioStatus,
  narrativeGeneration,
  wavProgress,
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
  narrativeReady: boolean;
  narrativeAudioStatus: string;
  narrativeGeneration: NarrativeGenerationState | null;
  wavProgress: WavProgress | null;
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
      <button className="button-secondary" type="button" onClick={() => void onGenerateLiteral()} disabled={wavBusy || busy || ocrCommitBusy}>
        {wavBusy ? "Gerando áudio…" : "Gerar audiobook completo em WAV"}
      </button>
      <button className="button-primary" type="button" onClick={() => void onGenerateNarrative()}
        disabled={wavBusy || busy || ocrCommitBusy || !narrativeReady}
        aria-describedby={!narrativeReady ? "narrative-audio-requirement" : undefined}>
        {wavBusy ? "Gerando áudio…" : "Gerar audiobook narrativo em WAV"}
      </button>
      {wavBusy && <button className="button-ghost danger" type="button" onClick={onCancel}>Cancelar geração</button>}
    </div>

    {!narrativeReady && <p id="narrative-audio-requirement" className="audio-inline-note">
      Aprove o roteiro na etapa Narrativa para habilitar a geração narrada.
    </p>}
    {narrativeAudioStatus && !narrativeGeneration && <p className="audio-generation-status" role="status" aria-live="polite">{narrativeAudioStatus}</p>}

    {narrativeGeneration && <ProgressiveNarrativePlayer generation={narrativeGeneration} voiceProgress={wavProgress} />}

    {wavBusy && !narrativeGeneration && <section className="audio-generation-loader" aria-label="Progresso da geração de áudio">
      <div className="generation-loader-heading">
        <span className="loading-ring" aria-hidden="true" />
        <div><strong>Gerando áudio neste dispositivo</strong>
          <small>{completeProgress !== null && completeTotal > 0
            ? `${completeProgress} de ${completeTotal} capítulos concluídos`
            : "Preparando a voz local…"}</small></div>
      </div>
      {completeProgress !== null && completeTotal > 0 && <progress value={completeProgress} max={completeTotal} />}
      {wavProgress && wavProgress.total > 0 && <p>{Math.min(100, Math.round(wavProgress.loaded / wavProgress.total * 100))}% dos arquivos de voz preparados</p>}
    </section>}

    {completeProgress !== null && !narrativeGeneration && <p role="status" aria-live="polite">{completeProgress} de {completeTotal} capítulos processados.</p>}

    {completeWav && (!narrativeGeneration || !("mode" in completeWav) || completeWav.mode !== "narrative") && <div className="wav-result">
      <p>Modo: {"mode" in completeWav && completeWav.mode === "narrative" ? "Narrativo" : "Literal"}.</p>
      <AudioPlayer src={completeWav.url} label="Audiobook completo" audioRef={completeAudioRef} onTimeUpdate={onTimeUpdate} />
      <div className="reading-actions">
        <button type="button" onClick={() => onSeek(currentChapter - 1)} disabled={currentChapter === 0}>Capítulo anterior</button>
        <button type="button" onClick={() => onSeek(currentChapter + 1)}
          disabled={currentChapter >= completeWav.chapters.length - 1}>Próximo capítulo</button>
      </div>
      <ChapterList completeWav={completeWav} currentChapter={currentChapter} onSeek={onSeek} />
    </div>}

    {completeWav && narrativeGeneration && "mode" in completeWav && completeWav.mode === "narrative"
      && <div className="final-audio-ready" role="status">
        <span><strong>Arquivo final pronto</strong><small>Todos os capítulos foram validados e o WAV completo já pode ser exportado.</small></span>
        <a className="button-link button-secondary" href="#export">Ir para exportação</a>
      </div>}
  </section>;
}
