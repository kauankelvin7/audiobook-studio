const paths = {
  project: "M20 20H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2Z",
  document: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h8",
  review: "M5 3h14v18H5z M8 8l1.5 1.5L12 7 M14 8h2 M8 14h8 M8 17h8",
  narrative: "M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z M19 10v1a7 7 0 0 1-14 0v-1 M12 18v4 M9 22h6",
  audio: "M4 10v4 M8 6v12 M12 3v18 M16 8v8 M20 10v4",
  export: "M12 16V3 M7 8l5-5 5 5 M5 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1",
  settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4",
  diagnostic: "M5 20V12 M12 20V7 M19 20V4",
  search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z M16 16l5 5",
  check: "m5 12 4 4L19 6",
  warning: "M10.3 3.9 2.4 18a2 2 0 0 0 1.8 3h15.6a2 2 0 0 0 1.8-3L13.7 3.9a2 2 0 0 0-3.4 0Z M12 9v4 M12 17h.01",
  edit: "M12 20h9 M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z",
  chevron: "m9 18 6-6-6-6",
  fullscreen: "M8 3H5a2 2 0 0 0-2 2v3 M16 3h3a2 2 0 0 1 2 2v3 M21 16v3a2 2 0 0 1-2 2h-3 M3 16v3a2 2 0 0 0 2 2h3",
  book: "M12 7c-2.2-1.6-5.6-2-9-1v14c3.4-1 6.8-.6 9 1 2.2-1.6 5.6-2 9-1V6c-3.4-1-6.8-.6-9 1Z M12 7v14",
  save: "M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z M17 21v-8H7v8 M7 3v5h8V3",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  play: "m7 5 12 7-12 7V5Z",
  pause: "M7 4h3v16H7z M14 4h3v16h-3z",
  stop: "M6 6h12v12H6z",
  download: "M12 3v12 M7 10l5 5 5-5 M5 21h14",
  close: "m18 6-12 12 M6 6l12 12",
  prev: "M19 12H5 M12 19l-7-7 7-7",
  next: "M5 12h14 M12 5l7 7-7 7",
  skipBack: "m19 20-9-8 9-8v16Z M5 19V5",
  skipForward: "m5 4 9 8-9 8V4Z M19 5v14",
  upload: "M12 16V3 M7 8l5-5 5 5 M4 17v4h16v-4",
  trash: "M3 6h18 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M19 6l-1 14H6L5 6 M10 11v5 M14 11v5",
  text: "M4 7V4h16v3 M9 20h6 M12 4v16",
  refresh: "M20 7v5h-5 M4 17v-5h5 M5.6 9A7 7 0 0 1 18 6l2 2 M4 16l2 2a7 7 0 0 0 12.4-3",
  sidebar: "M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z M9 3v18",
} as const;

export type StudioIconName = keyof typeof paths;

export function StudioIcon({ name, size = 20 }: { name: StudioIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
