import type { MutableRefObject } from "react";
import type { SpeechState } from "./adapters/local_speech";
import type { WavProgress } from "./adapters/local_wav";
import type { CompleteLiteralAudio, LiteralAudioEntry, SavedLiteralAudio } from "./adapters/saved_literal_audio";
import type { CompleteNarrativeAudio } from "./adapters/narrative_audio";
import type { ReadingSession } from "./adapters/rust_reading_preview";
import type { DocumentIr } from "./schemas/document";
import type { DocumentIrV2 } from "./schemas/ingestion";

type SavedWavWithUrl = SavedLiteralAudio & { url: string };
type CompleteAudioWithUrl = (CompleteLiteralAudio | CompleteNarrativeAudio) & { url: string };

export type AudioWorkspaceModel = {
  document: DocumentIr | null;
  documentV2: DocumentIrV2 | null;
  audioHistory: LiteralAudioEntry[];
  savedWav: SavedWavWithUrl | null;
  selectedAudioKey: string | null;
  audioOpening: boolean;
  audioMaintenanceBusy: boolean;
  currentAudioKey: string | null;
  completeWav: CompleteAudioWithUrl | null;
  completeProgress: number | null;
  completeTotal: number;
  currentChapter: number;
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
  ocrCommitBusy: boolean;
};

export type AudioWorkspaceActions = {
  openSavedAudio: (entry: LiteralAudioEntry) => void | Promise<void>;
  removeSavedAudio: (entry: LiteralAudioEntry) => void | Promise<void>;
  generateCompleteLiteral: () => void | Promise<void>;
  generateCompleteNarrative: () => void | Promise<void>;
  cancelCompleteGeneration: () => void;
  seekChapter: (index: number) => void;
  onCompleteTimeUpdate: (timeSeconds: number) => void;
  onStartPageChange: (pageNumber: number) => void;
  onEndPageChange: (pageNumber: number) => void;
  prepareReading: () => void | Promise<void>;
  onReviewedChange: (reviewed: boolean) => void;
  onVoiceChange: (voiceURI: string) => void;
  startReading: () => void;
  pauseReading: () => void;
  resumeReading: () => void;
  stopReading: () => void;
  generateWav: () => void | Promise<void>;
  cancelWav: () => void;
};

