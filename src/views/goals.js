/* ASTER — Goals view: simple, do-it-today cards. Ring = done, slider = progress,
   milestones = checkable boxes. */

import { h, todayKey, relDay } from "../utils.js";
import { icon } from "../icons.js";
import { getState, update } from "../store.js";
import { btn, chip, emptyState, colorHex, toast, confirmDialog, confetti } from "../components.js";
import { openGoalEditor, openGoalDetail, openSpaceEditor, deleteEntity } from "../editors.js";
import { ring } from "../charts.js";
import { goalProgress, goalTrack } from "../logic.js";
import { playSound } from "../sound.js";

const ui = { filter: "all" };

export function renderGoals(root) {
  const s = getState();
  const active = s.goals.filter((g) => !g.done).sort((a, b) => (a.deadline || "9").localeCompare(b.deadline || "9"));
  const done = s.goals.filter((g) => g.done).sort((a, b) => (b.doneAt || "").localeCompare(a.doneAt || ""));

  root.append(
    h("div", { class: "page-head" },
      h("div", {},
        h("h1", {}, "Goals"),
        h("p", { class: "subtitle" }, "Check it off. That's the whole trick.")),
      h("div", { class: "head-actions" },
        h("a", { class: "btn ghost", href: "#/progress", title: "Charts & history" }, icon("chart", 16), "Charts & history"),
        btn("New goal", { kind: "accent", ic: "plus", onclick: () => openGoalEditor() }))),

    active.length
      ? h("div", { class: "goal-list" }, active.map((g) => goalCardBig(g, s)))
      : emptyState({
          ic: "target",
          title: done.length ? "All done for now 🎉" : "No goals yet",
          hint: done.length ? "Everything's checked off — enjoy it." : "Big or small: read a book, drink water, finish the project.",
        }),

    done.length > 0 && h("div", {},
      h("div", { class: "section-head", style: "margin:22px 0 12px" }, icon("checkCircle", 16), h("span", {}, `Done (${done.length})`)),
      h("div", { class: "goal-list done-list" }, done.map((g) => goalCardBig(g, s))))
  );
}

/** The do-it card: ring toggle, inline slider (optional), milestone boxes. */
export function goalCardBig(g, s) {
  const p = goalProgress(s, g);
  const track = goalTrack(g);
  const sp = g.spaceId && s.spaces.find((x) => x.id === g.spaceId);
  const daysLeft = g.deadline ? Math.round((new Date(g.deadline) - new Date(todayKey())) / 86400000) : null;
  const pct = Math.round(p.pct);

  /* ring button — one tap = "I have done this goal" */
  const ringBtn = h("button", {
    class: "goal-ring" + (g.done ? " done" : ""),
    title: g.done ? "Mark as not done" : "I have done this!",
    onclick: (e) => {
      e.stopPropagation();
      update((d) => {
        const gg = d.goals.find((x) => x.id === g.id);
        if (!gg) return;
        gg.done = !gg.done;
        if (gg.done && gg.track !== "metric") gg.progress = 100;
      });
      if (!g.done) {
        confetti();
        playSound("goal");
      }
      toast({ title: g.done ? "Goal reopened" : `“${g.name}” done 🎉`, ic: "target", timeout: 2600 });
    },
  }, g.done ? icon("check", 26) : ring(pct, { size: 62, stroke: 6.5, label: track === "check" ? "" : pct + "%" }));

  /* slider goals only: drag the slider */
  let slider = null;
  if (track === "slider" && !g.done) {
    const val = h("span", { class: "range-val" }, pct + "%");
    const r = h("input", { type: "range", min: 0, max: 100, value: pct, class: "range goal-inline" });
    r.addEventListener("input", () => (val.textContent = r.value + "%"));
    r.addEventListener("change", () =>
      update((d) => { const gg = d.goals.find((x) => x.id === g.id); if (gg) { gg.progress = Number(r.value); gg.done = gg.progress >= 100; } }));
    ["pointerdown", "click"].forEach((ev) => r.addEventListener(ev, (e) => e.stopPropagation()));
    slider = h("div", { class: "row goal-inline-row" }, r, val);
  }

  /* milestone boxes: circular checks */
  const msRows = track === "milestones" ? (g.milestones || []).map((m) => {
    return h("div", { class: "gms-row" + (m.done ? " done" : "") },
      h("button", {
        class: "gms-check" + (m.done ? " on" : ""),
        title: "Check it off",
        onclick: (e) => {
          e.stopPropagation();
          update((d) => { const gg = d.goals.find((x) => x.id === g.id); const mm = gg?.milestones?.find((x) => x.id === m.id); if (mm) mm.done = !mm.done; });
        },
      }, icon("check", 13)),
      h("span", { class: "gms-name", onclick: () => openGoalDetail(g) }, m.name || "Milestone"));
  }) : [];

  return h("div", { class: "goal-card big do" + (g.done ? " done" : "") },
    h("div", { class: "goal-card-top" },
      ringBtn,
      h("div", { class: "grow" },
        h("h3", { class: "clickable", onclick: () => openGoalDetail(g), title: "Details" }, `${g.emoji || "🎯"} ${g.name}`),
        track === "metric" && p.metric
          ? h("p", { class: "muted small" }, `${p.fmt(p.current)} / ${p.fmt(p.target)} · ${({ all: "all time", week: "this week", month: "this month" })[g.period || "all"]}`)
          : track === "milestones" && (g.milestones?.length || 0) > 0
          ? h("p", { class: "muted small" }, `${g.milestones.filter((x) => x.done).length}/${g.milestones.length} boxes`)
          : track === "slider"
          ? h("p", { class: "muted small" }, `${pct}% — drag the slider`)
          : h("p", { class: "muted small" }, "tap the ring when it's done"),
        h("div", { class: "chips-row" },
          sp && chip(sp.name, { ic: "rocket", color: colorHex(sp.color) }),
          daysLeft != null && chip(daysLeft < 0 ? `overdue ${-daysLeft}d` : daysLeft === 0 ? "due today" : `${daysLeft}d left`, { ic: "calendar", color: daysLeft < 0 && !g.done ? "var(--c-coral)" : undefined })),
        g.note && h("p", { class: "goal-note" }, g.note))),
    slider,
    msRows.length ? h("div", { class: "gms-list" }, msRows) : null,
    h("button", { class: "icon-btn danger quick-x", title: "Delete goal", onclick: async (e) => {
      e.stopPropagation();
      if (await confirmDialog(`Delete "${g.name}"?`)) update((d) => deleteEntity(d, g.id));
    } }, icon("x", 15)));
}
