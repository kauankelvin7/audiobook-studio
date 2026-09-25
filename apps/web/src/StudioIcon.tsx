const paths = {
  project: "M3.5 7.5h6.2l1.7 2h9.1v10.5h-17z M3.5 7.5V4.5h5.4l1.8 3",
  document: "M6 3.5h8.2L18.5 8v12.5H6z M14 3.5V8h4.5 M9 12h6 M9 15.5h6",
  review: "M5.5 3.5h13v17h-13z M8.5 8h7 M8.5 12h7 M8.5 16h4",
  narrative: "M9 5a3 3 0 0 1 6 0v6.5a3 3 0 0 1-6 0z M5.5 10.5v1a6.5 6.5 0 0 0 13 0v-1 M12 18v3",
  audio: "M3.5 11v2 M7.5 7v10 M11.5 4v16 M15.5 8.5v7 M19.5 6v12",
  export: "M12 15.5V3.5 M7.5 8l4.5-4.5L16.5 8 M5 12.5H3.5v8h17v-8H19",
  settings: "M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7 M9.2 3.5h5.6l.8 2.6 2.6 1.1 2.3 4.8-2.3 4.8-2.6 1.1-.8 2.6H9.2l-.8-2.6-2.6-1.1L3.5 12l2.3-4.8 2.6-1.1z",
  diagnostic: "M4.5 19.5V13 M10.5 19.5V8.5 M16.5 19.5V5 M3 19.5h18",
  search: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13 M15.3 15.3 5.2 5.2",
  check: "M5 12.5l4.2 4.1L19 6.8",
  warning: "M12 3.5l9.2 16H2.8z M12 9v4.5 M12 16.5h.01",
  edit: "M4.5 16.5 11.8-11.8 4 4-11.8 11.8h-4z M14.2 6.8l4 4",
  chevron: "m9 5.5 6.5 6.5L9 18.5",
  fullscreen: "M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5",
  book: "M12 5.5C8.8 3.2 5.5 3.8 3 5v14.5c3-1.5 6-1.4 9 .8 3-2.2 6-2.3 9-.8V5c-2.5-1.2-5.8-1.8-9 .5z M12 5.5v14.8",
  save: "M4 3.5h13.5l2.5 2.5v14.5H4z M7 3.5v6h9v-6 M7 20.5v-7h10v7",
  more: "M12 5h.01 M12 12h.01 M12 19h.01",
  play: "M8 5.5v13l10-6.5z",
  pause: "M8 5.5v13 M16 5.5v13",
  previous: "M7 6v12 M18 6.5 9.5 12l8.5 5.5z",
  next: "M17 6v12 M6 6.5l8.5 5.5L6 17.5z",
} as const;

export type StudioIconName = keyof typeof paths;

export function StudioIcon({
  name,
  size = 20,
  className,
}: {
  name: StudioIconName;
  size?: number;
  className?: string;
}) {
  return <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.65"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d={paths[name]} />
  </svg>;
}
