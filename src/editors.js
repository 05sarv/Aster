/* ASTER — entity editors, detail modals, link picker, quick-add. */

import { h, uid, clear, todayKey, fmtDate, fmtTime, relDay, readImage, fmtVal, fmtEntryVal, isPast, advanceDue, autoArea, metricIsText } from "./utils.js";
import { icon } from "./icons.js";
import { getState, update, findEntity, putAtt, getAtt, delAtt } from "./store.js";
import { modal, btn, iconBtn, chip, toast, confirmDialog, emojiPicker, emojiSpan, swatchRow, tagInput, allTags, PALETTE, colorHex, KIND_META, emptyState, confetti, popover } from "./components.js";
import { stars, lineChart, ring } from "./charts.js";
import { metricStats, goalProgress, entriesOfMetric, metricParts, goalTrack } from "./logic.js";

/* ============================== shared bits ============================== */

export const field = (label, ...ctrl) => h("div", { class: "field" }, h("label", { class: "field-label" }, label), ...ctrl);
const inp = (draft, key, attrs = {}) => {
  const i = h("input", { class: "inp", value: draft[key] ?? "", ...attrs });
  i.addEventListener("input", () => (draft[key] = i.value));
  return i;
};
const area = (draft, key, rows = 3, ph = "") => {
  const a = h("textarea", { class: "inp", rows, placeholder: ph }, draft[key] || "");
  a.addEventListener("input", () => (draft[key] = a.value));
  return a;
};
function seg(options, value, onPick) {
  const wrap = h("div", { class: "seg" });
  const render = (v) => {
    clear(wrap);
    for (const o of options)
      wrap.append(
        h("button", { type: "button", class: "seg-btn" + (o.v === v ? " on" : ""), onclick: () => { render(o.v); onPick(o.v); } },
          o.ic && icon(o.ic, 15), o.label)
      );
  };
  render(value);
  return wrap;
}
const select = (options, value, onPick, attrs = {}) => {
  const s = h("select", { class: "inp", ...attrs });
  for (const o of options) {
    const op = h("option", { value: o.v }, o.label);
    if (o.v === value) op.selected = true;
    if (o.group) op.dataset.group = o.group;
    s.append(op);
  }
  s.addEventListener("change", () => onPick(s.value));
  return s;
};

function formModal({ title, body, onSave, onDelete, okLabel = "Save", wide }) {
  let md;
  const close = () => md.close();
  const save = () => {
    if (onSave() === false) return;
    close();
  };
  const del = async () => {
    if (await confirmDialog("This will be gone forever. Delete it?")) {
      onDelete && onDelete();
      close();
    }
  };
  md = modal({
    title,
    wide,
    body,
    footer: [
      onDelete && btn("Delete", { kind: "danger ghost", onclick: del }),
      h("div", { class: "grow" }),
      btn("Cancel", { onclick: close }),
      btn(okLabel, { kind: "accent", onclick: save }),
    ],
  });
  return md;
}

/* cascade delete inside update() */
export function deleteEntity(d, id) {
  const found = (["spaces", "memories", "tasks", "metrics", "entries", "goals"]).map((k) => ({ k, e: d[k].find((x) => x.id === id) })).find((x) => x.e);
  if (!found) return;
  const { k, e } = found;
  d[k] = d[k].filter((x) => x.id !== id);
  if (k === "spaces") {
    for (const col of ["memories", "tasks", "metrics", "goals"]) d[col].forEach((x) => x.spaceId === id && (x.spaceId = null));
    d.widgets = d.widgets.filter((w) => !(w.type === "space" && w.cfg.id === id));
  }
  if (k === "metrics") {
    d.entries = d.entries.filter((x) => x.metricId !== id);
    d.goals.forEach((g) => g.metricId === id && (g.metricId = null));
    d.widgets = d.widgets.filter((w) => !(w.type === "metric" && w.cfg.id === id));
  }
  if (k === "memories") e.atts.forEach((a) => delAtt(a.id));
  d.mapLinks = (d.mapLinks || []).filter((l) => l.a !== id && l.b !== id);
  d.widgets = d.widgets.filter((w) => !(["metric", "goal", "space"].includes(w.type) && w.cfg.id === id));
}

/* ============================== memory ============================== */

const KIND_DEFAULTS = { moment: "✨", person: "🙂", place: "📍" };

