/* ASTER — Settings: themes, gentle notifications, data & backups. */

import { h, download, todayKey } from "../utils.js";
import { icon } from "../icons.js";
import { getState, update, exportAll, importAll, seedState, storageMode, putAtt } from "../store.js";
import { btn, chip, iconBtn, swatchRow, PALETTE, BACKGROUNDS, applyTheme, toast, confirmDialog, modal } from "../components.js";
import { playSound, previewSound, SOUND_OPTIONS, currentSound } from "../sound.js";
import { requestPermission, inQuietHours } from "../notify.js";

function card(title, ic, ...children) {
  return h("section", { class: "settings-card card" },
    h("div", { class: "settings-head" }, icon(ic, 17), h("h3", {}, title)),
    ...children);
}
function row(label, sub, control) {
  return h("div", { class: "settings-row" },
    h("div", { class: "settings-row-tx" }, h("b", {}, label), sub && h("span", { class: "muted small" }, sub)),
    h("div", { class: "settings-row-ctl" }, control));
}
const toggle = (get, set) => {
  const c = h("input", { type: "checkbox", class: "switch", checked: get() });
  c.addEventListener("change", () => set(c.checked));
  return c;
};

export function renderSettings(root) {
  const s = getState();
  const st = s.settings;

  /* ---- profile ---- */
  // commit on blur/Enter only — updating per keystroke rebuilds the page and
  // closes the phone keyboard after every letter
  const name = h("input", { class: "inp", value: st.name, placeholder: "What should ASTER call you?" });
  name.addEventListener("change", () => update((d) => (d.settings.name = name.value.trim())));

  /* ---- appearance ---- */
  const themeSeg = h("div", { class: "seg" });
  const renderTheme = () => {
    themeSeg.replaceChildren(
      ...["auto", "light", "dark"].map((t) =>
        h("button", { class: "seg-btn" + (st.theme === t ? " on" : ""), onclick: () => { update((d) => (d.settings.theme = t)); applyTheme(getState()); renderTheme2(); } },
          icon(t === "auto" ? "spark" : t === "light" ? "sun" : "moon", 15), { auto: "Auto", light: "Light", dark: "Dark" }[t])));
  };
  const renderTheme2 = renderTheme;
  renderTheme();

  const bgSeg = h("div", { class: "seg" });
  const renderBg = () => {
    const cur = st.bg || "glow";
    bgSeg.replaceChildren(...BACKGROUNDS.map((b) =>
      h("button", { class: "seg-btn" + (cur === b.id ? " on" : ""), onclick: () => { update((d) => (d.settings.bg = b.id)); applyTheme(getState()); renderBg(); } }, b.label)));
  };
  renderBg();

  const sounds = toggle(() => st.sounds !== false, (v) => update((d) => (d.settings.sounds = v)));

  /* ---- sounds: pick a chime, or import your own clip ---- */
  const soundSel = h("select", { class: "inp", style: "width:150px", title: "Reminder sound" });
  const renderSoundSel = () => {
    const cur = currentSound();
    soundSel.replaceChildren(...SOUND_OPTIONS.map((o) => {
      const op = h("option", { value: o.id }, o.label);
      if (o.id === cur) op.selected = true;
      return op;
    }));
    if (cur === "custom" || !SOUND_OPTIONS.some((o) => o.id === cur)) {
      const op = h("option", { value: "custom" }, "Custom ♪");
      op.selected = true;
      soundSel.append(op);
    }
  };
  soundSel.addEventListener("change", () => {
    const v = soundSel.value;
    update((d) => (d.settings.sound = v));
    previewSound(v);
  });
  renderSoundSel();
  const sndFile = h("input", { type: "file", accept: "audio/*", style: "display:none" });
  sndFile.addEventListener("change", async () => {
    const f = sndFile.files[0];
    sndFile.value = "";
    if (!f) return;
    if (f.size > 1.5 * 1024 * 1024) {
      toast({ title: "That clip is too big", body: "Keep it under ~1.5 MB — a short sound is all you need.", ic: "info" });
      return;
    }
    try {
      const data = await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(f);
      });
      await putAtt({ id: "sound-custom", name: f.name, created: new Date().toISOString() }, data);
      update((d) => (d.settings.sound = "custom"));
      renderSoundSel();
      previewSound("custom");
      toast({ title: "Custom sound saved ♪", body: f.name, ic: "bell", timeout: 2600 });
    } catch {
      toast({ title: "Couldn't read that sound", ic: "info" });
    }
  });

  /* ---- notifications ---- */
  const n = st.notifications;
  const notifToggle = toggle(() => n.enabled, async (v) => {
    if (v) {
      const perm = await requestPermission();
      if (perm === "denied") {
        toast({ title: "Browser blocked notifications", body: "ASTER will still nudge you with in-app toasts.", ic: "bell", timeout: 5000 });
      }
    }
    update((d) => (d.settings.notifications.enabled = v));
    renderNotifState();
  });
  const quietStart = h("input", { type: "time", class: "inp slim", value: n.quietStart });
  quietStart.addEventListener("change", () => update((d) => (d.settings.notifications.quietStart = quietStart.value)));
  const quietEnd = h("input", { type: "time", class: "inp slim", value: n.quietEnd });
  quietEnd.addEventListener("change", () => update((d) => (d.settings.notifications.quietEnd = quietEnd.value)));
  const maxPerDay = h("input", { type: "number", min: 1, max: 30, class: "inp slim", value: n.maxPerDay });
  maxPerDay.addEventListener("change", () => update((d) => (d.settings.notifications.maxPerDay = Math.max(1, Number(maxPerDay.value) || 6))));
  const notifHint = h("span", { class: "muted small" }, "");
  const renderNotifState = () => {
    const cur = getState().settings.notifications;
    notifHint.textContent = inQuietHours(new Date(), cur)
      ? `🌙 Quiet hours active until ${cur.quietEnd} · ${getState().notif.count}/${cur.maxPerDay} nudges today`
      : `Awake hours · ${getState().notif.count}/${cur.maxPerDay} nudges sent today`;
  };
  renderNotifState();

  /* ---- data ---- */
  const withPhotos = { v: true };
  const exportBtn = async () => {
    toast({ title: "Packing your backup…", ic: "download", timeout: 1500 });
    const json = await exportAll(withPhotos.v);
    download(`aster-backup-${todayKey()}.json`, json);
    toast({ title: "Backup downloaded ✦", body: "Keep it somewhere safe — it contains everything.", ic: "download", timeout: 4200 });
  };
  const importFile = h("input", { type: "file", accept: ".json,application/json", style: "display:none" });
  importFile.addEventListener("change", async () => {
    const f = importFile.files[0];
    if (!f) return;
    try {
      const text = await f.text();
      if (!(await confirmDialog("Importing replaces everything currently in ASTER with the backup. Continue?", { okLabel: "Import", danger: true }))) return;
      await importAll(text);
      location.hash = "#/dashboard";
      location.reload();
    } catch (err) {
      toast({ title: "Import failed", body: String(err.message || err), ic: "info" });
    }
    importFile.value = "";
  });

  const counts = [
    ["Memories", s.memories.length], ["Tasks", s.tasks.length], ["Spaces", s.spaces.length],
    ["Metrics", s.metrics.length], ["Entries", s.entries.length], ["Goals", s.goals.length],
  ];

  root.append(
    h("div", { class: "page-head", },
      h("div", {}, h("h1", {}, "Settings"), h("p", { class: "subtitle" }, "Make ASTER feel like yours."))),

    card("You", "user",
      row("Your name", "used in greetings", name)),

    card("Appearance", "palette",
      row("Theme", "light, dark or follow your system", themeSeg),
      row("Accent color", null, h("div", {}, swatchRow(st.accent, (id) => { update((d) => (d.settings.accent = id)); applyTheme(getState()); }), h("div", { class: "muted small", style: "margin-top:6px" }, "Accents tint buttons, rings and highlights everywhere."))),
      row("Background", null, bgSeg),
      row("Sounds", "the chime for reminders & little wins", h("div", { class: "row", style: "gap:8px;align-items:center" },
        sounds, soundSel,
        btn("▶", { kind: "ghost", title: "Preview sound", onclick: () => previewSound(soundSel.value) }),
        btn("Import ♪", { kind: "ghost", title: "Use your own sound file", onclick: () => sndFile.click() }),
        sndFile))),

    card("Gentle notifications", "bell",
      row("Reminders", "nudges for tasks with a time — only while ASTER is open", notifToggle),
      row("Quiet hours", "no nudges between these times", h("div", { class: "row" }, quietStart, h("span", { class: "muted" }, "→"), quietEnd)),
      row("Daily limit", "ASTER never nags beyond this", maxPerDay),
      h("div", { class: "settings-note" }, icon("smile", 14), notifHint),
      h("div", { style: "margin-top:10px" }, btn("Send me a test nudge", { kind: "ghost", onclick: () => { playSound("notify"); toast({ title: "A gentle nudge ✦", body: "This is how reminders will feel. Soft, right?", ic: "bell", timeout: 6000 }); } }))),

    card("Dashboard", "grid",
      row("Reset widget layout", "back to the default cozy setup", btn("Reset", { kind: "ghost", onclick: async () => {
        if (await confirmDialog("Reset dashboard widgets to the default layout?", { okLabel: "Reset", danger: true })) {
          update((d) => (d.widgets = seedState().widgets));
          toast({ title: "Dashboard reset ✦", ic: "grid", timeout: 2400 });
        }
      } }))),

    card("Data & sync", "download",
      row("Where your data lives", "offline-first — nothing leaves this device", h("span", { class: "chip" }, icon("check", 13), storageMode())),
      row("Storage used", null, h("span", { class: "muted small" }, counts.map(([l, n]) => `${n} ${l.toLowerCase()}`).join(" · "))),
      row("Export backup", "a single JSON file with everything", h("div", { class: "row" },
        toggle(() => withPhotos.v, (v) => (withPhotos.v = v)), h("span", { class: "muted small" }, "include photos"), btn("Export", { kind: "accent", ic: "download", onclick: exportBtn }))),
      row("Import backup", "restore from an ASTER backup file", btn("Choose file…", { ic: "upload", onclick: () => importFile.click() })),
      importFile,
      h("div", { class: "settings-note" }, icon("info", 14), "Moving devices? Export here, then import on the other device — that's the sync. Your data never touches a server.")),

    card("Danger zone", "trash",
      row("Erase everything", "wipes all ASTER data from this browser", btn("Reset ASTER", { kind: "danger", onclick: async () => {
        if (!(await confirmDialog("This permanently erases ALL your memories, tasks, spaces and progress. There is no undo.", { okLabel: "Erase everything" }))) return;
        if (!(await confirmDialog("Really sure? Consider exporting a backup first.", { okLabel: "Yes, erase it all" }))) return;
        update((d) => Object.assign(d, seedState(), { settings: { ...d.settings, seenWelcome: true } }));
        toast({ title: "ASTER reset — fresh start 🌱", ic: "spark" });
        location.hash = "#/dashboard";
      } }))),

    h("p", { class: "about-foot muted small" }, `ASTER v1.0 · made with 💛 for people who love growing things · ${counts.reduce((a, [, b]) => a + b, 0)} little pieces of you`)
  );
}
