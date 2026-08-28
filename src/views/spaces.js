/* ASTER — Spaces view: custom corners of life, each with its own metrics.
   Remake inspired by classic trainer apps: quick-log with steppers, day-grouped
   history, per-metric charts with range tabs, and an activity calendar. */

import { h, clear, fmtDate, fmtHM, relDay, todayKey, addDays, fromKey, fmtVal, fmtEntryVal, uid, autoArea, metricIsText } from "../utils.js";
import { icon } from "../icons.js";
import { getState, update } from "../store.js";
import { btn, iconBtn, emptyState, colorHex, toast, confirmDialog, popover } from "../components.js";
import { openSpaceEditor, openMetricEditor, openEntryEditor, openMetricPicker, openGoalEditor, deleteEntity, METRIC_TYPES } from "../editors.js";
import { sparkline, lineChart, barChart, multiLineChart, stars } from "../charts.js";
import { metricStats, metricParts } from "../logic.js";
import { goalCardBig } from "./goals.js";

const ui = {
  tab: "overview",
  quickMetric: null,      // id of metric selected in the quick-log card
  ranges: {},             // metricId -> chart range key
  parts: {},              // metricId -> part id shown in charts
  chartType: {},          // metricId -> "line" | "bar"
  calMonth: null,         // "YYYY-MM" being viewed
  calSel: null,           // selected day key in calendar
};

/* One stable color per metric (index within its space), like trainer apps color exercises. */
const CHART_COLORS = ["#5b8def", "#e0607e", "#e5b84b", "#6bbf8e", "#9b7ede", "#e88d5a", "#54b3c4", "#c46ba8"];
const metricColor = (metrics, m) => CHART_COLORS[Math.max(0, metrics.indexOf(m)) % CHART_COLORS.length];

const RANGES = [
  { id: "all", label: "All", days: null },
  { id: "1y", label: "1Y", days: 365 },
  { id: "6m", label: "6M", days: 182 },
  { id: "3m", label: "3M", days: 91 },
  { id: "1m", label: "1M", days: 30 },
];

/* ------------------------------ spaces list ------------------------------ */

export function renderSpaces(root) {
  const s = getState();
  root.append(
    h("div", { class: "page-head" },
      h("div", {},
        h("h1", {}, "Spaces"),
        h("p", { class: "subtitle" }, "A corner for everything you're growing.")),
      h("div", { class: "head-actions" }, btn("New space", { kind: "accent", ic: "plus", onclick: () => openSpaceEditor() })))
  );

  if (!s.spaces.length) {
    root.append(emptyState({ ic: "rocket", title: "Create your first Space", hint: "Track whatever matters to you — with your own custom metrics." }));
    return;
  }

  root.append(
    h("div", { class: "space-grid" },
      s.spaces.map((sp) => spaceCard(sp, s)))
  );
}

function spaceCard(sp, s) {
  const metrics = s.metrics.filter((m) => m.spaceId === sp.id);
  const mIds = new Set(metrics.map((m) => m.id));
  const entries = s.entries.filter((e) => mIds.has(e.metricId));
  const month = todayKey().slice(0, 7);
  const thisMonth = entries.filter((e) => e.date.startsWith(month)).length;
  const daySet = new Set(entries.map((e) => e.date));
  // streak: consecutive days ending today/yesterday
  let streak = 0, cur = todayKey();
  if (!daySet.has(cur)) { cur = addDays(cur, -1); if (!daySet.has(cur)) streak = 0; else { while (daySet.has(cur)) { streak++; cur = addDays(cur, -1); } } }
  else while (daySet.has(cur)) { streak++; cur = addDays(cur, -1); }

  // 30-day volume sparkline
  const perDay = new Map();
  for (const e of entries) perDay.set(e.date, (perDay.get(e.date) || 0) + 1);
  const vol = [];
  for (let i = 29; i >= 0; i--) vol.push(perDay.get(addDays(todayKey(), -i)) || 0);

  return h(
    "div",
    { class: "spcard fn-card", style: `--sp:${colorHex(sp.color)}`, onclick: () => (location.hash = `#/space/${sp.id}`) },
    h("div", { class: "spcard-top" },
      h("span", { class: "spcard-emoji" }, sp.emoji),
      h("div", { class: "spcard-name" },
        h("h3", {}, sp.name),
        h("p", { class: "muted small" }, metrics.length ? `${metrics.length} metric${metrics.length === 1 ? "" : "s"}` : "empty space — add a metric")),
      vol.filter(Boolean).length > 2 && h("span", { class: "spcard-spark" }, sparkline(vol, { w: 84, h: 30, color: colorHex(sp.color) }))),
    h("div", { class: "spcard-stats" },
      h("div", { class: "fn-stat" }, h("span", {}, String(thisMonth)), h("label", {}, "this month")),
      h("div", { class: "fn-stat" }, h("span", {}, String(entries.length)), h("label", {}, "all time")),
      h("div", { class: "fn-stat" + (streak > 1 ? " hot" : "") }, h("span", {}, streak > 1 ? String(streak) : "–"), h("label", {}, streak > 1 ? "day streak" : "streak")),
      h("div", { class: "fn-stat" }, h("span", {}, String(s.goals.filter((g) => g.spaceId === sp.id && !g.done).length)), h("label", {}, "goals"))),
    h("button", { class: "icon-btn danger quick-x", title: "Delete space", onclick: async (e) => {
      e.stopPropagation();
      if (await confirmDialog(`Delete "${sp.name}"? Its metrics and entries go with it; memories, tasks and goals are kept, just unattached.`))
        update((d) => deleteEntity(d, sp.id));
    } }, icon("x", 15))
  );
}