export function openMemoryEditor(mem = null, preset = {}) {
  const isNew = !mem;
  const s = getState();
  const draft = {
    kind: mem?.kind || preset.kind || "moment",
    title: mem?.title || "",
    body: mem?.body || "",
    date: mem?.date || todayKey(),
    emoji: mem?.emoji || KIND_DEFAULTS[preset.kind || "moment"],
    spaceId: mem?.spaceId ?? preset.spaceId ?? null,
    tags: mem ? [...mem.tags] : [],
    atts: mem ? [...mem.atts] : [],
    mood: mem?.mood ?? null,
    favorite: mem?.favorite || false,
  };
  const addedAtts = [];
  let bodyEl, emojiBtn, moodRow, tagsCtl;

  const build = () => {
    emojiBtn = h("button", { type: "button", class: "emoji-badge", title: "Pick emoji", onclick: (e) => emojiPicker(e.currentTarget, draft.emoji, (em) => { draft.emoji = em; emojiBtn.replaceChildren(emojiSpan(em)); }), }, draft.emoji ? emojiSpan(draft.emoji) : draft.emoji);
    const titleInp = inp(draft, "title", { placeholder: "A title for this memory…", autofocus: true });
    const KIND_PRESETS = ["moment", "person", "place"];
    const isPreset = (k) => KIND_PRESETS.includes(k);
    const customInp = h("input", { class: "inp", placeholder: "Custom kind — Book, Recipe, Concert…", value: isPreset(draft.kind) ? "" : draft.kind });
    customInp.addEventListener("input", () => (draft.kind = customInp.value.trim() || "custom"));
    const kindSeg = seg(
      [
        { v: "moment", label: "Moment", ic: "spark" },
        { v: "person", label: "Person", ic: "user" },
        { v: "place", label: "Place", ic: "pin" },
        { v: "custom", label: "Custom…", ic: "plus" },
      ],
      isPreset(draft.kind) ? draft.kind : "custom",
      (v) => {
        if (v === "custom") {
          draft.kind = customInp.value.trim() || "custom";
          customInp.style.display = "";
        } else {
          draft.kind = v;
          customInp.style.display = "none";
          if (!mem || !mem.emoji) { draft.emoji = KIND_DEFAULTS[v]; emojiBtn.replaceChildren(emojiSpan(draft.emoji)); }
        }
      }
    );
    customInp.style.display = isPreset(draft.kind) ? "none" : "";
    const tags = tagInput(draft.tags);
    tagsCtl = tags;
    const spaceSel = select([{ v: "", label: "No space" }, ...s.spaces.map((sp) => ({ v: sp.id, label: `${sp.emoji} ${sp.name}` }))], draft.spaceId || "", (v) => (draft.spaceId = v || null));
    moodRow = h("div", { class: "field" }, h("label", { class: "field-label" }, "How did it feel?"), stars(draft.mood || 0, { onPick: (v) => (draft.mood = v) }));

    /* photos */
    const photoGrid = h("div", { class: "photo-grid" });
    const renderPhotos = () => {
      clear(photoGrid);
      draft.atts.forEach((a, i) => {
        const cell = h("div", { class: "photo-cell" }, h("div", { class: "photo-skel" }, "…"));
        getAtt(a.id).then((rec) => {
          if (rec) {
            clear(cell);
            cell.append(h("img", { src: rec.data, alt: a.name, onclick: () => lightbox(rec.data, a.name) }), h("button", { class: "photo-x", onclick: () => { draft.atts.splice(i, 1); renderPhotos(); } }, "×"));
          }
        });
        photoGrid.append(cell);
      });
      if (draft.atts.length < 9)
        photoGrid.append(
          h("label", { class: "photo-add" }, icon("camera", 20), "Add photo",
            h("input", { type: "file", accept: "image/*", multiple: true, style: "display:none", onchange: async (e) => {
                for (const f of e.target.files) {
                  try {
                    const data = await readImage(f);
                    const meta = { id: uid(), name: f.name, created: new Date().toISOString() };
                    await putAtt(meta, data);
                    draft.atts.push(meta);
                    addedAtts.push(meta.id);
                  } catch {
                    toast({ title: "Couldn't read that image", ic: "image" });
                  }
                }
                renderPhotos();
              } }))
        );
    };
    renderPhotos();

    bodyEl = h(
      "div",
      { class: "form" },
      h("div", { class: "row" }, kindSeg, h("div", { class: "grow" }), emojiBtn),
      customInp,
      field("Title", titleInp),
      field("Story / notes", area(draft, "body", 5, "What do you want to remember?")),
      field("Photos", photoGrid),
      h("div", { class: "row" },
        field("Date", inp(draft, "date", { type: "date" })),
        field("Space", spaceSel)),
      moodRow,
      field("Tags", tags.el),
    );
  };
  build();

  formModal({
    title: isNew ? "New memory" : "Edit memory",
    body: bodyEl,
    onDelete: mem && (() => update((d) => deleteEntity(d, mem.id))),
    onSave: () => {
      if (!draft.title.trim()) {
        toast({ title: "Give it a title first ✍️", ic: "info" });
        return false;
      }
      const tagsNow = tagsCtl.get();
      update((d) => {
        if (isNew) {
          d.memories.unshift({ id: uid(), kind: draft.kind, title: draft.title.trim(), body: draft.body, date: draft.date || todayKey(), emoji: draft.emoji, spaceId: draft.spaceId, tags: tagsNow, atts: draft.atts, mood: draft.mood, favorite: draft.favorite, created: new Date().toISOString(), updated: new Date().toISOString() });
        } else {
          const m = d.memories.find((x) => x.id === mem.id);
          Object.assign(m, { kind: draft.kind, title: draft.title.trim(), body: draft.body, date: draft.date, emoji: draft.emoji, spaceId: draft.spaceId, tags: tagsNow, atts: draft.atts, mood: draft.mood, favorite: draft.favorite, updated: new Date().toISOString() });
        }
      });
      toast({ title: isNew ? "Memory saved ✨" : "Memory updated", ic: "spark", timeout: 2600 });
      addedAtts.length = 0;
    },
  });
}

export function openMemoryDetail(mem) {
  const s = getState();
  const space = mem.spaceId ? s.spaces.find((x) => x.id === mem.spaceId) : null;
  const body = h("div", { class: "detail" },
    h("div", { class: "detail-meta" },
      chip(KIND_META[mem.kind].label, { ic: KIND_META[mem.kind].icon }),
      chip(fmtDate(mem.date), { ic: "calendar" }),
      mem.mood ? chip("★".repeat(mem.mood), { ic: "star" }) : null,
      space && chip(`${space.emoji} ${space.name}`, { ic: "rocket", color: colorHex(space.color) })),
    mem.atts.length > 0 && photoGallery(mem.atts),
    mem.body && h("p", { class: "detail-body" }, mem.body),
    mem.tags.length > 0 && h("div", { class: "chips-row" }, mem.tags.map((t) => chip("#" + t, { ic: "tag" }))),
  );
  modal({
    title: `${mem.emoji || ""} ${mem.title}`,
    body,
    footer: [
      btn("Delete", { kind: "danger ghost", onclick: async () => {
        if (await confirmDialog("Delete this memory and its photos?")) { update((d) => deleteEntity(d, mem.id)); closeModalAll(); }
      } }),
      h("div", { class: "grow" }),
      btn("Edit", { onclick: () => { closeModalAll(); openMemoryEditor(mem); } }),
    ],
  });
}

function photoGallery(atts) {
  const g = h("div", { class: "photo-grid gallery" });
  for (const a of atts) {
    const cell = h("div", { class: "photo-cell" }, h("div", { class: "photo-skel" }, "…"));
    getAtt(a.id).then((r) => {
      if (r) { clear(cell); cell.append(h("img", { src: r.data, alt: a.name, onclick: () => lightbox(r.data, a.name) })); }
    });
    g.append(cell);
  }
  return g;
}

export function lightbox(src, name = "") {
  const ov = h("div", { class: "overlay lightbox", onclick: () => ov.remove() }, h("img", { src, alt: name }));
  document.body.append(ov);
  const esc = (e) => e.key === "Escape" && ov.remove();
  document.addEventListener("keydown", esc);
}

/* ============================== time picker ============================== */

/** ASTER's own clock — a circular dial that fits a phone. Drag or tap the
 *  dial: hours first (auto-continues to minutes), any minute lands exactly.
 *  Shows 12-hour + AM/PM; stores 24-hour "HH:MM". */
