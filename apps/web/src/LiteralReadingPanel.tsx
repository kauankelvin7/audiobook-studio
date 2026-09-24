import { AudioPlayer } from "./AudioPlayer";
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
  return <section className="panel literal-reading-panel" aria-labelledby="reading-title">
    <h2 id="reading-title">Ouvir o texto do PDF</h2>
    <p>Selecione até dez páginas consecutivas. O texto é lido sem reescrita ou correção automática.</p>
    <label htmlFor="reading-page">Primeira página</label>
    <select id="reading-page" value={pageNumber} onChange={event => onStartPageChange(Number(event.target.value))}>
      {document.pages.map(page => <option key={page.number} value={page.number}>{page.number}</option>)}
    </select>
    <label htmlFor="reading-end-page">Última página</label>
    <select id="reading-end-page" value={endPage} onChange={event => onEndPageChange(Number(event.target.value))}>
      {document.pages.filter(page => page.number >= pageNumber && page.number < pageNumber + 10)
        .map(page => <option key={page.number} value={page.number}>{page.number}</option>)}
    </select>
    <button type="button" onClick={() => void onPrepareReading()} disabled={!documentV2 || busy}>Preparar leitura</button>

    {preview && <div className="reading-review">
      <h3>Texto para conferir</h3>
      <div className="reading-text">{preview.pages.map(page => <section key={page.pageNumber} aria-label={`Página ${page.pageNumber}`}>
        <h4>Página {page.pageNumber}</h4>
        {page.chunks.map(chunk => <p key={chunk.regionId}>{chunk.text}</p>)}
      </section>)}</div>
      <label className="check-label"><input type="checkbox" checked={reviewed}
        onChange={event => onReviewedChange(event.target.checked)} /> Conferi o texto de todas as páginas selecionadas.</label>
      <label htmlFor="reading-voice">Voz instalada</label>
      <select id="reading-voice" value={voiceURI} onChange={event => onVoiceChange(event.target.value)} disabled={voices.length === 0}>
        {voices.length === 0 ? <option value="">Nenhuma voz local disponível</option>
          : voices.map(voice => <option key={voice.voiceURI} value={voice.voiceURI}>{voice.name} ({voice.lang})</option>)}
      </select>
      <div className="reading-actions">
        <button type="button" onClick={onStartReading} disabled={!reviewed || !voiceURI || speechState !== "idle"}>Ouvir</button>
        <button type="button" onClick={onPauseReading} disabled={speechState !== "playing"}>Pausar</button>
        <button type="button" onClick={onResumeReading} disabled={speechState !== "paused"}>Retomar</button>
        <button type="button" onClick={onStopReading} disabled={speechState === "idle"}>Parar</button>
      </div>
      <p role="status" aria-live="polite">{speechState === "playing" ? "Lendo o texto selecionado." : speechState === "paused" ? "Leitura pausada." : "Leitura parada."}</p>

      <h3>Gerar arquivo de áudio</h3>
      <p>Use a voz local Faber (pt-BR). O modelo é baixado na primeira geração; o texto do PDF não é enviado ao serviço de voz. Limite: 12 mil caracteres por arquivo.</p>
      <div className="reading-actions">
        <button type="button" onClick={() => void onGenerateWav()} disabled={!reviewed || wavBusy || audioMaintenanceBusy}>Gerar WAV</button>
        <button type="button" onClick={onCancelWav} disabled={!wavBusy}>Cancelar geração</button>
      </div>
      {wavBusy && <p role="status" aria-live="polite">{wavProgress && wavProgress.total > 0
        ? `Preparando áudio: ${Math.min(100, Math.round(wavProgress.loaded / wavProgress.total * 100))}%.`
        : "Preparando áudio local…"}</p>}
      {wavUrl && <div className="wav-result">
        <AudioPlayer src={wavUrl} label="Prévia do WAV gerado" />
        <a href={wavUrl} download={`audiobook-studio-paginas-${pageNumber}-${endPage}.wav`}>Salvar WAV</a>
      </div>}
      <p className="footnote">Esta é uma leitura literal do texto extraído, não um audiobook narrativo revisado. O áudio pode conter erros da extração e da voz.</p>
    </div>}
  </section>;
}
