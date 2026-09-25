import { useEffect, useRef, useState } from "react";
import { AudioPlayer } from "./AudioPlayer";
import type { CompleteAudioWithUrl } from "./audio_types";

export function ReadingPlayer({ audio, pages, onPageChange, onExit }: {
  audio: CompleteAudioWithUrl | null;
  pages: (number | null)[];
  onPageChange: (page: number) => void;
  onExit: () => void;
}) {
  const player = useRef<HTMLAudioElement | null>(null);
  const active = useRef(-1);
  const [chapter, setChapter] = useState(0);
  const [follow, setFollow] = useState(true);
  const [ready, setReady] = useState(false);
  useEffect(() => { active.current = -1; setChapter(0); }, [audio?.url]);
  useEffect(() => {
    const element = player.current;
    setReady(!!element && element.readyState >= 1);
    if (!element) return;
    const loaded = () => setReady(true);
    element.addEventListener("loadedmetadata", loaded);
    return () => element.removeEventListener("loadedmetadata", loaded);
  }, [audio?.url]);
  function update(time: number) {
    if (!audio) return;
    const index = audio.chapters.reduce((last, item, position) => item.startSeconds <= time + 0.025 ? position : last, 0);
    setChapter(index);
    if (active.current !== index) {
      active.current = index;
      const page = pages[index];
      if (follow && page !== null && page !== undefined) onPageChange(page);
    }
  }
  function seek(index: number) {
    if (!ready || !audio || !player.current || !audio.chapters[index]) return;
    player.current.currentTime = audio.chapters[index].startSeconds;
    active.current = -1;
    update(audio.chapters[index].startSeconds);
  }
  function changeFollow(enabled: boolean) {
    setFollow(enabled);
    active.current = -1;
    const page = pages[chapter];
    if (enabled && page != null) onPageChange(page);
  }
  return <section className="reading-player" aria-label="Áudio no modo leitura">
    <div className="reading-player-heading"><div><strong>Ouvir e acompanhar</strong><p>{audio ? `Capítulo ${chapter + 1} de ${audio.chapters.length}` : "Seu audiobook aparecerá aqui quando o áudio estiver pronto."}</p></div><button type="button" onClick={onExit}>Sair da leitura</button></div>
    {audio ? <><div className="reading-player-controls"><button type="button" aria-label="Capítulo anterior na leitura" disabled={!ready || chapter === 0} onClick={() => seek(chapter - 1)}>Anterior</button><AudioPlayer src={audio.url} label="Audiobook no modo leitura" audioRef={player} onTimeUpdate={update} /><button type="button" aria-label="Próximo capítulo na leitura" disabled={!ready || chapter >= audio.chapters.length - 1} onClick={() => seek(chapter + 1)}>Próximo</button></div><label className="check-label"><input type="checkbox" checked={follow} onChange={event => changeFollow(event.target.checked)} />Acompanhar a página do capítulo</label>{pages[chapter] == null && <p className="footnote">Este capítulo não tem uma página de origem identificada. Use as setas do documento para acompanhar.</p>}</> : <a className="button-link primary" href="#audio" onClick={onExit}>Preparar audiobook</a>}
  </section>;
}