export function openTimePicker(anchor, current, onDone) {
  let [hh, mm] = (current || "09:00").split(":").map(Number);
  if (isNaN(hh)) hh = 9;
  if (isNaN(mm)) mm = 0;
  let mode = "h";
  const pad = (n) => String(n).padStart(2, "0");
  const h12 = () => { let x = hh % 12; return x === 0 ? 12 : x; };
  const NS = "http://www.w3.org/2000/svg";
  const S = 260, C = S / 2, R = 99;
  const svgEl = (t, attrs = {}) => {
    const e = document.createElementNS(NS, t);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };

  const svg = svgEl("svg", { viewBox: `0 0 ${S} ${S}`, class: "tp-dial-svg" });
  svg.append(svgEl("circle", { cx: C, cy: C, r: 121, class: "tp-dial-ring" }));
  const hand = svgEl("line", { class: "tp-hand" });
  const knob = svgEl("circle", { r: 17, class: "tp-knob" });
  const nums = svgEl("g");
  const pin = svgEl("circle", { cx: C, cy: C, r: 3.5, class: "tp-pin" });
  svg.append(hand, knob, nums, pin);

  const hrB = h("button", { type: "button", class: "tp-crumb on", title: "Set hours" }, String(h12()));
  const mnB = h("button", { type: "button", class: "tp-crumb", title: "Set minutes" }, pad(mm));
  const apB = h("button", { type: "button", class: "tp-ampm", title: "Switch AM/PM" }, hh < 12 ? "AM" : "PM");
  hrB.addEventListener("click", () => { mode = "h"; paint(); });
  mnB.addEventListener("click", () => { mode = "m"; paint(); });
  apB.addEventListener("click", () => { hh = (hh + 12) % 24; paint(); });

  const angleOf = (v) => ((mode === "h" ? (v % 12) * 30 : v * 6) - 90) * Math.PI / 180;

  function paint() {
    hrB.textContent = String(h12());
    mnB.textContent = pad(mm);
    apB.textContent = hh < 12 ? "AM" : "PM";
    hrB.classList.toggle("on", mode === "h");
    mnB.classList.toggle("on", mode === "m");
    const cur = mode === "h" ? h12() : mm;
    const a = angleOf(cur);
    const x = C + R * Math.cos(a), y = C + R * Math.sin(a);
    hand.setAttribute("x1", C); hand.setAttribute("y1", C);
    hand.setAttribute("x2", x); hand.setAttribute("y2", y);
    knob.setAttribute("cx", x); knob.setAttribute("cy", y);
    const labels = mode === "h" ? [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
    nums.replaceChildren(...labels.map((v) => {
      const la = angleOf(v);
      const t = svgEl("text", {
        x: (C + R * Math.cos(la)).toFixed(1), y: (C + R * Math.sin(la)).toFixed(1),
        class: "tp-num" + (v === cur ? " on" : ""),
        "text-anchor": "middle", "dominant-baseline": "central",
      });
      t.textContent = mode === "h" ? String(v) : pad(v);
      return t;
    }));
  }

  const setFromPt = (cx, cy) => {
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const x = ((cx - r.left) / r.width) * S - C;
    const y = ((cy - r.top) / r.height) * S - C;
    let ang = (Math.atan2(y, x) * 180) / Math.PI + 90;
    ang = (ang + 360) % 360;
    if (mode === "h") {
      const idx = ((Math.round(ang / 30) % 12) + 12) % 12;
      const h12v = idx === 0 ? 12 : idx;
      hh = (h12v % 12) + (hh < 12 ? 0 : 12);
    } else {
      mm = ((Math.round(ang / 6) % 60) + 60) % 60;
    }
    paint();
  };
  let dragging = false;
  svg.addEventListener("pointerdown", (e) => { dragging = true; try { svg.setPointerCapture(e.pointerId); } catch {} setFromPt(e.clientX, e.clientY); });
  svg.addEventListener("pointermove", (e) => { if (dragging) setFromPt(e.clientX, e.clientY); });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (mode === "h") { mode = "m"; paint(); } // hour picked → now the minutes
  };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);
  paint();

  const p = popover(anchor, h("div", { class: "time-picker" },
    h("div", { class: "tp-readout" }, hrB, h("span", { class: "tp-colon" }, ":"), mnB, apB),
    svg,
    h("div", { class: "row", style: "justify-content:flex-end;gap:8px;width:100%" },
      btn("Cancel", { onclick: () => p.remove() }),
      btn("Set ✦", { kind: "accent", onclick: () => { onDone(`${pad(hh)}:${pad(mm)}`); p.remove(); } }))), { width: 286 });
  return p;
}

/** A friendly button that opens the custom clock instead of the keyboard picker. */
function timeField(draft, { optional = false } = {}) {
  const btnEl = h("button", { type: "button", class: "inp tp-btn", onclick: (e) => {
    openTimePicker(e.currentTarget, draft.time || "09:00", (t) => {
      draft.time = t;
      btnEl.replaceChildren(h("span", { class: "icon" }, icon("clock", 15)), fmtTime(t) || (optional ? "add time" : "—"));
      btnEl.dispatchEvent(new CustomEvent("timepick", { bubbles: true }));
    });
  } }, h("span", { class: "icon" }, icon("clock", 15)), fmtTime(draft.time) || (optional ? "add time" : "9:00 AM"));
  return btnEl;
}

/* ============================== task ============================== */

export function openTaskEditor(task = null, preset = {}) {
  const isNew = !task;
  const s = getState();
  const draft = {
    title: task?.title || "",
    notes: task?.notes || "",
    due: task?.due ?? preset.due ?? todayKey(),
    time: task?.time || "",
    priority: task?.priority || "med",
    recurrence: task?.recurrence || "none",
    remind: task?.remind ?? true,
    spaceId: task?.spaceId ?? preset.spaceId ?? null,
    tags: task ? [...task.tags] : [],
    subtasks: task?.subtasks ? task.subtasks.map((x) => ({ ...x })) : [],
  };
  const tags = tagInput(draft.tags);

  /* subtasks */
  const subList = h("div", { class: "ms-list" });
  const renderSubs = () => {
    clear(subList);
    draft.subtasks.forEach((x, i) => {
      const c = h("input", { type: "checkbox", checked: x.done, class: "switch" });
      c.addEventListener("change", () => (x.done = c.checked));
      const t = h("input", { class: "inp", value: x.name, placeholder: "Step…" });
      t.addEventListener("input", () => (x.name = t.value));
      subList.append(h("div", { class: "ms-row" }, c, t, iconBtn("x", "Remove", () => { draft.subtasks.splice(i, 1); renderSubs(); })));
    });
  };
  renderSubs();

  const remindRow = h("div", { class: "field", style: "display:none" });
  const timeInp = timeField(draft, { optional: true });
  timeInp.addEventListener("timepick", () => (remindRow.style.display = draft.time ? "" : "none"));
  remindRow.style.display = draft.time ? "" : "none";
  const body = h("div", { class: "form" },
    field("Task", inp(draft, "title", { placeholder: "What needs doing?", autofocus: true })),
    field("Notes", area(draft, "notes", 2, "Optional details…")),
    field("Subtasks (optional)", subList, btn("+ Add step", { kind: "ghost", onclick: () => { draft.subtasks.push({ id: uid(), name: "", done: false }); renderSubs(); } })),
    h("div", { class: "row" },
      field("Due date", inp(draft, "due", { type: "date" })),
      field("Time (optional)", timeInp)),
    h("div", { class: "row" },
      field("Priority", select([
        { v: "low", label: "Low" }, { v: "med", label: "Normal" }, { v: "high", label: "High" },
      ], draft.priority, (v) => (draft.priority = v))),
      field("Repeat", select([
        { v: "none", label: "Never" }, { v: "daily", label: "Daily" }, { v: "weekly", label: "Weekly" },
        { v: "biweekly", label: "Every 2 weeks" }, { v: "monthly", label: "Monthly" },
      ], draft.recurrence || "none", (v) => (draft.recurrence = v === "none" ? null : v)))),
    remindRow,
    h("div", { class: "row" },
      field("Space", select([{ v: "", label: "No space" }, ...s.spaces.map((sp) => ({ v: sp.id, label: `${sp.emoji} ${sp.name}` }))], draft.spaceId || "", (v) => (draft.spaceId = v || null))),
      field("Tags", tags.el)),
  );
  const toggle = h("input", { type: "checkbox", checked: draft.remind, class: "switch" });
  toggle.addEventListener("change", () => (draft.remind = toggle.checked));
  remindRow.append(h("label", { class: "field-label" }, "Gentle reminder"), h("label", { class: "check-row" }, toggle, h("span", { class: "muted" }, "Nudge me at this time (respects quiet hours)")));
  remindRow.style.display = draft.time ? "" : "none";

  formModal({
    title: isNew ? "New task" : "Edit task",
    body,
    onDelete: task && (() => update((d) => deleteEntity(d, task.id))),
    onSave: () => {
      if (!draft.title.trim()) {
        toast({ title: "Name the task first ✍️", ic: "info" });
        return false;
      }
      update((d) => {
        const base = {
          title: draft.title.trim(), notes: draft.notes, due: draft.due || null, time: draft.time || null,
          priority: draft.priority, recurrence: draft.recurrence === "none" ? null : draft.recurrence, remind: !!draft.time && draft.remind,
          spaceId: draft.spaceId, tags: tags.get(),
          subtasks: draft.subtasks.filter((x) => x.name.trim()).map((x) => ({ ...x, name: x.name.trim() })),
        };
        if (isNew) d.tasks.unshift({ id: uid(), ...base, done: false, doneAt: null, history: [], created: new Date().toISOString() });
        else Object.assign(d.tasks.find((x) => x.id === task.id), base);
      });
      toast({ title: isNew ? "Task added ✅" : "Task updated", ic: "check", timeout: 2400 });
    },
  });
}

