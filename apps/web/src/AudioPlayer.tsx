import type { MutableRefObject } from "react";

export function AudioPlayer({
  src,
  label,
  audioRef,
  onTimeUpdate,
}: {
  src: string;
  label: string;
  audioRef?: MutableRefObject<HTMLAudioElement | null>;
  onTimeUpdate?: (timeSeconds: number) => void;
}) {
  return <audio
    controls
    ref={audioRef}
    src={src}
    aria-label={label}
    onTimeUpdate={onTimeUpdate ? event => onTimeUpdate(event.currentTarget.currentTime) : undefined}
  />;
}
