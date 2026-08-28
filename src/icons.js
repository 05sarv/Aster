/* ASTER — inline SVG icon set (stroke style, lucide-inspired). */

const P = (d) => `<path d="${d}"/>`;
const C = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}"/>`;

export const ICONS = {
  home: P("M3 11l9-8 9 8") + P("M5 9.5V21h5v-6h4v6h5V9.5"),
  spark: P("M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z") + P("M19 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"),
  check: P("M4 12l5 5L20 7"),
  checkCircle: C(12, 12, 9) + P("M8 12l3 3 5-6"),
  rocket: P("M12 2c4 2 6 6 6 10l-3 3h-6l-3-3c0-4 2-8 6-10z") + P("M8 15l-4 6M16 15l4 6") + C(12, 9, 2),
  chart: P("M5 20v-6M11 20V8M17 20V9") + P("M3 20h18"),
  map: P("M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z") + P("M9 4v14M15 6v14"),
  gear: P("M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z") + C(12, 12, 3),
  plus: P("M12 5v14M5 12h14"),
  search: C(11, 11, 7) + P("m21 21-4.3-4.3"),
  bell: P("M6 8a6 6 0 0 1 12 0c0 7 3 8 3 8H3s3-1 3-8") + P("M10.3 21a2 2 0 0 0 3.4 0"),
  moon: P("M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"),
  sun: C(12, 12, 4) + P("M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"),
  link: P("M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7") + P("M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"),
  image: `<rect x="3" y="3" width="18" height="18" rx="3"/>` + C(9, 9, 2) + P("m21 15-4.5-4.5L7 20"),
  trash: P("M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14") + P("M10 11v6M14 11v6"),
  pencil: P("M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"),
  x: P("M6 6l12 12M18 6 6 18"),
  chevDown: P("m6 9 6 6 6-6"),
  chevLeft: P("m15 18-6-6 6-6"),
  chevRight: P("m9 18 6-6-6-6"),
  chevUp: P("m6 15 6-6 6 6"),
  grip: C(9, 6, 1.3) + C(15, 6, 1.3) + C(9, 12, 1.3) + C(15, 12, 1.3) + C(9, 18, 1.3) + C(15, 18, 1.3),
  calendar: `<rect x="3" y="4" width="18" height="17" rx="3"/>` + P("M16 2v4M8 2v4M3 10h18"),
  clock: C(12, 12, 9) + P("M12 7v5l3 2"),
  flag: P("M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z") + P("M4 22v-7"),
  repeat: P("m17 2 4 4-4 4") + P("M3 11v-1a4 4 0 0 1 4-4h14") + P("m7 22-4-4 4-4") + P("M21 13v1a4 4 0 0 1-4 4H3"),
  star: P("M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"),
  heart: P("M12 21C6 16 3 12.5 3 8.8 3 6 5 4 7.5 4c1.8 0 3.4 1 4.5 2.6C13.1 5 14.7 4 16.5 4 19 4 21 6 21 8.8c0 3.7-3 7.2-9 12.2z"),
  tag: P("M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z") + C(7.5, 7.5, 1.5),
  target: C(12, 12, 9) + C(12, 12, 5) + C(12, 12, 1.5),
  flame: P("M12 3c2 3 5 5.5 5 9a5 5 0 0 1-10 0c0-1.5.6-2.9 1.5-4.2.3 1 .9 1.7 1.8 2.2C10 7.7 10.8 5.2 12 3z"),
  download: P("M12 3v12m0 0 4-4m-4 4-4-4") + P("M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"),
  upload: P("M12 15V3m0 0 4 4m-4-4-4 4") + P("M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"),
  sliders: P("M4 8h9M19 8h1M4 16h3M12 16h8") + C(16, 8, 2) + C(9.5, 16, 2),
  user: C(12, 8, 4) + P("M4 21c0-4 3.6-6 8-6s8 2 8 6"),
  pin: P("M12 21s-7-5.3-7-11a7 7 0 0 1 14 0c0 5.7-7 11-7 11z") + C(12, 10, 2.5),
  note: P("M4 4h16v10l-6 6H4z") + P("M20 14h-6v6") + P("M8 9h8M8 13h5"),
  refresh: P("M21 12a9 9 0 1 1-9-9c2.5 0 4.9 1 6.6 2.6L21 8") + P("M21 3v5h-5"),
  palette: P("M12 3a9 9 0 1 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a2 2 0 0 1 0-4h6a3 3 0 0 0 3-3c0-3.5-4-6-9-6z") + C(7.5, 10.5, 1) + C(12, 7.5, 1) + C(16.5, 10.5, 1),
  more: C(5, 12, 1.6) + C(12, 12, 1.6) + C(19, 12, 1.6),
  arrowRight: P("M4 12h16m0 0-6-6m6 6-6 6"),
  camera: P("M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v12H3V8a1 1 0 0 1 1-1z") + C(12, 13, 3.5),
  smile: C(12, 12, 9) + P("M8 14s1.5 2 4 2 4-2 4-2") + P("M9 9h.01M15 9h.01"),
  copy: `<rect x="9" y="9" width="11" height="11" rx="2"/>` + P("M5 15V5a2 2 0 0 1 2-2h10"),
  info: C(12, 12, 9) + P("M12 8h.01M12 12v4"),
  list: P("M8 6h13M8 12h13M8 18h13") + P("M3.5 6h.01M3.5 12h.01M3.5 18h.01"),
  grid: `<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>`,
  trophy: P("M8 4h8v5a4 4 0 0 1-8 0z") + P("M8 5H5a3 3 0 0 0 3 4M16 5h3a3 3 0 0 1-3 4") + P("M12 13v4M8 21h8M10 17h4"),
  edit2: P("M12 20h9") + P("M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z"),
};

const wrap = (inner, size) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

/** Element (span) containing the icon — use in DOM composition. */
export function icon(name, size = 20, cls = "") {
  const span = document.createElement("span");
  span.className = ("icon " + cls).trim();
  span.innerHTML = wrap(ICONS[name] || ICONS.spark, size);
  return span;
}
/** Full inline svg string — use inside innerHTML templates. */
export const iconStr = (name, size = 20) => wrap(ICONS[name] || ICONS.spark, size);
/** Just the inner markup — compose inside another <svg> (e.g. the Map view). */
export const iconInner = (name) => ICONS[name] || ICONS.spark;
