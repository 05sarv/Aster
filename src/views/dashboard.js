/* ASTER — Dashboard: your customizable home. Drag widgets around in edit mode. */

import { h, clear, todayKey, toKey, addDays, greeting, fmtDate, fmtTime, relDay, fuzzy, uid, fmtVal, hashColor } from "../utils.js";
import { icon } from "../icons.js";
import { getState, update } from "../store.js";
import { btn, chip, iconBtn, popover, toast, emptyState, colorHex, modal, emojiPicker, emojiSpan } from "../components.js";
import { openMemoryDetail, openTaskEditor, openEntryEditor, openMetricDetail, openGoalDetail, openMemoryEditor, openSpaceEditor, openMetricPicker, openReminderEditor } from "../editors.js";
import { sparkline, ring } from "../charts.js";
import { metricStats, goalProgress } from "../logic.js";
import { toggleTask, completeTask } from "./tasks.js";

const ui = { edit: false };
const COZY = [
  "Small steps still step.",
  "Future you says thanks.",
  "Collect the little joys ✦",
  "Progress lives in repetition.",
  "You're building something good.",
  "Rest is productive too.",
  "One thing at a time.",
  "Look how far you've come.",
];

/* widget sizes: 1 small (pairs up, even on phone) · 2 normal (default) */
const sizeOf = (w) => (w?.size === 1 ? 1 : 2);

function widgetShell(w, editMode, inner, { onRemove, onSettings } = {}) {
  const shell = h("section", { class: "widget" + (sizeOf(w) === 1 ? " size-1" : ""), "data-wid": w.id },
    editMode && h("div", { class: "widget-tools" },
      h("span", { class: "widget-grip", title: "Drag to rearrange" }, icon("grip", 16)),
      onSettings && iconBtn("sliders", "Widget settings", () => onSettings(shell), { cls: "widget-settings", size: 15 }),
      iconBtn("x", "Remove widget", onRemove || (() => {}), { cls: "widget-remove" })),
    inner);
  return shell;
}

/* ---------------- widgets ---------------- */

function wGreeting(s) {
  const today = todayKey();
  const openToday = s.tasks.filter((t) => !t.done && t.due && t.due <= today).length;
  const line = COZY[hashColor(today) % COZY.length];
  return h("div", { class: "w-greeting" },
    h("div", {},
      h("h2", {}, `${greeting()}${s.settings.name ? ", " + s.settings.name : ""} ✦`),
      h("p", { class: "muted" }, fmtDate(today, { weekday: true }) + " · " + line)),
    h("div", { class: "w-greeting-stats" },
      h("button", { class: "gstat", onclick: () => (location.hash = "#/tasks") }, h("b", {}, String(openToday)), h("span", {}, "tasks due")),
      h("button", { class: "gstat", onclick: () => (location.hash = "#/memories") }, h("b", {}, String(s.memories.length)), h("span", {}, "memories")),
      h("button", { class: "gstat", onclick: () => (location.hash = "#/spaces") }, h("b", {}, String(s.spaces.length)), h("span", {}, "spaces"))));
}

function wTasksToday(s) {
  const today = todayKey();
  const overdue = s.tasks.filter((t) => !t.done && t.due && t.due < today);
  const todayTs = s.tasks.filter((t) => !t.done && t.due === today);
  /* anything checked off today counts as done-today, whatever it was due
     (doneAt is UTC — compare in local time or the dates drift) */
  const doneToday = s.tasks.filter((t) => t.done && t.doneAt && toKey(new Date(t.doneAt)) === today);
  const rows = [...overdue.slice(0, 2), ...todayTs].slice(0, 6);
  const mkRow = (t) => {
    const cb = h("input", { type: "checkbox", checked: false });
    cb.addEventListener("change", (ev) => { ev.preventDefault(); cb.checked = false; completeTask(t.id, cb.parentElement.querySelector(".task-check-box")); });
    const subs = t.subtasks || [];
    return h("div", { class: "w-task" + (t.due < today ? " overdue" : "") },
      h("label", { class: "task-check sm" }, cb, h("span", { class: "task-check-box" }, icon("check", 11))),
      h("span", { class: "w-task-title", onclick: () => openTaskEditor(t) }, t.title),
      subs.length > 0 && h("span", { class: "muted tiny", style: "flex:none" }, `${subs.filter((x) => x.done).length}/${subs.length}`),
      t.priority === "high" && h("span", { class: "prio-dot high", title: "High priority" }));
  };
  const inner = h("div", { class: "w-list" },
    h("div", { class: "widget-title" }, icon("sun", 15), "Today"),
    rows.length
      ? rows.map(mkRow)
      : doneToday.length
        ? h("div", { class: "w-done-sep" }, `all done — ${doneToday.length} finished today ✨`)
        : h("div", { class: "w-allclear" }, "✨ All clear for today"),
    doneToday.length > 0 && rows.length > 0 && h("div", { class: "w-done-sep" }, "done today"),
    doneToday.slice(0, rows.length ? 3 : 6).map((t) =>
      h("div", { class: "w-task done", onclick: () => openTaskEditor(t) },
        h("span", { class: "task-check-box on sm", onclick: (e) => { e.stopPropagation(); toggleTask(t.id); } }, icon("check", 11)),
        h("span", { class: "w-task-title" }, t.title))),
    overdue.length > 2 && h("div", { class: "muted small" }, `+${overdue.length - 2} overdue`));
  return inner;
}

