import { StudioIcon } from "./StudioIcon";

type QaStatus = "pass" | "review" | "fail" | null;
type AudioMode = "literal" | "narrative" | null;

export function ReviewBottomDock({
  narrativeReady,
  narrativeChapters,
  narrativeQaStatus,
  audioUrl,
  audioChapters,
  audioMode,
  audioBusy,
  audioProgress,
  exportReady,
}: {
  narrativeReady: boolean;
  narrativeChapters: number;
  narrativeQaStatus: QaStatus;
  audioUrl: string | null;
  audioChapters: number;
  audioMode: AudioMode;
  audioBusy: boolean;
  audioProgress: { current: number; total: number } | null;
  exportReady: boolean;
}) {
  const qaLabel = narrativeQaStatus === "pass" ? "Conferência concluída"
    : narrativeQaStatus === "review" ? "Revisão humana necessária"
      : narrativeQaStatus === "fail" ? "Correção necessária" : "Aguardando roteiro";

  return <section className="review-bottom-dock" aria-label="Resumo de produção">
    <article className="review-summary-card narrative-summary-card">
      <header className="summary-card-header">
        <div><span className="summary-icon"><StudioIcon name="narrative" size={18} /></span>
          <div><p className="summary-kicker">NARRATIVA</p><h2>Roteiro narrativo</h2></div>
        </div>
        <a href="#narrative" aria-label="Abrir revisão da narrativa"><StudioIcon name="chevron" size={17} /></a>
      </header>
      <div className="summary-status-list">
        <p><StudioIcon name={narrativeReady ? "check" : "review"} size={16} />
          <span>{narrativeReady ? "Roteiro aprovado" : "Roteiro aguardando aprovação"}</span></p>
        <p><StudioIcon name={narrativeQaStatus === "fail" ? "warning" : "check"} size={16} />
          <span>{qaLabel}</span></p>
        <p><StudioIcon name="document" size={16} />
          <span>{narrativeChapters > 0 ? narrativeChapters + (narrativeChapters === 1 ? " capítulo" : " capítulos") : "Capítulos ainda não aprovados"}</span></p>
      </div>
      <a className="summary-action subtle" href="#narrative">Revisar roteiro</a>
    </article>

    <article className="review-summary-card audio-summary-card">
      <header className="summary-card-header">
        <div><span className="summary-icon"><StudioIcon name="audio" size={18} /></span>
          <div><p className="summary-kicker">ÁUDIO</p><h2>{audioUrl ? "Ouvir agora" : audioBusy ? "Preparando áudio" : "Preparar áudio"}</h2></div>
        </div>
        <a href="#audio" aria-label="Abrir etapa de áudio"><StudioIcon name="chevron" size={17} /></a>
      </header>
      {audioUrl ? <>
        <p className="audio-mode-label">{audioMode === "narrative" ? "Audiobook narrativo" : "Leitura literal"} · {audioChapters} {audioChapters === 1 ? "capítulo disponível" : "capítulos disponíveis"}</p>
        <audio className="summary-audio" controls src={audioUrl} aria-label="Audiobook disponível" />
        {audioBusy && audioProgress && <div className="summary-progress compact" aria-label="Progresso da geração">
          <div><span>Continuando a geração</span><strong>{audioProgress.current}/{audioProgress.total}</strong></div>
          <progress value={audioProgress.current} max={Math.max(1, audioProgress.total)} />
        </div>}
      </> : audioBusy && audioProgress ? <div className="summary-progress" aria-label="Progresso da geração">
        <div><span>Preparando primeiro capítulo</span><strong>{audioProgress.current}/{audioProgress.total}</strong></div>
        <progress value={audioProgress.current} max={Math.max(1, audioProgress.total)} />
      </div> : <p className="summary-empty">Gere o primeiro capítulo na etapa Áudio depois de concluir as aprovações.</p>}
      <a className="summary-action audio-action" href="#audio">{audioUrl ? "Abrir player" : "Ir para áudio"}</a>
    </article>

    <article className="review-summary-card export-summary-card">
      <header className="summary-card-header">
        <div><span className="summary-icon"><StudioIcon name="export" size={18} /></span>
          <div><p className="summary-kicker">EXPORTAR</p><h2>Audiobook final</h2></div>
        </div>
        <a href="#export" aria-label="Abrir exportação"><StudioIcon name="chevron" size={17} /></a>
      </header>
      <dl className="summary-metrics">
        <div><dt>Capítulos</dt><dd>{audioChapters || "—"}</dd></div>
        <div><dt>Modo</dt><dd>{audioMode === "narrative" ? "Narrativo" : audioMode === "literal" ? "Literal" : "—"}</dd></div>
        <div><dt>Formato</dt><dd>WAV</dd></div>
        <div><dt>Status</dt><dd className={exportReady ? "success-text" : "warning-text"}>{exportReady ? "Pronto" : "Aguardando áudio"}</dd></div>
      </dl>
      <a className={"summary-action" + (exportReady ? " primary" : "")} href="#export">{exportReady ? "Exportar audiobook" : "Ver requisitos"}</a>
    </article>
  </section>;
}