/* ------------------------------ space detail ------------------------------ */

export function renderSpace(root, id) {
  const s = getState();
  const sp = s.spaces.find((x) => x.id === id);
  if (!sp) {
    location.hash = "#/spaces";
    return;
  }
  const metrics = s.metrics.filter((m) => m.spaceId === sp.id);
  const goals = s.goals.filter((g) => g.spaceId === sp.id);
  if (ui.quickMetric && !metrics.some((m) => m.id === ui.quickMetric)) ui.quickMetric = null;

  root.append(
    h("div", { class: "page-head space-head", style: `--sp:${colorHex(sp.color)}` },
      h("div", { class: "row", style: "gap:10px;align-items:center" },
        iconBtn("chevLeft", "Back to Spaces", () => (location.hash = "#/spaces"), { cls: "big" }),
        h("span", { class: "space-emoji big" }, sp.emoji),
        h("div", {},
          h("h1", {}, sp.name),
          h("p", { class: "subtitle" }, sp.desc || `${metrics.length} metrics · ${goals.length} goals`))),
      h("div", { class: "head-actions" },
        metrics.length
          ? h("button", { class: "btn", onclick: (e) => metricManager(e.currentTarget, metrics, sp) }, icon("sliders", 16), "Metrics")
          : btn("New metric", { ic: "plus", onclick: () => openMetricEditor(null, { spaceId: sp.id }) }),
        btn("Log entry", { kind: "accent", ic: "plus", onclick: () => {
          if (!metrics.length) return openMetricEditor(null, { spaceId: sp.id });
          if (metrics.length === 1) return openEntryEditor(metrics[0]);
          openMetricPicker((m) => openEntryEditor(m));
        } }),
        iconBtn("pencil", "Edit space", () => openSpaceEditor(sp), { cls: "big" })))
  );

  const tabs = ["overview", "log", "charts", "calendar", "goals"];
  const tabBar = h("div", { class: "seg tabs" }, tabs.map((t) => segBtn(t)));
  function segBtn(t) {
    return h("button", { class: "seg-btn" + (ui.tab === t ? " on" : ""), onclick: () => { ui.tab = t; rerender(); } },
      { overview: "Overview", log: "Log", charts: "Charts", calendar: "Calendar", goals: "Goals" }[t]);
  }
  function rerender() { clear(root); renderSpace(root, id); }
  const body = h("div", {});

  function renderTab_() {
    clear(body);
    if (ui.tab === "overview") renderOverview(body, s, sp, metrics, goals);
    else if (ui.tab === "log") renderLog(body, s, sp, metrics);
    else if (ui.tab === "charts") renderCharts(body, s, sp, metrics);
    else if (ui.tab === "calendar") renderCalendar(body, s, sp, metrics);
    else renderGoals(body, s, sp, goals);
  }

  root.append(tabBar, body);
  renderTab_();
}

/** Reorder a metric within its space (dir: -1 up, +1 down). */
export function moveMetric(id, dir) {
  update((d) => {
    const i = d.metrics.findIndex((x) => x.id === id);
    if (i < 0) return;
    const spaceId = d.metrics[i].spaceId;
    let j = i + dir;
    while (j >= 0 && j < d.metrics.length && d.metrics[j].spaceId !== spaceId) j += dir;
    if (j < 0 || j >= d.metrics.length) return;
    [d.metrics[i], d.metrics[j]] = [d.metrics[j], d.metrics[i]];
  });
}