function wUpcoming(s) {
  const today = todayKey();
  /* one agenda: future tasks, upcoming reminders, goal deadlines */
  const items = [];
  for (const t of s.tasks) if (!t.done && t.due && t.due > today) items.push({ date: t.due, time: "", title: t.title, open: () => openTaskEditor(t) });
  for (const r of s.reminders || []) if (!r.done && r.date && r.date >= today) items.push({ date: r.date, time: r.time || "", title: r.title, open: () => openReminderEditor(r), rem: true });
  for (const g of s.goals) if (!g.done && g.deadline && g.deadline > today) items.push({ date: g.deadline, time: "", title: g.name, open: () => openGoalDetail(g) });
  items.sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || ""));
  const next = items.slice(0, 6);
  return h("div", { class: "w-list" },
    h("div", { class: "widget-title" }, icon("calendar", 15), "Coming up"),
    next.length
      ? next.map((it) => h("div", { class: "w-task", onclick: it.open },
          h("span", { class: "w-when" }, it.rem && it.date === today && it.time ? fmtTime(it.time) : relDay(it.date)),
          h("span", { class: "w-task-title" }, it.title)))
      : h("div", { class: "w-allclear" }, "Nothing scheduled — free as a bird 🐦"));
}

function wMemories(s) {
  const ms = [...s.memories].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  return h("div", { class: "w-list" },
    h("div", { class: "widget-title" }, icon("spark", 15), "Recent memories"),
    ms.length
      ? ms.map((m) => h("button", { class: "w-mem", onclick: () => openMemoryDetail(m) },
          h("span", { class: "w-mem-emoji" }, m.emoji || (m.kind === "person" ? "🙂" : m.kind === "place" ? "📍" : "✨")),
          h("span", { class: "w-mem-tx" }, h("b", {}, m.title), h("span", { class: "muted small" }, fmtDate(m.date, { short: true })))))
      : h("div", { class: "w-allclear" }, h("button", { class: "btn ghost sm", onclick: () => openMemoryEditor() }, icon("plus", 14), "Save a memory")));
}

function wThrowback(s) {
  const today = todayKey();
  const md = today.slice(5);
  const sameDay = s.memories.filter((m) => m.date.slice(5) === md && m.date < today);
  const old = sameDay.length ? sameDay : s.memories.filter((m) => m.date <= addDays(today, -90));
  const m = old[hashColor(today) % Math.max(1, old.length)];
  return h("div", { class: "w-list" },
    h("div", { class: "widget-title" }, icon("clock", 15), sameDay.length ? "On this day" : "A little throwback"),
    m
      ? h("button", { class: "w-mem throw", onclick: () => openMemoryDetail(m) },
          h("span", { class: "w-mem-emoji" }, m.emoji || "✨"),
          h("span", { class: "w-mem-tx" }, h("b", {}, m.title), h("span", { class: "muted small" }, fmtDate(m.date))))
      : h("div", { class: "w-allclear" }, "Keep saving memories — throwbacks appear here 🕰️"));
}

function wMetric(s, cfg) {
  const m = s.metrics.find((x) => x.id === cfg.id);
  if (!m) return h("div", { class: "w-list" }, h("div", { class: "widget-title" }, "Metric"), h("div", { class: "muted small" }, "Metric was deleted"));
  const st = metricStats(s, m);
  return h("div", { class: "w-list" },
    h("div", { class: "widget-title" }, icon("chart", 15), m.name, h("a", { class: "link", onclick: () => openMetricDetail(m) }, "→")),
    h("div", { class: "w-metric-val" }, st.last != null ? st.fmt(st.last) : "—"),
    st.vals.length > 1 && h("div", { class: "metric-spark" }, sparkline(st.vals.slice(-14))),
    h("div", { class: "row space-between" },
      st.streak > 1 ? h("span", { class: "streak" }, icon("flame", 13), st.streak) : h("span", { class: "muted small" }, `${st.count} entries`),
      h("button", { class: "btn ghost sm", onclick: () => openEntryEditor(m) }, icon("plus", 13), "Log")));
}