/* ============================== reminder ============================== */

/** Reminders are their own thing — time-based nudges, independent of tasks. */
export function openReminderEditor(rem = null, preset = {}) {
  const isNew = !rem;
  const draft = {
    title: rem?.title || "",
    date: rem?.date || preset.date || todayKey(),
    time: rem?.time || "09:00",
    repeat: rem?.repeat || "none",
    note: rem?.note || "",
  };
  const body = h("div", { class: "form" },
    field("Reminder", inp(draft, "title", { placeholder: "Water the plants…", autofocus: true })),
    h("div", { class: "row" },
      field("Date", inp(draft, "date", { type: "date" })),
      field("Time", timeField(draft))),
    field("Repeat", select([
      { v: "none", label: "One time" }, { v: "daily", label: "Daily" }, { v: "weekly", label: "Weekly" },
      { v: "biweekly", label: "Every 2 weeks" }, { v: "monthly", label: "Monthly" },
    ], draft.repeat || "none", (v) => (draft.repeat = v))),
    field("Note (optional)", inp(draft, "note", { placeholder: "Anything to remember with it…" })),
    h("p", { class: "muted tiny" }, "Fires a system notification at this time (while ASTER is open, respecting quiet hours)."));
  formModal({
    title: isNew ? "New reminder" : "Edit reminder",
    body,
    onDelete: rem && (() => update((d) => (d.reminders = d.reminders.filter((x) => x.id !== rem.id)))),
    onSave: () => {
      if (!draft.title.trim()) {
        toast({ title: "Name the reminder first ✍️", ic: "info" });
        return false;
      }
      update((d) => {
        const base = { title: draft.title.trim(), date: draft.date || todayKey(), time: draft.time || "09:00", repeat: draft.repeat, note: draft.note.trim() };
        if (isNew) d.reminders.unshift({ id: uid(), ...base, done: false, doneAt: null, created: new Date().toISOString() });
        else Object.assign(d.reminders.find((x) => x.id === rem.id), base);
      });
      toast({ title: isNew ? "Reminder set ⏰" : "Reminder updated", ic: "bell", timeout: 2400 });
    },
  });
}

/** Check off a reminder — repeating ones roll to their next date. */
export function toggleReminder(id) {
  const r = getState().reminders.find((x) => x.id === id);
  if (!r) return;
  let next = null;
  update((d) => {
    const rem = d.reminders.find((x) => x.id === id);
    if (!rem) return;
    if (!rem.done && rem.repeat && rem.repeat !== "none" && rem.date) {
      next = advanceDue(rem.date, rem.repeat);
      rem.date = next;
      rem.done = false;
    } else if (!rem.done) {
      rem.done = true;
      rem.doneAt = new Date().toISOString();
    } else {
      rem.done = false;
      rem.doneAt = null;
    }
  });
  if (next) toast({ title: "Done! 🔔", body: `Next: ${relDay(next).toLowerCase()} — ${fmtDate(next, { weekday: true })}`, ic: "repeat", timeout: 3200 });
}

/* ============================== space ============================== */

export function openSpaceEditor(space = null, preset = {}) {
  const draft = {
    name: space?.name || preset.name || "",
    emoji: space?.emoji || preset.emoji || "🌱",
    color: space?.color || preset.color || "violet",
    desc: space?.desc || "",
  };
  const emojiBtn = h("button", { type: "button", class: "emoji-badge big", onclick: (e) => emojiPicker(e.currentTarget, draft.emoji, (em) => { draft.emoji = em; emojiBtn.replaceChildren(emojiSpan(em)); }), }, draft.emoji ? emojiSpan(draft.emoji) : draft.emoji);

  /* metrics live here too — edit a space, edit what it tracks */
  const metricsBox = h("div", { class: "parts-box" });
  const renderMetrics = () => {
    clear(metricsBox);
    const list = space ? getState().metrics.filter((m) => m.spaceId === space.id) : [];
    for (const m of list) {
      const count = getState().entries.filter((e) => e.metricId === m.id).length;
      metricsBox.append(h("div", { class: "mm-row" },
        h("span", { class: "metric-emoji" }, m.emoji),
        h("div", { class: "grow", style: "min-width:0" },
          h("b", { style: "display:block;font-size:13.5px" }, m.name),
          h("span", { class: "muted tiny" }, metricParts(m).map((p) => p.label || METRIC_TYPES[p.kind]?.label || p.kind).join(" · ") + ` — ${count} entries`)),
        iconBtn("chevUp", "Move up", () => { swapMetric(m.id, -1); renderMetrics(); }, { size: 15 }),
        iconBtn("chevDown", "Move down", () => { swapMetric(m.id, 1); renderMetrics(); }, { size: 15 }),
        iconBtn("pencil", "Edit", () => openMetricEditor(m), { size: 15 }),
        iconBtn("trash", "Remove", async () => {
          if (await confirmDialog(`Remove "${m.name}" and its ${count} ${count === 1 ? "entry" : "entries"}?`)) {
            update((d) => deleteEntity(d, m.id));
            renderMetrics();
          }
        }, { size: 15, cls: "danger" })));
    }
    metricsBox.append(h("button", { type: "button", class: "btn ghost sm", style: "align-self:flex-start", onclick: () => openMetricEditor(null, { spaceId: space.id }) }, icon("plus", 14), "New metric"));
  };
  const swapMetric = (id, dir) => update((d) => {
    const i = d.metrics.findIndex((x) => x.id === id);
    if (i < 0) return;
    let j = i + dir;
    while (j >= 0 && j < d.metrics.length && d.metrics[j].spaceId !== d.metrics[i].spaceId) j += dir;
    if (j < 0 || j >= d.metrics.length) return;
    [d.metrics[i], d.metrics[j]] = [d.metrics[j], d.metrics[i]];
  });
  if (space) renderMetrics();

  const body = h("div", { class: "form" },
    h("div", { class: "row", style: "align-items:center" }, emojiBtn, field("Space name", inp(draft, "name", { placeholder: "Gym, Guitar, Travel…", autofocus: true }))),
    field("Description", area(draft, "desc", 2, "What is this space about?")),
    space && field(`Metrics (${getState().metrics.filter((m) => m.spaceId === space.id).length})`, metricsBox),
  );
  formModal({
    title: space ? "Edit space" : "New space",
    body,
    onDelete: space && (() => update((d) => deleteEntity(d, space.id))),
    onSave: () => {
      if (!draft.name.trim()) {
        toast({ title: "Name your space first ✍️", ic: "info" });
        return false;
      }
      update((d) => {
        if (space) Object.assign(d.spaces.find((x) => x.id === space.id), { name: draft.name.trim(), emoji: draft.emoji, color: draft.color, desc: draft.desc });
        else {
          const sp = { id: uid(), name: draft.name.trim(), emoji: draft.emoji, color: draft.color, desc: draft.desc, archived: false, created: new Date().toISOString() };
          d.spaces.push(sp);
          location.hash = `#/space/${sp.id}`;
        }
      });
      toast({ title: space ? "Space updated" : "Space created 🚀", ic: "rocket", timeout: 2400 });
    },
  });
}

