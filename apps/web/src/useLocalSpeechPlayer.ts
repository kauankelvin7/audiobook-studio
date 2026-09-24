import { useEffect, useRef, useState } from "react";
import { LocalSpeechPlayer, type SpeechState } from "./adapters/local_speech";

export function useLocalSpeechPlayer(onInterrupted: () => void) {
  const onInterruptedRef = useRef(onInterrupted);
  const playerRef = useRef<LocalSpeechPlayer | null>(null);
  const [speechState, setSpeechState] = useState<SpeechState>("idle");
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");

  onInterruptedRef.current = onInterrupted;

  useEffect(() => {
    const synthesis = typeof window === "undefined" ? null : window.speechSynthesis ?? null;
    const player = new LocalSpeechPlayer(synthesis, setSpeechState, () => onInterruptedRef.current());
    playerRef.current = player;

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
      playerRef.current = null;
    };
  }, []);

  return { playerRef, speechState, voices, voiceURI, setVoiceURI };
}
