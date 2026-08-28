/* ASTER — hand-rolled SVG charts (sparkline, line, bar, ring, heatmap). No dependencies. */

import { h } from "./utils.js";
import { todayKey, addDays, fmtDate, clamp } from "./utils.js";

const svgEl = (w, hgt, inner, color) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", `0 0 ${w} ${hgt}`);
  s.setAttribute("width", "100%");
  s.style.color = color || "var(--accent)";
  s.innerHTML = inner;
  return s;
};

/** Tiny inline trend line. values: number[] */
export function sparkline(values, { w = 130, h = 38, color } = {}) {
  const vals = values.map(Number).filter((v) => !isNaN(v));
  if (vals.length < 2) return svgEl(w, h, vals.length ? "" : "", color);
  const min = Math.min(...vals),
    max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) => [
    3 + (i / (vals.length - 1)) * (w - 6),
    h - 4 - ((v - min) / span) * (h - 8),
  ]);
  const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
  const area = `M${pts[0][0]},${h - 2} L` + line.replaceAll(" ", " L") + ` L${pts[pts.length - 1][0]},${h - 2} Z`;
  return svgEl(
    w,
    h,
    `<path d="${area}" fill="currentColor" opacity="0.13" stroke="none"/>` +
      `<polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<circle cx="${pts.at(-1)[0].toFixed(1)}" cy="${pts.at(-1)[1].toFixed(1)}" r="3" fill="currentColor"/>`,
    color
  );
}

/** Full line chart with area + tooltips. points: [{label, v}] */
export function lineChart(points, { w = 560, h: hgt = 190, color, fmt = (v) => v } = {}) {
  if (!points.length) return h("div", { class: "chart-empty" }, "No entries yet");
  const padL = 44, padR = 12, padT = 14, padB = 26;
  const iw = w - padL - padR, ih = hgt - padT - padB;
  let vals = points.map((p) => p.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const pad = (max - min) * 0.12;
  min -= pad; max += pad;
  const X = (i) => padL + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const Y = (v) => padT + ih - ((v - min) / (max - min)) * ih;
  const pts = points.map((p, i) => [X(i), Y(p.v)]);
  const line = pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
  const area = `M${pts[0][0]},${padT + ih} L` + line.replaceAll(" ", " L") + ` L${pts.at(-1)[0]},${padT + ih} Z`;
  let grid = "", labels = "";
  for (let g = 0; g <= 2; g++) {
    const y = padT + (ih * g) / 2;
    grid += `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="var(--border)" stroke-dasharray="3 5"/>`;
    labels += `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" class="axis">${fmt(max - ((max - min) * g) / 2)}</text>`;
  }
  const lab = (i) => `<text x="${X(i)}" y="${hgt - 8}" text-anchor="middle" class="axis">${points[i].label}</text>`;
  labels += lab(0) + (points.length > 2 ? lab(points.length - 1) : "");
  const dots = pts
    .map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="3.4" fill="var(--surface)" stroke="currentColor" stroke-width="2"><title>${points[i].tip || `${points[i].label}: ${fmt(points[i].v)}`}</title></circle>`)
    .join("");
  return svgEl(
    w,
    hgt,
    `${grid}<path d="${area}" fill="currentColor" opacity="0.12" stroke="none"/>` +
      `<polyline points="${line}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
      dots + labels,
    color
  );
}

/** Multi-series overview chart. series: [{name, color, points: [{date, v, label, tip}]}]
 *  Each line is scaled to its own min–max so different units can share one view. */