/* --------------------------------- LOG ---------------------------------- */

/** Space dashboard: stats at a glance + quick log + recent activity + goals. */
function renderOverview(body, s, sp, metrics, goals) {
  if (!metrics.length) {
    body.append(emptyState({ ic: "chart", title: "Nothing to track yet", hint: `Choose what to track in ${sp.name} — weight, hours, ratings, anything.` }));
    return;
  }
  const mIds = new Set(metrics.map((m) => m.id));
  const entries = s.entries.filter((e) => mIds.has(e.metricId));
  const month = todayKey().slice(0, 7);
  const thisMonth = entries.filter((e) => e.date.startsWith(month)).length;
  const daySet = new Set(entries.map((e) => e.date));
  let streak = 0, cur = todayKey();
  if (!daySet.has(cur)) { cur = addDays(cur, -1); if (daySet.has(cur)) while (daySet.has(cur)) { streak++; cur = addDays(cur, -1); } }
  else while (daySet.has(cur)) { streak++; cur = addDays(cur, -1); }
  const activeGoals = goals.filter((g) => !g.done);

  body.append(
    h("div", { class: "fn-card sp-overview-stats" },
      h("div", { class: "fn-stat" }, h("span", {}, String(thisMonth)), h("label", {}, "this month")),
      h("div", { class: "fn-stat" }, h("span", {}, String(entries.length)), h("label", {}, "all time")),
      h("div", { class: "fn-stat" + (streak > 1 ? " hot" : "") }, h("span", {}, streak > 1 ? String(streak) : "–"), h("label", {}, streak > 1 ? "day streak" : "streak")),
      h("div", { class: "fn-stat" }, h("span", {}, String(activeGoals.length)), h("label", {}, "goals"))),
    h("div", { style: "margin-top:14px" }, quickLogCard(s, metrics)),
    h("div", { class: "section-head", style: "margin-top:20px" }, icon("note", 16), h("span", {}, "Recent"),
      h("div", { class: "grow" }),
      h("button", { class: "btn ghost sm", onclick: () => { ui.tab = "log"; rerenderSpace(); } }, "All history →")),
    historyList(s, sp, metrics, 5),
    activeGoals.length > 0 && h("div", {},
      h("div", { class: "section-head", style: "margin-top:20px" }, icon("target", 16), h("span", {}, "Goals")),
      h("div", { class: "goal-list" }, activeGoals.slice(0, 3).map((g) => goalCardBig(g, s))))
  );
}

function renderLog(body, s, sp, metrics) {
  if (!metrics.length) {
    body.append(emptyState({ ic: "chart", title: "Nothing to log yet", hint: `Choose what to track in ${sp.name} — weight, hours, ratings, anything.`, action: { label: "New metric", fn: () => openMetricEditor(null, { spaceId: sp.id }) } }));
    return;
  }
  body.append(quickLogCard(s, metrics));

  body.append(
    h("div", { class: "section-head", style: "margin-top:20px" }, icon("note", 16), h("span", {}, "History"),
      h("span", { class: "muted small" }, "tap an entry to edit")),
    historyList(s, sp, metrics)
  );
}

/** Popover: add / edit / reorder / delete the space's metrics. */
function metricManager(anchor, metrics, sp) {
  const rows = metrics.map((m) => {
    const count = getState().entries.filter((e) => e.metricId === m.id).length;
    return h("div", { class: "mm-row" },
      h("span", { class: "metric-emoji" }, m.emoji),
      h("div", { class: "grow", style: "min-width:0" },
        h("b", { style: "display:block;font-size:13.5px" }, m.name),
        h("span", { class: "muted tiny" }, `${count} entries`)),
      iconBtn("chevUp", "Move up", () => { moveMetric(m.id, -1); anchor?.click?.(); }, { size: 15 }),
      iconBtn("chevDown", "Move down", () => { moveMetric(m.id, 1); anchor?.click?.(); }, { size: 15 }),
      iconBtn("pencil", "Edit", () => openMetricEditor(m), { size: 15 }),
      iconBtn("trash", "Remove", async () => {
        if (await confirmDialog(`Remove "${m.name}" and its ${count} ${count === 1 ? "entry" : "entries"}?`))
          update((d) => deleteEntity(d, m.id));
      }, { size: 15, cls: "danger" }));
  });
  popover(anchor, h("div", { class: "mm-list" },
    rows.length ? rows : h("p", { class: "muted small", style: "padding:6px 2px" }, "No metrics yet."),
    h("button", { class: "btn accent sm", style: "width:100%;justify-content:center;margin-top:8px", onclick: () => openMetricEditor(null, { spaceId: sp.id }) }, icon("plus", 14), "New metric")),
    { width: 330 });
}

