/* ASTER — Reminders view: time-based nudges, their own thing (separate from tasks). */

import { h, todayKey, addDays, fmtDate, fmtTime, relDay, nowHM } from "../utils.js";
import { icon } from "../icons.js";
import { getState, update } from "../store.js";
import { btn, chip, emptyState, confirmDialog } from "../components.js";
import { openReminderEditor, toggleReminder } from "../editors.js";

const ui = { filter: "active" };

const REPEAT_LABEL = { daily: "daily", weekly: "weekly", biweekly: "2 weeks", monthly: "monthly" };

export function renderReminders(root) {
  const s = getState();
  const today = todayKey();
  const now = nowHM();

  const active = s.reminders.filter((r) => !r.done).sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  const done = s.reminders.filter((r) => r.done).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));
  const list = ui.filter === "done" ? done : active;

  const overdue = active.filter((r) => r.date < today);
  const todays = active.filter((r) => r.date === today);
  const tomorrow = active.filter((r) => r.date === addDays(today, 1));
  const later = active.filter((r) => r.date > addDays(today, 1));

  const row = (r, { late = false } = {}) =>
    h("div", { class: "rem-row" + (late ? " late" : "") },
      h("button", {
        class: "gms-check" + (r.done ? " on" : ""),
        title: r.repeat && r.repeat !== "none" ? `Done — repeats ${REPEAT_LABEL[r.repeat]}` : "Done",
        onclick: () => toggleReminder(r.id),
      }, icon("check", 13)),
      h("span", { class: "rem-title", onclick: () => openReminderEditor(r), title: "Edit" }, r.title),
      r.repeat && r.repeat !== "none" && icon("repeat", 13),
      chip(
        r.date === today && r.time ? fmtTime(r.time) : r.time ? `${fmtDate(r.date, { short: true })} · ${fmtTime(r.time)}` : fmtDate(r.date, { short: true }),
        { ic: late ? "flame" : "bell", color: late ? "var(--c-coral)" : undefined }
      ),
      h("button", { class: "icon-btn danger quick-x", title: "Delete reminder", onclick: async (e) => {
        e.stopPropagation();
        if (await confirmDialog(`Delete "${r.title}"?`)) update((d) => (d.reminders = d.reminders.filter((x) => x.id !== r.id)));
      } }, icon("x", 15)));

  const section = (title, items, { ic = "calendar", late = false } = {}) =>
    items.length
      ? h("div", { class: "rem-section" },
          h("div", { class: "section-head" }, icon(ic, 16), h("span", {}, `${title} (${items.length})`)),
          h("div", { class: "fn-card fn-list" }, items.map((r) => row(r, { late }))))
      : null;

  root.append(
    h("div", { class: "page-head" },
      h("div", {},
        h("h1", {}, "Reminders"),
        h("p", { class: "subtitle" },
          overdue.length ? `${overdue.length} past due · ${todays.length} today` : todays.length ? `${todays.length} today ⏰` : "Time-based nudges — separate from tasks")),
      h("div", { class: "head-actions" }, btn("New reminder", { kind: "accent", ic: "bell", onclick: () => openReminderEditor() }))),

    s.reminders.length || ui.filter === "done"
      ? h("div", { class: "seg", style: "margin-bottom:16px" },
          ["active", "done"].map((f) =>
            h("button", { class: "seg-btn" + (ui.filter === f ? " on" : ""), onclick: () => { ui.filter = f; dispatchEvent(new HashChangeEvent("hashchange")); } },
              f === "active" ? `Active (${active.length})` : `Done (${done.length})`)))
      : null,

    ui.filter === "active"
      ? h("div", {},
          section("Past due", overdue, { ic: "flame", late: true }),
          section("Today", todays.map((r) => r).sort((a, b) => (a.time || "99").localeCompare(b.time || "99")), { ic: "sun", late: true }),
          section("Tomorrow", tomorrow, { ic: "sun" }),
          section("Later", later, { ic: "calendar" }),
          !active.length && emptyState({ ic: "bell", title: "No reminders", hint: "“Water the plants at 6pm”, “Call mom Sunday 10am” — they notify you at the time." }))
      : h("div", {},
          done.length
            ? h("div", { class: "fn-card fn-list" }, done.map((r) => row(r)))
            : emptyState({ ic: "bell", title: "Nothing done yet", hint: "Completed reminders land here." }))
  );
}
