/* ASTER — shared UI components & design tokens used across views. */

import { h, clear } from "./utils.js";
import { icon } from "./icons.js";
import { getState } from "./store.js";

/* ---------- palette ---------- */
export const PALETTE = [
  { id: "sage", name: "Sage", hex: "#94a88b" },
  { id: "peach", name: "Peach", hex: "#ff8a5c" },
  { id: "rose", name: "Rose", hex: "#f27eb2" },
  { id: "violet", name: "Violet", hex: "#9d7bea" },
  { id: "sky", name: "Sky", hex: "#5ca9f2" },
  { id: "mint", name: "Mint", hex: "#3ebd8c" },
  { id: "honey", name: "Honey", hex: "#ecb02e" },
  { id: "coral", name: "Coral", hex: "#f26d6d" },
  { id: "ocean", name: "Ocean", hex: "#38b8c4" },
  { id: "leaf", name: "Leaf", hex: "#7fb84e" },
];
export const colorHex = (id) => (PALETTE.find((c) => c.id === id) || PALETTE[1]).hex;
export const CLEAN = () => !!window.__ASTER_CLEAN__;

export const BACKGROUNDS = [
  { id: "plain", label: "Plain" },
  { id: "glow", label: "Glow" },
  { id: "grid", label: "Grid" },
  { id: "stars", label: "Stars" },
];

export function applyTheme(s) {
  const clean = CLEAN();
  const accent = s.settings.accent || (clean ? "sage" : "peach");
  const theme = s.settings.theme === "auto"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : s.settings.theme;
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = accent;
  if (clean) {
    document.documentElement.dataset.clean = "1";
    document.documentElement.dataset.bg = "plain";
  } else {
    document.documentElement.dataset.bg = !s.settings.bg || s.settings.bg === "dots" ? "glow" : s.settings.bg;
  }
  // Tell the native hosts (ASTER exe) so the window chrome can match the theme.
  try {
    if (window.chrome?.webview?.postMessage)
      window.chrome.webview.postMessage(JSON.stringify({ aster: "theme", dark: theme === "dark", accent: colorHex(accent) }));
  } catch {}
  try {
    if (window.AsterNotify?.theme) window.AsterNotify.theme(theme === "dark");
  } catch {}
  try {
    localStorage.setItem(clean ? "aster-clean-theme" : "aster-theme", JSON.stringify({
      theme: s.settings.theme, accent, bg: clean ? "plain" : s.settings.bg,
    }));
  } catch {}
}

/* ---------- entity metadata ---------- */
export const TYPE_META = {
  space: { label: "Space", icon: "rocket" },
  memory: { label: "Memory", icon: "spark" },
  task: { label: "Task", icon: "check" },
  metric: { label: "Metric", icon: "chart" },
  entry: { label: "Entry", icon: "note" },
  goal: { label: "Goal", icon: "target" },
};
export const KIND_META = {
  moment: { label: "Moment", icon: "spark" },
  person: { label: "Person", icon: "user" },
  place: { label: "Place", icon: "pin" },
};
export function entityTitle(type, e) {
  return e.title || e.name || "(untitled)";
}
export function entityColor(type, e) {
  if (e && e.color) return colorHex(e.color);
  return {
    space: "var(--c-violet)",
    memory: "var(--c-peach)",
    task: "var(--c-sky)",
    metric: "var(--c-ocean)",
    entry: "var(--c-mint)",
    goal: "var(--c-honey)",
  }[type];
}

/* ---------- buttons & chips ---------- */
export const btn = (label, { onclick, kind = "", icon: ic, title, type = "button", disabled } = {}) =>
  h("button", { type, class: `btn ${kind}`.trim(), onclick, title, disabled }, ic && icon(ic, 17), label);
export const iconBtn = (ic, title, onclick, { size = 17, cls = "" } = {}) =>
  h("button", { type: "button", class: `icon-btn ${cls}`.trim(), title, onclick: onclick ? () => onclick() : undefined }, icon(ic, size));

