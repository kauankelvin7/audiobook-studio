const paths = {
  project: "M3 7h7l2 2h9v11H3z M3 7V4h6l2 3", document: "M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6", review: "M5 3h14v18H5z M8 7h8 M8 11h8 M8 15h4", narrative: "M9 4a3 3 0 0 1 6 0v8a3 3 0 0 1-6 0z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3", audio: "M3 10v4 M7 6v12 M11 3v18 M15 8v8 M19 5v14 M23 10v4", export: "M12 16V3 M7 8l5-5 5 5 M5 12H3v9h18v-9h-2", settings: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z", diagnostic: "M5 20V12 M12 20V7 M19 20V3", search: "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14 M15 15l6 6", check: "M5 12l4 4L19 6", warning: "M12 3l10 18H2z M12 9v5 M12 17v1", edit: "M4 16L16 4l4 4L8 20H4z M14 6l4 4", chevron: "M9 5l7 7-7 7", fullscreen: "M3 9V3h6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6", book: "M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-4-2-7-1-10 1z M12 5v16", save: "M4 3h14l3 3v15H3V3z M7 3v7h10V3 M7 21v-7h10v7", more: "M12 4v1 M12 11v1 M12 18v1",
} as const;
export type StudioIconName = keyof typeof paths;
export function StudioIcon({ name, size = 20 }: { name: StudioIconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
