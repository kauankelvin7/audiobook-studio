import type { CompleteAudioWithUrl } from "./audio_types";
import { StudioIcon } from "./StudioIcon";

function formatSeconds(secs: number): string {
  if (!Number.isFinite(secs) || secs < 0) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

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
  return (
    <div className="chapter-list-wrapper">
      <div className="chapter-list-header">
        <span className="chapter-count-label">
          {completeWav.chapters.length} {completeWav.chapters.length === 1 ? "capítulo" : "capítulos"}
        </span>
        <span className="chapter-mode-tag">
          {narrative ? "Roteiro Narrativo" : "Leitura Literal"}
        </span>
      </div>
      <ol className="chapter-list" aria-label="Capítulos do audiobook">
        {completeWav.chapters.map(chapter => {
          const index = chapter.pageNumber - 1;
          const isActive = currentChapter === index;
          return (
            <li key={chapter.pageNumber}>
              <button
                type="button"
                className={`chapter-item-btn${isActive ? " is-active" : ""}`}
                onClick={() => onSeek(index)}
                aria-current={isActive ? "true" : undefined}
              >
                <span className="chapter-num-badge">
                  {String(chapter.pageNumber).padStart(2, "0")}
                </span>
                <span className="chapter-title-copy">
                  {narrative ? "Capítulo" : "Página"} {chapter.pageNumber} · início {Math.floor(chapter.startSeconds / 60)}:{String(Math.floor(chapter.startSeconds % 60)).padStart(2, "0")}
                </span>
                <span className="chapter-duration-pill">
                  {formatSeconds(chapter.durationSeconds)}
                </span>
                {isActive && (
                  <span className="chapter-active-icon" title="Capítulo em reprodução">
                    <StudioIcon name="audio" size={14} />
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