/** FitNotes-style quick log: pick a metric, set the value(s) with steppers, save.
 *  Multi-field metrics get one control per field — e.g. "60 kg · 12 reps". */
function quickLogCard(s, metrics) {
  const m = metrics.find((x) => x.id === ui.quickMetric) || metrics[0];
  ui.quickMetric = m.id;
  const parts = metricParts(m);
  const multi = parts.length > 1;
  const st = metricStats(s, m);
  const lastEnt = s.entries.filter((e) => e.metricId === m.id).sort((a, b) => b.date.localeCompare(a.date) || (b.created || "").localeCompare(a.created || ""))[0];
  const col = metricColor(metrics, m);

  const NUM_KINDS = new Set(["number", "count", "distance", "duration", "percent", "check"]);
  const fallback = (kind) => (kind === "rating" ? 3 : kind === "percent" ? 50 : kind === "check" ? 1 : "");
  const draft = {
    val: multi
      ? Object.fromEntries(parts.map((p) => [p.id, lastEnt && typeof lastEnt.val === "object" && lastEnt.val[p.id] != null ? lastEnt.val[p.id] : fallback(p.kind)]))
      : lastEnt && !["text", "custom"].includes(m.type) ? lastEnt.val : fallback(parts[0].kind),
    note: "",
  };
  const getV = (p) => (multi ? draft.val[p.id] : draft.val);
  const painters = [];
  let paint = () => {};
  const setV = (p, v) => { if (multi) draft.val[p.id] = v; else draft.val = v; paint(); };

  const stepOf = (p) => (p.kind === "duration" ? 5 : p.kind === "percent" ? 5 : p.kind === "count" ? 1 : p.decimals ? Math.pow(10, -(p.decimals || 0)) : 1);
  const mkStepBtn = (label, bump, title, sm) =>
    h("button", { class: "fn-step" + (sm ? " sm" : ""), title, type: "button", onclick: bump }, h("b", {}, label));

  /** control for one field; the first field renders big, extras compact */
  const partControl = (p, i) => {
    const dec = p.decimals || 0;
    const step = stepOf(p);
    const bump = (dir) => { const cur = Number(getV(p)) || 0; setV(p, Math.max(0, Number((cur + dir * step).toFixed(dec)))); };
    const label = p.label || METRIC_TYPES[p.kind]?.label || p.kind;
    const wrap = (ctrl, unit) =>
      h("div", { class: "fn-part" + (i === 0 ? " main" : "") },
        (multi || p.label) ? h("label", { class: "fn-part-label" }, label) : null,
        ctrl,
        unit ? h("span", { class: "fn-unit" }, unit) : null);
    const sm = i > 0;
    switch (p.kind) {
      case "rating":
        return wrap(h("div", { class: "fn-stars" }, stars(Number(getV(p)) || 3, { size: sm ? 22 : 30, onPick: (v) => setV(p, v) })), "");
      case "percent": {
        const bubble = h("span", { class: "range-val fn-pct" }, (Number(getV(p)) || 0) + "%");
        const r = h("input", { type: "range", min: 0, max: 100, step: 1, value: Number(getV(p)) || 0, class: "range" + (sm ? "" : " fn-range-wide") });
        r.addEventListener("input", () => { setV(p, Number(r.value)); bubble.textContent = r.value + "%"; });
        return wrap(h("div", { class: "fn-pct-wrap" }, r, bubble), "");
      }
      case "check": {
        const b = h("button", { class: "fn-check" + (Number(getV(p)) ? " on" : ""), type: "button", title: "Tap ✓ when done" }, icon("check", 22));
        b.addEventListener("click", () => {
          const on = !b.classList.contains("on");
          b.classList.toggle("on", on);
          setV(p, on ? 1 : 0);
        });
        return wrap(b, "");
      }
      case "text":
      case "custom": {
        const t = autoArea(getV(p) ?? "", `${label}…`, (v) => setV(p, v));
        t.classList.add("fn-text-inp");
        return wrap(t, "");
      }
      case "duration": {
        const total = Number(getV(p)) || 0;
        const hIn = h("input", { class: "fn-val-inp fn-dur-inp", type: "number", min: 0, value: Math.floor(total / 60) });
        const mIn = h("input", { class: "fn-val-inp fn-dur-inp", type: "number", min: 0, value: total % 60 });
        hIn.addEventListener("input", () => setV(p, (Number(hIn.value) || 0) * 60 + (Number(mIn.value) || 0)));
        mIn.addEventListener("input", () => setV(p, (Number(hIn.value) || 0) * 60 + (Number(mIn.value) || 0)));
        painters.push(() => { const t = Number(getV(p)) || 0; hIn.value = Math.floor(t / 60); mIn.value = t % 60; });
        const dur = h("div", { class: "fn-dur" }, hIn, h("span", { class: "fn-dur-u" }, "h"), mIn, h("span", { class: "fn-dur-u" }, "m"));
        return sm
          ? wrap(dur, "minutes")
          : wrap(h("div", { class: "fn-stepper" }, mkStepBtn("−", () => bump(-1), "−5 min"), dur, mkStepBtn("+", () => bump(1), "+5 min")), "minutes");
      }
      default: {
        const inp = h("input", { class: "fn-val-inp", type: "number", step: "any", inputmode: "decimal", value: getV(p) === "" || getV(p) == null ? "" : getV(p) });
        inp.addEventListener("input", () => setV(p, inp.value));
        painters.push(() => (inp.value = getV(p)));
        const unit = p.unit || (p.kind === "count" ? "reps" : "");
        return wrap(h("div", { class: "fn-stepper" + (sm ? " compact" : "") },
          mkStepBtn("−", () => bump(-1), null, sm), inp, mkStepBtn("+", () => bump(1), null, sm)), unit);
      }
    }
  };
  paint = () => painters.forEach((f) => f());

  const valueCtrl = multi ? h("div", { class: "fn-parts" }, parts.map((p, i) => partControl(p, i))) : partControl(parts[0], 0);

  const hint = h("div", { class: "muted tiny center fn-hint" },
    lastEnt ? `last: ${fmtEntryVal(m, lastEnt.val)}` : "first entry — you set the bar");

  const showNote = multi ? parts.every((p) => !["text", "custom"].includes(p.kind)) : !["text", "custom"].includes(m.type);
  const noteIn = showNote && h("input", { class: "inp fn-note-inp", placeholder: "note (optional)", oninput: (e) => (draft.note = e.target.value) });

  const save = () => {
    const has = multi
      ? parts.some((p) => draft.val[p.id] !== "" && draft.val[p.id] != null)
      : draft.val !== "" && draft.val != null;
    if (!has) { toast({ title: "Add a value first ✍️", ic: "info" }); return; }
    const val = multi
      ? Object.fromEntries(parts.map((p) => [p.id, NUM_KINDS.has(p.kind) && draft.val[p.id] !== "" ? Number(draft.val[p.id]) : draft.val[p.id]]))
      : NUM_KINDS.has(m.type) && draft.val !== "" ? Number(draft.val) : draft.val;
    update((d) => d.entries.unshift({ id: uid(), metricId: m.id, date: todayKey(), val, note: draft.note, created: new Date().toISOString() }));
    toast({ title: "Logged ✓", body: `${m.emoji} ${m.name} — ${fmtEntryVal(m, val)}`, ic: "note", timeout: 2400 });
  };

  return h("div", { class: "fn-card fn-quick" },
    h("div", { class: "fn-quick-head" },
      h("span", { class: "fn-quick-ic" }, m.emoji),
      h("div", { class: "grow" },
        h("b", { style: "font-size:15px" }, `Quick log · ${m.name}`),
        h("span", { class: "muted tiny", style: "display:block" }, multi ? `today · ${parts.length} fields` : "today")),
      h("button", { class: "icon-btn", title: `Edit ${m.name}`, onclick: () => openMetricEditor(m) }, icon("pencil", 15)),
      h("span", { class: "fn-dot", style: `background:${col}`, title: "metric color" })),
    h("div", { class: "fn-chips" },
      metrics.map((x) =>
        h("button", { class: "fn-metric-chip" + (x.id === m.id ? " on" : ""), onclick: () => { ui.quickMetric = x.id; rerenderSpace(); } },
          h("span", { class: "fn-dot sm", style: `background:${metricColor(metrics, x)}` }), `${x.emoji} ${x.name}`))),
    h("div", { class: "fn-quick-body" },
      valueCtrl,
      hint,
      noteIn,
      h("button", { class: "btn accent fn-save", onclick: save }, icon("check", 16), "Save entry")));
}

