import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChapterList } from "./ChapterList";
import { OcrNativeTextView } from "./OcrInspectorContent";
import { OcrInspectorTabs } from "./OcrReviewViews";
import { ReviewBottomDock } from "./ReviewBottomDock";
import type { CompleteAudioWithUrl } from "./audio_types";

describe("frontend UI contracts", () => {
  it("renders the OCR inspector as an accessible tab list", () => {
    const html = renderToStaticMarkup(<OcrInspectorTabs value="ocr" onChange={() => undefined} />);
    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('aria-controls="ocr-inspector-panel"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain(">Nativo<");
    expect(html).toContain(">OCR<");
    expect(html).toContain(">Reconciliado<");
    expect(html).toContain(">Histórico<");
  });

  it("renders native OCR content with user-facing language", () => {
    const html = renderToStaticMarkup(<OcrNativeTextView
      pageNumber={1}
      regionId="region-1"
      nativeText="Texto original"
      pageHasNoText={false}
    />);
    expect(html).toContain("Texto extraído do PDF");
    expect(html).toContain("Texto original");
    expect(html).not.toContain("unknown:");
  });

  it("keeps review dock summaries separate from the full production panels", () => {
    const html = renderToStaticMarkup(<ReviewBottomDock
      narrativeReady={false}
      narrativeChapters={0}
      narrativeQaStatus={null}
      audioUrl={null}
      audioChapters={0}
      audioMode={null}
      audioBusy={false}
      audioProgress={null}
      exportReady={false}
    />);
    expect(html).toContain("Roteiro narrativo");
    expect(html).toContain("Preparar áudio");
    expect(html).toContain("Audiobook final");
    expect(html).toContain("Aguardando áudio");
  });

  it("marks the active audiobook chapter semantically", () => {
    const completeWav = {
      url: "blob:test",
      chapters: [
        { pageNumber: 1, audioKey: "chapter-1", startSeconds: 0, durationSeconds: 10 },
        { pageNumber: 2, audioKey: "chapter-2", startSeconds: 10, durationSeconds: 12 },
      ],
    } as unknown as CompleteAudioWithUrl;
    const html = renderToStaticMarkup(<ChapterList completeWav={completeWav} currentChapter={1} onSeek={() => undefined} />);
    expect(html).toContain('aria-current="true"');
    expect(html).toContain("Página 2");
  });
});
