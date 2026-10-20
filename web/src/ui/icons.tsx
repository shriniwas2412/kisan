// One pictogram set, drawn at the same stroke weight, so icons look the same on every phone.
// Decorative: every use sits next to a text label.
const P: Record<string, string> = {
  rupee: "M7 5h10M7 9h10M9 5c4 0 6 1.6 6 4s-2 4-6 4H8l7 7",
  weather: "M7 18a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 9.5a4.3 4.3 0 0 1 0 8.5H7zM10 21l-1 2M15 21l-1 2",
  drop: "M12 3c3.5 4.5 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6.5 6-11z",
  leaf: "M5 19C5 10 10 5 20 4c0 10-5 15-14 15zM5 19l8-8",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  calendar: "M4 6h16v15H4zM4 10h16M8 3v5M16 3v5M8 14h3",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.5-4 3.2-6 6.5-6s6 2 6.5 6M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14c2 .7 3.2 2.6 3.5 6",
  clipboard: "M8 4h8v3H8zM6 5H5v16h14V5h-1M9 12h6M9 16h6",
  plus: "M12 5v14M5 12h14",
  sync: "M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  camera: "M4 8h3l2-3h6l2 3h3v12H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  rain: "M7 15a4 4 0 0 1-.6-8A5.5 5.5 0 0 1 17 6.5a4.3 4.3 0 0 1 0 8.5H7zM9 18l-1 3M13 18l-1 3M17 18l-1 3",
  temp: "M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0zM12 9v7",
  check: "M5 12.5l4.5 4.5L19 7",
  back: "M15 5l-7 7 7 7",
  farmer: "M12 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM4 21c.6-4.5 4-7 8-7s7.4 2.5 8 7M6 5h12",
  play: "M8 5v14l11-7z",
  offline: "M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M14 10.3A10 10 0 0 1 19 13M2 9.5a15 15 0 0 1 4.5-2.8M10.5 5.1A15 15 0 0 1 22 9.5M12 20h.01",
};

export type IconName = keyof typeof P;

export function Icon({ name, size = 28 }: { name: IconName; size?: number }) {
  return (
    <svg class="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
      <path d={P[name]} />
    </svg>
  );
}
