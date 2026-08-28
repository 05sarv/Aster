/* ASTER — app shell: router, navigation, welcome, boot. */

import { h, clear, uid, todayKey } from "./utils.js";
import { icon } from "./icons.js";
import { init, getState, subscribe, update } from "./store.js";
import { applyTheme, modal, btn, toast, swatchRow, CLEAN } from "./components.js";
import { watchGoals } from "./editors.js";
import { initScheduler, syncReminders, syncWidgetData } from "./notify.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderToday } from "./views/today.js";
import { renderCleanLog, setLogFilter } from "./views/cleanlog.js";
import { renderMemories } from "./views/memories.js";
import { renderTasks } from "./views/tasks.js";
import { renderSpaces, renderSpace } from "./views/spaces.js";
import { renderGoals } from "./views/goals.js";
import { renderReminders } from "./views/reminders.js";
import { renderProgress } from "./views/progress.js";
import { renderMap } from "./views/mapview.js";
import { renderSettings } from "./views/settings.js";
import { openQuickAdd, openSpaceEditor, openTaskEditor, openGoalEditor, openMemoryEditor, openMetricEditor, openEntryEditor, openReminderEditor, openMetricPicker } from "./editors.js";
const app = document.getElementById("app");

const NAV = [
  { key: "dashboard", hash: "#/dashboard", label: "Home", ic: "home" },
  { key: "spaces", hash: "#/spaces", label: "Spaces", ic: "rocket" },
  { key: "tasks", hash: "#/tasks", label: "Tasks", ic: "check" },
  { key: "goals", hash: "#/goals", label: "Goals", ic: "target" },
  { key: "reminders", hash: "#/reminders", label: "Reminders", ic: "bell" },
  { key: "memories", hash: "#/memories", label: "Memories", ic: "spark" },
  { key: "map", hash: "#/map", label: "Map", ic: "map" },
  { key: "settings", hash: "#/settings", label: "Settings", ic: "gear" },
];

/* ASTER Clean: four tabs, one quick bar — everything is one tap away. */
const NAV_CLEAN = [
  { key: "today", hash: "#/today", label: "Today", ic: "sun" },
  { key: "memories", hash: "#/memories", label: "Notes", ic: "spark" },
  { key: "log", hash: "#/log", label: "Log", ic: "check" },
  { key: "settings", hash: "#/settings", label: "Settings", ic: "gear" },
];

/* The quick bar: type + Enter captures straight into the current tab. */
function quickBar(r) {
  const conf = {
    today: { ph: "add a task for today…", ic: "check", run: (t) => {
      update((d) => d.tasks.unshift({ id: uid(), title: t, notes: "", due: todayKey(), time: null, priority: "med", recurrence: null, remind: false, spaceId: null, tags: [], done: false, doneAt: null, history: [], created: new Date().toISOString() }));
      toast({ title: "Added to today ✓", ic: "check", timeout: 1500 });
    } },
    memories: { ph: "write a note…", ic: "spark", run: (t) => {
      update((d) => d.memories.unshift({ id: uid(), kind: "moment", title: t, body: t, date: todayKey(), emoji: "✨", spaceId: null, tags: [], atts: [], mood: 4, favorite: false, created: new Date().toISOString(), updated: new Date().toISOString() }));
      toast({ title: "Noted ✨", ic: "spark", timeout: 1500 });
    } },
    log: { ph: "filter metrics — Enter logs the first match", ic: "chart", run: null },
  }[r.key];

  const inp = h("input", { class: "inp qb-inp", placeholder: conf?.ph || "add anything…", enterkeyhint: "done" });
  if (r.key === "log") {
    inp.addEventListener("input", () => setLogFilter(inp.value));
    inp.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || !inp.value.trim()) return;
      e.preventDefault();
      setLogFilter(inp.value);
      const first = document.querySelector("#view .log-row");
      if (first) first.click(); else inp.select();
    });
  } else if (conf) {
    inp.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" || !inp.value.trim()) return;
      e.preventDefault();
      conf.run(inp.value.trim());
      inp.value = "";
    });
  }
  return h("div", { class: "qb" },
    h("span", { class: "qb-ic" }, icon(conf?.ic || "plus", 17)),
    inp);
}

/* The + button does what the current view is about. */
function fabAction(r) {
  switch (r.key) {
    case "spaces":
      return () => openSpaceEditor();
    case "space": {
      const s = getState();
      const metrics = s.metrics.filter((m) => m.spaceId === r.id);
      if (!metrics.length) return () => openMetricEditor(null, { spaceId: r.id });
      if (metrics.length === 1) return () => openEntryEditor(metrics[0]);
      // several metrics → let the user pick which one to log
      return () => openMetricPicker((m) => openEntryEditor(m));
    }
    case "tasks":
      return () => openTaskEditor();
    case "reminders":
      return () => openReminderEditor();
    case "goals":
      return () => openGoalEditor();
    case "memories":
      return () => openMemoryEditor();
    case "today":
      return () => openTaskEditor(); // a gentle capture for the day
    case "settings":
      return null; // no floating + on settings
    default:
      return () => openQuickAdd(); // home, map, progress
  }
}