function wGoal(s, cfg) {
  const g = s.goals.find((x) => x.id === cfg.id);
  if (!g) return h("div", { class: "w-list" }, h("div", { class: "widget-title" }, "Goal"), h("div", { class: "muted small" }, "Goal was deleted"));
  const p = goalProgress(s, g);
  return h("button", { class: "w-list left", onclick: () => openGoalDetail(g) },
    h("div", { class: "widget-title" }, icon("target", 15), g.name),
    h("div", { class: "w-goal-row" },
      ring(p.pct, { size: 54, stroke: 6, label: Math.round(p.pct) + "%" }),
      h("div", { class: "w-goal-tx" },
        p.metric ? h("span", {}, `${p.fmt(p.current)} / ${p.fmt(p.target)}`) : h("span", {}, g.milestones?.length ? `${g.milestones.filter((x) => x.done).length}/${g.milestones.length} milestones` : `${Math.round(p.pct)}%`),
        g.deadline && h("span", { class: "muted small" }, `due ${relDay(g.deadline)}`))));
}

function wSpace(s, cfg) {
  const sp = s.spaces.find((x) => x.id === cfg.id);
  if (!sp) return h("div", { class: "w-list" }, h("div", { class: "widget-title" }, "Space"), h("div", { class: "muted small" }, "Space was deleted"));
  const metrics = s.metrics.filter((m) => m.spaceId === sp.id);
  const best = metrics.map((m) => metricStats(s, m)).reduce((a, b) => (b.streak > (a?.streak || 0) ? b : a), null);
  return h("div", { class: "w-list", style: `--sp:${colorHex(sp.color)}` },
    h("div", { class: "widget-title" }, h("span", {}, sp.emoji), sp.name, h("a", { class: "link", href: `#/space/${sp.id}` }, "Open →")),
    best?.streak > 1 && h("div", { class: "streak", style: "margin-bottom:6px" }, icon("flame", 13), `${best.streak}-day streak`),
    metrics.length
      ? h("div", { class: "w-space-quick" }, metrics.slice(0, 4).map((m) =>
          h("button", { class: "quick-log", title: `Log ${m.name}`, onclick: () => openEntryEditor(m) }, `${m.emoji} +`)))
      : h("div", { class: "muted small" }, "No metrics yet"));
}

/** Custom note widget: your own title, emoji and text. Edit via ⚙ in Customize mode. */
function wNote(s, cfg) {
  cfg = cfg || {};
  return h("div", { class: "w-list" },
    h("div", { class: "widget-title" }, cfg.emoji || "📝", cfg.title || "My note"),
    h("p", { class: "w-note-text" }, cfg.text || "Tap Customize → ⚙ to write anything here — a plan, an affirmation, a shopping list…"));
}

const REGISTRY = {
  note: { label: "Custom note", render: wNote, defSize: 2 },
  greeting: { label: "Hello card", render: wGreeting, defSize: 2 },
  tasksToday: { label: "Today's tasks", render: wTasksToday, defSize: 2 },
  upcoming: { label: "Coming up", render: wUpcoming, defSize: 2 },
  memories: { label: "Recent memories", render: wMemories, defSize: 2 },
  throwback: { label: "Throwback", render: wThrowback, defSize: 2 },
  metric: { label: "Metric", render: wMetric, defSize: 2, pick: "metric" },
  goal: { label: "Goal", render: wGoal, defSize: 2, pick: "goal" },
  space: { label: "Space", render: wSpace, defSize: 2, pick: "space" },
};

/* ---------------- dashboard ---------------- */

