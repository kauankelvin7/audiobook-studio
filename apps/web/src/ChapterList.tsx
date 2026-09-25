import type { CompleteAudioWithUrl } from "./audio_types";

export function ChapterList({
  completeWav,
  currentChapter,
  onSeek,
}: {
  completeWav: CompleteAudioWithUrl;
  currentChapter: number;
  onSeek: (index: number) => void;
}) {
  const narrative = "mode" in completeWav && completeWav.mode === "narrative";
  return <ol className="chapter-list" aria-label="Capítulos do audiobook">
    {completeWav.chapters.map(chapter => <li key={chapter.pageNumber}>
      <button type="button" onClick={() => onSeek(chapter.pageNumber - 1)}
        aria-current={currentChapter === chapter.pageNumber - 1 ? "true" : undefined}>
        {narrative ? "Capítulo" : "Página"} {chapter.pageNumber} · início {Math.floor(chapter.startSeconds / 60)}:{String(Math.floor(chapter.startSeconds % 60)).padStart(2, "0")}
      </button>
    </li>)}
  </ol>;
}