/* ============================== metric ============================== */

export const METRIC_TYPES = {
  number: { label: "Number", hint: "any value — weight, money, pages…", unit: "" },
  count: { label: "Count", hint: "how many — reps, glasses, songs", unit: "×" },
  check: { label: "Checkbox", hint: "yes/no — tap ✓ when done", unit: "" },
  duration: { label: "Duration", hint: "time — practice, study, sleep", unit: "min" },
  distance: { label: "Distance", hint: "km — runs, rides, walks", unit: "km" },
  rating: { label: "Rating", hint: "1–5 stars — mood, quality", unit: "" },
  percent: { label: "Percent", hint: "0–100%", unit: "%" },
  text: { label: "Notes", hint: "journal text — no charts", unit: "" },
  custom: { label: "Custom", hint: "free text with your own unit", unit: "" },
};

export function openMetricEditor(metric = null, preset = {}) {
  const s = getState();
  // Value fields: classic metrics are one field; users can add more (e.g. weight + reps).
  const asPart = (kind, src) => ({
    id: uid(),
    label: "",
    kind,
    unit: src?.unit ?? METRIC_TYPES[kind].unit ?? "",
    decimals: kind === "number" ? (src?.decimals ?? 1) : 0,
  });
  const draft = {
    name: metric?.name || "",
    emoji: metric?.emoji || "📊",
    parts: metric?.parts?.length
      ? metric.parts.map((p) => ({ ...p }))
      : [asPart(metric?.type || preset.type || "number", { unit: metric?.unit, decimals: metric?.decimals })],
    direction: metric?.direction || "up",
    spaceId: metric?.spaceId ?? preset.spaceId ?? (s.spaces[0]?.id || null),
  };
  const emojiBtn = h("button", { type: "button", class: "emoji-badge", onclick: (e) => emojiPicker(e.currentTarget, draft.emoji, (em) => { draft.emoji = em; emojiBtn.replaceChildren(emojiSpan(em)); }), }, draft.emoji ? emojiSpan(draft.emoji) : draft.emoji);
  const nameInp = inp(draft, "name", { placeholder: "Bench press, Meditation, Water…", autofocus: true });
  const dirSeg = seg([{ v: "up", label: "↑ higher is better" }, { v: "down", label: "↓ lower is better" }], draft.direction, (v) => (draft.direction = v));

  const partsBox = h("div", { class: "parts-box" });
  const renderParts = () => {
    clear(partsBox);
    draft.parts.forEach((p, i) => {
      const kindSel = select(
        Object.entries(METRIC_TYPES).map(([v, t]) => ({ v, label: t.label })),
        p.kind,
        (v) => { p.kind = v; p.unit = METRIC_TYPES[v].unit ?? ""; p.decimals = v === "number" ? 1 : 0; renderParts(); }
      );
      const row = h("div", { class: "part-row" },
        h("input", { class: "inp part-label", placeholder: i === 0 ? "field name (optional)" : `e.g. ${METRIC_TYPES[p.kind].hint.split("—")[0].trim().split(",")[0].slice(0, 18)}`, value: p.label || "", oninput: (e) => (p.label = e.target.value) }),
        kindSel,
        ["number", "count", "distance", "custom"].includes(p.kind)
          ? h("input", { class: "inp part-unit", placeholder: "unit", value: p.unit || "", oninput: (e) => (p.unit = e.target.value) })
          : null,
        p.kind === "number"
          ? h("input", { class: "inp part-dec", type: "number", min: 0, max: 8, step: 1, title: "decimals shown (0–8)", value: p.decimals ?? 1, oninput: (e) => (p.decimals = Math.max(0, Math.min(8, Number(e.target.value) || 0))) })
          : null,
        draft.parts.length > 1
          ? h("button", { type: "button", class: "icon-btn danger", title: "Remove field", onclick: () => { draft.parts.splice(i, 1); renderParts(); } }, icon("trash", 15))
          : null);
      partsBox.append(row);
    });
    if (draft.parts.length < 4)
      partsBox.append(h("button", { type: "button", class: "chip clickable add", onclick: () => { draft.parts.push(asPart("count")); renderParts(); } }, icon("plus", 13), "Add field"));
    partsBox.append(h("p", { class: "muted tiny" }, draft.parts.length > 1
      ? "Multi-field: every entry logs all fields together — e.g. “5 kg · 6 reps”."
      : "Add a second field to log combos like weight × reps, or give this field a custom name (e.g. “reps”). Number fields accept up to 8 decimals (e.g. 8.5345)."));
  };
  renderParts();

  const body = h("div", { class: "form" },
    h("div", { class: "row", style: "align-items:center" }, emojiBtn, field("Metric name", nameInp)),
    field("Value fields", partsBox),
    field("Direction (first field)", dirSeg),
    s.spaces.length > 1 || (!metric && !draft.spaceId)
      ? field("Space", select([{ v: "", label: "No space" }, ...s.spaces.map((sp) => ({ v: sp.id, label: `${sp.emoji} ${sp.name}` }))], draft.spaceId || "", (v) => (draft.spaceId = v || null)))
      : null,
  );
  formModal({
    title: metric ? "Edit metric" : "New metric",
    body,
    onDelete: metric && (() => update((d) => deleteEntity(d, metric.id))),
    onSave: () => {
      if (!draft.name.trim()) {
        toast({ title: "Name the metric first ✍️", ic: "info" });
        return false;
      }
      update((d) => {
        const first = draft.parts[0];
        const base = {
          name: draft.name.trim(),
          emoji: draft.emoji,
          parts: draft.parts,
          type: first.kind,       // mirror the first field so classic display paths keep working
          unit: first.unit.trim(),
          decimals: Number(first.decimals) || 0,
          direction: draft.direction,
          spaceId: draft.spaceId,
        };
        if (metric) Object.assign(d.metrics.find((x) => x.id === metric.id), base);
        else d.metrics.push({ id: uid(), ...base, created: new Date().toISOString() });
      });
      toast({ title: metric ? "Metric updated" : "Metric added 📈", ic: "chart", timeout: 2400 });
    },
  });
}

/* ============================== entry (log) ============================== */