export function renderDashboard(root) {
  const removeWidget = (w) => {
    const idx = getState().widgets.findIndex((x) => x.id === w.id);
    update((d) => d.widgets.splice(idx, 1));
    toast({ title: "Widget removed", ic: "sliders", timeout: 3200, actions: [{ label: "Undo", fn: () => update((d) => d.widgets.splice(Math.min(idx, d.widgets.length), 0, w)) }] });
  };

  const addMenu = (anchor) => {
    const mk = (type) => h("button", { class: "menu-item", onclick: () => {
        document.querySelectorAll(".popover").forEach((p) => p.remove());
        if (type === "note") return addNoteWidget();
        addWidget(type);
      } }, icon("plus", 15), def2Label(type));
    const pick = (type) => h("button", { class: "menu-item", onclick: () => {
        document.querySelectorAll(".popover").forEach((p) => p.remove());
        openPicker(type);
      } }, icon("plus", 15), def2Label(type) + "…");
    popover(anchor, h("div", {},
      mk("note"),
      h("div", { class: "menu-sep" }),
      ["greeting", "tasksToday", "upcoming", "memories", "throwback"].map(mk),
      h("div", { class: "menu-sep" }),
      ["metric", "goal", "space"].map(pick)), { width: 220 });
  };
  const def2Label = (t) => REGISTRY[t].label;

  const addWidget = (type, cfg = {}) =>
    update((d) => d.widgets.push({ id: uid(), type, cfg, size: REGISTRY[type].defSize }));

  const openPicker = (kind, existing = null) => {
    const st = getState();
    // picked → swap this widget's source, or add a new widget
    const apply = (cfg) =>
      existing
        ? update((d) => { const x = d.widgets.find((y) => y.id === existing.id); if (x) x.cfg = cfg; })
        : addWidget(kind, cfg);
    if (kind === "metric") {
      if (!st.metrics.length) return toast({ title: "No metrics yet", body: "Create one in a Space first 🌱", ic: "info" });
      return openMetricPicker((m) => apply({ id: m.id }));
    }
    if (kind === "goal") {
      if (!st.goals.length) return toast({ title: "No goals yet", body: "Create one in Progress first 🎯", ic: "info" });
      return modal({ title: "Pick a goal", body: h("div", { class: "link-list" }, st.goals.map((g) =>
        h("button", { class: "link-row", onclick: () => { document.querySelectorAll(".overlay").forEach((o) => o.remove()); apply({ id: g.id }); } },
          h("span", { class: "emoji-badge sm" }, g.emoji || "🎯"), g.name))) });
    }
    if (!st.spaces.length) return toast({ title: "No spaces yet", body: "Create one first 🚀", ic: "info" });
    modal({ title: "Pick a space", body: h("div", { class: "link-list" }, st.spaces.map((sp) =>
      h("button", { class: "link-row", onclick: () => { document.querySelectorAll(".overlay").forEach((o) => o.remove()); apply({ id: sp.id }); } },
        h("span", { class: "emoji-badge sm" }, sp.emoji), sp.name))) });
  };

  /* per-widget settings popover (edit mode): resize (within limits) + change source / edit note */
  const widgetMenu = (anchor, w) => {
    const def = REGISTRY[w.type];
    const labels = { 1: "Small", 2: "Normal" };
    const cur = sizeOf(w);
    const bubble = h("span", { class: "range-val" }, labels[cur]);
    const r = h("input", { type: "range", min: 1, max: 2, step: 1, value: cur, class: "range" });
    r.addEventListener("input", () => {
      bubble.textContent = labels[r.value];
      update((d) => { const x = d.widgets.find((y) => y.id === w.id); if (x) x.size = Number(r.value); });
    });
    popover(anchor, h("div", { class: "w-menu" },
      h("div", { class: "field-label" }, "Size"),
      h("div", { class: "row" }, r, bubble),
      (def.pick || w.type === "note") && h("div", { class: "menu-sep" }),
      w.type === "note" && h("button", { class: "menu-item", onclick: () => { closePopover(); editNoteWidget(w); } }, icon("pencil", 15), "Edit note…"),
      def.pick && h("button", { class: "menu-item", onclick: () => { closePopover(); openPicker(def.pick, w); } },
        icon("repeat", 15), `Change ${def.label.toLowerCase()}…`)), { width: 230 });
  };
  const closePopover = () => document.querySelectorAll(".popover").forEach((p) => p.remove());

  const addNoteWidget = () => {
    const w = { id: uid(), type: "note", cfg: { emoji: "📝", title: "My note", text: "" }, size: 2 };
    update((d) => d.widgets.push(w));
    editNoteWidget(w);
  };

  const editNoteWidget = (w) => {
    const st = getState();
    const cur = st.widgets.find((x) => x.id === w.id)?.cfg || {};
    const draft = { emoji: cur.emoji || "📝", title: cur.title || "", text: cur.text || "" };
    const emojiBtn = h("button", { type: "button", class: "emoji-badge", onclick: (e) => emojiPicker(e.currentTarget, draft.emoji, (em) => { draft.emoji = em; emojiBtn.replaceChildren(emojiSpan(em)); }) }, emojiSpan(draft.emoji));
    const titleInp = h("input", { class: "inp", placeholder: "Note title…", value: draft.title });
    titleInp.addEventListener("input", () => (draft.title = titleInp.value));
    const textArea = h("textarea", { class: "inp", rows: 5, placeholder: "Write anything — a plan, an idea, a list…", style: "resize:vertical" }, draft.text);
    textArea.addEventListener("input", () => (draft.text = textArea.value));
    let md;
    md = modal({
      title: "Custom note",
      body: h("div", { class: "form" },
        h("div", { class: "row", style: "align-items:center;gap:10px" }, emojiBtn, titleInp),
        textArea),
      footer: [
        h("div", { class: "grow" }),
        btn("Cancel", { onclick: () => md.close() }),
        btn("Save", { kind: "accent", onclick: () => {
          update((d) => { const x = d.widgets.find((y) => y.id === w.id); if (x) x.cfg = { emoji: draft.emoji, title: draft.title.trim() || "My note", text: draft.text }; });
          md.close();
        } }),
      ],
    });
  };

  function build() {
    clear(root);
    const s = getState();
    const grid = h("div", { class: "widget-grid" + (ui.edit ? " editing" : "") });
    for (const w of s.widgets) {
      const def = REGISTRY[w.type];
      if (!def) continue;
      const inner = def.render(s, w.cfg || {});
      grid.append(widgetShell(w, ui.edit, inner, {
        onRemove: () => removeWidget(w),
        onSettings: (anchor) => widgetMenu(anchor, w),
      }));
    }
    const editBtn = h("button", { class: "btn" + (ui.edit ? " accent" : ""), onclick: () => {
        ui.edit = !ui.edit;
        build();
        if (!ui.edit) toast({ title: "Layout saved ✦", ic: "sliders", timeout: 2200 });
      } }, icon("sliders", 16), ui.edit ? "Done" : "Customize");
    root.append(
      h("div", { class: "page-head" },
        h("div", {}, h("p", { class: "subtitle", style: "margin:0" }, "Your cozy home base")),
        h("div", { class: "head-actions" }, ui.edit && h("span", { class: "muted small" }, "drag to arrange · ⚙ to resize"), editBtn,
          h("button", { class: "btn", onclick: (e) => addMenu(e.currentTarget) }, icon("plus", 16), "Add widget"))),
      grid
    );
    if (ui.edit) enableDrag(grid);
  }
  build();
}

