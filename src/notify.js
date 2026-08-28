/* ASTER — gentle notification scheduler.
 * Reminders fire only while the app is open, respect quiet hours,
 * and are capped per day. Never spammy. */

import { getState, update } from "./store.js";
import { toast } from "./components.js";
import { todayKey, isPast, addDays, fmtDate, fmtTime } from "./utils.js";
import { playSound } from "./sound.js";

/* System-notification bridges:
 *  - Android shell exposes window.AsterNotify (JavascriptInterface)
 *  - ASTER Windows exe exposes window.chrome.webview (WebMessage) → native balloon
 *  - plain browsers use the Web Notification API */
const android = () => (typeof window !== "undefined" && window.AsterNotify && typeof window.AsterNotify.show === "function" ? window.AsterNotify : null);
const winExe = () => (typeof window !== "undefined" && window.chrome?.webview?.postMessage ? window.chrome.webview : null);

export function remindAtOf(task) {
  if (!task.time || !task.due) return null;
  const d = new Date(`${task.due}T${task.time}`);
  return isNaN(d) ? null : d;
}

export function inQuietHours(now, { quietStart, quietEnd }) {
  if (!quietStart || !quietEnd || quietStart === quietEnd) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [sh, sm] = quietStart.split(":").map(Number);
  const [eh, em] = quietEnd.split(":").map(Number);
  const s = sh * 60 + sm, e = eh * 60 + em;
  return s < e ? cur >= s && cur < e : cur >= s || cur < e; // wraps midnight
}

export function hostNotify(title, body, tag) {
  const a = android();
  if (a) { try { a.show(title, body); return true; } catch { return false; } }
  const w = winExe();
  if (w) { try { w.postMessage(JSON.stringify({ aster: "notify", title, body, tag })); return true; } catch { return false; } }
  return false;
}

export async function requestPermission() {
  if (android()) { try { android().request(); } catch {} return "granted"; }
  if (winExe()) return "granted";
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") return "granted";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

function fire(task, when, view = "#/tasks", { host = true } = {}) {
  const title = task.title;
  const body = when ? `Due ${when}` : "A gentle nudge from ASTER";
  toast({ title, body, ic: "bell", timeout: 8000, actions: [{ label: "View", fn: () => { location.hash = view; } }] });
  playSound("notify");
  /* plain-ASCII prefix — special glyphs garble in some native notifiers */
  const head = `ASTER: ${title}`;
  if (host && hostNotify(head, body, task.id)) return;
  if (host && "Notification" in window && Notification.permission === "granted" && document.hidden) {
    try {
      new Notification(head, { body, tag: task.id, silent: false });
    } catch {}
  }
}

let timer = null;
export function initScheduler() {
  if (timer) clearInterval(timer);
  timer = setInterval(check, 30000);
  setTimeout(check, 1500);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check();
  });
}

/* Keep the phone's native alarm list in sync — reminders then fire in the
   notification bar even when ASTER is closed (Android bridge). */
let lastSynced = "";
export function syncReminders() {
  const bridge = android();
  if (!bridge?.sync) return;
  try {
    const s = getState();
    const list = (s.reminders || [])
      .filter((r) => !r.done && r.date && r.time)
      .map((r) => {
        const at = new Date(`${r.date}T${r.time}`).getTime();
        return isNaN(at) || at <= Date.now() ? null : { id: r.id, title: r.title, body: r.note || `at ${fmtTime(r.time)}`, at };
      })
      .filter(Boolean);
    const json = JSON.stringify(list);
    if (json === lastSynced) return;
    lastSynced = json;
    bridge.sync(json);
  } catch {}
}

/* Keep the phone's home-screen widgets in sync (Android bridge):
 * spaces / tasks / goals / reminders / home summary, all in one push.
 * Widgets never mutate data — taps just open the app at the right view. */
let lastWidgetSync = "";
export function syncWidgetData() {
  const bridge = android();
  if (!bridge?.widgetData) return;
  try {
    const s = getState();
    const today = todayKey();
    const due = s.tasks.filter((t) => !t.done && t.due && t.due <= today);
    const rem = (s.reminders || [])
      .filter((r) => !r.done && r.date >= today)
      .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
    const goals = s.goals.filter((g) => !g.done);
    const data = {
      spaces: s.spaces.map((sp) => ({ spaceId: sp.id, route: "spaces", name: sp.name, emoji: sp.emoji || "🌱" })),
      tasks: due.slice(0, 4).map((t) => ({ route: "tasks", name: t.title })),
      goals: goals.slice(0, 4).map((g) => ({ route: "goals", name: g.name })),
      reminders: rem.slice(0, 4).map((r) => ({
        route: "reminders",
        name: `${r.date === today ? "" : fmtDate(r.date, { short: true }) + " - "}${r.time ? fmtTime(r.time) + " - " : ""}${r.title}`,
      })),
      home: [
        { route: "tasks", emoji: "✅", name: `${due.length} due` },
        { route: "goals", emoji: "🎯", name: `${goals.length} active` },
        { route: "reminders", emoji: "⏰", name: `${rem.length} reminder${rem.length === 1 ? "" : "s"}` },
      ],
    };
    const json = JSON.stringify(data);
    if (json === lastWidgetSync) return;
    lastWidgetSync = json;
    bridge.widgetData(json);
  } catch {}
}

export function check() {
  const s = getState();
  const cfg = s.settings.notifications;
  if (!cfg.enabled) return;
  const today = todayKey();
  if (s.notif.day !== today || s.notif.count < 0) {
    update((d) => {
      d.notif.day = today;
      d.notif.count = 0;
    });
    return;
  }
  const now = new Date();
  if (inQuietHours(now, cfg)) return;
  if (s.notif.count >= cfg.maxPerDay) return;

  for (const t of s.tasks) {
    if (t.done || !t.remind || !t.time || !t.due) continue;
    const key = `${t.id}:${t.due}:${t.time}`;
    if (s.notif.fired[key]) continue;
    const at = remindAtOf(t);
    if (!at || at > now) continue;
    // Too stale (> 1 day overdue): mark seen silently instead of pinging.
    if (isPast(addDays(t.due, -1)) && t.due < today) {
      update((d) => void (d.notif.fired[key] = true));
      continue;
    }
    const when = t.due === today ? `today at ${fmtTime(t.time)}` : `on ${t.due}`;
    fire(t, when);
    update((d) => {
      d.notif.fired[key] = true;
      d.notif.count++;
      const keys = Object.keys(d.notif.fired);
      if (keys.length > 300) for (const k of keys.slice(0, keys.length - 200)) delete d.notif.fired[k];
    });
    if (getState().notif.count >= cfg.maxPerDay) break;
  }

  /* standalone reminders (Reminders tab) — native alarms cover the system
     notification on Android, so in-app we only toast + chime */
  if (getState().notif.count >= cfg.maxPerDay) return;
  for (const r of s.reminders || []) {
    if (r.done || !r.date || !r.time) continue;
    const key = `r:${r.id}:${r.date}:${r.time}`;
    if (s.notif.fired[key]) continue;
    const at = new Date(`${r.date}T${r.time}`);
    if (isNaN(at) || at > now) continue;
    fire({ id: r.id, title: r.title }, r.date === today ? `now · ${fmtTime(r.time)}` : `on ${fmtDate(r.date)}`, "#/reminders", { host: !android() });
    update((d) => {
      d.notif.fired[key] = true;
      d.notif.count++;
    });
    if (getState().notif.count >= cfg.maxPerDay) break;
  }
}