export function multiLineChart(series, { w = 640, h = 210 } = {}) {
  const padL = 10, padR = 10, padT = 14, padB = 22;
  const iw = w - padL - padR, ih = h - padT - padB;
  const n = series[0]?.points.length || 0;
  if (!n) return h("div", { class: "chart-empty" }, "No entries yet");
  let inner = "";
  series.forEach((s, si) => {
    const vals = s.points.map((p) => p.v);
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const pts = s.points.map((p, i) => [
      padL + (n === 1 ? iw / 2 : (i / (n - 1)) * iw),
      padT + ih - ((p.v - min) / span) * ih,
    ]);
    const line = pts.map((p) => p.map((x) => x.toFixed(1)).join(",")).join(" ");
    inner += `<polyline points="${line}" fill="none" stroke="${s.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"/>`;
    inner += pts.map((p, i) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" fill="var(--surface)" stroke="${s.color}" stroke-width="2"><title>${s.points[i].tip}</title></circle>`).join("");
  });
  // light horizontal guides
  let guides = "";
  for (let g = 0; g <= 2; g++) {
    const y = padT + (ih * g) / 2;
    guides += `<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" stroke="var(--border)" stroke-dasharray="3 5"/>`;
  }
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("width", "100%");
  svg.innerHTML = guides + inner;
  return svg;
}

/** Bar chart. items: [{label, v, tip}] */
export function barChart(items, { w = 560, h: hgt = 190, color, fmt = (v) => v } = {}) {
  if (!items.length) return h("div", { class: "chart-empty" }, "No entries yet");
  const padL = 40, padR = 8, padT = 14, padB = 26;
  const iw = w - padL - padR, ih = hgt - padT - padB;
  const max = Math.max(...items.map((i) => i.v), 0.001);
  const bw = Math.min(38, (iw / items.length) * 0.62);
  let bars = "", labels = "";
  items.forEach((it, i) => {
    const x = padL + (i + 0.5) * (iw / items.length) - bw / 2;
    const bh = Math.max(it.v > 0 ? 3 : 0, (it.v / max) * ih);
    const y = padT + ih - bh;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${bh.toFixed(1)}" rx="4" fill="currentColor"><title>${it.tip || `${it.label}: ${fmt(it.v)}`}</title></rect>`;
    if (items.length <= 16 || i % Math.ceil(items.length / 8) === 0)
      labels += `<text x="${(x + bw / 2).toFixed(1)}" y="${hgt - 8}" text-anchor="middle" class="axis">${it.label}</text>`;
  });
  labels += `<text x="${padL - 6}" y="${padT + 8}" text-anchor="end" class="axis">${fmt(max)}</text>`;
  return svgEl(w, hgt, bars + labels, color);
}

/** Progress ring. Returns svg element; pct 0..100 */
export function ring(pct, { size = 64, stroke = 7, color, label } = {}) {
  pct = clamp(pct || 0, 0, 100);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const off = c - (pct / 100) * c;
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", `0 0 ${size} ${size}`);
  s.style.color = color || "var(--accent)";
  s.style.width = s.style.height = size + "px";
  s.innerHTML =
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" ` +
    `stroke-dasharray="${c}" stroke-dashoffset="${off}" transform="rotate(-90 ${size / 2} ${size / 2})" class="ring-anim"/>` +
    (label != null ? `<text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle" class="ring-label">${label}</text>` : "");
  return s;
}

/** Calendar heatmap for the last `weeks` weeks. dates: Map<'YYYY-MM-DD', number> */
export function heatmap(dates, { weeks = 13, color } = {}) {
  const today = todayKey();
  const start = addDays(today, -(weeks * 7 - 1));
  const startDow = new Date(start).getDay();
  const grid = h("div", { class: "heatmap" });
  const max = Math.max(1, ...dates.values());
  for (let i = 0; i < weeks * 7 + startDow; i++) {
    const key = addDays(start, i - startDow);
    const v = dates.get(key) || 0;
    const lv = v === 0 ? 0 : Math.ceil((v / max) * 3);
    grid.append(
      h("span", {
        class: "hm-cell",
        "data-lv": lv,
        style: v > 0 && lv >= 3 ? `background:${color || "var(--accent)"}` : undefined,
        title: `${fmtDate(key)} — ${v} entr${v === 1 ? "y" : "ies"}`,
      })
    );
  }
  return grid;
}

/** Rating stars (interactive optional). Clicking the current value clears it. */
export function stars(value, { max = 5, onPick, size = 22 } = {}) {
  const row = h("div", { class: "stars" + (onPick ? " editable" : "") });
  let cur = Number(value) || 0;
  const paint = () => row.querySelectorAll(".star").forEach((b, bi) => {
    b.classList.toggle("on", bi < cur);
    const svg = b.querySelector("svg");
    if (svg) svg.setAttribute("fill", bi < cur ? "currentColor" : "none");
  });
  for (let i = 1; i <= max; i++)
    row.append(
      h("button", {
        type: "button",
        class: "star" + (i <= value ? " on" : ""),
        "data-v": i,
        onclick: onPick
          ? () => {
              cur = cur === i ? 0 : i;
              paint();
              onPick(cur);
            }
          : undefined,
        html: `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${i <= value ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>`,
      })
    );
  return row;
}