/** One labeled value control for a metric field (kind decides the widget). */
function partControl(part, value, onChange) {
  const set = (v) => onChange(v);
  switch (part.kind) {
    case "rating":
      return h("div", { class: "stars big editable" }, stars(Number(value) || 3, { size: 28, onPick: set }));
    case "percent": {
      const bubble = h("span", { class: "range-val" }, (Number(value) || 0) + "%");
      const r = h("input", { type: "range", min: 0, max: 100, step: 1, value: Number(value) || 0, class: "range" });
      r.addEventListener("input", () => { set(Number(r.value)); bubble.textContent = r.value + "%"; });
      return h("div", { class: "row" }, r, bubble);
    }
    case "duration": {
      const total = Number(value) || 0;
      const hIn = h("input", { type: "number", min: 0, class: "inp dur-inp", value: Math.floor(total / 60), placeholder: "0" });
      const mIn = h("input", { type: "number", min: 0, class: "inp dur-inp", value: total % 60, placeholder: "0" });
      const sync = () => set((Number(hIn.value) || 0) * 60 + (Number(mIn.value) || 0));
      hIn.addEventListener("input", sync);
      mIn.addEventListener("input", sync);
      return h("div", { class: "row" },
        h("label", { class: "dur-part" }, hIn, h("span", { class: "muted" }, "hours")),
        h("label", { class: "dur-part" }, mIn, h("span", { class: "muted" }, "minutes")));
    }
    case "check": {
      let on = value === true || value === 1;
      const b = h("button", { type: "button", class: "btn check-toggle" + (on ? " on" : "") }, icon("check", 17), on ? "Yes" : "No");
      b.addEventListener("click", () => {
        on = !on;
        set(on ? 1 : 0);
        b.className = "btn check-toggle" + (on ? " on" : "");
        b.replaceChildren(icon("check", 17), on ? "Yes" : "No");
      });
      return b;
    }
    case "text":
    case "custom":
      return autoArea(value ?? "", "Write freely…", set);
    default: {
      const i = h("input", { type: "number", step: "any", class: "inp", value: value ?? "", placeholder: "0", oninput: () => set(i.value) });
      return h("div", { class: "row" }, i, h("span", { class: "muted", style: "align-self:center" }, part.unit || (part.kind === "count" ? "×" : "")));
    }
  }
}

export function openEntryEditor(metric, entry = null) {
  const parts = metricParts(metric);
  const multi = parts.length > 1;
  // For new entries, suggest the previously entered values.
  const prev = entry
    ? null
    : getState().entries
        .filter((e) => e.metricId === metric.id)
        .sort((a, b) => b.date.localeCompare(a.date) || (b.created || "").localeCompare(a.created || ""))[0];
  const fallback = (kind) => (kind === "rating" ? 3 : kind === "percent" ? 50 : kind === "check" ? 1 : "");
  const draft = {
    date: entry?.date || todayKey(),
    val: entry
      ? entry.val
      : multi
        ? Object.fromEntries(parts.map((p) => [p.id, prev && typeof prev.val === "object" && prev.val[p.id] != null ? prev.val[p.id] : fallback(p.kind)]))
        : prev && !["text", "custom"].includes(metric.type) ? prev.val : fallback(metric.type),
    note: entry?.note || "",
  };

  const valueCtrl = multi
    ? h("div", { class: "entry-parts" },
        parts.map((p) =>
          h("div", { class: "entry-part" },
            h("label", { class: "field-label" }, p.label || METRIC_TYPES[p.kind].label),
            partControl(p, draft.val[p.id], (v) => (draft.val[p.id] = v)))))
    : partControl(parts[0], draft.val, (v) => (draft.val = v));

  const suggested = !entry && prev && (multi || !["text", "custom"].includes(metric.type));
  const body = h("div", { class: "form" },
    h("div", { class: "entry-metric-head" }, h("span", { class: "emoji-badge" }, metric.emoji), h("div", {}, h("b", {}, metric.name))),
    field("Value", valueCtrl,
      suggested && h("div", { class: "muted tiny", style: "margin-top:-2px" }, "↩ prefilled with your last values — change what was different")),
    field("Date", inp(draft, "date", { type: "date" })),
    (!multi || parts.every((p) => !["text", "custom"].includes(p.kind))) && field("Note (optional)", inp(draft, "note", { placeholder: "context, thoughts…" })),
  );
  formModal({
    title: entry ? "Edit entry" : `Log ${metric.name}`,
    body,
    okLabel: entry ? "Save" : "Log it",
    onDelete: entry && (() => update((d) => (d.entries = d.entries.filter((e) => e.id !== entry.id)))),
    onSave: () => {
      const hasValue = multi
        ? parts.some((p) => draft.val[p.id] !== "" && draft.val[p.id] != null)
        : draft.val !== "" && draft.val != null;
      if (!hasValue) {
        toast({ title: "Add a value first ✍️", ic: "info" });
        return false;
      }
      const numericKinds = new Set(["number", "count", "distance", "duration", "percent", "check"]);
      update((d) => {
        if (entry) Object.assign(d.entries.find((e) => e.id === entry.id), { date: draft.date, val: draft.val, note: draft.note });
        else
          d.entries.unshift({
            id: uid(),
            metricId: metric.id,
            date: draft.date || todayKey(),
            val: multi
              ? Object.fromEntries(parts.map((p) => [p.id, numericKinds.has(p.kind) && draft.val[p.id] !== "" ? Number(draft.val[p.id]) : draft.val[p.id]]))
              : numericKinds.has(metric.type) ? Number(draft.val) : draft.val,
            note: draft.note,
            created: new Date().toISOString(),
          });
      });
      toast({ title: "Logged ✓", body: `${metric.emoji} ${metric.name} — ${fmtEntryVal(metric, draft.val)}`, ic: "note", timeout: 2600 });
    },
  });
}

/* ============================== goal ============================== */