/** Fire a full view re-render (used by in-card controls that mutate ui state). */
function rerenderSpace() {
  // Re-dispatch the current hash route; main.js re-renders the view in place.
  dispatchEvent(new HashChangeEvent("hashchange"));
}

/** Entries of these metrics grouped by day, newest first — trainer-app history. */
function historyList(s, sp, metrics, limit = 30) {
  const mById = new Map(metrics.map((m) => [m.id, m]));
  const ents = s.entries
    .filter((e) => mById.has(e.metricId))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.created || "").localeCompare(a.created || ""));
  if (!ents.length)
    return emptyState({ ic: "note", title: "No history yet", hint: "Your logged entries will appear here, grouped by day." });

  const byDay = new Map();
  for (const e of ents) {
    if (!byDay.has(e.date)) byDay.set(e.date, []);
    byDay.get(e.date).push(e);
  }

  return h("div", { class: "fn-card fn-list" },
    [...byDay.entries()].slice(0, limit).map(([date, list]) =>
      h("div", { class: "fn-day" },
        h("div", { class: "fn-day-head" },
          h("b", {}, relDay(date) || fmtDate(date)),
          h("span", { class: "muted small" }, fmtDate(date, { short: true }))),
        list.map((e) => entryRow(e, mById.get(e.metricId), metrics)))));

  function entryRow(e, m, mets) {
    const col = metricColor(mets, m);
    return h("button", { class: "fn-entry", onclick: () => openEntryEditor(m, e) },
      h("span", { class: "fn-dot", style: `background:${col}` }),
      h("span", { class: "fn-e-emoji" }, m.emoji),
      h("div", { class: "fn-e-main" },
        h("span", { class: "fn-e-name" }, m.name),
        e.note && h("span", { class: "fn-e-note" }, e.note)),
      h("span", { class: "fn-e-val" + (metricIsText(m) ? " text" : "") }, fmtEntryVal(m, e.val).slice(0, 60)));
  }
}

