/* ASTER — tiny WebAudio sound effects. No files, all synthesized.
   Used sparingly: goals completed, reminders, gentle checks.
   Browsers only allow audio after a user gesture — the first tap anywhere
   unlocks the AudioContext so later sounds (even scheduler ones) can play. */

import { getState, getAtt } from "./store.js";

let ctx = null;

function makeCtx() {
  try { return new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
}

/* Unlock on the first user gesture (required by all browsers/WebView2/Android). */
if (typeof window !== "undefined") {
  const unlock = () => {
    if (!ctx) ctx = makeCtx();
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  };
  window.addEventListener("pointerdown", unlock, { once: false, capture: true });
  window.addEventListener("keydown", unlock, { once: false, capture: true });
}

function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = makeCtx();
  if (!ctx) return null;
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(c, { f, t = 0, dur = 0.18, type = "sine", vol = 0.16 }) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.value = f;
  const start = c.currentTime + t;
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(vol, start + 0.014);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

const SOUNDS = {
  /* rising fanfare — goal finished */
  goal() {
    const c = audio(); if (!c) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, { f, t: i * 0.09, dur: 0.24, type: "sine", vol: 0.15 }));
    tone(c, { f: 1567.98, t: 0.36, dur: 0.34, type: "triangle", vol: 0.1 });
  },
  /* two-note ding — classic reminder */
  notify() {
    const c = audio(); if (!c) return;
    tone(c, { f: 880, dur: 0.18, type: "triangle", vol: 0.16 });
    tone(c, { f: 659.25, t: 0.15, dur: 0.3, type: "triangle", vol: 0.13 });
  },
  /* short blip — checked something off */
  check() {
    const c = audio(); if (!c) return;
    tone(c, { f: 640, dur: 0.1, type: "sine", vol: 0.13 });
    tone(c, { f: 960, t: 0.07, dur: 0.11, type: "sine", vol: 0.09 });
  },
  /* soft bell with a shimmering overtone */
  chime() {
    const c = audio(); if (!c) return;
    tone(c, { f: 587.33, dur: 0.9, type: "sine", vol: 0.15 });
    tone(c, { f: 1174.66, dur: 0.7, type: "sine", vol: 0.05 });
    tone(c, { f: 1760, dur: 0.4, type: "sine", vol: 0.025 });
  },
  /* wooden three-note drop */
  marimba() {
    const c = audio(); if (!c) return;
    [783.99, 659.25, 523.25].forEach((f, i) => tone(c, { f, t: i * 0.11, dur: 0.26, type: "triangle", vol: 0.14 }));
  },
  /* bright little arcade coin */
  coin() {
    const c = audio(); if (!c) return;
    tone(c, { f: 987.77, dur: 0.08, type: "square", vol: 0.07 });
    tone(c, { f: 1318.51, t: 0.08, dur: 0.22, type: "square", vol: 0.07 });
  },
  /* quick upward sparkle */
  sparkle() {
    const c = audio(); if (!c) return;
    [1046.5, 1318.51, 1567.98, 2093].forEach((f, i) => tone(c, { f, t: i * 0.05, dur: 0.14, type: "sine", vol: 0.09 }));
  },
  /* low soft heartbeat pulse */
  pulse() {
    const c = audio(); if (!c) return;
    tone(c, { f: 196, dur: 0.16, type: "sine", vol: 0.2 });
    tone(c, { f: 196, t: 0.24, dur: 0.2, type: "sine", vol: 0.16 });
  },
};

/** Sounds offered in Settings → Sounds (custom appears once imported). */
export const SOUND_OPTIONS = [
  { id: "notify", label: "Ding" },
  { id: "chime", label: "Bell" },
  { id: "marimba", label: "Marimba" },
  { id: "sparkle", label: "Sparkle" },
  { id: "coin", label: "Coin" },
  { id: "pulse", label: "Pulse" },
];

export const currentSound = () => {
  try { return getState()?.settings?.sound || "notify"; } catch { return "notify"; }
};

let customAudio = null;
function playCustom() {
  getAtt("sound-custom")
    .then((rec) => {
      if (!rec) return;
      if (customAudio) { try { customAudio.pause(); } catch {} }
      customAudio = new Audio(rec.data);
      customAudio.volume = 0.85;
      customAudio.play().catch(() => {});
    })
    .catch(() => {});
}

/** Preview any option by id (Settings buttons). */
export function previewSound(id) {
  if (id === "custom") return playCustom();
  if (SOUNDS[id]) { try { SOUNDS[id](); } catch {} }
}

/** playSound("goal" | "notify" | "check") — "notify" plays whatever the user
 *  picked in Settings (any built-in or their imported clip). */
export function playSound(name) {
  let muted = false;
  try { muted = getState()?.settings?.sounds === false; } catch {}
  if (muted) return;
  if (name === "notify") {
    const pick = currentSound();
    if (pick === "custom") return playCustom();
    if (SOUNDS[pick]) { try { SOUNDS[pick](); } catch {} return; }
  }
  if (!SOUNDS[name]) return;
  try { SOUNDS[name](); } catch {}
}
