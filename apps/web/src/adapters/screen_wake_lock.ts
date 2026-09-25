export type ScreenWakeLockHandle = {
  release(): Promise<void>;
};

type NavigatorWithWakeLock = Navigator & {
  wakeLock?: {
    request(type: "screen"): Promise<ScreenWakeLockHandle>;
  };
};

export async function requestScreenWakeLock(): Promise<ScreenWakeLockHandle | null> {
  const nav = globalThis.navigator as NavigatorWithWakeLock | undefined;
  if (!nav?.wakeLock || (typeof document !== "undefined" && document.visibilityState !== "visible")) return null;
  try {
    return await nav.wakeLock.request("screen");
  } catch {
    return null;
  }
}