/* -------------------------------- CHARTS -------------------------------- */

function renderCharts(body, s, sp, metrics) {
  const numeric = metrics.filter((m) => !metricIsText(m));
  if (!numeric.length) {
    body.append(emptyState({ ic: "chart", title: "No chartable metrics", hint: "Number-style metrics get progress charts. Create one to see trends.", action: { label: "New metric", fn: () => openMetricEditor(null, { spaceId: sp.id }) } }));
    return;
  }
  body.append(
    overviewChartCard(s, sp, metrics, numeric),
    h("div", { class: "section-head", style: "margin-top:22px" }, icon("chart", 16), h("span", {}, "Per metric"),
      h("span", { class: "muted small" }, "each metric in its own color — pick a range")),
    h("div", { class: "fn-chart-grid" }, numeric.map((m) => chartCard(s, metrics, m)))
  );
}

/** One chart with every metric in the space — each line scaled to its own range,
 *  tooltips show the real values. */
function overviewChartCard(s, sp, metrics, numeric) {
  const days = 30;
  const from = addDays(todayKey(), -(days - 1));
  const series = [];
  for (const m of numeric) {
    const st = metricStats(s, m);
    const pts = st.days
      .filter((d) => d >= from)
      .map((d) => ({ date: d, v: st.byDay.get(d), label: fmtDate(d, { short: true }), tip: `${m.emoji} ${m.name} — ${st.fmt(st.byDay.get(d))} · ${fmtDate(d, { short: true })}` }));
    if (pts.length >= 1) series.push({ name: m.name, color: metricColor(metrics, m), points: pts });
  }
  return h("div", { class: "fn-card fn-chart overview" },
    h("div", { class: "fn-chart-head" },
      h("div", { class: "row", style: "gap:8px;align-items:center" },
        h("span", { class: "metric-emoji" }, sp.emoji),
        h("b", { style: "font-size:14.5px" }, `Everything in ${sp.name}`),
        h("span", { class: "muted tiny" }, `last ${days} days`))),
    series.length
      ? h("div", {},
          h("div", { class: "fn-chart-body" }, multiLineChart(series)),
          h("div", { class: "fn-legend", style: "padding:4px 16px 14px" },
            series.map((sr) => h("span", { class: "fn-legend-item" }, h("i", { style: `background:${sr.color}` }), sr.name))))
      : h("div", { class: "chart-empty", style: "padding:14px" }, "Log a few entries and the whole space shows up here"));
}

