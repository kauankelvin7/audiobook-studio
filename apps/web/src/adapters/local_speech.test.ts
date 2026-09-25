import { afterEach, describe, expect, it, vi } from "vitest";
import { LocalSpeechPlayer } from "./local_speech";

const page = { documentId: "doc", sourceHash: "sha256:test", pageNumber: 1, chunks: [
  { regionId: "a", text: "Primeiro" }, { regionId: "b", text: "Segundo" },
] };
const session = { documentId: "doc", sourceHash: "sha256:test", startPage: 1, endPage: 1, pages: [page] };

class FakeUtterance {
  voice: SpeechSynthesisVoice | null = null;
  lang = "";
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}

afterEach(() => vi.unstubAllGlobals());

describe("local speech adapter", () => {
  it("uses only installed voices and plays chunks in order", () => {
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    const local = { voiceURI: "local", lang: "pt-BR", localService: true } as SpeechSynthesisVoice;
    const remote = { voiceURI: "remote", lang: "pt-BR", localService: false } as SpeechSynthesisVoice;
    const spoken: FakeUtterance[] = [];
    const synth = { getVoices: () => [remote, local], speak: (utterance: FakeUtterance) => spoken.push(utterance),
      cancel: vi.fn(), pause: vi.fn(), resume: vi.fn() } as unknown as SpeechSynthesis;
    const states: string[] = [];
    const player = new LocalSpeechPlayer(synth, state => states.push(state), vi.fn());
    expect(player.localVoices()).toEqual([local]);
    expect(() => player.play(session, "remote")).toThrow();
    player.play(session, "local");
    expect(spoken.map(item => item.text)).toEqual(["Primeiro"]);
    spoken[0].onend?.();
    expect(spoken.map(item => item.text)).toEqual(["Primeiro", "Segundo"]);
    spoken[1].onend?.();
    expect(states.at(-1)).toBe("idle");
  });

  it("cancels continuation when stopped", () => {
    vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
    const voice = { voiceURI: "local", lang: "pt-BR", localService: true } as SpeechSynthesisVoice;
    const spoken: FakeUtterance[] = [];
    const synth = { getVoices: () => [voice], speak: (utterance: FakeUtterance) => spoken.push(utterance),
      cancel: vi.fn() } as unknown as SpeechSynthesis;
    const player = new LocalSpeechPlayer(synth, vi.fn(), vi.fn());
    player.play(session, "local");
    player.stop();
    spoken[0].onend?.();
    expect(spoken).toHaveLength(1);
  });
});
