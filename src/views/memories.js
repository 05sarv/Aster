/* ASTER — Memories view: moments, people, places, photos. Cards & timeline. */

import { h, clear, fuzzy, fmtDate, fmtMonth, todayKey, hashColor } from "../utils.js";
import { icon } from "../icons.js";
import { getState, update, getAtt } from "../store.js";
import { btn, chip, emptyState, allTags, colorHex, confirmDialog, KIND_META } from "../components.js";
import { openMemoryEditor, openMemoryDetail, deleteEntity } from "../editors.js";

const ui = { q: "", kind: "all", tag: "", view: "cards" };
const TAG_COLORS = ["var(--c-peach)", "var(--c-rose)", "var(--c-violet)", "var(--c-sky)", "var(--c-mint)", "var(--c-honey)", "var(--c-coral)", "var(--c-ocean)", "var(--c-leaf)"];

function cover(mem) {
  const c = h("div", { class: "mem-cover" });
  if (mem.atts.length) {
    c.append(h("div", { class: "photo-skel" }, "…"));
    getAtt(mem.atts[0].id).then((r) => {
      if (r && c.isConnected) {
        clear(c);
        c.append(h("img", { src: r.data, alt: "", loading: "lazy" }));
      }
    });
  } else {
    c.classList.add("emoji");
    c.append(mem.emoji || "✨");
  }
  return c;
}

function memCard(mem, s) {
  const space = mem.spaceId && s.spaces.find((x) => x.id === mem.spaceId);
  const kindTint = mem.kind === "person" ? "var(--c-rose)" : mem.kind === "place" ? "var(--c-mint)" : "var(--c-sky)";
  return h(
    "article",
    {
      class: "mem-card" + (mem.kind !== "moment" ? " " + String(mem.kind).replace(/[^\w-]/g, "") : ""),
      onclick: () => openMemoryDetail(mem),
    },
    mem.kind === "moment" && (mem.atts.length || mem.emoji) && cover(mem),
    h("div", { class: "mem-body" },
      mem.kind !== "moment" && h("div", { class: "mem-avatar", title: KIND_META[mem.kind]?.label || mem.kind, style: `background:${kindTint}22;border-color:${kindTint}55` }, mem.emoji || (mem.kind === "person" ? "🙂" : mem.kind === "place" ? "📍" : "✨")),
      mem.kind !== "moment" && mem.atts.length > 0 && h("div", { class: "mem-photo-count" }, icon("image", 12), mem.atts.length),
      h("h3", { class: "mem-title" }, mem.title),
      mem.body && h("p", { class: "mem-snippet" }, mem.body.slice(0, 120) + (mem.body.length > 120 ? "…" : "")),
      h("div", { class: "mem-meta" },
        chip(fmtDate(mem.date, { short: true }), { ic: "calendar" }),
        space && chip(space.name, { ic: "rocket", color: colorHex(space.color) }),
        mem.tags.slice(0, 2).map((t) => chip("#" + t, { color: TAG_COLORS[hashColor(t) % TAG_COLORS.length] })))),
    h("button", { class: "icon-btn danger quick-x", title: "Delete memory", onclick: async (e) => {
      e.stopPropagation();
      if (await confirmDialog(`Delete "${mem.title}" and its photos?`)) update((d) => deleteEntity(d, mem.id));
    } }, icon("x", 15))
  );
}

function timelineItem(mem) {
  return h(
    "button",
    { class: "tl-item", onclick: () => openMemoryDetail(mem) },
    h("span", { class: "tl-dot" }, icon(KIND_META[mem.kind]?.icon || "spark", 13)),
    h("span", { class: "tl-content" },
      h("span", { class: "tl-title" }, `${mem.emoji || ""} ${mem.title}`),
      h("span", { class: "tl-sub" }, mem.body ? mem.body.slice(0, 90) + (mem.body.length > 90 ? "…" : "") : "—")),
    h("span", { class: "tl-date" }, fmtDate(mem.date, { short: true }))
  );
}

