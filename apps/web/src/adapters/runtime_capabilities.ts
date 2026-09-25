export type RuntimeCapabilities = {
  android: boolean;
  mobile: boolean;
  opfs: boolean;
  webLocks: boolean;
  workers: boolean;
  wasm: boolean;
  webSpeech: boolean;
  localVoiceCount: number;
  wakeLock: boolean;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
};

export type RuntimeProbe = {
  userAgent: string;
  mobileHint: boolean;
  coarsePointer: boolean;
  opfs: boolean;
  webLocks: boolean;
  workers: boolean;
  wasm: boolean;
  webSpeech: boolean;
  localVoiceCount: number;
  wakeLock: boolean;
  deviceMemoryGb: number | null;
  hardwareConcurrency: number | null;
};

export function classifyRuntime(probe: RuntimeProbe): RuntimeCapabilities {
  const android = /android/i.test(probe.userAgent);
  return {
    android,
    mobile: android || probe.mobileHint || probe.coarsePointer,
    opfs: probe.opfs,
    webLocks: probe.webLocks,
    workers: probe.workers,
    wasm: probe.wasm,
    webSpeech: probe.webSpeech,
    localVoiceCount: probe.localVoiceCount,
    wakeLock: probe.wakeLock,
    deviceMemoryGb: probe.deviceMemoryGb,
    hardwareConcurrency: probe.hardwareConcurrency,
  };
}

export function detectRuntimeCapabilities(): RuntimeCapabilities {
  const nav = globalThis.navigator as (Navigator & {
    deviceMemory?: number;
    userAgentData?: { mobile?: boolean };
    storage?: StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> };
    locks?: unknown;
    wakeLock?: { request(type: "screen"): Promise<unknown> };
  }) | undefined;
  const speech = typeof window === "undefined" ? null : window.speechSynthesis ?? null;
  const coarsePointer = typeof globalThis.matchMedia === "function"
    ? globalThis.matchMedia("(pointer: coarse)").matches
    : false;

  return classifyRuntime({
    userAgent: nav?.userAgent ?? "",
    mobileHint: nav?.userAgentData?.mobile === true,
    coarsePointer,
    opfs: typeof nav?.storage?.getDirectory === "function",
    webLocks: !!nav?.locks,
    workers: typeof Worker !== "undefined",
    wasm: typeof WebAssembly !== "undefined",
    webSpeech: !!speech,
    localVoiceCount: speech?.getVoices().filter(voice => voice.localService).length ?? 0,
    wakeLock: typeof nav?.wakeLock?.request === "function",
    deviceMemoryGb: typeof nav?.deviceMemory === "number" && Number.isFinite(nav.deviceMemory) ? nav.deviceMemory : null,
    hardwareConcurrency: typeof nav?.hardwareConcurrency === "number" && Number.isFinite(nav.hardwareConcurrency)
      ? nav.hardwareConcurrency
      : null,
  });
}

export function recommendedTtsChunkChars(capabilities = detectRuntimeCapabilities()): number {
  if (!capabilities.mobile) return 12_000;
  const constrainedMemory = capabilities.deviceMemoryGb !== null && capabilities.deviceMemoryGb <= 4;
  const constrainedCpu = capabilities.hardwareConcurrency !== null && capabilities.hardwareConcurrency <= 4;
  return constrainedMemory || constrainedCpu ? 1_800 : 2_800;
}