export const chip = (text, { color, ic, onclick, active, title } = {}) =>
  h(
    onclick ? "button" : "span",
    {
      class: "chip" + (onclick ? " clickable" : "") + (active ? " active" : ""),
      title,
      onclick: onclick ? () => onclick() : undefined,
      style: color ? `--chip-c:${color}` : undefined,
    },
    ic && icon(ic, 13),
    text
  );

export function emptyState({ ic = "spark", title, hint, action }) {
  return h(
    "div",
    { class: "empty" },
    h("div", { class: "empty-icon" }, icon(ic, 26)),
    h("div", { class: "empty-title" }, title),
    hint && h("div", { class: "empty-hint" }, hint),
    action && h("div", { class: "empty-action" }, btn(action.label, { kind: "accent", onclick: action.fn }))
  );
}

/* ---------- modal ---------- */
let activeModal = null;
export function modal({ title, body, footer, wide, onclose, nopad }) {
  closeModal();
  // popovers live above overlays — never let one linger over a new modal
  document.querySelectorAll(".popover").forEach((p) => p.remove());
  const overlay = h("div", { class: "overlay" });
  const close = () => {
    overlay.classList.add("closing");
    setTimeout(() => overlay.remove(), 140);
    document.body.classList.remove("modal-open");
    if (activeModal === close) activeModal = null;
    onclose && onclose();
  };
  const m = h(
    "div",
    { class: "modal" + (wide ? " wide" : "") + (nopad ? " nopad" : ""), role: "dialog", "aria-label": title },
    h("header", { class: "modal-head" }, h("h3", {}, title), iconBtn("x", "Close", close)),
    body && h("div", { class: "modal-body" }, body),
    footer && h("footer", { class: "modal-foot" }, footer)
  );
  overlay.append(m);
  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) close();
  });
  const esc = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", esc);
  document.body.append(overlay);
  document.body.classList.add("modal-open");
  activeModal = close;
  setTimeout(() => {
    const f = m.querySelector("[autofocus], input, textarea, select, button.btn-accent");
    if (f) f.focus();
  }, 60);
  return { el: overlay, close };
}
export function closeModal() {
  if (activeModal) activeModal();
}

export function confirmDialog(message, { okLabel = "Delete", danger = true } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
      md.close();
    };
    const md = modal({
      title: "Are you sure?",
      body: h("p", { class: "confirm-msg" }, message),
      onclose: () => !done && resolve(false),
      footer: [
        btn("Cancel", { onclick: () => fin(false) }),
        btn(okLabel, { kind: danger ? "danger" : "accent", onclick: () => fin(true) }),
      ],
    });
  });
}

/* ---------- toast ---------- */
let toastWrap = null;
export function toast({ title, body = "", ic = "spark", actions = [], timeout = 4600 }) {
  if (!toastWrap) {
    toastWrap = h("div", { class: "toasts" });
    document.body.append(toastWrap);
  }
  const t = h(
    "div",
    { class: "toast" },
    h("div", { class: "toast-ic" }, icon(ic, 18)),
    h("div", { class: "toast-tx" }, h("div", { class: "toast-title" }, title), body && h("div", { class: "toast-body" }, body)),
    actions.length > 0 && h("div", { class: "toast-actions" }, actions.map((a) => btn(a.label, { kind: "ghost", onclick: () => { a.fn && a.fn(); dismiss(); } }))),
    iconBtn("x", "Dismiss", dismiss)
  );
  function dismiss() {
    t.classList.add("out");
    setTimeout(() => t.remove(), 250);
  }
  toastWrap.append(t);
  if (toastWrap.children.length > 4) toastWrap.firstChild.remove();
  if (timeout) setTimeout(dismiss, timeout);
  requestAnimationFrame(() => t.classList.add("in"));
  return dismiss;
}