export function openGoalEditor(goal = null, preset = {}) {
  const s = getState();
  const draft = {
    name: goal?.name || "",
    emoji: goal?.emoji || "🎯",
    spaceId: goal?.spaceId ?? preset.spaceId ?? null,
    track: goal ? goalTrack(goal) : "check",
    metricId: goal?.metricId || "",
    target: goal?.target ?? 10,
    period: goal?.period || "all",
    deadline: goal?.deadline || "",
    milestones: goal ? goal.milestones.map((m) => ({ note: "", ...m })) : [],
    progress: goal?.progress || 0,
    note: goal?.note || "",
  };
  const metricOpts = [{ v: "", label: "— pick a metric —" }, ...s.metrics.map((m) => {
    const sp = s.spaces.find((x) => x.id === m.spaceId);
    return { v: m.id, label: `${m.emoji} ${m.name}${sp ? ` — ${sp.name}` : ""}` };
  })];
  const emojiBtn = h("button", { type: "button", class: "emoji-badge", onclick: (e) => emojiPicker(e.currentTarget, draft.emoji, (em) => { draft.emoji = em; emojiBtn.replaceChildren(emojiSpan(em)); }), }, draft.emoji ? emojiSpan(draft.emoji) : draft.emoji);
  const targetInp = inp(draft, "target", { type: "number", step: "any" });
  const periodSel = select([
    { v: "all", label: "All time" }, { v: "week", label: "This week" }, { v: "month", label: "This month" },
  ], draft.period, (v) => (draft.period = v));
  const metricSel = select(metricOpts, draft.metricId, (v) => (draft.metricId = v));

  /* track modes: simple check-off / slider / milestone boxes / auto from a metric */
  const TRACKS = [
    { v: "check", label: "✓ Check-off", hint: "Simple: done or not done. Tap the ring when you finish." },
    { v: "slider", label: "▰ Slider", hint: "Drag progress 0–100% as you go." },
    { v: "milestones", label: "☑ Boxes", hint: "A checklist of boxes — tick each one off as you go." },
    { v: "metric", label: "📈 Metric", hint: "Auto-progress from a metric's entries vs a target." },
  ];
  const trackHint = h("div", { class: "muted small field-hint" }, "");
  const trackSeg = h("div", { class: "seg wrap" });
  const renderTrack = () => {
    clear(trackSeg);
    trackSeg.append(...TRACKS.map((t) =>
      h("button", { class: "seg-btn" + (draft.track === t.v ? " on" : ""), onclick: () => { draft.track = t.v; renderTrack(); refreshMode(); } }, t.label)));
    trackHint.textContent = TRACKS.find((t) => t.v === draft.track)?.hint || "";
  };
  renderTrack();

  const sliderWrap = h("div", { class: "field" });
  const slider = h("input", { type: "range", min: 0, max: 100, value: draft.progress, class: "range" });
  const sliderVal = h("span", { class: "range-val" }, draft.progress + "%");
  slider.addEventListener("input", () => { draft.progress = Number(slider.value); sliderVal.textContent = slider.value + "%"; });
  sliderWrap.append(h("label", { class: "field-label" }, "Starting progress"), h("div", { class: "row" }, slider, sliderVal));

  const msList = h("div", { class: "ms-list" });
  const renderMs = () => {
    clear(msList);
    draft.milestones.forEach((m, i) => {
      const c = h("input", { type: "checkbox", checked: m.done, class: "switch" });
      c.addEventListener("change", () => (m.done = c.checked));
      const t = h("input", { class: "inp", value: m.name, placeholder: "Milestone…" });
      t.addEventListener("input", () => (m.name = t.value));
      msList.append(h("div", { class: "ms-row" }, c, t, iconBtn("x", "Remove", () => { draft.milestones.splice(i, 1); renderMs(); })));
    });
  };
  renderMs();

  const refreshMode = () => {
    clear(modeBox);
    if (draft.track === "metric") {
      modeBox.append(
        h("div", { class: "row" },
          field("Metric", metricSel),
          field("Target", targetInp),
          field("Period", periodSel)));
    } else if (draft.track === "slider") {
      modeBox.append(sliderWrap);
    } else if (draft.track === "milestones") {
      modeBox.append(field("Boxes", msList, btn("+ Add box", { kind: "ghost", onclick: () => { draft.milestones.push({ id: uid(), name: "", done: false }); renderMs(); } })));
    }
    // check mode: nothing extra — just a done ring
  };
  let modeBox;
  modeBox = h("div", {});
  refreshMode();

  const body = h("div", { class: "form" },
    h("div", { class: "row", style: "align-items:center" }, emojiBtn, field("Goal", inp(draft, "name", { placeholder: "Read 12 books this year…", autofocus: true }))),
    field("Track with", h("div", {}, trackSeg, trackHint)),
    modeBox,
    field("Note (optional)", area(draft, "note", 2, "Why this matters, reflections, progress thoughts…")),
    h("div", { class: "row" },
      field("Space", select([{ v: "", label: "No space" }, ...s.spaces.map((sp) => ({ v: sp.id, label: `${sp.emoji} ${sp.name}` }))], draft.spaceId || "", (v) => (draft.spaceId = v || null))),
      field("Deadline (optional)", inp(draft, "deadline", { type: "date" }))),
  );
  formModal({
    title: goal ? "Edit goal" : "New goal",
    body,
    onDelete: goal && (() => update((d) => deleteEntity(d, goal.id))),
    onSave: () => {
      if (!draft.name.trim()) {
        toast({ title: "Name the goal first ✍️", ic: "info" });
        return false;
      }
      update((d) => {
        const base = {
          name: draft.name.trim(), emoji: draft.emoji, spaceId: draft.spaceId,
          track: draft.track,
          metricId: draft.track === "metric" ? draft.metricId || null : null,
          target: draft.track === "metric" ? Number(draft.target) || 0 : null,
          period: draft.period,
          deadline: draft.deadline || null,
          milestones: draft.milestones.filter((m) => m.name.trim()).map((m) => ({ id: m.id, name: m.name.trim(), done: !!m.done })),
          progress: draft.track === "slider" ? draft.progress : null,
          note: draft.note.trim(),
        };
        let g;
        if (goal) { g = d.goals.find((x) => x.id === goal.id); Object.assign(g, base); }
        else { g = { id: uid(), ...base, done: false, doneAt: null, created: new Date().toISOString() }; d.goals.push(g); }
        if (!goal) setTimeout(() => watchGoals(), 60);
      });
      toast({ title: goal ? "Goal updated" : "Goal set 🎯", ic: "target", timeout: 2400 });
    },
  });
}

/* ============================== goal detail ============================== */

export function openGoalDetail(goal) {
  const s = getState();
  const p = goalProgress(s, goal);
  const space = goal.spaceId && s.spaces.find((x) => x.id === goal.spaceId);
  const metric = goal.metricId && s.metrics.find((x) => x.id === goal.metricId);
  const body = h("div", { class: "detail goal-detail" },
    h("div", { class: "goal-hero" },
      ring(p.pct, { size: 92, stroke: 9, label: Math.round(p.pct) + "%" }),
      h("div", {},
        p.metric ? h("div", { class: "goal-nums" }, `${p.fmt(p.current)} `, h("span", { class: "muted" }, "/ " + p.fmt(p.target)))
                 : h("div", { class: "goal-nums" }, `${Math.round(p.pct)}%`),
        metric && h("div", { class: "muted small" }, `from ${metric.emoji} ${metric.name} · ${({ all: "all time", week: "this week", month: "this month" })[goal.period || "all"]}`),
        goal.deadline && h("div", { class: "small" + (isPast(goal.deadline) ? " warn" : "") }, icon("calendar", 13), ` due ${relDay(goal.deadline)} — ${fmtDate(goal.deadline)}`))),
    goal.milestones?.length > 0 && h("div", { class: "ms-view" },
      h("div", { class: "field-label" }, "Milestones"),
      goal.milestones.map((m) => {
        const c = h("input", { type: "checkbox", checked: m.done, class: "switch" });
        c.addEventListener("change", () => {
          update((d) => {
            const g = d.goals.find((x) => x.id === goal.id);
            g.milestones.find((x) => x.id === m.id).done = c.checked;
          });
        });
        return h("label", { class: "ms-item" + (m.done ? " done" : "") }, c,
          h("span", {}, m.name));
      })),
    space && h("div", { style: "margin-top:14px" }, chip(`${space.emoji} ${space.name}`, { ic: "rocket", color: colorHex(space.color) })),
  );
  modal({
    title: `${goal.emoji || "🎯"} ${goal.name}`,
    body,
    footer: [
      goal.done && chip("Completed 🎉", { ic: "checkCircle" }),
      h("div", { class: "grow" }),
      btn("Edit", { onclick: () => openGoalEditor(goal) }),
    ],
  });
}

