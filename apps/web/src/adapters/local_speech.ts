import type { ReadingSession } from "./rust_reading_preview";

export type SpeechState = "idle" | "playing" | "paused";

export class LocalSpeechError extends Error {
  constructor(public readonly code: "UNAVAILABLE" | "NO_LOCAL_VOICE" | "SYNTHESIS_FAILED", message: string) {
    super(message);
    this.name = "LocalSpeechError";
  }
}

export class LocalSpeechPlayer {
  private state: SpeechState = "idle";
  private generation = 0;

  constructor(private readonly synth: SpeechSynthesis | null, private readonly notify: (state: SpeechState) => void,
    private readonly onError: () => void) {}

  localVoices(): SpeechSynthesisVoice[] {
    return this.synth?.getVoices().filter(voice => voice.localService) ?? [];
  }

  play(session: ReadingSession, voiceURI: string): void {
    if (!this.synth || typeof SpeechSynthesisUtterance === "undefined") {
      throw new LocalSpeechError("UNAVAILABLE", "Este navegador não oferece leitura em voz alta.");
    }
    const voice = this.localVoices().find(candidate => candidate.voiceURI === voiceURI);
    if (!voice) throw new LocalSpeechError("NO_LOCAL_VOICE", "Selecione uma voz instalada neste dispositivo.");
    this.stop();
    const generation = this.generation;
    const chunks = session.pages.flatMap(page => page.chunks);
    let index = 0;
    const next = () => {
      if (generation !== this.generation) return;
      if (index >= chunks.length) {
        this.state = "idle";
        this.notify(this.state);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index++].text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      utterance.onend = next;
      utterance.onerror = () => {
        if (generation !== this.generation) return;
        this.stop();
        this.onError();
      };
      try {
        this.synth!.speak(utterance);
      } catch {
        if (generation !== this.generation) return;
        this.stop();
        this.onError();
      }
    };
    this.state = "playing";
    this.notify(this.state);
    next();
  }

  pause(): void {
    if (this.state !== "playing") return;
    this.synth?.pause();
    this.state = "paused";
    this.notify(this.state);
  }

  resume(): void {
    if (this.state !== "paused") return;
    this.synth?.resume();
    this.state = "playing";
    this.notify(this.state);
  }

  stop(): void {
    this.generation++;
    this.synth?.cancel();
    this.state = "idle";
    this.notify(this.state);
  }
}
