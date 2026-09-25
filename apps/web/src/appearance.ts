export type Appearance = "light" | "dark" | "system";

const STORAGE_KEY = "audiobook-studio.appearance";

export function storedAppearance(): Appearance {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" || value === "system" ? value : "light";
  } catch {
    return "light";
  }
}

export function applyAppearance(appearance: Appearance, persist = true): void {
  const effective = appearance === "system"
    ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : appearance;
  document.documentElement.dataset.appearance = effective;
  document.documentElement.dataset.appearancePreference = appearance;
  document.documentElement.style.colorScheme = effective;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  meta.content = effective === "dark" ? "#111923" : "#F3F1EB";
  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, appearance); } catch { /* A preferência vale para esta sessão. */ }
  }
}

export function watchAppearance(): () => void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onSystemChange = () => { if (storedAppearance() === "system") applyAppearance("system", false); };
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) applyAppearance(storedAppearance(), false);
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}
