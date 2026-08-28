/* ASTER Clean — Today: one calm page for the day. Greeting, what's due,
   one goal to check off, one memory to smile at. Nothing more. */

import { h, todayKey, toKey, fmtDate, fmtTime, greeting, hashColor } from "../utils.js";
import { icon } from "../icons.js";
import { getState, update } from "../store.js";
import { iconBtn } from "../components.js";
import { openTaskEditor, openMemoryDetail, openGoalEditor } from "../editors.js";
import { completeTask } from "./tasks.js";

const WHISPERS = [
  "Small steps still step.",
  "You don't have to do everything. Just the next thing.",
  "Rest is part of the work.",
  "Progress lives in repetition, not intensity.",
  "Collect the little joys.",
  "One thing at a time.",
  "You're building something good.",
];

export function renderToday(root) {
  const s = getState();
  const today = todayKey();
  const whisper = WHISPERS[hashColor(today) % WHISPERS.length];

  /* what's due today (and anything overdue, gently) */
  const dueTasks = s.tasks.filter((t) => !t.done && t.due && t.due <= today).sort((a, b) => a.due.localeCompare(b.due)).slice(0, 6);
  const remToday = (s.reminders || []).filter((r) => !r.done && r.date === today).sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const goal = s.goals.find((g) => !g.done);
  const memory = [...s.memories].sort((a, b) => b.date.localeCompare(a.date))[0];
  const doneToday = s.tasks.filter((t) => t.done && t.due === today && t.doneAt && toKey(new Date(t.doneAt)) === today).slice(0, 3);

  const taskRow = (t) => {
    const cb = h("input", { type: "checkbox", checked: false });
    cb.addEventListener("change", (ev) => { ev.preventDefault(); cb.checked = false; completeTask(t.id, cb.parentElement.querySelector(".task-check-box")); });
    return h("div", { class: "today-row" },
      h("label", { class: "task-check sm" }, cb, h("span", { class: "task-check-box" }, icon("check", 11))),
      h("span", { class: "tr-title", onclick: () => openTaskEditor(t) }, t.title));
  };

  root.append(
    h("div", { class: "today-greet" },
      h("h2", {}, `${greeting()}${s.settings.name ? ", " + s.settings.name : ""}`),
      h("p", {}, fmtDate(today, { weekday: true }))),

    (dueTasks.length || remToday.length) ? h("div", { class: "today-card" },
      h("div", { class: "tc-title" }, "Today"),
      dueTasks.length
        ? dueTasks.map(taskRow)
        : h("div", { class: "today-empty" }, "Nothing due — the day is yours ✨"),
      remToday.map((r) =>
        h("div", { class: "today-row" },
          icon("bell", 16),
          h("span", { class: "tr-title" }, r.title),
          r.time && h("span", { class: "muted small" }, fmtTime(r.time)))),
      doneToday.map((t) =>
        h("div", { class: "today-row done" },
          h("span", { class: "task-check-box on sm" }, icon("check", 11)),
          h("span", { class: "tr-title" }, t.title))))
      : h("div", { class: "today-card" },
          h("div", { class: "tc-title" }, "Today"),
          h("div", { class: "today-empty" }, "Nothing due — the day is yours ✨")),

    goal && h("div", { class: "today-card" },
      h("div", { class: "tc-title" }, "One small win"),
      h("div", { class: "today-row" },
        h("button", {
          class: "gms-check" + (goal.done ? " on" : ""),
          title: "I did this",
          onclick: () => {
            update((d) => { const g = d.goals.find((x) => x.id === goal.id); if (g) { g.done = !g.done; if (g.done && g.track !== "metric") g.progress = 100; } });
          },
        }, icon("check", 13)),
        h("span", { class: "tr-title", onclick: () => openGoalEditor(goal) }, `${goal.emoji || "🎯"} ${goal.name}`))),

    memory && h("div", { class: "today-card" },
      h("div", { class: "tc-title" }, "Remembered"),
      h("div", { class: "today-row", onclick: () => openMemoryDetail(memory), style: "cursor:pointer" },
        h("span", { style: "font-size:18px" }, memory.emoji || "✨"),
        h("span", { class: "tr-title" }, memory.title),
        h("span", { class: "muted small" }, fmtDate(memory.date, { short: true })))),

    h("p", { class: "today-whisper" }, whisper)
  );
}