function chartCard(s, allMetrics, m) {
  const col = metricColor(allMetrics, m);
  const numericParts = metricParts(m).filter((p) => !["text", "custom"].includes(p.kind));
  const partId = numericParts.some((p) => p.id === ui.parts[m.id]) ? ui.parts[m.id] : numericParts[0]?.id;
  const st = metricStats(s, m, partId);
  const part = st.part || metricParts(m)[0];
  const rangeId = ui.ranges[m.id] || "all";
  const range = RANGES.find((r) => r.id === rangeId);
  const from = range.days ? addDays(todayKey(), -range.days) : null;
  const points = st.days
    .filter((d) => !from || d >= from)
    .map((d) => ({ label: fmtDate(d, { short: true }), v: st.byDay.get(d) }));

  const mkRangeBtn = (r) =>
    h("button", { class: "fn-range-btn" + (r.id === rangeId ? " on" : ""), onclick: () => { ui.ranges[m.id] = r.id; rerenderSpace(); } }, r.label);

  const chartType = ui.chartType[m.id] === "bar" ? "bar" : "line";
  const mkTypeBtn = (t, label) =>
    h("button", { class: "fn-range-btn type" + (chartType === t ? " on" : ""), title: `${label} chart`, onclick: () => { ui.chartType[m.id] = t; rerenderSpace(); } }, label);

  const partChips = numericParts.length > 1
    ? h("div", { class: "fn-range fn-part-tabs" },
        numericParts.map((p) =>
          h("button", { class: "fn-range-btn" + (p.id === partId ? " on" : ""), onclick: () => { ui.parts[m.id] = p.id; rerenderSpace(); } },
            p.label || METRIC_TYPES[p.kind]?.label || p.kind)))
    : null;

  const chartEl = chartType === "bar"
    ? barChart(points, { color: col, fmt: (v) => st.fmt(v) })
    : lineChart(points, { color: col, fmt: (v) => st.fmt(v) });

  return h("div", { class: "fn-card fn-chart" , style: `--mc:${col}` },
    h("div", { class: "fn-chart-head" },
      h("div", { class: "row", style: "gap:8px;align-items:center" },
        h("span", { class: "fn-dot", style: `background:${col}` }),
        h("span", { class: "metric-emoji" }, m.emoji),
        h("b", { style: "font-size:14.5px" }, m.name),
        numericParts.length > 1 && h("span", { class: "muted tiny" }, part.label || METRIC_TYPES[part.kind]?.label)),
      h("div", { class: "fn-range" }, mkTypeBtn("line", "Line"), mkTypeBtn("bar", "Bar"), RANGES.map(mkRangeBtn))),
    partChips,
    st.count > 1 && h("div", { class: "fn-stats" },
      h("div", { class: "fn-stat" }, h("span", {}, st.fmt(st.last)), h("label", {}, "latest")),
      h("div", { class: "fn-stat" }, h("span", {}, st.fmt(st.best)), h("label", {}, m.direction === "down" ? "low" : "best")),
      h("div", { class: "fn-stat" }, h("span", {}, st.fmt(Math.round(st.avg * 100) / 100)), h("label", {}, "avg")),
      h("div", { class: "fn-stat" }, h("span", {}, String(st.count)), h("label", {}, "entries"))),
    h("div", { class: "fn-chart-body" }, chartEl),
    h("button", { class: "fn-manage-link", onclick: () => openMetricEditor(m) }, icon("pencil", 12), "edit metric"));
}

/* ------------------------------- CALENDAR ------------------------------- */