export function AudioWorkspace({
  model,
  actions,
  completeAudioRef,
}: {
  model: AudioWorkspaceModel;
  actions: AudioWorkspaceActions;
  completeAudioRef: MutableRefObject<HTMLAudioElement | null>;
}) {
  const {
    document, documentV2, audioHistory, savedWav, selectedAudioKey, audioOpening,
    audioMaintenanceBusy, currentAudioKey, completeWav, completeProgress, completeTotal,
    currentChapter, pageNumber, endPage, preview, reviewed, speechState, voices, voiceURI,
    wavBusy, wavProgress, wavUrl, busy, ocrCommitBusy,
  } = model;

  return <section className="stage-section" id="audio" aria-label="Áudio">
    {!documentV2 && <div className="stage-empty"><span className="section-number">05</span><div>
      <h2>Áudio</h2><p>Quando o texto estiver pronto, gere, ouça e baixe o audiobook aqui.</p>
    </div></div>}

    {document && audioHistory.length > 0 && <section className="panel" aria-labelledby="saved-audio-title">
      <h2 id="saved-audio-title">Gravações neste dispositivo</h2>
      <p>Abra uma gravação para ouvir ou baixar. Cada WAV contém o texto extraído do intervalo indicado.</p>
      <ul className="audio-history">{audioHistory.map(entry => <li key={entry.artifactKey}>
        Páginas {entry.startPage} a {entry.endPage} · {new Date(entry.createdAtMs).toLocaleString("pt-BR")} · {(entry.sizeBytes / 1024 / 1024).toFixed(1)} MB{" "}
        <button type="button" onClick={() => void actions.openSavedAudio(entry)} disabled={audioOpening}
          aria-label={`Abrir gravação das páginas ${entry.startPage} a ${entry.endPage}, salva em ${new Date(entry.createdAtMs).toLocaleString("pt-BR")}`}>
          {selectedAudioKey === entry.artifactKey ? "Reabrir gravação" : "Abrir gravação"}
        </button>
        {entry.artifactKey !== currentAudioKey && !completeWav?.chapters.some(chapter => chapter.audioKey === entry.artifactKey)
          && <button type="button" onClick={() => void actions.removeSavedAudio(entry)}
            disabled={audioMaintenanceBusy || audioOpening || wavBusy}
            aria-label={`Excluir gravação das páginas ${entry.startPage} a ${entry.endPage}, salva em ${new Date(entry.createdAtMs).toLocaleString("pt-BR")}`}>
            Excluir gravação antiga
          </button>}
      </li>)}</ul>
      {savedWav && <div className="wav-result">
        <audio controls src={savedWav.url} aria-label="Gravação WAV selecionada" />
        <a href={savedWav.url} download={`audiobook-studio-paginas-${savedWav.startPage}-${savedWav.endPage}.wav`}>Baixar WAV selecionado</a>
      </div>}
    </section>}

    {documentV2 && <section className="panel" aria-labelledby="complete-audio-title">
      <h2 id="complete-audio-title">Gerar audiobook completo</h2>
      <p>Escolha leitura literal ou narração aprovada. Páginas sem texto aprovado bloqueiam a geração.</p>
      <button type="button" onClick={() => void actions.generateCompleteLiteral()} disabled={wavBusy || busy || ocrCommitBusy}>
        {wavBusy ? "Gerando áudio…" : "Gerar audiobook completo em WAV"}
      </button>
      <button type="button" onClick={() => void actions.generateCompleteNarrative()} disabled={wavBusy || busy || ocrCommitBusy}>
        {wavBusy ? "Gerando áudio…" : "Gerar audiobook narrativo em WAV"}
      </button>
      {wavBusy && <button type="button" onClick={actions.cancelCompleteGeneration}>Cancelar geração</button>}
      {completeProgress !== null && <p role="status">{completeProgress} de {completeTotal} capítulos processados.</p>}
      {completeWav && <div className="wav-result">
        <p>Modo: {"mode" in completeWav && completeWav.mode === "narrative" ? "Narrativo" : "Literal"}.</p>
        <audio controls ref={completeAudioRef} src={completeWav.url} aria-label="Audiobook completo"
          onTimeUpdate={event => actions.onCompleteTimeUpdate(event.currentTarget.currentTime)} />
        <div className="reading-actions">
          <button type="button" onClick={() => actions.seekChapter(currentChapter - 1)} disabled={currentChapter === 0}>Capítulo anterior</button>
          <button type="button" onClick={() => actions.seekChapter(currentChapter + 1)} disabled={currentChapter >= completeWav.chapters.length - 1}>Próximo capítulo</button>
        </div>
        <ol>{completeWav.chapters.map(chapter => <li key={chapter.pageNumber}>
          <button type="button" onClick={() => actions.seekChapter(chapter.pageNumber - 1)}
            aria-current={currentChapter === chapter.pageNumber - 1 ? "true" : undefined}>
            {"mode" in completeWav && completeWav.mode === "narrative" ? "Capítulo" : "Página"} {chapter.pageNumber} · início {Math.floor(chapter.startSeconds / 60)}:{String(Math.floor(chapter.startSeconds % 60)).padStart(2, "0")}
          </button>
        </li>)}</ol>
      </div>}
    </section>}

    {document && <section className="panel" aria-labelledby="reading-title">
      <h2 id="reading-title">Ouvir o texto do PDF</h2>
      <p>Selecione até dez páginas consecutivas. O texto é lido sem reescrita ou correção automática.</p>
      <label htmlFor="reading-page">Primeira página</label>
      <select id="reading-page" value={pageNumber} onChange={event => actions.onStartPageChange(Number(event.target.value))}>
        {document.pages.map(page => <option key={page.number} value={page.number}>{page.number}</option>)}
      </select>
      <label htmlFor="reading-end-page">Última página</label>
      <select id="reading-end-page" value={endPage} onChange={event => actions.onEndPageChange(Number(event.target.value))}>
        {document.pages.filter(page => page.number >= pageNumber && page.number < pageNumber + 10)
          .map(page => <option key={page.number} value={page.number}>{page.number}</option>)}
      </select>
      <button type="button" onClick={() => void actions.prepareReading()} disabled={!documentV2 || busy}>Preparar leitura</button>

      {preview && <div className="reading-review">
        <h3>Texto para conferir</h3>
        <div className="reading-text">{preview.pages.map(page => <section key={page.pageNumber} aria-label={`Página ${page.pageNumber}`}>
          <h4>Página {page.pageNumber}</h4>
          {page.chunks.map(chunk => <p key={chunk.regionId}>{chunk.text}</p>)}
        </section>)}</div>
        <label className="check-label"><input type="checkbox" checked={reviewed}
          onChange={event => actions.onReviewedChange(event.target.checked)} /> Conferi o texto de todas as páginas selecionadas.</label>
        <label htmlFor="reading-voice">Voz instalada</label>
        <select id="reading-voice" value={voiceURI} onChange={event => actions.onVoiceChange(event.target.value)} disabled={voices.length === 0}>
          {voices.length === 0 ? <option value="">Nenhuma voz local disponível</option>
            : voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
        </select>
        <div className="reading-actions">
          <button type="button" onClick={actions.startReading} disabled={!reviewed || !voiceURI || speechState !== "idle"}>Ouvir</button>
          <button type="button" onClick={actions.pauseReading} disabled={speechState !== "playing"}>Pausar</button>
          <button type="button" onClick={actions.resumeReading} disabled={speechState !== "paused"}>Retomar</button>
          <button type="button" onClick={actions.stopReading} disabled={speechState === "idle"}>Parar</button>
        </div>
        <p role="status" aria-live="polite">{speechState === "playing" ? "Lendo o texto selecionado." : speechState === "paused" ? "Leitura pausada." : "Leitura parada."}</p>

        <h3>Gerar arquivo de áudio</h3>
        <p>Use a voz local Faber (pt-BR). O modelo é baixado na primeira geração; o texto do PDF não é enviado ao serviço de voz. Limite: 12 mil caracteres por arquivo.</p>
        <div className="reading-actions">
          <button type="button" onClick={() => void actions.generateWav()} disabled={!reviewed || wavBusy || audioMaintenanceBusy}>Gerar WAV</button>
          <button type="button" onClick={actions.cancelWav} disabled={!wavBusy}>Cancelar geração</button>
        </div>
        {wavBusy && <p role="status" aria-live="polite">{wavProgress && wavProgress.total > 0
          ? `Preparando áudio: ${Math.min(100, Math.round(wavProgress.loaded / wavProgress.total * 100))}%.`
          : "Preparando áudio local…"}</p>}
        {wavUrl && <div className="wav-result">
          <audio controls src={wavUrl} aria-label="Prévia do WAV gerado" />
          <a href={wavUrl} download={`audiobook-studio-paginas-${pageNumber}-${endPage}.wav`}>Salvar WAV</a>
        </div>}
        <p className="footnote">Esta é uma leitura literal do texto extraído, não um audiobook narrativo revisado. O áudio pode conter erros da extração e da voz.</p>
      </div>}
    </section>}
  </section>;
}