/* ---------- popover ---------- */
export function popover(anchor, content, { align = "end", width } = {}) {
  document.querySelectorAll(".popover").forEach((p) => p.remove());
  const p = h("div", { class: "popover", style: width ? `width:${width}px` : undefined }, content);
  document.body.append(p);
  const r = anchor.getBoundingClientRect();
  const pw = p.offsetWidth, ph = p.offsetHeight;
  let x = align === "end" ? r.right - pw : r.left;
  x = Math.max(10, Math.min(x, innerWidth - pw - 10));
  let y = r.bottom + 8;
  if (y + ph > innerHeight - 10) y = Math.max(10, r.top - ph - 8);
  p.style.left = x + "px";
  p.style.top = y + scrollY + "px";
  setTimeout(() => {
    const off = (e) => {
      if (!p.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) {
        p.remove();
        document.removeEventListener("pointerdown", off, true);
      }
    };
    document.addEventListener("pointerdown", off, true);
  });
  const esc = (e) => {
    if (e.key === "Escape") {
      p.remove();
      document.removeEventListener("keydown", esc);
    }
  };
  document.addEventListener("keydown", esc);
  return p;
}

/* ---------- emoji picker (full set + custom image import) ---------- */
const EMOJI_CATEGORIES = [
  ["Smileys", "😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😗 😚 😙 🥲 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 🥸 😎 🤓 🧐 😕 😟 🙁 ☹️ 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 🤖 😺 😸 😹 😻 😼 😽 🙀 😿 😾"],
  ["Gestures", "👋 🤚 🖐️ ✋ 🖖 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ 👍 👎 ✊ 👊 🤛 🤜 👏 🙌 👐 🤲 🤝 🙏 ✍️ 💅 🤳 💪 🦾 🦵 🦶 👂 👃 🧠 🫀 👀 👁️ 👅 👄 💋 🩸"],
  ["Hearts", "❤️ 🧡 💛 💚 💙 💜 🖤 🤍 🤎 💔 ❣️ 💕 💞 💓 💗 💖 💘 💝 💟 ♥️ 🔥 ✨ 🌟 💫 ⭐ 🎉 🎊 🥳 🎈 🎁 🏆 🥇 🥈 🥉 🏅 👑 💯 ✅ ❌ ❗ ❓ 💤 🕊️ 🍀"],
  ["Animals", "🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐻‍❄️ 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🙈 🙉 🙊 🐒 🐔 🐧 🐦 🐤 🦅 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪱 🐛 🦋 🐌 🐞 🐜 🪰 🕷️ 🦂 🐢 🐍 🦎 🦖 🦕 🐙 🦑 🦐 🦞 🦀 🐡 🐠 🐟 🐬 🐳 🐋 🦈 🐊 🐅 🐆 🦓 🦍 🦧 🐘 🦛 🦏 🐪 🦒 🦘 🐃 🐂 🐄 🐎 🐖 🐏 🐑 🦙 🐐 🦌 🐕 🐩 🦮 🐈 🐓 🦃 🦤 🦚 🦜 🦢 🕊️ 🐇 🦝 🦨 🦡 🦦 🦥 🐁 🐀 🐿️ 🦔"],
  ["Plants", "🌱 🌲 🌳 🌴 🌵 🎋 🎍 🍀 🌾 💐 🌷 🌹 🥀 🌺 🌸 🌼 🌻 🌞 🌝 🌛 🌜 🌚 🌙 🌎 🌍 🌏 🪐 💫 ⭐ 🌟 ✨ ⛅ ☁️ ⛈️ 🌤️ 🌥️ 🌦️ 🌧️ 🌩️ 🌨️ ❄️ ☃️ ⛄ 🌬️ 💨 🌪️ 🌊 💧 💦 ☔ 🌈 🔥 🍂 🍁 🍃 🪴 🍄 🐚 🪨 🌵"],
  ["Food", "🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🍆 🥑 🥦 🥬 🥒 🌶️ 🫑 🌽 🥕 🫒 🧄 🧅 🥔 🍠 🥐 🥯 🍞 🥖 🥨 🧀 🥚 🍳 🧈 🥞 🧇 🥓 🥩 🍗 🍖 🌭 🍔 🍟 🍕 🥪 🥙 🧆 🌮 🌯 🥗 🥘 🍝 🍜 🍲 🍛 🍣 🍱 🥟 🦪 🍤 🍙 🍚 🍘 🍥 🥠 🥮 🍢 🍡 🍧 🍨 🍦 🥧 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 🌰 🥜 🍯 🥛 🍼 ☕ 🫖 🍵 🧃 🥤 🧋 🧉 🍺 🍻 🥂 🍷 🥃 🍸 🍹 🧉 🍾"],
  ["Activity", "⚽ 🏀 🏈 ⚾ 🥎 🎾 🏐 🏉 🥏 🎱 🪀 🏓 🏸 🥊 🥋 🎽 🛹 🛼 🛷 ⛸️ 🥌 🎿 ⛷️ 🏂 🪂 🏋️ 🤼 🤸 ⛹️ 🤺 🤾 🏌️ 🏇 🧘 🏄 🏊 🤽 🚣 🧗 🚵 🚴 🏆 🥇 🥈 🥉 🏅 🎖️ 🏵️ 🎗️ 🎫 🎟️ 🎪 🤹 🎭 🎨 🎬 🎤 🎧 🎼 🎹 🥁 🎷 🎺 🎸 🪕 🎻 🎲 ♟️ 🎯 🎳 🎮 🎰 🧩"],
  ["Travel", "🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚐 🛻 🚚 🚛 🚜 🦯 🦽 🦼 🛴 🚲 🛵 🏍️ 🛺 🚨 🚔 🚍 🚘 🚖 🚡 🚠 🚟 🚃 🚋 🚞 🚝 🚄 🚅 🚈 🚂 🚆 🚇 🚊 🚉 ✈️ 🛫 🛬 🛩️ 💺 🛰️ 🚀 🛸 🚁 🛶 ⛵ 🚤 🛥️ 🛳️ ⛴️ 🚢 ⚓ 🪝 ⛽ 🚧 🚦 🚥 🗺️ 🗿 🗽 🗼 🏰 🏯 🏟️ 🎡 🎢 🎠 ⛲ ⛱️ 🏖️ 🏝️ 🏜️ 🌋 ⛰️ 🏔️ 🗻 🏕️ ⛺ 🛖 🏠 🏡 🏘️ 🏚️ 🏗️ 🏭 🏢 🏬 🏣 🏤 🏥 🏦 🏨 🏪 🏫 🏩 💒 🏛️ ⛪ 🕌 🕍 🛕 🕋 ⛩️ 🛤️ 🛣️ 🗾 🎑 🏞️ 🌅 🌄 🌠 🎇 🎆 🌇 🌆 🏙️ 🌃 🌌 🌉 🌁"],
  ["Objects", "⌚ 📱 💻 ⌨️ 🖥️ 🖨️ 🖱️ 💽 💾 💿 📀 📷 📸 📹 🎥 📽️ 📺 📻 🎙️ 🎚️ 🎛️ 🧭 ⏱️ ⏲️ ⏰ 🕰️ ⌛ ⏳ 📡 🔋 🔌 💡 🔦 🕯️ 🧯 🛢️ 💸 💵 💴 💶 💷 🪙 💰 💳 💎 ⚖️ 🪜 🧰 🔧 🔨 ⚒️ 🛠️ ⛏️ 🔩 ⚙️ 🪛 🔬 🔭 📡 💉 🩹 🩺 🚪 🪑 🚽 🪠 🚰 🛁 🚿 🧼 🪥 🧽 🧹 🧺 🛒 🚀 🛝 🪁 🧿 🪄 🔮 🧸 🪆 🎎 🎏 🎐 🎑 🧧 🏹 🛡️ 🪖 ⛳ 🪄 🔑 🗝️ 🚪 🪑 🛏️ 🛋️ 🪟 🚬 ⚰️ 🗿 🪧 🪪"],
  ["Books & work", "📚 📖 📕 📗 📘 📙 📔 📒 📓 📃 📜 📄 📰 🗞️ 📑 🔖 🏷️ 💰 🧾 ✏️ ✒️ 🖋️ 🖊️ 🖌️ 🖍️ 📝 💼 📁 📂 🗂️ 📇 📈 📉 📊 📋 📌 📍 📎 🖇️ 📏 📐 ✂️ 🗃️ 🗄️ 🗑️ 🔒 🔓 🔏 🔐 🖊️ 🕵️ 🧑‍💻 👩‍💻 👨‍💻 🧑‍🏫 👩‍🏫 👨‍🏫 🧑‍⚕️ 👩‍⚕️ 👨‍⚕️ 🧑‍🌾 👩‍🌾 👨‍🌾 🧑‍🍳 👩‍🍳 👨‍🍳"],
  ["People", "👶 🧒 👦 👧 🧑 👱 👨 🧔 👩 🧓 👴 👵 🙃 🙃 😺 🤳 💃 🕺 👯 🧑‍🤝‍🧑 👭 👬 👥 👤 👪 👫 👬 👭 💏 💑 🤵 👰 🤰 🤱 🎅 🤶 🦸 🦹 🧙 🧚 🧛 🧜 🧝 🧞 🧟 🎓 🤵 👔 👕 👖 👗 👘 🥋 🩱 🩲 🩳 👙 👚 🧥 🧦 🧤 🧣 🎩 🧢 👒 🎓 👑 👢 👞 🥾 🥿 🩰 🥿 🔗"],
];

