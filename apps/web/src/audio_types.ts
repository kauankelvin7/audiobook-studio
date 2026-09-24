import type { SpeechState } from "./adapters/local_speech";
import type { WavProgress } from "./adapters/local_wav";
import type { CompleteLiteralAudio, LiteralAudioEntry, SavedLiteralAudio } from "./adapters/saved_literal_audio";
import type { CompleteNarrativeAudio } from "./adapters/narrative_audio";
import type { ReadingSession } from "./adapters/rust_reading_preview";
import type { DocumentIr } from "./schemas/document";
import type { DocumentIrV2 } from "./schemas/ingestion";

export type SavedWavWithUrl = SavedLiteralAudio & { url: string };
export type CompleteAudioWithUrl = (CompleteLiteralAudio | CompleteNarrativeAudio) & { url: string };

export type AudioWorkspaceModel = {
  document: DocumentIr | null;
  documentV2: DocumentIrV2 | null;
  audioHistory: LiteralAudioEntry[];
  savedWav: SavedWavWithUrl | null;
  selectedAudioKey: string | null;
  audioOpening: boolean;
  audioMaintenanceBusy: boolean;
  currentAudioKey: string | null;
  completeWav: CompleteAudioWithUrl | null;
  completeProgress: number | null;
  completeTotal: number;
  currentChapter: number;
  pageNumber: number;
  endPage: number;
  preview: ReadingSession | null;
  reviewed: boolean;
  speechState: SpeechState;
  voices: SpeechSynthesisVoice[];
  voiceURI: string;
  wavBusy: boolean;
  wavProgress: WavProgress | null;
  wavUrl: string | null;
  busy: boolean;
  ocrCommitBusy: boolean;
};

export type AudioWorkspaceActions = {
  openSavedAudio: (entry: LiteralAudioEntry) => void | Promise<void>;
  removeSavedAudio: (entry: LiteralAudioEntry) => void | Promise<void>;
  generateCompleteLiteral: () => void | Promise<void>;
  generateCompleteNarrative: () => void | Promise<void>;
  cancelCompleteGeneration: () => void;
  seekChapter: (index: number) => void;
  onCompleteTimeUpdate: (timeSeconds: number) => void;
  onStartPageChange: (pageNumber: number) => void;
  onEndPageChange: (pageNumber: number) => void;
  prepareReading: () => void | Promise<void>;
  onReviewedChange: (reviewed: boolean) => void;
  onVoiceChange: (voiceURI: string) => void;
  startReading: () => void;
  pauseReading: () => void;
  resumeReading: () => void;
  stopReading: () => void;
  generateWav: () => void | Promise<void>;
  cancelWav: () => void;
};
