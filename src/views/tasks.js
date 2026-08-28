/* ASTER — Tasks view: due dates, priorities, recurrence, gentle completing. */

import { h, clear, fuzzy, todayKey, addDays, relDay, isPast, fmtDate, fmtTime, advanceDue } from "../utils.js";
import { icon } from "../icons.js";
import { getState, update } from "../store.js";
import { btn, chip, iconBtn, toast, emptyState, colorHex, confirmDialog } from "../components.js";
import { openTaskEditor, deleteEntity } from "../editors.js";
import { uid } from "../utils.js";

const ui = { q: "", tab: "all", showDone: false };

/** Complete / un-complete a task. Recurring tasks roll to their next date. */
export function toggleTask(id) {
  const t = getState().tasks.find((x) => x.id === id);
  if (!t) return;
  let next = null;
  update((d) => {
    const task = d.tasks.find((x) => x.id === id);
    if (!task.done && task.recurrence && task.due) {
      task.history.push({ at: new Date().toISOString(), on: task.due });
      next = advanceDue(task.due, task.recurrence);
      task.due = next;
      task.done = false;
    } else if (!task.done) {
      task.done = true;
      task.doneAt = new Date().toISOString();
    } else {
      task.done = false;
      task.doneAt = null;
    }
  });
  if (next) toast({ title: "Done! ✅", body: `Next up ${relDay(next).toLowerCase()} — ${fmtDate(next, { weekday: true })}`, ic: "repeat", timeout: 3400 });
}

/** Play the tick animation, then complete — so the check visibly pops
 *  before the row re-renders and settles below. */
export function completeTask(id, boxEl) {
  if (boxEl) {
    boxEl.classList.add("just-checked");
    const row = boxEl.closest(".task-row, .w-task");
    if (row) row.classList.add("completing");
  }
  setTimeout(() => toggleTask(id), 380);
}

const PRIO = {
  high: { label: "High", color: "var(--c-coral)" },
  med: { label: "Normal", color: "var(--c-honey)" },
  low: { label: "Low", color: "var(--c-mint)" },
};

function taskRow(t, s) {
  const space2 = t.spaceId && s.spaces.find((x) => x.id === t.spaceId);
  const overdue = !t.done && isPast(t.due) && t.due !== todayKey();
  const cb = h("input", { type: "checkbox", checked: t.done });
  cb.addEventListener("change", (ev) => {
    if (!t.done) { ev.preventDefault(); cb.checked = false; completeTask(t.id, cb.parentElement.querySelector(".task-check-box")); }
    else toggleTask(t.id);
  });
  const subs = t.subtasks || [];
  const subToggle = (sid) => update((d) => {
    const task = d.tasks.find((x) => x.id === t.id);
    const sub = task?.subtasks?.find((x) => x.id === sid);
    if (sub) sub.done = !sub.done;
  });
  return h(
    "div",
    { class: "task-row" + (t.done ? " done" : "") },
    h("label", { class: "task-check" }, cb, h("span", { class: "task-check-box" }, icon("check", 13))),
    h("div", { class: "task-main", onclick: () => openTaskEditor(t) },
      h("div", { class: "task-title" }, t.title),
      subs.length > 0 && h("div", { class: "subtask-list" },
        chip(`${subs.filter((x) => x.done).length}/${subs.length} steps`, { ic: "list" }),
        subs.map((x) =>
          h("label", { class: "subtask" + (x.done ? " done" : "") },
            h("input", { type: "checkbox", checked: x.done, onclick: (e) => { e.stopPropagation(); subToggle(x.id); } }),
            h("span", {}, x.name)))),
      h("div", { class: "task-chips" },
        t.due && chip(relDay(t.due), { ic: "calendar", color: overdue ? "var(--c-coral)" : t.due === todayKey() ? "var(--accent)" : undefined, title: fmtDate(t.due, { weekday: true }) }),
        t.time && chip(fmtTime(t.time), { ic: "clock" }),
        t.priority === "high" && chip(PRIO.high.label, { ic: "flag", color: PRIO.high.color }),
        t.priority === "low" && chip(PRIO.low.label, { ic: "flag" }),
        t.recurrence && t.recurrence !== "none" && chip({ daily: "Daily", weekly: "Weekly", biweekly: "2 weeks", monthly: "Monthly" }[t.recurrence] || "repeats", { ic: "repeat" }),
        space2 && chip(space2.name, { ic: "rocket", color: colorHex(space2.color) }),
        t.tags.map((tag) => chip("#" + tag, { ic: "tag" })))),
    iconBtn("pencil", "Edit", () => openTaskEditor(t), { cls: "row-edit" }),
    h("button", { class: "icon-btn danger quick-x", title: "Delete task", onclick: async (e) => {
      e.stopPropagation();
      if (await confirmDialog(`Delete "${t.title}"?`)) update((d) => deleteEntity(d, t.id));
    } }, icon("x", 15))
  );
}

function section(title, tasks, s, { count, icon: ic = "calendar" } = {}) {
  if (!tasks.length) return null;
  return h(
    "section",
    { class: "task-section" },
    h("div", { class: "section-head" }, icon(ic, 16), h("span", {}, title), h("span", { class: "count-pill" }, tasks.length)),
    tasks.map((t) => taskRow(t, s))
  );
}

