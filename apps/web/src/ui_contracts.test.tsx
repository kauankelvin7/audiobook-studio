import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChapterList } from "./ChapterList";
import { OcrNativeTextView } from "./OcrInspectorContent";
import { OcrInspectorTabs } from "./OcrReviewViews";
import { ReviewBottomDock } from "./ReviewBottomDock";
import { DocumentViewer } from "./DocumentWorkspace";
import { NativeTextApprovalPanel } from "./NativeTextApprovalPanel";
import { ProgressiveNarrativePlayer } from "./ProgressiveNarrativePlayer";
import type { DocumentIr } from "./schemas/document";
import type { DocumentIrV2 } from "./schemas/ingestion";
import type { CompleteAudioWithUrl, NarrativeGenerationState } from "./audio_types";

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
  it("keeps text as the default reader and exposes the original PDF mode", () => {
    const document = {
      pages: [{
        number: 1,
        rawText: "Trecho de teste",
        textQuality: "good",
        blocks: [{ id: "region-1", type: "paragraph", text: "Trecho de teste" }],
      }],
    } as unknown as DocumentIr;
    const html = renderToStaticMarkup(<DocumentViewer
      document={document}
      pageNumber={1}
      onPageChange={() => undefined}
      reviewMode={true}
    />);
    expect(html).toContain('aria-label="Visualização do documento"');
    expect(html).toContain(">Texto<");
    expect(html).toContain(">Original<");
    expect(html).toContain("disabled");
    expect(html).toContain("Trecho de teste");
    expect(html).toContain('checked=""');
    expect(html).toContain('role="button"');
  });

  it("turns review mode into a real reader state instead of a decorative toggle", () => {
    const document = {
      pages: [{
        number: 1,
        rawText: "Trecho de teste",
        textQuality: "extracted",
        blocks: [{ id: "region-1", type: "paragraph", text: "Trecho de teste" }],
      }],
    } as unknown as DocumentIr;
    const html = renderToStaticMarkup(<DocumentViewer
      document={document}
      pageNumber={1}
      onPageChange={() => undefined}
      reviewMode={false}
    />);
    expect(html).not.toContain('checked=""');
    expect(html).not.toContain('role="button"');
    expect(html).toContain('aria-label="Modo de revisão"');
  });

  it("keeps native approval compact by listing only pages that need attention", () => {
    const document = {
      pages: [
        { number: 1, extractionQuality: "good", regions: [{ id: "r1", sources: { rawText: "Texto bom" } }] },
        { number: 2, extractionQuality: "no_text", regions: [] },
      ],
    } as unknown as DocumentIrV2;
    const html = renderToStaticMarkup(<NativeTextApprovalPanel
      document={document}
      persistence={null}
      onApproved={() => undefined}
    />);
    expect(html).toContain("1 de 2 páginas com texto selecionável");
    expect(html).toContain("1 para revisar");
    expect(html).toContain("Página 2");
    expect(html).not.toContain("Página 1 · texto encontrado");
  });

  it("renders progressive narrative playback before the full audiobook exists", () => {
    const generation: NarrativeGenerationState = {
      phase: "generating",
      currentChapter: 2,
      message: "Capítulo 1 pronto. Continuando a geração.",
      chapters: [
        { chapterNumber: 1, title: "Introdução", text: "Texto para acompanhar.", status: "ready",
          url: "blob:chapter-1", durationSeconds: 12 },
        { chapterNumber: 2, title: "Continuação", text: "Próximo texto.", status: "generating",
          url: null, durationSeconds: null },
      ],
    };
    const html = renderToStaticMarkup(<ProgressiveNarrativePlayer
      generation={generation}
      voiceProgress={{ loaded: 50, total: 100 }}
    />);
    expect(html).toContain("PLAYER EM TEMPO REAL");
    expect(html).toContain("1 de 2 capítulos disponíveis");
    expect(html).toContain("Texto do capítulo");
    expect(html).toContain("Texto para acompanhar.");
    expect(html).toContain("Gerando agora");
  });

});
