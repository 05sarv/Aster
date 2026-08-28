/* ASTER — reactive store + local-first persistence (IndexedDB, localStorage fallback). */

import { uid, todayKey, debounce } from "./utils.js";

const SCHEMA_VERSION = 1;
const CLEAN = typeof window !== 'undefined' && !!window.__ASTER_CLEAN__;
const DB_NAME = CLEAN ? 'aster-clean-db' : 'aster-db';
const STORE_KV = "kv";
const STORE_ATTS = "atts";

/* Entity type → collection key in state. Everything is linkable by id. */
export const TYPES = {
  space: "spaces",
  memory: "memories",
  task: "tasks",
  metric: "metrics",
  entry: "entries",
  goal: "goals",
};

let state = null;
const listeners = new Set();
let idb = null;
let usingFallback = false;

/* ---------- IndexedDB helpers ---------- */
function openIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_KV)) db.createObjectStore(STORE_KV);
      if (!db.objectStoreNames.contains(STORE_ATTS)) db.createObjectStore(STORE_ATTS);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const tx = (store, mode) => idb.transaction(store, mode).objectStore(store);
const reqP = (req) =>
  new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

/* ---------- seed ---------- */
export function seedState() {
  const t = todayKey();
  return {
    version: SCHEMA_VERSION,
    settings: {
      name: "",
      theme: "auto",
      accent: CLEAN ? "sage" : "peach",
      bg: CLEAN ? "plain" : "glow",
      sounds: true,
      sound: "notify",
      seenWelcome: false,
      notifications: { enabled: false, quietStart: "22:00", quietEnd: "08:00", maxPerDay: 6 },
    },
    spaces: [],
    memories: [
      {
        id: uid(),
        kind: "moment",
        title: "Welcome to ASTER ✦",
        body:
          "This is your cozy second brain. A few tips to get started:\n\n" +
          "• Save memories — moments, people, places and photos you never want to forget\n" +
          "• Keep tasks — with due dates, priorities and gentle reminders\n" +
          "• Create Spaces — for anything you're growing (gym, guitar, travel, finance…)\n" +
          "• Track progress — custom metrics, goals and milestones\n\n" +
          "Everything stays on your device. Have fun! 🌱",
        date: t,
        emoji: "✨",
        spaceId: null,
        tags: ["aster"],
        atts: [],
        mood: 5,
        favorite: true,
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
    ],
    tasks: [
      { id: uid(), title: "Save your first memory 💭", notes: "", due: t, time: null, priority: "med", recurrence: null, remind: false, spaceId: null, tags: [], done: false, doneAt: null, history: [], created: new Date().toISOString() },
      { id: uid(), title: "Create a Space for something you love", notes: "Gym, Guitar, Reading, Finance — anything!", due: t, time: null, priority: "med", recurrence: null, remind: false, spaceId: null, tags: [], done: false, doneAt: null, history: [], created: new Date().toISOString() },
      { id: uid(), title: "Evening reflection ✍️", notes: "Jot one good thing about today.", due: t, time: "21:00", priority: "low", recurrence: "daily", remind: true, spaceId: null, tags: [], done: false, doneAt: null, history: [], created: new Date().toISOString() },
    ],
    metrics: [],
    entries: [],
    goals: [],
    relations: [],
    mapLinks: [],
    reminders: [],
    widgets: [
      { id: uid(), type: "greeting", cfg: {}, size: 2 },
      { id: uid(), type: "tasksToday", cfg: {}, size: 2 },
      { id: uid(), type: "memories", cfg: {}, size: 2 },
      { id: uid(), type: "upcoming", cfg: {}, size: 2 },
    ],
    notif: { day: t, count: 0, fired: {} },
  };
}

/* ---------- init / persistence ---------- */
export async function init() {
  try {
    idb = await openIDB();
    const saved = await reqP(tx(STORE_KV, "readonly").get("state"));
    state = saved || seedState();
  } catch (e) {
    usingFallback = true;
    try {
      state = JSON.parse(localStorage.getItem(CLEAN ? "aster-clean-state" : "aster-state") || "null") || seedState();
    } catch {
      state = seedState();
    }
  }
  migrate(state);
  window.addEventListener("beforeunload", () => persistNow());
  saveSoon = debounce(() => persistNow(), 250);
  return state;
}
let saveSoon = () => {};

export function persistNow() {
  if (!state) return;
  if (usingFallback || !idb) {
    try {
      localStorage.setItem(CLEAN ? "aster-clean-state" : "aster-state", JSON.stringify(state));
    } catch {}
  } else {
    try {
      tx(STORE_KV, "readwrite").put(state, "state");
    } catch {}
  }
}

function migrate(s) {
  const d = seedState();
  s.settings = { ...d.settings, ...(s.settings || {}) };
  s.settings.notifications = { ...d.settings.notifications, ...(s.settings.notifications || {}) };
  for (const k of ["spaces", "memories", "tasks", "metrics", "entries", "goals", "relations", "widgets", "reminders"])
    if (!Array.isArray(s[k])) s[k] = [];
  s.notif = { ...d.notif, ...(s.notif || {}) };
  s.version = SCHEMA_VERSION;
}

/* ---------- reactive api ---------- */
export const getState = () => state;
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
/** Mutate state immutably-ish: update(s => { s.tasks.push(t) }) */
export function update(mutator) {
  const draft = structuredClone(state);
  mutator(draft);
  state = draft;
  saveSoon();
  for (const fn of listeners) {
    try {
      fn(state);
    } catch (e) {
      console.error(e);
    }
  }
}

/* ---------- entity helpers ---------- */
export function findEntity(id) {
  for (const [type, key] of Object.entries(TYPES)) {
    const ent = state[key].find((e) => e.id === id);
    if (ent) return { type, key, ent };
  }
  return null;
}
export const byId = (key, id) => state[key].find((e) => e.id === id) || null;

/* ---------- attachments (photos live in their own store) ---------- */
export async function putAtt(meta, dataUrl) {
  const rec = { ...meta, data: dataUrl };
  if (usingFallback || !idb) {
    try {
      const all = JSON.parse(localStorage.getItem(CLEAN ? "aster-clean-atts" : "aster-atts") || "{}");
      all[meta.id] = rec;
      localStorage.setItem(CLEAN ? "aster-clean-atts" : "aster-atts", JSON.stringify(all));
    } catch {}
  } else {
    await reqP(tx(STORE_ATTS, "readwrite").put(rec, meta.id));
  }
}
export async function getAtt(id) {
  if (usingFallback || !idb) {
    try {
      const all = JSON.parse(localStorage.getItem(CLEAN ? "aster-clean-atts" : "aster-atts") || "{}");
      return all[id] || null;
    } catch {
      return null;
    }
  }
  return (await reqP(tx(STORE_ATTS, "readonly").get(id))) || null;
}
export async function delAtt(id) {
  if (usingFallback || !idb) {
    try {
      const all = JSON.parse(localStorage.getItem(CLEAN ? "aster-clean-atts" : "aster-atts") || "{}");
      delete all[id];
      localStorage.setItem(CLEAN ? "aster-clean-atts" : "aster-atts", JSON.stringify(all));
    } catch {}
  } else {
    await reqP(tx(STORE_ATTS, "readwrite").delete(id));
  }
}
export async function allAtts() {
  if (usingFallback || !idb) {
    try {
      return Object.values(JSON.parse(localStorage.getItem(CLEAN ? "aster-clean-atts" : "aster-atts") || "{}"));
    } catch {
      return [];
    }
  }
  return new Promise((res) => {
    const out = [];
    const cur = tx(STORE_ATTS, "readonly").openCursor();
    cur.onsuccess = () => {
      const c = cur.result;
      if (c) {
        out.push(c.value);
        c.continue();
      } else res(out);
    };
    cur.onerror = () => res(out);
  });
}

/* ---------- backup / restore ---------- */
export async function exportAll(withPhotos = true) {
  const out = { app: "ASTER", schema: SCHEMA_VERSION, exportedAt: new Date().toISOString(), state, photos: {} };
  if (withPhotos) {
    for (const a of await allAtts()) out.photos[a.id] = { name: a.name, created: a.created, data: a.data };
  }
  return JSON.stringify(out);
}
export async function importAll(json) {
  const parsed = JSON.parse(json);
  if (parsed.app !== "ASTER" || !parsed.state) throw new Error("Not an ASTER backup file");
  if (usingFallback || !idb) {
    localStorage.setItem(CLEAN ? "aster-clean-state" : "aster-state", JSON.stringify(parsed.state));
    localStorage.setItem(CLEAN ? "aster-clean-atts" : "aster-atts", JSON.stringify(parsed.photos || {}));
  } else {
    await reqP(tx(STORE_KV, "readwrite").put(parsed.state, "state"));
    const store = tx(STORE_ATTS, "readwrite");
    await reqP(store.clear());
    for (const [id, p] of Object.entries(parsed.photos || {})) {
      store.put({ id, name: p.name, created: p.created, data: p.data }, id);
    }
  }
}
export const storageMode = () => (usingFallback ? "localStorage (fallback)" : "IndexedDB");
