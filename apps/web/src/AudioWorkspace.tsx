import type { MutableRefObject } from "react";
import { AudioHistory } from "./AudioHistory";
import { CompleteAudiobookPanel } from "./CompleteAudiobookPanel";
import { LiteralReadingPanel } from "./LiteralReadingPanel";
import type { AudioWorkspaceActions, AudioWorkspaceModel } from "./audio_types";

export function AudioWorkspace({
  model,
  actions,
  completeAudioRef,
}: {
  model: AudioWorkspaceModel;
  actions: AudioWorkspaceActions;
  completeAudioRef: MutableRefObject<HTMLAudioElement | null>;
}) {
  return <section className="stage-section" id="audio" aria-label="Áudio">
    {!model.documentV2 && <div className="stage-empty"><span className="section-number">05</span><div>
      <h2>Áudio</h2><p>Quando o texto estiver pronto, gere, ouça e baixe o audiobook aqui.</p>
    </div></div>}

    {model.document && <AudioHistory
      entries={model.audioHistory}
      savedWav={model.savedWav}
      selectedAudioKey={model.selectedAudioKey}
      opening={model.audioOpening}
      maintenanceBusy={model.audioMaintenanceBusy}
      currentAudioKey={model.currentAudioKey}
      completeWav={model.completeWav}
      wavBusy={model.wavBusy}
      onOpen={actions.openSavedAudio}
      onRemove={actions.removeSavedAudio}
    />}

    {model.documentV2 && <CompleteAudiobookPanel
      completeWav={model.completeWav}
      completeProgress={model.completeProgress}
      completeTotal={model.completeTotal}
      currentChapter={model.currentChapter}
      wavBusy={model.wavBusy}
      busy={model.busy}
      ocrCommitBusy={model.ocrCommitBusy}
      completeAudioRef={completeAudioRef}
      onGenerateLiteral={actions.generateCompleteLiteral}
      onGenerateNarrative={actions.generateCompleteNarrative}
      onCancel={actions.cancelCompleteGeneration}
      onSeek={actions.seekChapter}
      onTimeUpdate={actions.onCompleteTimeUpdate}
    />}

    {model.document && <LiteralReadingPanel
      document={model.document}
      documentV2={model.documentV2}
      pageNumber={model.pageNumber}
      endPage={model.endPage}
      preview={model.preview}
      reviewed={model.reviewed}
      speechState={model.speechState}
      voices={model.voices}
      voiceURI={model.voiceURI}
      wavBusy={model.wavBusy}
      wavProgress={model.wavProgress}
      wavUrl={model.wavUrl}
      busy={model.busy}
      audioMaintenanceBusy={model.audioMaintenanceBusy}
      onStartPageChange={actions.onStartPageChange}
      onEndPageChange={actions.onEndPageChange}
      onPrepareReading={actions.prepareReading}
      onReviewedChange={actions.onReviewedChange}
      onVoiceChange={actions.onVoiceChange}
      onStartReading={actions.startReading}
      onPauseReading={actions.pauseReading}
      onResumeReading={actions.resumeReading}
      onStopReading={actions.stopReading}
      onGenerateWav={actions.generateWav}
      onCancelWav={actions.cancelWav}
    />}
  </section>;
}
