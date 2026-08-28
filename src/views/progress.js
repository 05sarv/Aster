/* ASTER — Progress view: goals, milestones, charts and history across all spaces. */

import { h, todayKey, fmtDate, relDay, isPast, fmtVal } from "../utils.js";
import { icon } from "../icons.js";
import { getState, update } from "../store.js";
import { btn, chip, iconBtn, emptyState, colorHex } from "../components.js";
import { openGoalEditor, openGoalDetail, openMetricEditor, openMetricDetail, openEntryEditor, openSpaceEditor } from "../editors.js";
import { ring, sparkline, lineChart, heatmap } from "../charts.js";
import { metricStats, goalProgress } from "../logic.js";

export function renderProgress(root) {
  const s = getState();

  root.append(
    h("div", { class: "page-head" },
      h("div", {},
        h("h1", {}, "Progress"),
        h("p", { class: "subtitle" }, "Charts & history for every metric.")),
      h("div", { class: "head-actions" },
        h("a", { class: "btn ghost", href: "#/goals" }, icon("target", 16), "Goals →")))
  );

  /* ---- metrics by space ---- */
  root.append(h("div", { class: "section-head" }, icon("chart", 16), h("span", {}, "Metrics & history")));
  if (!s.metrics.length) {
    root.append(emptyState({ ic: "chart", title: "No metrics yet", hint: "Metrics live inside Spaces — create one and choose what to track.", action: { label: "Create a Space", fn: () => openSpaceEditor() } }));
    return;
  }

  const groups = new Map();
  groups.set("Everyday", []);
  for (const m of s.metrics) {
    const sp = s.spaces.find((x) => x.id === m.spaceId);
    const key = sp ? `${sp.emoji} ${sp.name}` : "Everyday";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(m);
  }
  for (const [name, ms] of groups) {
    if (!ms.length) continue;
    root.append(h("h3", { class: "group-title" }, name));
    root.append(h("div", { class: "metric-detail-grid" }, ms.map((m) => metricPanel(m, s))));
  }
}

function metricPanel(m, s) {
  const st = metricStats(s, m);
  const sp = m.spaceId && s.spaces.find((x) => x.id === m.spaceId);
  const head = h("div", { class: "metric-panel-head" },
    h("button", { class: "metric-name clickable", onclick: () => openMetricDetail(m), title: "Details" }, h("span", { class: "metric-emoji" }, m.emoji), m.name),
    h("div", { class: "row" },
      st.streak > 1 && h("span", { class: "streak" }, icon("flame", 14), st.streak),
      iconBtn("pencil", "Edit metric", () => openMetricEditor(m)),
      iconBtn("plus", "Log entry", () => openEntryEditor(m))));

  const chart =
    ["text", "custom"].includes(m.type)
      ? h("div", { class: "muted small", style: "padding:8px 2px" }, `${st.count} note entries`)
      : st.days.length
      ? lineChart(st.days.slice(-30).map((d) => ({ label: fmtDate(d, { short: true }), v: st.byDay.get(d), tip: `${fmtDate(d)} — ${st.fmt(st.byDay.get(d))}` })),
          { fmt: (v) => st.fmt(v) })
      : h("div", { class: "chart-empty" }, "No entries yet");

  return h(
    "div",
    { class: "metric-panel card" },
    head,
    chart,
    !["text", "custom"].includes(m.type) && st.days.length > 1 && h("div", { class: "hm-wrap" }, heatmap(st.byDay, { weeks: 13 })),
    !["text", "custom"].includes(m.type) && h("div", { class: "stat-grid" },
      h("div", { class: "stat" }, h("b", {}, st.fmt(st.last) || "—"), h("span", { class: "muted small" }, "latest")),
      h("div", { class: "stat" }, h("b", {}, st.fmt(st.best) || "—"), h("span", { class: "muted small" }, m.direction === "down" ? "lowest" : "best")),
      h("div", { class: "stat" }, h("b", {}, st.fmt(st.avg) || "—"), h("span", { class: "muted small" }, "average")),
      h("div", { class: "stat" }, h("b", {}, st.fmt(st.total) || "—"), h("span", { class: "muted small" }, "total")))
  );
}