export function renderMemories(root) {
  const s = getState();
  root.append(
    h("div", { class: "page-head" },
      h("div", {},
        h("h1", {}, "Memories"),
        h("p", { class: "subtitle" }, s.memories.length ? `${s.memories.length} little pieces of you` : "Moments, people, places & photos")),
      h("div", { class: "head-actions" },
        btn("Person", { ic: "user", onclick: () => openMemoryEditor(null, { kind: "person" }) }),
        btn("Place", { ic: "pin", onclick: () => openMemoryEditor(null, { kind: "place" }) }),
        btn("New memory", { kind: "accent", ic: "plus", onclick: () => openMemoryEditor() })))
  );

  const search = h("input", { class: "inp", placeholder: "Search memories…", type: "search" });
  search.addEventListener("input", () => { ui.q = search.value; refresh(); });

  const kindLabel = (k) => (k === "all" ? "All" : KIND_META[k]?.label || k);
  const kindChip = (k) =>
    chip(kindLabel(k), { ic: k === "all" ? "spark" : KIND_META[k]?.icon || "tag", active: ui.kind === k, onclick: () => { ui.kind = k; renderChips(); refresh(); } });
  const kindList = () => ["all", "moment", "person", "place", ...[...new Set(s.memories.map((m) => m.kind))].filter((k) => !["moment", "person", "place"].includes(k))];

  const kindChips = h("div", { class: "chips-row" }, kindList().map(kindChip));

  const tags = allTags();
  const tagChips = h("div", { class: "chips-row" },
    tags.map((t) => chip("#" + t, { ic: "tag", active: ui.tag === t, onclick: () => { ui.tag = ui.tag === t ? "" : t; renderChips(); refresh(); } })));

  const viewToggle = h("div", { class: "seg" },
    ["cards", "timeline"].map((v) =>
      h("button", { class: "seg-btn" + (ui.view === v ? " on" : ""), title: v, onclick: () => { ui.view = v; renderToggle(); refresh(); } },
        icon(v === "cards" ? "grid" : "list", 15))));

  const wrap = h("div", {});
  function renderChips() {
    clear(kindChips);
    kindChips.append(...kindList().map(kindChip));
    clear(tagChips);
    tagChips.append(...tags.map((t) => chip("#" + t, { ic: "tag", active: ui.tag === t, onclick: () => { ui.tag = ui.tag === t ? "" : t; renderChips(); refresh(); } })));
  }
  function renderToggle() {
    clear(viewToggle);
    viewToggle.append(...["cards", "timeline"].map((v) =>
      h("button", { class: "seg-btn" + (ui.view === v ? " on" : ""), title: v === "cards" ? "Cards" : "Timeline", onclick: () => { ui.view = v; renderToggle(); refresh(); } },
        icon(v === "cards" ? "grid" : "list", 15))));
  }

  const refresh = () => {
    clear(wrap);
    const st = getState();
    let ms = st.memories
      .filter((m) => fuzzy(ui.q, m.title, m.body, m.tags.join(" ")))
      .filter((m) => ui.kind === "all" || m.kind === ui.kind)
      .filter((m) => !ui.tag || m.tags.includes(ui.tag))
      .sort((a, b) => b.date.localeCompare(a.date) || (b.created || "").localeCompare(a.created || ""));
    if (!ms.length) {
      wrap.append(emptyState({
        ic: "spark",
        title: ui.q || ui.tag || ui.kind !== "all" ? "Nothing matches" : "No memories yet",
        hint: ui.q || ui.tag || ui.kind !== "all" ? "Try a different search or filter." : "Save your first moment, person or place — future-you will be grateful.",
      }));
      return;
    }
    if (ui.view === "cards") {
      wrap.append(h("div", { class: "mem-grid" }, ms.map((m) => memCard(m, st))));
    } else {
      const byMonth = new Map();
      for (const m of ms) {
        const mk = m.date.slice(0, 7);
        if (!byMonth.has(mk)) byMonth.set(mk, []);
        byMonth.get(mk).push(m);
      }
      wrap.append(h("div", { class: "timeline" },
        [...byMonth.entries()].map(([mk, arr]) =>
          h("div", { class: "tl-month" },
            h("div", { class: "tl-month-label" }, fmtMonth(mk)),
            arr.map(timelineItem)))));
    }
  };

  root.append(h("div", { class: "toolbar wrap" }, search, kindChips, tagChips, viewToggle), wrap);
  refresh();
}