/* pointer-based drag reordering of widgets (edit mode) */
function enableDrag(grid) {
  if (grid._dragEnabled) return;
  grid._dragEnabled = true;
  grid.addEventListener("pointerdown", (ev) => {
    const grip = ev.target.closest(".widget-grip");
    if (!grip) return;
    const shell = grip.closest(".widget");
    ev.preventDefault();
    const wids = [...grid.querySelectorAll(".widget")].map((el) => el.dataset.wid);
    const rect = shell.getBoundingClientRect();
    const ghost = shell.cloneNode(true);
    ghost.className = "widget ghost" + (shell.classList.contains("size-1") ? " size-1" : "");
    Object.assign(ghost.style, { width: rect.width + "px", height: rect.height + "px", left: rect.left + "px", top: rect.top + "px" });
    document.body.append(ghost);
    shell.classList.add("dragging");
    const ph = h("div", { class: "widget placeholder" + (shell.classList.contains("size-1") ? " size-1" : "") });
    let placed = false;
    const move = (e) => {
      ghost.style.left = e.clientX - rect.width / 2 + "px";
      ghost.style.top = e.clientY - 24 + "px";
      const els = [...grid.querySelectorAll(".widget:not(.dragging):not(.placeholder)")];
      let before = null;
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (e.clientY < r.top + r.height / 2) { before = el; break; }
      }
      if (before) grid.insertBefore(ph, before);
      else grid.append(ph);
      placed = true;
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      ghost.remove();
      shell.classList.remove("dragging");
      if (!placed) { ph.remove(); return; }
      const newOrderIds = [...grid.querySelectorAll(".widget")]
        .filter((el) => !el.classList.contains("dragging"))
        .map((el) => el.dataset.wid)
        .filter(Boolean);
      const draggedId = shell.dataset.wid;
      const phIdx = [...grid.children].indexOf(ph);
      ph.remove();
      // rebuild order: insert dragged id at phIdx position among others
      const others = newOrderIds.filter((id) => id !== draggedId);
      others.splice(Math.min(phIdx, others.length), 0, draggedId);
      const s = getState();
      const map = new Map(s.widgets.map((w) => [w.id, w]));
      const reordered = others.map((id) => map.get(id)).filter(Boolean);
      for (const w of s.widgets) if (!others.includes(w.id)) reordered.push(w);
      update((d) => (d.widgets = reordered));
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });
}