/* Central goal-completion watcher: celebrates goals crossing 100%,
 * un-completes goals that fall back under. Called on every state change. */
const celebrated = new Set();
export function watchGoals(quiet = false) {
  const s = getState();
  const toComplete = [], toReopen = [];
  for (const g of s.goals) {
    const pct = goalProgress(s, g).pct;
    if (pct >= 100 && !g.done) toComplete.push(g);
    else if (g.done && pct < 100) toReopen.push(g);
  }
  if (toComplete.length || toReopen.length) {
    update((d) => {
      for (const g of toComplete) {
        const gg = d.goals.find((x) => x.id === g.id);
        if (gg) { gg.done = true; gg.doneAt = new Date().toISOString(); }
      }
      for (const g of toReopen) {
        const gg = d.goals.find((x) => x.id === g.id);
        if (gg) { gg.done = false; gg.doneAt = null; }
        celebrated.delete(g.id);
      }
    });
  }
  if (quiet) {
    for (const g of toComplete) celebrated.add(g.id);
    return;
  }
  for (const g of toComplete) {
    if (celebrated.has(g.id)) continue;
    celebrated.add(g.id);
    confetti();
    toast({ title: `Goal complete — ${g.name}! 🎉`, ic: "trophy", timeout: 7000 });
  }
}

/* ============================== openEntity ============================== */

export function openEntity(id) {
  const f = findEntity(id);
  if (!f) return;
  closeModalAll();
  switch (f.type) {
    case "memory": return openMemoryDetail(f.ent);
    case "task": return openTaskEditor(f.ent);
    case "goal": return openGoalDetail(f.ent);
    case "space": return (location.hash = `#/space/${f.ent.id}`);
    case "metric": return openMetricDetail(f.ent);
    case "entry": {
      const m = getState().metrics.find((x) => x.id === f.ent.metricId);
      if (m) openEntryEditor(m, f.ent);
      return;
    }
  }
}
function closeModalAll() {
  document.querySelectorAll(".overlay").forEach((o) => o.remove());
  document.body.classList.remove("modal-open");
}

/* ============================== metric detail ============================== */

export function openMetricDetail(metric) {
  const s = getState();
  const st = metricStats(s, metric);
  const space = metric.spaceId && s.spaces.find((x) => x.id === metric.spaceId);
  const chartBox = h("div", { class: "chart-box" });
  if (metric.type !== "text") {
    const pts = st.days.slice(-30).map((d) => ({ label: fmtDate(d, { short: true }), v: st.byDay.get(d), tip: `${fmtDate(d)} — ${st.fmt(st.byDay.get(d))}` }));
    chartBox.append(lineChart(pts, { fmt: (v) => st.fmt(v) }));
  }
  const stats = metric.type === "text"
    ? [[st.count, "entries"], [st.streak + "🔥", "day streak"]]
    : [[st.fmt(st.last), "latest"], [st.fmt(st.best), "best"], [st.fmt(st.avg), "average"], [st.streak + "🔥", "day streak"]];
  const list = h("div", { class: "entry-log" });
  const renderList = () => {
    clear(list);
    const ents = entriesOfMetric(getState(), metric.id).slice(0, 12);
    if (!ents.length) { list.append(h("div", { class: "muted small", style: "padding:6px 2px" }, "No entries yet — log the first one!")); return; }
    for (const e of ents) {
      list.append(
        h("div", { class: "entry-log-row" },
          h("span", { class: "entry-log-date" }, fmtDate(e.date, { short: true })),
          h("b", { class: metricIsText(metric) ? "elog-text" : "" }, fmtEntryVal(metric, e.val).slice(0, 90)),
          h("span", { class: "muted small grow" }, e.note || ""),
          iconBtn("pencil", "Edit", () => openEntryEditor(metric, e)),
          iconBtn("trash", "Delete", async () => {
            if (await confirmDialog("Delete this entry?")) update((d) => (d.entries = d.entries.filter((x) => x.id !== e.id)));
          }))
      );
    }
  };
  renderList();
  const body = h("div", { class: "detail" },
    h("div", { class: "detail-meta" },
      chip(metric.type in METRIC_TYPES ? METRIC_TYPES[metric.type].label : metric.type, { ic: "chart" }),
      space && chip(`${space.emoji} ${space.name}`, { ic: "rocket", color: colorHex(space.color) })),
    chartBox,
    h("div", { class: "stat-grid" }, stats.map(([v, l]) => h("div", { class: "stat" }, h("b", {}, v), h("span", { class: "muted small" }, l)))),
    h("div", { class: "field-label", style: "margin-top:14px" }, "Recent entries"),
    list,
  );
  modal({
    title: `${metric.emoji || "📊"} ${metric.name}`,
    body,
    footer: [
      btn("Edit metric", { onclick: () => openMetricEditor(metric) }),
      h("div", { class: "grow" }),
      btn("Log entry", { kind: "accent", onclick: () => openEntryEditor(metric) }),
    ],
  });
}

/* ============================== quick add ============================== */

export function openQuickAdd() {
  const s = getState();
  const opts = [
    { ic: "spark", label: "Memory", hint: "a moment, person or place", fn: () => openMemoryEditor() },
    { ic: "check", label: "Task", hint: "something to do", fn: () => openTaskEditor() },
    { ic: "chart", label: "Log entry", hint: "add a metric value", fn: () => (s.metrics.length ? openMetricPicker((m) => openEntryEditor(m)) : (toast({ title: "Create a metric first", body: "Add one inside a Space 🌱", ic: "info" }), null)) },
    { ic: "rocket", label: "Space", hint: "a new corner of your life", fn: () => openSpaceEditor() },
  ];
  modal({
    title: "Quick add",
    body: h("div", { class: "qa-grid" }, opts.map((o) =>
      h("button", { class: "qa-btn", onclick: () => { closeModalAll(); o.fn(); } },
        h("span", { class: "qa-ic" }, icon(o.ic, 22)),
        h("span", { class: "qa-label" }, o.label),
        h("span", { class: "qa-hint" }, o.hint)))),
  });
}

export function openMetricPicker(onPick) {
  const s = getState();
  const list = h("div", { class: "link-list" });
  const ms = s.metrics;
  if (!ms.length) list.append(h("div", { class: "empty" }, h("div", { class: "empty-hint" }, "No metrics yet — create one in a Space")));
  else
    for (const m of ms) {
      const sp = s.spaces.find((x) => x.id === m.spaceId);
      list.append(
        h("button", { type: "button", class: "link-row", onclick: () => { closeModalAll(); onPick(m); } },
          h("span", { class: "emoji-badge sm" }, m.emoji),
          h("span", { class: "link-name" }, m.name),
          h("span", { class: "muted small" }, sp ? `${sp.emoji} ${sp.name}` : fmtVal(m.type, 1, m.unit)))
      );
    }
  modal({ title: "Pick a metric", body: list });
}