function route() {
  const parts = (location.hash || "#/dashboard").replace(/^#\/?/, "").split("/");
  if (parts[0] === "space" && parts[1]) return { key: "space", id: parts[1] };
  return { key: parts[0] || "dashboard" };
}

let lastRouteKey = null;
function renderShell() {
  const r = route();
  const s = getState();
  const routeKey = r.key + (r.id || "");
  const navigated = lastRouteKey !== null && lastRouteKey !== routeKey;
  lastRouteKey = routeKey;
  const view = h("div", { id: "view", class: "view route-" + r.key + (navigated ? " entering" : "") });

  const fabAction_ = fabAction(r);
  const fab = fabAction_
    ? h("button", { class: "fab" + (navigated ? " swap" : ""), title: "Add", "aria-label": "Add", onclick: fabAction_ }, icon("plus", 24))
    : null;

  /* ASTER Clean: one calm column — header, quick bar, content, floating tabs. No FAB (the bar is the adder). */
  if (CLEAN()) {
    const head = h(
      "header",
      { class: "clean-head" },
      h("a", { class: "logo", href: "#/today" }, h("span", { class: "logo-mark" }, "✦"), h("span", { class: "logo-tx" }, "ASTER Clean")),
      h("div", { class: "head-tools" },
        h("button", { class: "icon-btn", title: "Toggle theme", onclick: toggleTheme }, icon(themeIcon(), 18)))
    );
    const tabs = h(
      "nav",
      { class: "clean-bottom" },
      NAV_CLEAN.map((n) =>
        h("a", { class: "clean-tab" + (r.key === n.key ? " active" : ""), href: n.hash },
          icon(n.ic, 20), h("span", {}, n.label)))
    );
    const qb = quickBar(r);
    const shell = h("div", { class: "clean-shell" }, head, ...(qb ? [qb] : []), h("main", { class: "clean-main" }, view));
    app.replaceChildren(shell, tabs);
    renderRoute(r, view);
    if (navigated) window.scrollTo(0, 0);
    else if (r.key === "log") setLogFilter("");
    return;
  }

  /* desktop sidebar */
  const sidebar = h(
    "aside",
    { class: "sidebar" },
    h("a", { class: "logo", href: "#/dashboard" }, h("span", { class: "logo-mark" }, "✦"), h("span", { class: "logo-tx" }, "ASTER")),
    h("nav", { class: "side-nav" }, NAV.map((n) =>
      h("a", { class: "side-link" + (r.key === n.key || (r.key === "space" && n.key === "spaces") ? " active" : ""), href: n.hash },
        icon(n.ic, 19), h("span", {}, n.label)))),
    h("div", { class: "side-foot" },
      h("button", { class: "icon-btn big", title: "Toggle theme", onclick: toggleTheme }, icon(themeIcon(), 19)),
      h("span", { class: "muted tiny" }, "local-first ✦ v1.0"))
  );

  /* mobile chrome */
  const mobileHead = h(
    "header",
    { class: "mobile-head" },
    h("a", { class: "logo", href: "#/dashboard" }, h("span", { class: "logo-mark" }, "✦"), h("span", { class: "logo-tx" }, "ASTER")),
    h("div", { class: "head-tools" },
      h("a", { class: "icon-btn", href: "#/memories", title: "Memories" }, icon("spark", 18)),
      h("a", { class: "icon-btn", href: "#/map", title: "Map & timeline" }, icon("map", 18)),
      h("button", { class: "icon-btn", title: "Toggle theme", onclick: toggleTheme }, icon(themeIcon(), 18)),
      h("a", { class: "icon-btn", href: "#/settings", title: "Settings" }, icon("gear", 18)))
  );
  const bottomNav = h(
    "nav",
    { class: "bottom-nav" },
    NAV.slice(0, 5).map((n) =>
      h("a", { class: "bottom-link" + (r.key === n.key || (r.key === "space" && n.key === "spaces") ? " active" : ""), href: n.hash },
        icon(n.ic, 21), h("span", {}, n.label)))
  );

  const main = h("main", { class: "main" }, mobileHead, view);

  /* remember where you were before the re-render (toggles must not yank you to the top) */
  const se = document.scrollingElement || document.documentElement;
  const prevTop = se.scrollTop;
  const prevMainTop = document.querySelector(".main")?.scrollTop || 0;

  app.replaceChildren(sidebar, main, bottomNav, ...(fab ? [fab] : []));
  renderRoute(r, view);
  if (navigated) {
    main.scrollTop = 0;
    window.scrollTo(0, 0);
  } else {
    se.scrollTop = prevTop;
    main.scrollTop = prevMainTop;
  }
}

function renderRoute(r, view) {
  switch (r.key) {
    case "today": renderToday(view); break;
    case "memories": renderMemories(view); break;
    case "tasks": renderTasks(view); break;
    case "spaces": renderSpaces(view); break;
    case "space": renderSpace(view, r.id); break;
    case "goals": renderGoals(view); break;
    case "reminders": renderReminders(view); break;
    case "progress": renderProgress(view); break;
    case "log": renderCleanLog(view); break;
    case "map": renderMap(view); break;
    case "settings": renderSettings(view); break;
    default: CLEAN() ? renderToday(view) : renderDashboard(view);
  }
}

function cleanWelcome() {
  const nameInp = h('input', { class: 'inp', placeholder: 'what should we call you?', autofocus: true });
  const begin = () => {
    update((d) => {
      d.settings.name = nameInp.value.trim();
      d.settings.seenWelcome = true;
      if (!d.settings.accent) d.settings.accent = 'sage';
    });
    applyTheme(getState());
    scr.remove();
    renderShell();
    const name = nameInp.value.trim();
    toast({ title: name ? "Welcome, " + name + " ✦" : "Welcome ✦", body: "Take a breath. This is your quiet place.", ic: "spark", timeout: 5200 });
  };
  nameInp.addEventListener('keydown', (e) => { if (e.key === 'Enter') begin(); });
  const scr = h('div', { class: 'clean-welcome' },
    h('div', { class: 'cw-mark' }, '✦'),
    h('h1', {}, 'ASTER Clean'),
    h('p', {}, 'A quiet place for your day — small notes, small wins, gentle nudges. Nothing here shouts.'),
    nameInp,
    btn('Begin ✦', { kind: 'accent', onclick: begin }));
  document.body.append(scr);
  setTimeout(() => nameInp.focus(), 250);
}

function themeIcon() {
  const t = document.documentElement.dataset.theme;
  return t === "dark" ? "sun" : "moon";
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme;
  update((d) => (d.settings.theme = cur === "dark" ? "light" : "dark"));
  applyTheme(getState());
  renderShell();
}

function welcome() {
  const s = getState();
  const draft = { name: "", accent: s.settings.accent, theme: s.settings.theme };
  const nameInp = h("input", { class: "inp", placeholder: "Your name (optional)", autofocus: true });
  nameInp.addEventListener("input", () => (draft.name = nameInp.value));
  const sw = swatchRow(draft.accent, (id) => {
    draft.accent = id;
    update((d) => (d.settings.accent = id));
    applyTheme(getState());
  });
  const themeRow = h("div", { class: "seg" });
  const renderTheme = () => themeRow.replaceChildren(
    ...["auto", "light", "dark"].map((t) =>
      h("button", { class: "seg-btn" + (draft.theme === t ? " on" : ""), onclick: () => {
          draft.theme = t;
          update((d) => (d.settings.theme = t));
          applyTheme(getState());
          renderTheme();
        } },
        icon(t === "auto" ? "spark" : t === "light" ? "sun" : "moon", 15), { auto: "Auto", light: "Light", dark: "Dark" }[t])));
  renderTheme();
  const md = modal({
    title: "Welcome to ASTER ✦",
    body: h("div", { class: "welcome" },
      h("p", { class: "muted" }, "A cozy home for your memories, tasks and everything you're growing. Let's make it yours."),
      h("div", { class: "field-label" }, "What should I call you?"),
      nameInp,
      h("div", { class: "field-label", style: "margin-top:14px" }, "Pick a vibe"),
      themeRow,
      sw,
      h("p", { class: "muted small", style: "margin-top:12px" }, "Everything stays on this device — private by default.")),
    footer: [
      h("div", { class: "grow" }),
      btn("Start exploring ✦", { kind: "accent", onclick: () => {
          update((d) => {
            d.settings.name = draft.name.trim();
            d.settings.accent = draft.accent;
            d.settings.theme = draft.theme;
            d.settings.seenWelcome = true;
          });
          applyTheme(getState());
          md.close();
          toast({ title: `Welcome aboard${draft.name ? ", " + draft.name : ""}! 🌱`, body: "Try creating your first Space — or save a memory.", ic: "spark", timeout: 5200 });
        } }),
    ],
  });
}

async function boot() {
  await init();
  applyTheme(getState());
  watchGoals(true); // silently mark already-complete goals
  renderShell();
  subscribe(() => {
    renderShell();
    watchGoals();
    syncReminders();
    syncWidgetData();
  });
  syncReminders();
  syncWidgetData();
  initScheduler();
  if (!getState().settings.seenWelcome) CLEAN() ? cleanWelcome() : welcome();
  window.addEventListener("hashchange", renderShell);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getState().settings.theme === "auto") applyTheme(getState());
  });
}
boot();
