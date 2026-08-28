/* ASTER Clean — Log tab: every metric one tap away.
   Checkbox metrics check off right on the row; everything else opens
   a prefilled editor. The quick bar above filters this list as you type. */

import { h, clear, todayKey, uid, fmtEntryVal } from "../utils.js";
import { icon } from "../icons.js";
import { getState, update } from "../store.js";
import { emptyState } from "../components.js";
import { openEntryEditor, openMetricEditor } from "../editors.js";

const ui = { q: "" };
let renderRows = null;

export function setLogFilter(q) {
  ui.q = q;
  if (renderRows) renderRows();
}

function checkState(s, m) {
  // today's entry for a single-checkbox metric → "on" | "off" | null
  if (m.type !== "check" || (m.parts || []).length > 1) return null;
  const e = s.entries.find((e) => e.metricId === m.id && e.date === todayKey());
  if (!e) return null;
  const v = typeof e.val === "object" ? Object.values(e.val)[0] : e.val;
  return v ? "on" : "off";
}

export function renderCleanLog(root) {
  const s = getState();
  root.append(
    h("div", { class: "today-greet" },
      h("h2", {}, "Log"),
      h("p", {}, "one tap to check off — tap a row for details"))
  );

  if (!s.metrics.length) {
    root.append(emptyState({
      ic: "chart", title: "Nothing to log yet",
      hint: "Metrics live inside Spaces. Create one to start logging here.",
      action: { label: "New metric", fn: () => openMetricEditor() },
    }));
    return;
  }

  const list = h("div", { class: "today-card log-rows" });
  root.append(list);

  renderRows = () => {
    clear(list);
    const q = ui.q.trim().toLowerCase();
    const ms = s.metrics.filter((m) => {
      if (!q) return true;
      const sp = s.spaces.find((x) => x.id === m.spaceId);
      return m.name.toLowerCase().includes(q) || (sp && sp.name.toLowerCase().includes(q));
    });
    if (!ms.length) {
      list.append(h("div", { class: "today-empty" }, "Nothing matches — try another word"));
      return;
    }
    const lastOf = (m) => s.entries.filter((e) => e.metricId === m.id)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.created || "").localeCompare(a.created || ""))[0];

    for (const m of ms) {
      const sp = s.spaces.find((x) => x.id === m.spaceId);
      const last = lastOf(m);
      const cs = checkState(s, m);
      const row = h("div", { class: "today-row log-row", onclick: () => openEntryEditor(m) },
        h("span", { class: "log-emoji" }, m.emoji || "📊"),
        h("div", { class: "log-main" },
          h("span", { class: "tr-title" }, m.name),
          h("span", { class: "log-last" }, last ? fmtEntryVal(m, last.val) : "not yet today")),
        sp && h("span", { class: "muted tiny" }, `${sp.emoji} ${sp.name}`),
        cs !== null
          ? h("button", {
              class: "gms-check log-check" + (cs === "on" ? " on" : ""),
              title: cs === "on" ? "Uncheck today" : "Check off today",
              onclick: (e) => { e.stopPropagation(); toggleCheck(m, cs); },
            }, icon("check", 14))
          : h("button", { class: "icon-btn log-plus", title: `Log ${m.name}`, onclick: (e) => { e.stopPropagation(); openEntryEditor(m); } }, icon("plus", 16)));
      list.append(row);
    }
    if (!q) list.append(h("button", { class: "log-add", onclick: () => openMetricEditor() }, icon("plus", 14), "New metric"));
  };
  renderRows();
}

function toggleCheck(m, cur) {
  update((d) => {
    const t = todayKey();
    const e = d.entries.find((e) => e.metricId === m.id && e.date === t);
    if (e) {
      const v = typeof e.val === "object" ? Object.values(e.val)[0] : e.val;
      const nv = v ? 0 : 1;
      if (typeof e.val === "object") e.val[Object.keys(e.val)[0]] = nv; else e.val = nv;
    } else {
      d.entries.unshift({
        id: uid(), metricId: m.id, date: t,
        val: (m.parts || []).length > 1 ? { [m.parts[0].id]: 1 } : 1,
        note: "", created: new Date().toISOString(),
      });
    }
  });
}
