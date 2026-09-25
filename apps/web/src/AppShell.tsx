import { useEffect, useRef, useState, type ReactNode } from "react";
import { StudioIcon, type StudioIconName } from "./StudioIcon";
const sections: [string, string, StudioIconName][] = [["project", "Projeto", "project"], ["document", "Documento", "document"], ["review", "Revisão", "review"], ["narrative", "Narrativa", "narrative"], ["audio", "Áudio", "audio"], ["export", "Exportar", "export"]];
export function useProductStage() {
  const [stage, setStage] = useState(() => window.location.hash.slice(1) || "project");

  useEffect(() => {
    const updateFromHash = () => {
      const hash = window.location.hash.slice(1);
      if (sections.some(([id]) => id === hash)) setStage(hash);
    };
    window.addEventListener("hashchange", updateFromHash);

    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      const id = visible?.target.id;
      if (id && sections.some(([sectionId]) => sectionId === id)) setStage(id);
    }, { rootMargin: "-22% 0px -58% 0px", threshold: [0.05, 0.2, 0.5] });

    for (const [id] of sections) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }

    return () => {
      window.removeEventListener("hashchange", updateFromHash);
      observer.disconnect();
    };
  }, []);

  return stage;
}
function StudioSidebar({ active, fileName, pageCount, saved, onUtility }: { active: string; fileName: string; pageCount: number; saved: boolean; onUtility: (value: string) => void }) {
  return <aside className="studio-sidebar" aria-label="Navegação principal">
    <a className="studio-brand" href="#project">
      <span className="brand-wave"><StudioIcon name="audio" size={24} /></span>
      <span className="brand-copy"><strong>Audiobook</strong><small>Studio</small></span>
    </a>
    <p className="sidebar-caption">Projeto</p>
    <nav className="studio-nav" aria-label="Etapas do projeto">{sections.map(([id, label, icon]) => <a key={id} href={`#${id}`} aria-current={active === id ? "location" : undefined}><span className="nav-icon"><StudioIcon name={icon} size={18} /></span><span>{label}</span></a>)}</nav>
    <div className="sidebar-rule" />
    <p className="sidebar-caption">Ferramentas</p>
    <nav className="utility-nav" aria-label="Ferramentas"><button onClick={() => onUtility("Diagnóstico")}><span className="nav-icon"><StudioIcon name="diagnostic" size={18} /></span><span>Diagnóstico</span></button><button onClick={() => onUtility("Configurações")}><span className="nav-icon"><StudioIcon name="settings" size={18} /></span><span>Configurações</span></button></nav>
    <div className="sidebar-project">
      <div className="sidebar-project-head"><span className="project-file-icon"><StudioIcon name="document" size={18} /></span><span><strong>{fileName.replace(/\.pdf$/i, "") || "Seu audiobook"}</strong><small>{pageCount ? "PDF processado" : "Nenhum PDF aberto"}</small></span></div>
      <dl><div><dt>Páginas</dt><dd>{pageCount || "—"}</dd></div><div><dt>Estado</dt><dd>{saved ? "Salvo localmente" : "Local"}</dd></div></dl>
      <a href="#project">Ver projeto <StudioIcon name="chevron" size={14} /></a>
    </div>
  </aside>;
}
function ProjectHeader({ fileName, pageCount, saved, narrativeReady, audioBusy, chapterCount }: { fileName: string; pageCount: number; saved: boolean; narrativeReady: boolean; audioBusy: boolean; chapterCount: number }) {
  return <header className="project-bar">
    <div className="project-identity">
      <div><span className="project-overline">Documento atual</span><strong className="project-bar-title">{fileName.replace(/\.pdf$/i, "") || "Audiobook Studio"}</strong></div>
      <span className="saved-badge"><StudioIcon name="save" size={13} />{saved ? "Salvo localmente" : "Processamento local"}</span>
    </div>
    <div className="project-statuses">
      {pageCount > 0 && <span className="project-status"><span className="status-icon success"><StudioIcon name="check" size={14} /></span><span>Documento<small>{pageCount} páginas</small></span></span>}
      {narrativeReady && <span className="project-status"><span className="status-icon success"><StudioIcon name="check" size={14} /></span><span>Narrativa<small>Roteiro aprovado</small></span></span>}
      {(audioBusy || chapterCount > 0) && <span className="project-status"><span className={`status-icon ${audioBusy ? "working" : "success"}`}><StudioIcon name={audioBusy ? "audio" : "check"} size={14} /></span><span>{audioBusy ? "Gerando áudio" : "Áudio pronto"}<small>{chapterCount ? `${chapterCount} capítulos` : "Preparando"}</small></span></span>}
    </div>
  </header>;
}
export function AppShell({ children, fileName, pageCount, saved, hasDocument, narrativeReady = false, audioBusy = false, chapterCount = 0 }: { children: ReactNode; fileName: string; pageCount: number; saved: boolean; hasDocument: boolean; narrativeReady?: boolean; audioBusy?: boolean; chapterCount?: number }) {
  const active = useProductStage();
  const [utility, setUtility] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  function openUtility(value: string) { setUtility(value); dialog.current?.showModal(); }
  return <div className={`app-frame${active === "review" && hasDocument ? " review-mode" : ""}`}>
    <a className="skip-link" href="#main-content">Ir para o conteúdo</a>
    <StudioSidebar active={active} fileName={fileName} pageCount={pageCount} saved={saved} onUtility={openUtility} />
    <div className="workspace-frame"><ProjectHeader fileName={fileName} pageCount={pageCount} saved={saved} narrativeReady={narrativeReady} audioBusy={audioBusy} chapterCount={chapterCount} /><main id="main-content" className={`shell${hasDocument ? " has-document" : ""}`}>{children}</main></div>
    <nav className="mobile-nav" aria-label="Etapas do projeto">{sections.filter(([id]) => ["project", "document", "review", "audio"].includes(id)).map(([id,label,icon]) => <a key={id} href={`#${id}`} aria-current={active === id ? "location" : undefined}><span className="mobile-nav-icon"><StudioIcon name={icon} size={18} /></span><span>{label}</span></a>)}<details className="mobile-more"><summary><StudioIcon name="more" />Mais</summary><div><a href="#narrative">Narrativa</a><a href="#export">Exportar</a><button onClick={() => openUtility("Diagnóstico")}>Diagnóstico</button><button onClick={() => openUtility("Configurações")}>Configurações</button></div></details></nav>
    <dialog ref={dialog} className="studio-dialog" aria-labelledby="utility-title"><h2 id="utility-title">{utility}</h2>{utility === "Diagnóstico" ? <dl><dt>Documento</dt><dd>{fileName || "Nenhum documento aberto"}</dd><dt>Páginas importadas</dt><dd>{pageCount}</dd><dt>Armazenamento do projeto</dt><dd>{saved ? "Disponível neste navegador" : "Ainda não salvo"}</dd><dt>Capítulos disponíveis</dt><dd>{chapterCount}</dd></dl> : <p>O documento é processado neste dispositivo. As fontes visuais são locais. As opções de voz e de leitura ficam na etapa Áudio.</p>}<form method="dialog"><button>Fechar</button></form></dialog>
  </div>;
}
