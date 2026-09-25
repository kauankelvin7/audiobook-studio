import { StudioIcon } from "./StudioIcon";
import type { CompleteLiteralAudio } from "./adapters/saved_literal_audio";
import type { CompleteNarrativeAudio } from "./adapters/narrative_audio";

type CompleteAudioWithUrl = (CompleteLiteralAudio | CompleteNarrativeAudio) & { url: string };

export function ExportPanel({ completeWav }: { completeWav: CompleteAudioWithUrl | null }) {
  const mode = completeWav && "mode" in completeWav ? completeWav.mode : "literal";
  const manifest = completeWav
    ? {
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
      }
    : null;

  return (
    <section className="panel export-stage" id="export" aria-labelledby="export-title">
      <div className="section-heading compact-heading">
        <span className="section-number">06</span>
        <div>
          <p className="section-kicker">EXPORTAR</p>
          <h2 id="export-title">Exportar audiobook</h2>
        </div>
      </div>

      {completeWav ? (
        <div className="export-content-grid animate-fade-in">
          <div className="card-box export-ready-card">
            <div className="card-header-row">
              <span className="status-badge success">Pronto para baixar</span>
              <span className="mode-tag">
                {mode === "narrative" ? "Narração Aprovada" : "Leitura Literal"}
              </span>
            </div>
            <p className="export-summary-text">
              {completeWav.chapters.length}{" "}
              {completeWav.chapters.length === 1 ? "capítulo sintetizado" : "capítulos sintetizados"} e
              unificados em formato WAV padrão de estúdio.
            </p>

            <div className="export-meta-chips">
              <span className="meta-chip">Áudio: 22.05 kHz WAV</span>
              <span className="meta-chip">Voz: Faber neural (pt-BR)</span>
              <span className="meta-chip">Capítulos: {completeWav.chapters.length}</span>
            </div>

            <div className="export-actions-group">
              <a
                className="button-link primary export-primary-btn"
                href={completeWav.url}
                download="audiobook-studio-completo.wav"
              >
                <StudioIcon name="download" size={18} />
                <span>Baixar audiobook completo em WAV</span>
              </a>

              <a
                className="button-link secondary-btn"
                href={
                  "data:application/json;charset=utf-8," +
                  encodeURIComponent(JSON.stringify(manifest, null, 2))
                }
                download="audiobook-studio-completo.manifest.json"
              >
                <StudioIcon name="document" size={16} />
                <span>Baixar índice e manifesto JSON</span>
              </a>
            </div>
          </div>
        </div>
      ) : (
        <div className="card-box export-blocked-card">
          <div className="card-header-row">
            <span className="status-badge warning">Aguardando geração de áudio</span>
          </div>
          <p className="blocked-desc">
            Para baixar o audiobook final e seu manifesto, conclua a geração completa na etapa de Áudio.
          </p>
          <div className="blocked-action-row">
            <a href="#audio" className="button-link primary">
              <StudioIcon name="audio" size={16} />
              <span>Ir para a etapa Áudio</span>
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
