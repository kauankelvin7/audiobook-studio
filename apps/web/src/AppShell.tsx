import { useEffect, useRef, useState, type ReactNode } from "react";
import { StudioIcon, type StudioIconName } from "./StudioIcon";
import { applyAppearance, storedAppearance, type Appearance } from "./appearance";
const sections: [string, string, StudioIconName][] = [["project", "Projeto", "project"], ["document", "Documento", "document"], ["review", "Revisão", "review"], ["narrative", "Narrativa", "narrative"], ["audio", "Áudio", "audio"], ["export", "Exportar", "export"]];
export function useProductStage() {
  const [stage, setStage] = useState(() => window.location.hash.slice(1) || "project");
  useEffect(() => { const update = () => setStage(window.location.hash.slice(1) || "project"); window.addEventListener("hashchange", update); return () => window.removeEventListener("hashchange", update); }, []);
  return stage;
}
function StudioSidebar({ active, fileName, pageCount, saved, hasDocument, onUtility }: { active: string; fileName: string; pageCount: number; saved: boolean; hasDocument: boolean; onUtility: (value: string) => void }) {
  return <aside className="studio-sidebar" aria-label="Navegação principal">
    <a className="studio-brand" href="#project"><span className="brand-wave"><StudioIcon name="audio" size={32} /></span><span>Audiobook<br />Studio</span></a>
    <nav className="studio-nav" aria-label="Etapas do projeto">{sections.filter(([id]) => hasDocument || id === "project").map(([id, label, icon]) => <a key={id} href={`#${id}`} aria-current={active === id ? "location" : undefined}><StudioIcon name={icon} size={22} />{label}</a>)}</nav>
    <nav className="utility-nav" aria-label="Ferramentas">{hasDocument && <button onClick={() => onUtility("Diagnóstico")}><StudioIcon name="diagnostic" />Diagnóstico</button>}<button onClick={() => onUtility("Configurações")}><StudioIcon name="settings" />Configurações</button></nav>
    <div className="sidebar-project"><div><StudioIcon name="document" size={28} /><span><strong>{fileName.replace(/\.pdf$/i, "") || "Seu audiobook"}</strong><small>{pageCount ? "PDF importado" : "Nenhum PDF aberto"}</small></span></div><p><StudioIcon name="document" size={15} />{pageCount} páginas</p><p><StudioIcon name="save" size={15} />{saved ? "Salvo neste dispositivo" : "Processamento local"}</p><a href="#project">Ver detalhes</a></div>
  </aside>;
}
function ProjectHeader({ fileName, pageCount, saved, narrativeReady, audioBusy, chapterCount, onOpenCommandPalette }: { fileName: string; pageCount: number; saved: boolean; narrativeReady: boolean; audioBusy: boolean; chapterCount: number; onOpenCommandPalette: () => void }) {
  return <header className="project-bar"><div className="project-identity"><strong className="project-bar-title">{fileName.replace(/\.pdf$/i, "") || "Audiobook Studio"}</strong><span className="saved-badge"><StudioIcon name="save" size={14} />{saved ? "Salvo neste dispositivo" : "Processamento local"}</span></div><div className="project-statuses">{pageCount > 0 && <span><StudioIcon name="document" /><span>Documento importado<small>{pageCount} páginas</small></span></span>}{narrativeReady && <span><StudioIcon name="check" /><span>Narrativa pronta<small>Roteiro aprovado</small></span></span>}{(audioBusy || chapterCount > 0) && <span><StudioIcon name={audioBusy ? "audio" : "check"} /><span>{audioBusy ? "Áudio em geração" : "Áudio disponível"}<small>{chapterCount ? `${chapterCount} capítulos` : "Preparando narração"}</small></span></span>}<button type="button" className="command-trigger" onClick={onOpenCommandPalette} aria-label="Abrir ações rápidas" title="Ações rápidas (Ctrl K)">⌘ K</button></div></header>;
}
export function AppShell({ children, fileName, pageCount, saved, hasDocument, narrativeReady = false, audioBusy = false, chapterCount = 0, readingMode = false }: { children: ReactNode; fileName: string; pageCount: number; saved: boolean; hasDocument: boolean; narrativeReady?: boolean; audioBusy?: boolean; chapterCount?: number; readingMode?: boolean }) {
  const active = useProductStage();
  const [utility, setUtility] = useState("");
  const [appearance, setAppearance] = useState<Appearance>(storedAppearance);
  const dialog = useRef<HTMLDialogElement>(null);
  const commandDialog = useRef<HTMLDialogElement>(null);
  const [commandQuery, setCommandQuery] = useState("");
  function openUtility(value: string) { setUtility(value); if (dialog.current && !dialog.current.open) dialog.current.showModal(); }
  function openCommandPalette() { if (commandDialog.current?.open) return; setCommandQuery(""); commandDialog.current?.showModal(); }
  const commands = [
    { label: "Abrir biblioteca", hint: "Ir para o início", run: () => { window.location.hash = "project"; } },
    { label: "Importar PDF", hint: "Escolher um documento", run: () => { globalThis.document.getElementById("pdf-input")?.click(); } },
    ...(hasDocument ? [
      { label: "Abrir revisão", hint: "Conferir o texto", run: () => { window.location.hash = "review"; } },
      { label: "Abrir áudio", hint: "Gerar ou ouvir", run: () => { window.location.hash = "audio"; } },
    ] : []),
    { label: "Abrir configurações", hint: "Tema e preferências", run: () => { openUtility("Configurações"); } },
  ];
  const filteredCommands = commands.filter(command => `${command.label} ${command.hint}`.toLocaleLowerCase().includes(commandQuery.toLocaleLowerCase()));
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        openCommandPalette();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  return <div className={`app-frame${active === "review" && hasDocument ? " review-mode" : ""}${readingMode ? " reading-mode" : ""}`}>
    <a className="skip-link" href="#main-content">Ir para o conteúdo</a>
    <StudioSidebar active={active} fileName={fileName} pageCount={pageCount} saved={saved} hasDocument={hasDocument} onUtility={openUtility} />
    <div className="workspace-frame"><ProjectHeader fileName={fileName} pageCount={pageCount} saved={saved} narrativeReady={narrativeReady} audioBusy={audioBusy} chapterCount={chapterCount} onOpenCommandPalette={openCommandPalette} /><main id="main-content" className={`shell${hasDocument ? " has-document" : ""}`}>{children}</main></div>
    <nav className="mobile-nav" aria-label="Etapas do projeto">{sections.filter(([id]) => (hasDocument || id === "project") && ["project", "document", "review", "audio"].includes(id)).map(([id,label,icon]) => <a key={id} href={`#${id}`} aria-current={active === id ? "location" : undefined}><StudioIcon name={icon} size={20} />{label}</a>)}<details className="mobile-more"><summary><StudioIcon name="more" />Mais</summary><div>{hasDocument && <><a href="#narrative">Narrativa</a><a href="#export">Exportar</a><button onClick={() => openUtility("Diagnóstico")}>Diagnóstico</button></>}<button onClick={() => openUtility("Configurações")}>Configurações</button></div></details></nav>
    <dialog ref={dialog} className="studio-dialog" aria-labelledby="utility-title"><h2 id="utility-title">{utility}</h2>{utility === "Diagnóstico" ? <dl><dt>Documento</dt><dd>{fileName || "Nenhum documento aberto"}</dd><dt>Páginas importadas</dt><dd>{pageCount}</dd><dt>Armazenamento do projeto</dt><dd>{saved ? "Disponível neste navegador" : "Ainda não salvo"}</dd><dt>Capítulos disponíveis</dt><dd>{chapterCount}</dd></dl> : <><p>Escolha a aparência do estúdio. A preferência fica salva neste navegador.</p><fieldset className="appearance-options"><legend>Aparência</legend>{(["light", "dark", "system"] as const).map((value) => <label key={value}><input type="radio" name="appearance" value={value} checked={appearance === value} onChange={() => { setAppearance(value); applyAppearance(value); }} /><span>{value === "light" ? "Claro" : value === "dark" ? "Escuro" : "Usar a do sistema"}</span></label>)}</fieldset><p>As opções de voz e leitura ficam na etapa Áudio.</p></>}<form method="dialog"><button>Fechar</button></form></dialog>
    <dialog ref={commandDialog} className="studio-dialog command-palette" aria-labelledby="command-title">
      <div className="command-palette-heading"><h2 id="command-title">Ir para</h2><kbd>Ctrl K</kbd></div>
      <input autoFocus value={commandQuery} onChange={event => setCommandQuery(event.target.value)} placeholder="Buscar ação" aria-label="Buscar ação" />
      <div className="command-list">{filteredCommands.map(command => <button key={command.label} type="button" onClick={() => { commandDialog.current?.close(); command.run(); }}><span>{command.label}</span><small>{command.hint}</small></button>)}</div>
      {filteredCommands.length === 0 && <p className="command-empty">Nenhuma ação encontrada.</p>}
    </dialog>
  </div>;
}
