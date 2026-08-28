/* ASTER — shared utilities: DOM helper, dates, misc. */

export const uid = () =>
  "x" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-5);

/* ---------- tiny DOM helper ---------- */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "html") el.innerHTML = String(v);
    else if (k === "value") el.value = v;
    else if (k === "checked" || k === "disabled" || k === "selected") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  append(el, children);
  return el;
}
export const frag = (...children) => {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
};
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}
export const clear = (el) => {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
};

/* Views often call element.append(a, maybeNull, b) — the DOM would render a
   literal "null" text node for null/false args. Filter them once, globally. */
{
  const origAppend = Element.prototype.append;
  Element.prototype.append = function (...nodes) {
    const safe = nodes.filter((n) => n != null && n !== false);
    return safe.length ? origAppend.apply(this, safe) : undefined;
  };
}

/* ---------- dates (all local, keys are 'YYYY-MM-DD') ---------- */
const pad = (n) => String(n).padStart(2, "0");
export const toKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayKey = () => toKey(new Date());
export const fromKey = (k) => {
  const [y, m, d] = (k || todayKey()).split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (k, n) => toKey(new Date(fromKey(k).getTime() + n * 86400000));
export const daysBetween = (a, b) => Math.round((fromKey(b) - fromKey(a)) / 86400000);
export const monthKey = (k) => (k || "").slice(0, 7);
export const nowHM = (d = new Date()) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function fmtDate(k, opts = {}) {
  if (!k) return "";
  const d = fromKey(k);
  if (opts.weekday) return `${WD[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`;
  if (opts.short) return `${MON[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
  return `${MON[d.getMonth()].slice(0, 3)} ${d.getDate()}, ${d.getFullYear()}`;
}
export function fmtMonth(mk) {
  if (!mk) return "";
  const [y, m] = mk.split("-").map(Number);
  return `${MON[m - 1]} ${y}`;
}
export function relDay(k) {
  if (!k) return "";
  const n = daysBetween(todayKey(), k);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  if (n > 1 && n < 7) return WD[fromKey(k).getDay()];
  if (n < 0) return `${-n}d ago`;
  return `in ${n}d`;
}
export const isPast = (k) => k && k < todayKey();
export const isToday = (k) => k === todayKey();
export function greeting(d = new Date()) {
  const hr = d.getHours();
  if (hr < 5) return "Up late?";
  if (hr < 12) return "Good morning";
  if (hr < 17) return "Good afternoon";
  if (hr < 22) return "Good evening";
  return "Good night";
}
export function advanceDue(key, recurrence) {
  let k = key || todayKey();
  const step = { daily: 1, weekly: 7, biweekly: 14, monthly: 30 }[recurrence] || 1;
  do {
    if (recurrence === "monthly") {
      const d = fromKey(k);
      d.setMonth(d.getMonth() + 1);
      k = toKey(d);
    } else k = addDays(k, step);
  } while (k < todayKey()); // never roll into the past
  return k;
}
export const fmtHM = (mins) => {
  const m = Math.round(mins);
  return m >= 60 ? `${Math.floor(m / 60)}h ${pad(m % 60)}m` : `${m}m`;
};
/** "14:05" → "2:05 PM" (24-hour "HH:MM" in, friendly 12-hour out). */
export function fmtTime(t) {
  if (!t) return "";
  const [hh, mm] = String(t).split(":").map(Number);
  if (isNaN(hh) || isNaN(mm)) return String(t);
  const ap = hh < 12 ? "AM" : "PM";
  let x = hh % 12;
  if (x === 0) x = 12;
  return `${x}:${pad(mm)} ${ap}`;
}
export function fmtVal(type, val, unit = "", decimals = 0) {
  if (val == null || val === "") return "—";
  if (type === "duration") return fmtHM(Number(val)) + (unit ? ` ${unit}` : "");
  if (type === "rating") return Number(val).toFixed(0) + " ★";
  if (type === "percent") return `${Math.round(Number(val))}%`;
  if (type === "check") return Number(val) ? "✓" : "—";
  if (type === "text") return String(val);
  if (type === "custom") return String(val) + (unit ? ` ${unit}` : "");
  const n = Number(val);
  return (Number.isInteger(n) ? n : n.toFixed(decimals)) + (unit ? ` ${unit}` : "");
}

/** True if a metric's value contains free text (Notes/Custom fields) — those wrap, not nowrap. */
export const metricIsText = (m) => ["text", "custom"].includes(m.type) || (m.parts || []).some((p) => ["text", "custom"].includes(p.kind));

/** Auto-growing textarea for free-text fields — Enter makes a new line, text wraps. */
export function autoArea(value = "", placeholder = "", onChange = null, maxH = 200) {
  const t = h("textarea", { class: "inp auto-area", rows: 2, placeholder }, value ?? "");
  const grow = () => { t.style.height = "auto"; t.style.height = Math.min(maxH, t.scrollHeight) + "px"; };
  t.addEventListener("input", () => { onChange && onChange(t.value); grow(); });
  requestAnimationFrame(grow);
  return t;
}

/** Format an entry's value for a metric — handles multi-field (compound) metrics:
 *  val is an object keyed by part id, shown as "60 kg · 12 ×". */
export function fmtEntryVal(metric, val) {
  const parts = metric.parts || [];
  if (val != null && typeof val === "object") {
    const bits = parts
      .filter((p) => val[p.id] !== "" && val[p.id] != null)
      .map((p) => (p.kind === "text" ? String(val[p.id]) : fmtVal(p.kind, val[p.id], p.unit, p.decimals)));
    if (bits.length) return bits.join(" · ");
    return "—";
  }
  return fmtVal(metric.type, val, metric.unit, metric.decimals);
}

/* ---------- misc ---------- */
export const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
export const sum = (a) => a.reduce((x, y) => x + y, 0);
export const debounce = (fn, ms) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
export function fuzzy(query, ...fields) {
  const q = (query || "").toLowerCase().trim();
  if (!q) return true;
  const hay = fields.filter(Boolean).join(" ").toLowerCase();
  return q.split(/\s+/).every((t) => hay.includes(t));
}
export function hashColor(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
export function download(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
/** Read an image file → downscaled JPEG dataURL (keeps storage small). */
export function readImage(file, max = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Not an image"));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read image"));
    };
    img.src = url;
  });
}
export function relTime(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  const d = Math.floor(s / 86400);
  return d < 30 ? `${d}d ago` : fmtDate(toKey(new Date(iso)));
}
export const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
