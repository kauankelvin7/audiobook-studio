import { lazy, StrictMode, Suspense, useEffect, useRef, useState, type ChangeEvent } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserLocalPersistence, type BrowserLocalPersistence } from "./adapters/browser_local_persistence";
import type { CheckpointDraft } from "./adapters/local_project_persistence";
import { MAX_PDF_BYTES } from "./adapters/pdf_limits";
import { LocalSpeechPlayer, type SpeechState } from "./adapters/local_speech";
import { renderLocalWav, type WavProgress } from "./adapters/local_wav";
import { listLiteralAudios, loadCompleteLiteralAudio, loadLiteralAudio, loadLiteralAudioByKey,
  removeHistoricalLiteralAudio, saveCompleteLiteralAudio, saveLiteralAudio,
  type CompleteLiteralAudio, type LiteralAudioEntry, type SavedLiteralAudio } from "./adapters/saved_literal_audio";
import { buildReadingSession, type ReadingSession } from "./adapters/rust_reading_preview";
import { loadLatestApprovedNarrative, type ApprovedNarrativeRecord } from "./adapters/approved_narrative";
import { listNarrativeChapters, loadCompleteNarrativeAudio, narrativeReadingSession,
  saveCompleteNarrativeAudio, saveNarrativeChapter, type CompleteNarrativeAudio } from "./adapters/narrative_audio";
import type { ArtifactWrite } from "./adapters/ports";
import { documentIrSchema, type DocumentIr } from "./schemas/document";
import { documentIrV2Schema, type DocumentIrV2 } from "./schemas/ingestion";
import { decodePipelineResponse } from "./workers/protocol";
import { userError } from "./adapters/user_error";
import { AppShell, useProductStage } from "./AppShell";
import { DocumentWorkspace } from "./DocumentWorkspace";
import { NativeTextApprovalPanel } from "./NativeTextApprovalPanel";
import { ProjectImportPanel } from "./ProjectImportPanel";
import { ReviewBottomDock } from "./ReviewBottomDock";
import { ExportPanel } from "./ExportPanel";
import { AudioWorkspace } from "./AudioWorkspace";
import "@fontsource/geist-sans/latin-400.css";
import "@fontsource/geist-sans/latin-600.css";
import "@fontsource/geist-mono/latin-400.css";
import "@fontsource/source-serif-4/latin-400.css";
import "@fontsource/source-serif-4/latin-600.css";
import "./styles/tokens.css";
import "./styles/shell.css";

const OcrReviewPanel = lazy(async () => ({ default: (await import("./OcrReviewPanel")).OcrReviewPanel }));
const NarrativePanel = lazy(async () => ({ default: (await import("./NarrativePanel")).NarrativePanel }));

