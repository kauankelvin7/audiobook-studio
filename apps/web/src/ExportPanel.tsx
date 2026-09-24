import type { CompleteLiteralAudio } from "./adapters/saved_literal_audio";
import type { CompleteNarrativeAudio } from "./adapters/narrative_audio";

type CompleteAudioWithUrl = (CompleteLiteralAudio | CompleteNarrativeAudio) & { url: string };

export function ExportPanel({ completeWav }: { completeWav: CompleteAudioWithUrl | null }) {
  const mode = completeWav && "mode" in completeWav ? completeWav.mode : "literal";
  const manifest = completeWav ? {
    schemaVersion: 1,
    format: "audio/wav",
    mode,
    scriptHash: "scriptHash" in completeWav ? completeWav.scriptHash : null,
    sourceHash: completeWav.sourceHash,
    documentHash: completeWav.documentHash,
    audioHash: completeWav.audioHash,
    pipelineVersion: completeWav.pipelineVersion,
    voiceId: "pt_BR-faber-medium",
    chapters: completeWav.chapters,
  } : null;

  return <section className="panel export-stage" id="export" aria-labelledby="export-title">
    <div className="section-heading compact-heading"><span className="section-number">06</span><div>
      <p className="section-kicker">EXPORTAR</p><h2 id="export-title">Exportar audiobook</h2>
    </div></div>
    {completeWav ? <>
      <div className="export-readiness">
        <span className="status-badge success">Pronto para baixar</span>
        <p>{completeWav.chapters.length} {completeWav.chapters.length === 1 ? "capítulo pronto" : "capítulos prontos"} · {mode === "narrative" ? "narração aprovada" : "leitura literal"}.</p>
      </div>
      <div className="export-actions">
        <a className="button-link primary" href={completeWav.url} download="audiobook-studio-completo.wav">Baixar audiobook completo em WAV</a>
        <a className="button-link" href={"data:application/json;charset=utf-8," + encodeURIComponent(JSON.stringify(manifest))}
          download="audiobook-studio-completo.manifest.json">Baixar índice e manifesto</a>
      </div>
    </> : <div className="export-blocked">
      <span className="status-badge warning">Aguardando áudio</span>
      <p>Gere e confira o áudio na etapa Áudio. O download ficará disponível aqui.</p>
      <a href="#audio">Ir para Áudio</a>
    </div>}
  </section>;
}