export function renderTasks(root) {
  const s = getState();
  root.append(
    h("div", { class: "page-head" },
      h("div", {},
        h("h1", {}, "Tasks"),
        h("p", { class: "subtitle" }, "Small steps, gently nudged.")),
      h("div", { class: "head-actions" }, btn("New task", { kind: "accent", ic: "plus", onclick: () => openTaskEditor() })))
  );

  const quick = h("input", { class: "inp quick-add", placeholder: "＋ Quick add a task…" });
  const list = h("div", { class: "task-list" });
  const tabs = ["all", "today", "upcoming", "done"];

  const refresh = () => {
    clear(list);
    const st = getState();
    const q = ui.q;
    let ts = st.tasks.filter((t) => fuzzy(q, t.title, t.notes, t.tags.join(" ")));
    const today = todayKey();
    const open = ts.filter((t) => !t.done);
    const overdue = open.filter((t) => t.due && t.due < today);
    const todayTs = open.filter((t) => t.due === today);
    const upcoming = open.filter((t) => t.due && t.due > today).sort((a, b) => a.due.localeCompare(b.due));
    const someday = open.filter((t) => !t.due);
    const doneTs = ts.filter((t) => t.done).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));

    if (ui.tab === "today") {
      list.append(...[section("Overdue", overdue, st, { icon: "flag" }), section("Today", todayTs, st, { icon: "sun" })].filter(Boolean));
      if (!overdue.length && !todayTs.length) list.append(emptyState({ ic: "checkCircle", title: "All clear for today 🌤️", hint: "Nothing due — enjoy or plan ahead." }));
    } else if (ui.tab === "upcoming") {
      const groups = new Map();
      for (const t of upcoming) {
        const g = relDay(t.due).startsWith("in") || ["Tomorrow"].includes(relDay(t.due)) ? relDay(t.due) : fmtDate(t.due, { short: true });
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(t);
      }
      if (!groups.size) list.append(emptyState({ ic: "calendar", title: "Nothing upcoming", hint: "Your future is free as a bird." }));
      for (const [g, arr] of groups) list.append(section(g, arr, st));
    } else if (ui.tab === "done") {
      list.append(section("Completed", doneTs.slice(0, 60), st, { icon: "checkCircle" }));
      if (!doneTs.length) list.append(emptyState({ ic: "spark", title: "No completed tasks yet", hint: "Check something off — it feels great." }));
    } else {
      list.append(...[
        section("Overdue", overdue, st, { icon: "flag" }),
        section("Today", todayTs, st, { icon: "sun" }),
        section("Upcoming", upcoming.slice(0, 12), st),
        section("Someday", someday, st, { icon: "moon" }),
      ].filter(Boolean));
      if (ui.showDone && doneTs.length) list.append(section("Completed", doneTs.slice(0, 40), st, { icon: "checkCircle" }));
      if (!overdue.length && !todayTs.length && !upcoming.length && !someday.length)
        list.append(emptyState({ ic: "spark", title: "No tasks here", hint: "Add one above, or from any Space." }));
    }
  };

  quick.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && quick.value.trim()) {
      const title = quick.value.trim();
      quick.value = "";
      let id;
      update((d) => {
        id = uid();
        d.tasks.unshift({ id, title, notes: "", due: todayKey(), time: null, priority: "med", recurrence: null, remind: false, spaceId: null, tags: [], done: false, doneAt: null, history: [], created: new Date().toISOString() });
      });
      toast({ title: "Task added ✅", body: title, ic: "check", timeout: 2600, actions: [{ label: "Edit", fn: () => openTaskEditor(getState().tasks.find((x) => x.id === id)) }] });
    }
  });
  quick.addEventListener("input", () => { ui.q = quick.value; refresh(); });

  root.append(
    h("div", { class: "toolbar" },
      quick,
      h("div", { class: "seg" }, tabs.map((t) =>
        h("button", { class: "seg-btn" + (ui.tab === t ? " on" : ""), onclick: () => { ui.tab = t; renderTabs(); refresh(); } },
          { all: "All", today: "Today", upcoming: "Upcoming", done: "Done" }[t]))),
      ui.tab === "all" && h("button", { class: "seg-btn" + (ui.showDone ? " on" : ""), onclick: () => { ui.showDone = !ui.showDone; renderTabs(); refresh(); } }, icon("checkCircle", 14), "Completed"))
  );
  const toolbar = root.lastChild;
  function renderTabs() {
    clear(toolbar);
    toolbar.append(quick,
      h("div", { class: "seg" }, tabs.map((t) =>
        h("button", { class: "seg-btn" + (ui.tab === t ? " on" : ""), onclick: () => { ui.tab = t; renderTabs(); refresh(); } },
          { all: "All", today: "Today", upcoming: "Upcoming", done: "Done" }[t]))),
      ui.tab === "all" ? h("button", { class: "seg-btn" + (ui.showDone ? " on" : ""), onclick: () => { ui.showDone = !ui.showDone; renderTabs(); refresh(); } }, icon("checkCircle", 14), "Completed") : null);
  }

  root.append(list);
  refresh();
}