const EMOJI_SECTIONS = EMOJI_CATEGORIES.map(([name, str]) => ({ name, list: [...new Set(str.split(" ").filter(Boolean))] }));
export const EMOJI_LIST = EMOJI_SECTIONS.flatMap((s) => s.list);

const RECENT_KEY = "aster-emoji-recent";
const recentEmojis = () => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").filter(Boolean); } catch { return []; }
};
const pushRecent = (e) => {
  try {
    const list = [e, ...recentEmojis().filter((x) => x !== e)].slice(0, 24);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {}
};

/** Emoji values can also be imported-image data URLs — render helper. */
export const isImgEmoji = (v) => typeof v === "string" && v.startsWith("data:");
export function emojiSpan(v, cls = "") {
  if (isImgEmoji(v)) return h("img", { src: v, class: "emoji-img" + (cls ? " " + cls : ""), alt: "", loading: "lazy" });
  return h("span", { class: cls || undefined }, v || "✨");
}

export function emojiPicker(anchor, current, onPick) {
  const CAT_ICONS = { Recent: "🕘", Smileys: "😀", Gestures: "👋", Hearts: "❤️", Animals: "🐶", Plants: "🌱", Food: "🍔", Activity: "⚽", Travel: "✈️", Objects: "💡", "Books & work": "📚", People: "🙂" };
  const recents = recentEmojis();
  const isRecent = recents.includes(current);
  const cat = isRecent ? "Recent"
    : EMOJI_SECTIONS.find((s) => s.list.includes(current))?.name || "Smileys";
  const pick = (e) => { pushRecent(e); onPick(e); p.remove(); };

  const fileInp = h("input", { type: "file", accept: "image/*", style: "display:none" });
  fileInp.addEventListener("change", async () => {
    const f = fileInp.files[0];
    if (!f) return;
    try {
      const { readImage } = await import("./utils.js");
      const data = await readImage(f, 96, 0.85);
      pick(data);
    } catch {
      /* ignore unreadable files */
    }
    fileInp.value = "";
  });

  const grid = h("div", { class: "emoji-grid big" });
  const paint = (list) => {
    clear(grid);
    grid.append(...list.map((e) =>
      h("button", { type: "button", class: "emoji-cell" + (e === current ? " sel" : ""), onclick: () => pick(e) },
        isImgEmoji(e) ? emojiSpan(e) : e)));
  };
  const sections = recents.length ? [{ name: "Recent", list: recents }, ...EMOJI_SECTIONS] : EMOJI_SECTIONS;
  const tabs = h("div", { class: "emoji-tabs" },
    sections.map((s) =>
      h("button", { type: "button", class: "emoji-tab" + (s.name === cat ? " on" : ""), title: s.name, onclick: (ev) => {
        tabs.querySelectorAll(".emoji-tab").forEach((b) => b.classList.remove("on"));
        ev.currentTarget.classList.add("on");
        paint(s.list);
      } }, CAT_ICONS[s.name] || "•")));

  paint(sections.find((s) => s.name === cat).list);
  const p = popover(anchor, h("div", { class: "emoji-picker" },
    tabs, grid,
    h("button", { type: "button", class: "btn ghost sm emoji-import", onclick: () => fileInp.click() }, "🖼️ Import image…")), { width: 328 });
  return p;
}

/* ---------- swatches ---------- */
export function swatchRow(current, onPick, colors = PALETTE) {
  return h(
    "div",
    { class: "swatches" },
    colors.map((c) =>
      h("button", {
        type: "button",
        class: "swatch" + (c.id === current ? " sel" : ""),
        title: c.name,
        style: `background:${c.hex}`,
        onclick: () => onPick(c.id),
      })
    )
  );
}

/* ---------- tag input ---------- */
export function allTags() {
  const s = getState();
  const set = new Set();
  s.memories.forEach((m) => m.tags.forEach((t) => set.add(t)));
  s.tasks.forEach((t) => t.tags.forEach((t) => set.add(t)));
  s.goals.forEach((t) => t.tags && t.tags.forEach((t) => set.add(t)));
  return [...set].sort();
}
export function tagInput(tags = []) {
  const list = [...tags];
  const wrap = h("div", { class: "tag-input" });
  const input = h("input", { type: "text", placeholder: "Add tag + Enter…", class: "inp" });
  const render = () => {
    clear(wrap);
    list.forEach((t, i) =>
      wrap.append(
        h("span", { class: "chip removable" }, t, h("button", { class: "chip-x", onclick: () => { list.splice(i, 1); render(); } }, "×"))
      )
    );
    wrap.append(input);
  };
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      e.preventDefault();
      const t = input.value.trim().replace(/^#/, "").toLowerCase();
      if (t && !list.includes(t)) list.push(t);
      input.value = "";
      render();
      wrap.querySelector("input").focus();
    } else if (e.key === "Backspace" && !input.value && list.length) {
      list.pop();
      render();
      wrap.querySelector("input").focus();
    }
  });
  render();
  return { el: wrap, get: () => [...list] };
}

/* ---------- confetti ---------- */
export function confetti(x = innerWidth / 2, y = innerHeight / 3) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = PALETTE.map((c) => c.hex);
  const c = h("canvas", { class: "confetti", width: innerWidth, height: innerHeight });
  document.body.append(c);
  const ctx = c.getContext("2d");
  const parts = Array.from({ length: 70 }, () => ({
    x, y,
    vx: (Math.random() - 0.5) * 9,
    vy: -Math.random() * 8 - 3,
    r: 3 + Math.random() * 4,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    col: colors[(Math.random() * colors.length) | 0],
  }));
  const t0 = performance.now();
  (function frame(t) {
    const dt = (t - t0) / 1300;
    ctx.clearRect(0, 0, c.width, c.height);
    for (const p of parts) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.22;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.col;
      ctx.globalAlpha = Math.max(0, 1 - dt);
      ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    }
    if (dt < 1) requestAnimationFrame(frame);
    else c.remove();
  })(t0);
}