function App() {
  const stage = useProductStage();
  const workerRef = useRef<Worker | null>(null);
  const persistenceRef = useRef<BrowserLocalPersistence | null>(null);
  const speechRef = useRef<LocalSpeechPlayer | null>(null);
  const readingRequestRef = useRef(0);
  const importGenerationRef = useRef(0);
  const audioOpenRef = useRef(0);
  const wavAbortRef = useRef<AbortController | null>(null);
  const wavUrlRef = useRef<string | null>(null);
  const savedWavUrlRef = useRef<string | null>(null);
  const completeWavUrlRef = useRef<string | null>(null);
  const completeAudioRef = useRef<HTMLAudioElement | null>(null);
  const [document, setDocument] = useState<DocumentIr | null>(null);
  const [documentV2, setDocumentV2] = useState<DocumentIrV2 | null>(null);
  const [ocrSourceReady, setOcrSourceReady] = useState(false);
  const [ocrEpoch, setOcrEpoch] = useState(0);
  const [canonicalEpoch, setCanonicalEpoch] = useState(0);
  const [narrativeEpoch, setNarrativeEpoch] = useState(0);
  const [approvedNarrative, setApprovedNarrative] = useState<ApprovedNarrativeRecord | null>(null);
  const [ocrCommitBusy, setOcrCommitBusy] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [endPage, setEndPage] = useState(1);
  const [preview, setPreview] = useState<ReadingSession | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [speechState, setSpeechState] = useState<SpeechState>("idle");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [fileName, setFileName] = useState("");
  const [status, setStatus] = useState("Escolha um PDF para conferir o texto extraído.");
  const [busy, setBusy] = useState(false);
  const [wavBusy, setWavBusy] = useState(false);
  const [wavUrl, setWavUrl] = useState<string | null>(null);
  const [wavProgress, setWavProgress] = useState<WavProgress | null>(null);
  const [savedWav, setSavedWav] = useState<(SavedLiteralAudio & { url: string }) | null>(null);
  const [completeWav, setCompleteWav] = useState<((CompleteLiteralAudio | CompleteNarrativeAudio) & { url: string }) | null>(null);
  const [completeProgress, setCompleteProgress] = useState<number | null>(null);
  const [completeTotal, setCompleteTotal] = useState(0);
  const [currentChapter, setCurrentChapter] = useState(0);
  const [audioHistory, setAudioHistory] = useState<LiteralAudioEntry[]>([]);
  const [selectedAudioKey, setSelectedAudioKey] = useState<string | null>(null);
  const [audioOpening, setAudioOpening] = useState(false);
  const [audioMaintenanceBusy, setAudioMaintenanceBusy] = useState(false);
  const [currentAudioKey, setCurrentAudioKey] = useState<string | null>(null);

  function clearWav() {
    wavAbortRef.current?.abort();
    wavAbortRef.current = null;
    if (wavUrlRef.current) URL.revokeObjectURL(wavUrlRef.current);
    wavUrlRef.current = null;
    setWavUrl(null);
    setWavProgress(null);
    setWavBusy(false);
  }

  function clearSavedWav() {
    audioOpenRef.current++;
    if (savedWavUrlRef.current) URL.revokeObjectURL(savedWavUrlRef.current);
    savedWavUrlRef.current = null;
    setSavedWav(null);
    setSelectedAudioKey(null);
    setAudioOpening(false);
  }

  function clearCompleteWav() {
    if (completeWavUrlRef.current) URL.revokeObjectURL(completeWavUrlRef.current);
    completeWavUrlRef.current = null;
    setCompleteWav(null);
    setCompleteProgress(null);
    setCurrentChapter(0);
  }

  function seekChapter(index: number) {
    const chapter = completeWav?.chapters[index];
    const audio = completeAudioRef.current;
    if (!chapter || !audio) return;
    audio.currentTime = chapter.startSeconds;
    setCurrentChapter(index);
    void audio.play().catch(() => undefined);
  }

  async function openSavedAudio(entry: LiteralAudioEntry) {
    if (!documentV2 || !persistenceRef.current) return;
    const request = ++audioOpenRef.current;
    const generation = importGenerationRef.current;
    setAudioOpening(true);
    try {
      const saved = await loadLiteralAudioByKey(persistenceRef.current.service, documentV2, entry.artifactKey);
      if (request !== audioOpenRef.current || generation !== importGenerationRef.current) return;
      if (!saved) throw new Error("A gravação não corresponde ao documento atual.");
      if (savedWavUrlRef.current) URL.revokeObjectURL(savedWavUrlRef.current);
      const url = URL.createObjectURL(saved.blob);
      savedWavUrlRef.current = url;
      setSavedWav({ ...saved, url });
      setSelectedAudioKey(entry.artifactKey);
      setStatus("Gravação aberta. Confira o áudio antes de baixar.");
    } catch {
      if (request === audioOpenRef.current && generation === importGenerationRef.current)
        setStatus("Não foi possível abrir esta gravação. O arquivo pode estar ausente ou danificado.");
    } finally {
      if (request === audioOpenRef.current) setAudioOpening(false);
    }
  }

  async function removeSavedAudio(entry: LiteralAudioEntry) {
    if (!documentV2 || !persistenceRef.current || audioMaintenanceBusy || wavBusy
      || entry.artifactKey === currentAudioKey) return;
    const confirmed = window.confirm(`Excluir a gravação das páginas ${entry.startPage} a ${entry.endPage}? O arquivo e os checkpoints que o referenciam serão removidos deste dispositivo. Esta ação não pode ser desfeita.`);
    if (!confirmed) return;
    const generation = importGenerationRef.current;
    setAudioMaintenanceBusy(true);
    try {
      const result = await removeHistoricalLiteralAudio(persistenceRef.current.service, documentV2, entry.artifactKey);
      if (generation !== importGenerationRef.current) return;
      if (selectedAudioKey === entry.artifactKey) clearSavedWav();
      setAudioHistory(history => history.filter(item => item.artifactKey !== entry.artifactKey));
      setStatus(result.pendingFiles > 0
        ? "Gravação removida do catálogo. A limpeza do arquivo será retomada neste dispositivo."
        : "Gravação antiga removida. O projeto e a gravação atual foram preservados.");
    } catch (error) {
      if (generation === importGenerationRef.current) {
        const code = typeof error === "object" && error !== null && "code" in error ? error.code : null;
        setStatus(code === "RECOVERY_UNSAFE"
          ? "Esta gravação não pode ser removida porque falta uma cópia recuperável do projeto."
          : code === "NOT_HISTORICAL" || code === "CHECKPOINT_CHANGED"
            ? "O projeto mudou. Recarregue a página antes de tentar excluir a gravação."
            : "Não foi possível concluir a exclusão. Recarregue a página e confira as gravações salvas.");
      }
    } finally {
      if (generation === importGenerationRef.current) setAudioMaintenanceBusy(false);
    }
  }

  useEffect(() => {
    const synthesis = typeof window === "undefined" ? null : window.speechSynthesis ?? null;
    const player = new LocalSpeechPlayer(synthesis, setSpeechState,
      () => setStatus("A leitura foi interrompida pelo navegador. Tente novamente."));
    speechRef.current = player;
    const refresh = () => {
      const available = player.localVoices();
      setVoices(available);
      setVoiceURI(current => available.some(voice => voice.voiceURI === current) ? current : available[0]?.voiceURI ?? "");
    };
    refresh();
    synthesis?.addEventListener("voiceschanged", refresh);
    return () => {
      synthesis?.removeEventListener("voiceschanged", refresh);
      player.stop();
      speechRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let localPersistence: BrowserLocalPersistence | null = null;

    try {
      localPersistence = createBrowserLocalPersistence();
      persistenceRef.current = localPersistence;
      void (async () => {
        const candidates = [];
        for (const projectId of await localPersistence!.service.listProjectIds()) {
          try {
            await localPersistence!.service.resumePendingFileDeletions(projectId);
          } catch {
            // Falha de limpeza pendente não impede a recuperação do projeto.
          }
          try {
            const inspection = await localPersistence!.service.inspectResume(projectId);
            const onlyAudioUnavailable = inspection.unavailableArtifactKeys.length > 0
              && inspection.unavailableArtifactKeys.every(key => key.startsWith("literal_wav_")
                || key.startsWith("narrative_wav_") || key.startsWith("narrative_complete_"));
            if (inspection.checkpoint && (inspection.resumable || onlyAudioUnavailable)) candidates.push(inspection);
          } catch {
            // Outro contexto pode estar escrevendo; recuperação permanece disponível depois.
          }
        }
        const latest = candidates.sort((left, right) =>
          (right.checkpoint?.createdAtMs ?? 0) - (left.checkpoint?.createdAtMs ?? 0))[0];
        const documentRecord = latest?.artifacts.find(artifact => artifact.artifactKey === "document_ir");
        const documentV2Record = latest?.artifacts.find(artifact => artifact.artifactKey === "document_ir_v2");
        if (!documentRecord || cancelled || importGenerationRef.current !== 0) return;
        const blob = await localPersistence!.service.readArtifact(documentRecord);
        const parsed = documentIrSchema.safeParse(JSON.parse(await blob.text()));
        if (!parsed.success || cancelled || importGenerationRef.current !== 0) return;
        setDocument(parsed.data);
        let recoveredAudio = false;
        let audioRecoveryFailed = false;
        const audioExpected = latest?.checkpoint?.artifactKeys.some(key => key.startsWith("literal_wav_")) ?? false;
        if (documentV2Record) {
          const v2Blob = await localPersistence!.service.readArtifact(documentV2Record);
          const v2 = documentIrV2Schema.safeParse(JSON.parse(await v2Blob.text()));
          if (v2.success && v2.data.documentId === parsed.data.documentId && v2.data.sourceHash === parsed.data.sourceHash && !cancelled && importGenerationRef.current === 0) {
            setDocumentV2(v2.data);
            setOcrSourceReady(true);
            setCurrentAudioKey(latest?.checkpoint?.artifactKeys.slice().reverse().find(key => /^literal_wav_[0-9a-f]{32}$/.test(key)) ?? null);
            try {
              const history = await listLiteralAudios(localPersistence!.service, v2.data);
              if (!cancelled && importGenerationRef.current === 0) setAudioHistory(history);
            } catch {
              // A leitura do projeto continua disponível sem o catálogo de gravações.
            }
            try {
              const saved = await loadLiteralAudio(localPersistence!.service, v2.data);
              if (saved && !cancelled && importGenerationRef.current === 0) {
                const url = URL.createObjectURL(saved.blob);
                savedWavUrlRef.current = url;
                setSavedWav({ ...saved, url });
                setSelectedAudioKey(latest?.checkpoint?.artifactKeys.slice().reverse().find(key => /^literal_wav_[0-9a-f]{32}$/.test(key)) ?? null);
                recoveredAudio = true;
              }
              if (!saved && audioExpected) audioRecoveryFailed = true;
            } catch {
              audioRecoveryFailed = audioExpected;
            }
            let completeAudioCreatedAtMs = -1;
            try {
              const complete = await loadCompleteLiteralAudio(localPersistence!.service, v2.data);
              if (complete && !cancelled && importGenerationRef.current === 0) {
                completeAudioCreatedAtMs = (await localPersistence!.service.loadArtifactRecord(v2.data.documentId,
                  complete.artifactKey))?.createdAtMs ?? -1;
                const url = URL.createObjectURL(complete.blob);
                completeWavUrlRef.current = url;
                setCompleteWav({ ...complete, url });
                recoveredAudio = true;
              }
            } catch { audioRecoveryFailed = true; }
            try {
              const complete = await loadCompleteNarrativeAudio(localPersistence!.service, v2.data);
              if (complete && !cancelled && importGenerationRef.current === 0) {
                const createdAtMs = (await localPersistence!.service.loadArtifactRecord(v2.data.documentId,
                  complete.artifactKey))?.createdAtMs ?? -1;
                if (createdAtMs >= completeAudioCreatedAtMs) {
                  if (completeWavUrlRef.current) URL.revokeObjectURL(completeWavUrlRef.current);
                  const url = URL.createObjectURL(complete.blob);
                  completeWavUrlRef.current = url;
                  setCompleteWav({ ...complete, url });
                }
                recoveredAudio = true;
              }
            } catch { audioRecoveryFailed = true; }
          }
        }
        if (!cancelled && importGenerationRef.current === 0) setStatus(recoveredAudio
          ? "Seu último projeto e WAV salvo foram recuperados neste dispositivo."
          : audioRecoveryFailed
            ? "Seu projeto foi recuperado, mas o WAV salvo não pôde ser aberto. Gere outro arquivo após conferir o texto."
            : "Seu último projeto foi recuperado neste dispositivo.");
      })().catch(() => undefined);
    } catch {
      persistenceRef.current = null;
    }

    return () => {
      cancelled = true;
      wavAbortRef.current?.abort();
      if (wavUrlRef.current) URL.revokeObjectURL(wavUrlRef.current);
      if (savedWavUrlRef.current) URL.revokeObjectURL(savedWavUrlRef.current);
      if (completeWavUrlRef.current) URL.revokeObjectURL(completeWavUrlRef.current);
      workerRef.current?.terminate();
      workerRef.current = null;
      if (persistenceRef.current === localPersistence) persistenceRef.current = null;
      localPersistence?.close();
    };
  }, []);

  function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const generation = ++importGenerationRef.current;
    readingRequestRef.current++;
    speechRef.current?.stop();
    clearWav();
    clearSavedWav();
    clearCompleteWav();
    setAudioHistory([]);
    setCurrentAudioKey(null);
    setPreview(null);
    setReviewed(false);
    setDocumentV2(null);
    setOcrSourceReady(false);
    setOcrCommitBusy(false);
    setOcrEpoch(value => value + 1);
    setPageNumber(1);
    setEndPage(1);
    workerRef.current?.terminate();
    workerRef.current = null;
    setDocument(null);
    setFileName(file.name);
    if (file.size > MAX_PDF_BYTES) {
      setBusy(false);
      setStatus("O PDF ultrapassa o limite de 32 MB. Escolha um arquivo menor.");
      return;
    }

    setBusy(true);
    setStatus("Lendo o PDF neste dispositivo…");
    const worker = new Worker(new URL("./workers/pipeline.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.onmessage = async (message: MessageEvent<unknown>) => {
      if (workerRef.current !== worker) return;
      const response = decodePipelineResponse(message.data);
      if (!response) return;

      if (response.type === "result") {
        setDocument(response.document);
        setDocumentV2(response.documentV2);
        const pageCount = response.document.pages.length;
        const baseStatus = `${pageCount} ${pageCount === 1 ? "página importada" : "páginas importadas"}. Confira o texto antes de continuar.`;
        worker.terminate();
        workerRef.current = null;

        const persistence = persistenceRef.current?.service;
        if (persistence) {
          const createdAtMs = Date.now();
          const checkpoint: CheckpointDraft = {
            schemaVersion: 1,
            projectId: response.document.documentId,
            createdAtMs,
            pipelineVersion: "m4.2",
            sourceHash: response.document.sourceHash,
            job: { state: "STRUCTURING", resumeState: null },
            artifactKeys: ["source_pdf", "document_ir", "document_ir_v2", ...(response.contentModel ? ["content_model", "semantic_outline"] : [])],
          };
          const writes: ArtifactWrite[] = [
            {
              projectId: checkpoint.projectId,
              artifactKey: "source_pdf",
              kind: "source_pdf",
              value: file,
              mediaType: file.type || "application/pdf",
              createdAtMs,
              regenerable: false,
              pinned: true,
              finalArtifact: false,
              expiresAtMs: null,
            },
            {
              projectId: checkpoint.projectId,
              artifactKey: "document_ir",
              kind: "document_ir",
              value: new Blob([JSON.stringify(response.document)], { type: "application/json" }),
              mediaType: "application/json",
              createdAtMs,
              regenerable: true,
              pinned: false,
              finalArtifact: false,
              expiresAtMs: null,
            },
            {
              projectId: checkpoint.projectId,
              artifactKey: "document_ir_v2",
              kind: "document_ir",
              value: new Blob([JSON.stringify(response.documentV2)], { type: "application/json" }),
              mediaType: "application/json",
              createdAtMs,
              regenerable: true,
              pinned: false,
              finalArtifact: false,
              expiresAtMs: null,
            },
            ...(response.contentModel && response.semanticOutline ? [{
              projectId: checkpoint.projectId,
              artifactKey: "content_model",
              kind: "document_ir",
              value: new Blob([JSON.stringify(response.contentModel)], { type: "application/json" }),
              mediaType: "application/json",
              createdAtMs,
              regenerable: true,
              pinned: false,
              finalArtifact: false,
              expiresAtMs: null,
            }, {
              projectId: checkpoint.projectId,
              artifactKey: "semantic_outline",
              kind: "document_ir",
              value: new Blob([JSON.stringify(response.semanticOutline)], { type: "application/json" }),
              mediaType: "application/json",
              createdAtMs,
              regenerable: true,
              pinned: false,
              finalArtifact: false,
              expiresAtMs: null,
            }] satisfies ArtifactWrite[] : []),
          ];
          try {
            await persistence.persistNext(checkpoint, writes);
            if (generation === importGenerationRef.current) {
              setOcrSourceReady(true);
              setCurrentAudioKey(null);
              setStatus(`${baseStatus} Progresso salvo neste dispositivo.`);
              try {
                const history = await listLiteralAudios(persistence, response.documentV2);
                if (generation === importGenerationRef.current) setAudioHistory(history);
              } catch {
                // O PDF salvo continua acessível mesmo se o catálogo de áudio falhar.
              }
            }
          } catch {
            if (generation === importGenerationRef.current)
              setStatus(`${baseStatus} O progresso não pôde ser salvo neste navegador.`);
          }
        } else {
          setStatus(baseStatus);
        }
      } else {
        setStatus(userError(new Error(response.message), "Não foi possível processar o PDF. Confira o arquivo e tente novamente."));
        worker.terminate();
        workerRef.current = null;
      }
      setBusy(false);
    };
    worker.onerror = () => {
      if (workerRef.current !== worker) return;
      setStatus("Não foi possível ler este PDF. Tente outro arquivo.");
      setBusy(false);
      worker.terminate();
      workerRef.current = null;
    };
    worker.postMessage({ type: "extract", file });
  }

  async function prepareReading() {
    if (!documentV2) return;
    const request = ++readingRequestRef.current;
    speechRef.current?.stop();
    clearWav();
    setReviewed(false);
    setPreview(null);
    try {
      const ready = await buildReadingSession(documentV2, pageNumber, endPage);
      if (request !== readingRequestRef.current) return;
      setPreview(ready);
      setStatus("Confira o texto das páginas e confirme antes de ouvir.");
    } catch {
      if (request !== readingRequestRef.current) return;
      setStatus("O intervalo contém página que não pode ser lida com segurança. Escolha páginas com texto selecionável.");
    }
  }

  function startReading() {
    if (!preview || !reviewed || !documentV2 || preview.documentId !== documentV2.documentId
      || preview.startPage !== pageNumber || preview.endPage !== endPage) return;
    try {
      speechRef.current?.play(preview, voiceURI);
    } catch (error) {
      setStatus(userError(error, "Não foi possível iniciar a leitura. Tente novamente."));
    }
  }

  async function generateWav() {
    if (!preview || !reviewed || !documentV2 || preview.documentId !== documentV2.documentId
      || preview.sourceHash !== documentV2.sourceHash || preview.startPage !== pageNumber || preview.endPage !== endPage || wavBusy) return;
    clearWav();
    speechRef.current?.stop();
    const controller = new AbortController();
    wavAbortRef.current = controller;
    setWavBusy(true);
    setStatus("Preparando a voz neste dispositivo. Na primeira vez, o modelo de cerca de 63 MB será baixado.");
    try {
      const wav = await renderLocalWav(preview, controller.signal, setWavProgress);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(wav);
      wavUrlRef.current = url;
      setWavUrl(url);
      const persistence = persistenceRef.current?.service;
      if (persistence && documentV2) {
        try {
          const audioKey = await saveLiteralAudio(persistence, documentV2, preview, wav);
          if (!controller.signal.aborted) {
            clearSavedWav();
            setCurrentAudioKey(audioKey);
            setStatus("WAV pronto e salvo neste dispositivo. Você também pode baixar uma cópia.");
            try {
              const history = await listLiteralAudios(persistence, documentV2);
              if (!controller.signal.aborted) setAudioHistory(history);
            } catch {
              // O WAV já está salvo e segue disponível pelo link desta geração.
            }
          }
        } catch {
          if (!controller.signal.aborted) setStatus("WAV pronto, mas não foi salvo neste dispositivo. Baixe uma cópia agora.");
        }
      } else {
        setStatus("WAV pronto, mas o armazenamento local está indisponível. Baixe uma cópia agora.");
      }
    } catch (error) {
      if (!controller.signal.aborted) setStatus(userError(error, "Não foi possível gerar o áudio. Tente novamente."));
    } finally {
      if (wavAbortRef.current === controller) {
        wavAbortRef.current = null;
        setWavBusy(false);
      }
    }
  }

  async function exportCompleteWav() {
    if (!documentV2 || !persistenceRef.current || wavBusy || busy || ocrCommitBusy) return;
    const source = documentV2;
    const generation = importGenerationRef.current;
    const store = persistenceRef.current.service;
    const controller = new AbortController();
    wavAbortRef.current = controller;
    setWavBusy(true);
    setCompleteProgress(0);
    setCompleteTotal(source.pages.length);
    setStatus("Conferindo todas as páginas antes da exportação…");
    try {
      const sessions = [];
      for (let page = 1; page <= source.pages.length; page++) {
        sessions.push(await buildReadingSession(source, page, page));
        if (controller.signal.aborted || generation !== importGenerationRef.current) return;
      }
      const history = await listLiteralAudios(store, source);
      const keys: string[] = [];
      for (const [index, session] of sessions.entries()) {
        if (controller.signal.aborted || generation !== importGenerationRef.current) return;
        const cached = history.find(entry => entry.startPage === index + 1 && entry.endPage === index + 1);
        if (cached) keys.push(cached.artifactKey);
        else {
          setStatus(`Gerando áudio da página ${index + 1} de ${sessions.length}…`);
          const wav = await renderLocalWav(session, controller.signal, setWavProgress);
          if (controller.signal.aborted) return;
          keys.push(await saveLiteralAudio(store, source, session, wav));
        }
        setCompleteProgress(index + 1);
      }
      if (controller.signal.aborted || generation !== importGenerationRef.current) return;
      setStatus("Validando e montando o audiobook completo…");
      const complete = await saveCompleteLiteralAudio(store, source, keys);
      if (controller.signal.aborted || generation !== importGenerationRef.current) return;
      clearCompleteWav();
      const url = URL.createObjectURL(complete.blob);
      completeWavUrlRef.current = url;
      setCompleteWav({ ...complete, url });
      setCompleteProgress(source.pages.length);
      setStatus("Audiobook completo salvo neste dispositivo. Confira o player e baixe o WAV.");
      setAudioHistory(await listLiteralAudios(store, source));
    } catch (error) {
      if (!controller.signal.aborted && generation === importGenerationRef.current) {
        setStatus(userError(error, "Não foi possível exportar o audiobook. Tente novamente."));
      }
    } finally {
      if (wavAbortRef.current === controller) { wavAbortRef.current = null; setWavBusy(false); }
    }
  }

  async function exportNarrativeWav() {
    if (!documentV2 || !persistenceRef.current || wavBusy || busy || ocrCommitBusy) return;
    const source = documentV2;
    const generation = importGenerationRef.current;
    const store = persistenceRef.current.service;
    const controller = new AbortController();
    wavAbortRef.current = controller;
    setWavBusy(true);
    setCompleteProgress(0);
    setStatus("Conferindo roteiro e fontes antes da síntese…");
    try {
      const approved = await loadLatestApprovedNarrative(store, source);
      if (!approved) throw new Error("Aprove um roteiro narrativo antes de gerar o WAV.");
      const chapterCount = approved.approved.plan.spokenChapters.length;
      setCompleteTotal(chapterCount);
      const sessions = Array.from({ length: chapterCount }, (_, index) =>
        narrativeReadingSession(source, approved, index + 1));
      const cached = await listNarrativeChapters(store, source, approved);
      const keys: string[] = [];
      for (const [index, session] of sessions.entries()) {
        if (controller.signal.aborted || generation !== importGenerationRef.current) return;
        const key = cached.get(index + 1);
        if (key) keys.push(key);
        else {
          setStatus(`Gerando áudio narrativo do capítulo ${index + 1} de ${chapterCount}…`);
          const wav = await renderLocalWav(session, controller.signal, setWavProgress);
          if (controller.signal.aborted) return;
          keys.push(await saveNarrativeChapter(store, source, approved, index + 1, wav));
        }
        setCompleteProgress(index + 1);
      }
      if (controller.signal.aborted || generation !== importGenerationRef.current) return;
      const complete = await saveCompleteNarrativeAudio(store, source, approved, keys);
      if (controller.signal.aborted || generation !== importGenerationRef.current) return;
      clearCompleteWav();
      const url = URL.createObjectURL(complete.blob);
      completeWavUrlRef.current = url;
      setCompleteWav({ ...complete, url });
      setCompleteProgress(chapterCount);
      setStatus("Audiobook narrativo completo salvo neste dispositivo. Confira o player e baixe o WAV.");
    } catch (error) {
      if (!controller.signal.aborted && generation === importGenerationRef.current)
        setStatus(userError(error, "Não foi possível gerar o áudio narrativo. Confira o roteiro e tente novamente."));
    } finally {
      if (wavAbortRef.current === controller) { wavAbortRef.current = null; setWavBusy(false); }
    }
  }


  useEffect(() => {
    let cancelled = false;
    if (!documentV2 || !ocrSourceReady || !persistenceRef.current) {
      setApprovedNarrative(null);
      return;
    }
    void loadLatestApprovedNarrative(persistenceRef.current.service, documentV2)
      .then(value => { if (!cancelled) setApprovedNarrative(value); })
      .catch(() => { if (!cancelled) setApprovedNarrative(null); });
    return () => { cancelled = true; };
  }, [documentV2, ocrSourceReady, canonicalEpoch, narrativeEpoch]);

  return <AppShell fileName={fileName} pageCount={document?.pages.length ?? 0} saved={ocrSourceReady}
    hasDocument={!!document} narrativeReady={!!approvedNarrative} audioBusy={wavBusy} chapterCount={completeWav?.chapters.length ?? 0}>
    {!document && <header className="intro">
      <p className="eyebrow">Audiobook Studio · leitura de PDF</p>
      <h1>Do documento à voz.</h1>
      <p>Importe seu PDF, confira o texto e prepare uma narração para ouvir e baixar.</p>
    </header>}
    <ProjectImportPanel hasDocument={!!document} fileName={fileName} status={status}
      disabled={busy || wavBusy || audioMaintenanceBusy || ocrCommitBusy} onChange={importFile} />
    <div className="editor-grid">
    <section className="stage-section" id="document" aria-label="Documento">
    {document ? <DocumentWorkspace document={document} pageNumber={pageNumber} onPageChange={setPageNumber} />
      : <div className="stage-empty"><span className="section-number">02</span><div><h2>Documento</h2><p>O texto encontrado no PDF aparecerá aqui para conferência.</p></div></div>}
    </section>
    <section className="stage-section" id="review" aria-label="Revisão do texto">
    {documentV2 ? <Suspense fallback={<p role="status">Carregando comparação OCR…</p>}>
      <OcrReviewPanel key={`${documentV2.documentId}:${ocrEpoch}`} document={documentV2}
        activePageNumber={pageNumber}
        persistence={ocrSourceReady ? persistenceRef.current?.service ?? null : null}
        onCommitChange={setOcrCommitBusy} onApproved={() => setCanonicalEpoch(value => value + 1)} />
    </Suspense> : <div className="stage-empty"><span className="section-number">03</span><div><h2>Revisão</h2><p>Importe um PDF para conferir trechos que precisam de revisão.</p></div></div>}
    {documentV2 && <NativeTextApprovalPanel document={documentV2}
      persistence={ocrSourceReady ? persistenceRef.current?.service ?? null : null}
      onApproved={() => setCanonicalEpoch(value => value + 1)} />}
    </section>
    </div>
    {stage === "review" && document && <ReviewBottomDock
      narrativeReady={!!approvedNarrative}
      narrativeChapters={approvedNarrative?.approved.plan.spokenChapters.length ?? 0}
      narrativeQaStatus={approvedNarrative?.approved.qa.status ?? null}
      audioUrl={completeWav?.url ?? null}
      audioChapters={completeWav?.chapters.length ?? 0}
      audioMode={completeWav ? ("mode" in completeWav ? completeWav.mode : "literal") : null}
      audioBusy={wavBusy}
      audioProgress={completeProgress !== null ? { current: completeProgress, total: completeTotal } : null}
      exportReady={!!completeWav}
    />}
    <div className={"production-grid" + (stage === "review" && document ? " review-production-hidden" : "")}>
    <section className="stage-section" id="narrative" aria-label="Roteiro narrativo">
    {documentV2 ? <Suspense fallback={<p role="status">Carregando roteiro…</p>}>
      <NarrativePanel key={`${documentV2.documentId}:${canonicalEpoch}`} document={documentV2}
        persistence={ocrSourceReady ? persistenceRef.current?.service ?? null : null}
        onApproved={() => setNarrativeEpoch(value => value + 1)} />
    </Suspense> : <div className="stage-empty"><span className="section-number">04</span><div><h2>Narrativa</h2><p>Depois da revisão, prepare o roteiro de cada capítulo.</p></div></div>}
    </section>
    <AudioWorkspace
      completeAudioRef={completeAudioRef}
      model={{
        document, documentV2, audioHistory, savedWav, selectedAudioKey, audioOpening,
        audioMaintenanceBusy, currentAudioKey, completeWav, completeProgress, completeTotal,
        currentChapter, pageNumber, endPage, preview, reviewed, speechState, voices, voiceURI,
        wavBusy, wavProgress, wavUrl, busy, ocrCommitBusy,
      }}
      actions={{
        openSavedAudio,
        removeSavedAudio,
        generateCompleteLiteral: exportCompleteWav,
        generateCompleteNarrative: exportNarrativeWav,
        cancelCompleteGeneration: () => wavAbortRef.current?.abort(),
        seekChapter,
        onCompleteTimeUpdate: time => {
          if (!completeWav) return;
          const index = completeWav.chapters.reduce((selected, chapter, position) =>
            chapter.startSeconds <= time ? position : selected, -1);
          if (index >= 0) setCurrentChapter(index);
        },
        onStartPageChange: value => {
          readingRequestRef.current++;
          speechRef.current?.stop();
          clearWav();
          setPreview(null);
          setReviewed(false);
          setPageNumber(value);
          setEndPage(value);
        },
        onEndPageChange: value => {
          readingRequestRef.current++;
          speechRef.current?.stop();
          clearWav();
          setPreview(null);
          setReviewed(false);
          setEndPage(value);
        },
        prepareReading,
        onReviewedChange: value => {
          if (!value) { speechRef.current?.stop(); clearWav(); }
          setReviewed(value);
        },
        onVoiceChange: setVoiceURI,
        startReading,
        pauseReading: () => speechRef.current?.pause(),
        resumeReading: () => speechRef.current?.resume(),
        stopReading: () => speechRef.current?.stop(),
        generateWav,
        cancelWav: clearWav,
      }}
    />
    <ExportPanel completeWav={completeWav} />
    </div>
  </AppShell>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
