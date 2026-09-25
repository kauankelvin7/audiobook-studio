import { describe, expect, it } from "vitest";
import { classifyRuntime, recommendedTtsChunkChars, type RuntimeProbe } from "./runtime_capabilities";

const desktop: RuntimeProbe = {
  userAgent: "Mozilla/5.0 (X11; Linux x86_64)",
  mobileHint: false,
  coarsePointer: false,
  opfs: true,
  webLocks: true,
  workers: true,
  wasm: true,
  webSpeech: true,
  localVoiceCount: 2,
  wakeLock: true,
  deviceMemoryGb: 8,
  hardwareConcurrency: 8,
};

describe("runtime capabilities", () => {
  it("keeps the existing long TTS chunk on desktop", () => {
    const capabilities = classifyRuntime(desktop);
    expect(capabilities.mobile).toBe(false);
    expect(recommendedTtsChunkChars(capabilities)).toBe(12_000);
  });

  it("uses smaller TTS chunks on constrained Android devices", () => {
    const capabilities = classifyRuntime({
      ...desktop,
      userAgent: "Mozilla/5.0 (Linux; Android 16)",
      mobileHint: true,
      coarsePointer: true,
      deviceMemoryGb: 4,
      hardwareConcurrency: 4,
    });
    expect(capabilities.android).toBe(true);
    expect(capabilities.mobile).toBe(true);
    expect(recommendedTtsChunkChars(capabilities)).toBe(1_800);
  });

  it("uses a moderate chunk on less constrained mobile devices", () => {
    const capabilities = classifyRuntime({
      ...desktop,
      mobileHint: true,
      coarsePointer: true,
      deviceMemoryGb: 8,
      hardwareConcurrency: 8,
    });
    expect(recommendedTtsChunkChars(capabilities)).toBe(2_800);
  });
});