function renderCalendar(body, s, sp, metrics) {
  const mIds = new Map(metrics.map((m) => [m.id, m]));
  const perMetricDays = new Map(metrics.map((m) => [m.id, new Set()]));
  const entsByDay = new Map();
  for (const e of s.entries) {
    if (!mIds.has(e.metricId)) continue;
    perMetricDays.get(e.metricId).add(e.date);
    if (!entsByDay.has(e.date)) entsByDay.set(e.date, []);
    entsByDay.get(e.date).push(e);
  }
  if (!metrics.length) {
    body.append(emptyState({ ic: "calendar", title: "Nothing to see yet", hint: "Create a metric and log entries — your days light up here.", action: { label: "New metric", fn: () => openMetricEditor(null, { spaceId: sp.id }) } }));
    return;
  }

  const now = new Date();
  const mk = todayKey().slice(0, 7);
  if (!ui.calMonth) ui.calMonth = mk;
  const [y, mo] = ui.calMonth.split("-").map(Number);
  const first = new Date(y, mo - 1, 1);
  const lead = first.getDay(); // Sun=0
  const daysIn = new Date(y, mo, 0).getDate();

  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(h("span", { class: "fn-cal-cell dim" }));
  for (let d = 1; d <= daysIn; d++) {
    const key = `${ui.calMonth}-${String(d).padStart(2, "0")}`;
    const dots = [];
    let extra = 0;
    for (const m of metrics) {
      if (perMetricDays.get(m.id).has(key)) {
        if (dots.length < 4) dots.push(h("i", { style: `background:${metricColor(metrics, m)}`, title: m.name }));
        else extra++;
      }
    }
    const future = key > todayKey();
    cells.push(
      h("button", {
        class: "fn-cal-cell" + (key === todayKey() ? " today" : "") + (ui.calSel === key ? " sel" : "") + (future ? " future" : ""),
        onclick: () => { ui.calSel = ui.calSel === key ? null : key; rerenderSpace(); },
      },
        h("span", { class: "num" }, String(d)),
        h("span", { class: "fn-cal-dots" }, dots, extra > 0 && h("i", { class: "more", title: `+${extra} more` }))));
  }

  const sel = ui.calSel;
  const selEnts = sel ? entsByDay.get(sel) || [] : null;

  body.append(
    h("div", { class: "section-head" }, icon("calendar", 16), h("span", {}, "History calendar"),
      h("span", { class: "muted small" }, "dots show which metrics you logged that day")),
    h("div", { class: "fn-card fn-cal" },
      h("div", { class: "fn-cal-nav" },
        iconBtn("chevLeft", "Previous month", () => { ui.calMonth = prevMonth(ui.calMonth); rerenderSpace(); }, { size: 16 }),
        h("b", {}, fmtMonthName(ui.calMonth)),
        h("button", { class: "btn ghost sm" + (ui.calMonth === mk ? "" : " pulse"), onclick: () => { ui.calMonth = mk; rerenderSpace(); } }, "today"),
        iconBtn("chevRight", "Next month", () => { ui.calMonth = nextMonth(ui.calMonth); rerenderSpace(); }, { size: 16 })),
      h("div", { class: "fn-cal-grid" },
        ["S", "M", "T", "W", "T", "F", "S"].map((d) => h("span", { class: "fn-cal-dow" }, d)),
        cells)),
    selEnts && h("div", { class: "fn-card fn-day-detail" },
      h("div", { class: "fn-day-head", style: "padding:12px 14px 4px" },
        h("b", {}, relDay(sel) || fmtDate(sel)),
        h("span", { class: "muted small" }, selEnts.length ? `${selEnts.length} entr${selEnts.length === 1 ? "y" : "ies"}` : "no entries")),
      selEnts.length
        ? selEnts.map((e) => {
            const m = mIds.get(e.metricId);
            return h("button", { class: "fn-entry", onclick: () => openEntryEditor(m, e) },
              h("span", { class: "fn-dot", style: `background:${metricColor(metrics, m)}` }),
              h("span", { class: "fn-e-emoji" }, m.emoji),
              h("div", { class: "fn-e-main" }, h("span", { class: "fn-e-name" }, m.name), e.note && h("span", { class: "fn-e-note" }, e.note)),
              h("span", { class: "fn-e-val" + (metricIsText(m) ? " text" : "") }, fmtEntryVal(m, e.val).slice(0, 60)));
          })
        : h("p", { class: "muted small", style: "padding:0 14px 12px" }, "Nothing logged this day.")),
    h("div", { class: "fn-legend muted tiny" },
      metrics.slice(0, 8).map((m) => h("span", { class: "fn-legend-item" }, h("i", { style: `background:${metricColor(metrics, m)}` }), `${m.emoji} ${m.name}`)))
  );
}

const prevMonth = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
const nextMonth = (ym) => { const [y, m] = ym.split("-").map(Number); return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`; };
const fmtMonthName = (ym) => { const [y, m] = ym.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" }); };

/* --------------------------- GOALS & LINKS ------------------------------ */

function renderGoals(body, s, sp, goals) {
  body.append(
    h("div", { class: "section-head" }, icon("target", 16), h("span", {}, "Goals"), h("div", { class: "grow" }), btn("New goal", { kind: "ghost", ic: "plus", onclick: () => openGoalEditor(null, { spaceId: sp.id }) })),
    goals.length ? h("div", { class: "goal-list" }, goals.map((g) => goalCardBig(g, s))) : emptyState({ ic: "target", title: "No goals in this space yet", hint: "A goal turns your metrics into a story." })
  );
}
