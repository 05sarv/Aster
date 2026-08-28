/* ASTER — Memory Map: a living graph of everything you've saved, + Timeline.
   Pan with a drag, zoom with wheel/pinch/buttons, nodes drag & open.
   Connect mode draws persistent lines between any two items. */

import { h, clear, fuzzy, fmtDate, fmtMonth, uid } from "../utils.js";
import { icon } from "../icons.js";
import { getState, update } from "../store.js";
import { chip, iconBtn, btn, emptyState, colorHex, toast } from "../components.js";
import { openEntity } from "../editors.js";

const ui = { mode: "map", q: "", types: { space: true, memory: true, task: true, goal: true, metric: false }, linkMode: false, linkSel: null, view: null };

/* Node positions survive re-renders and restarts — the map never resets itself. */
const POS_KEY = "aster-map-pos";
let posStore = new Map(Object.entries(JSON.parse(localStorage.getItem(POS_KEY) || "{}")));
const savePos = () => { try { localStorage.setItem(POS_KEY, JSON.stringify(Object.fromEntries(posStore))); } catch {} };

const TYPE_COLOR = {
  space: null, // uses space color
  memory: "#ff8a5c",
  person: "#f27eb2",
  place: "#3ebd8c",
  task: "#5ca9f2",
  goal: "#ecb02e",
  metric: "#38b8c4",
};
const W = 960, H = 640;

function buildGraph(s) {
  const nodes = [], byId = new Map();
  const add = (type, e, extra = {}) => {
    if (byId.has(e.id)) return;
    const saved = posStore.get(e.id);
    const n = {
      id: e.id, type, label: e.title || e.name || "•", emoji: e.emoji || "",
      color: type === "space" ? colorHex(e.color) : TYPE_COLOR[type === "memory" ? e.kind : type] || TYPE_COLOR.memory,
      r: { space: 44, goal: 31, memory: 28, person: 33, place: 33, metric: 26, task: 24 }[type === "memory" ? e.kind : type] || 24,
      x: saved?.x, y: saved?.y,
      ...extra,
    };
    nodes.push(n);
    byId.set(e.id, n);
  };
  if (ui.types.space) s.spaces.forEach((e) => add("space", e));
  if (ui.types.memory) s.memories.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 60).forEach((e) => add("memory", e));
  if (ui.types.task) s.tasks.filter((t) => !t.done).slice(0, 30).forEach((e) => add("task", e));
  if (ui.types.goal) s.goals.forEach((e) => add("goal", e));
  if (ui.types.metric) s.metrics.forEach((e) => add("metric", e));

  const edges = [];
  const link = (a, b) => {
    if (!byId.has(a) || !byId.has(b) || a === b) return;
    edges.push({ a: byId.get(a), b: byId.get(b) });
  };
  for (const m of s.memories) if (byId.has(m.id) && m.spaceId) link(m.id, m.spaceId);
  for (const t of s.tasks) if (byId.has(t.id) && t.spaceId) link(t.id, t.spaceId);
  for (const m of s.metrics) if (byId.has(m.id) && m.spaceId) link(m.id, m.spaceId);
  for (const g of s.goals) {
    if (byId.has(g.id) && g.spaceId) link(g.id, g.spaceId);
    if (byId.has(g.id) && g.metricId) link(g.id, g.metricId);
  }

  // degree-based sizing
  for (const e of edges) { e.a.deg = (e.a.deg || 0) + 1; e.b.deg = (e.b.deg || 0) + 1; }
  for (const n of nodes) n.r = Math.min(n.r + Math.min((n.deg || 0) * 2, 16), 56);
  return { nodes, edges, byId };
}

/* Force layout. `fixed` = ids that keep their current position (they still
 * repel/spring, so newcomers settle around them instead of reshuffling all). */
function runLayout(nodes, edges, fixed = new Set()) {
  const cx = W / 2, cy = H / 2;
  nodes.forEach((n, i) => {
    if (fixed.has(n.id)) { n.vx = 0; n.vy = 0; return; }
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2 + Math.random() * 0.5;
    const rr = Math.min(W, H) * (0.18 + 0.3 * Math.random());
    n.x = cx + rr * Math.cos(a);
    n.y = cy + rr * Math.sin(a);
    n.vx = 0;
    n.vy = 0;
  });
  const K = 30000;
  for (let iter = 0; iter < 300; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const A = nodes[i], B = nodes[j];
        let dx = A.x - B.x, dy = A.y - B.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) { d2 = 1; dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
        if (d2 > 160000) continue;
        const f = K / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        A.vx += fx; A.vy += fy; B.vx -= fx; B.vy -= fy;
      }
    }
    for (const e of edges) {
      const dx = e.b.x - e.a.x, dy = e.b.y - e.a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const rest = 190;
      const f = (d - rest) * 0.018;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      e.a.vx += fx; e.a.vy += fy; e.b.vx -= fx; e.b.vy -= fy;
    }
    for (const n of nodes) {
      if (fixed.has(n.id)) continue;
      n.vx += (cx - n.x) * 0.012;
      n.vy += (cy - n.y) * 0.012;
      n.vx *= 0.82; n.vy *= 0.82;
      n.x += Math.max(-18, Math.min(18, n.vx));
      n.y += Math.max(-18, Math.min(18, n.vy));
      n.x = Math.max(58, Math.min(W - 58, n.x));
      n.y = Math.max(58, Math.min(H - 58, n.y));
    }
  }
}

export function renderMap(root) {
  const s = getState();
  root.append(
    h("div", { class: "page-head" },
      h("div", {},
        h("h1", {}, "Map & Timeline"),
        h("p", { class: "subtitle" }, "How it all connects — drag, zoom, tap.")))
  );

  const search = h("input", { class: "inp", placeholder: "Focus on something…", type: "search" });
  const typeChips = h("div", { class: "chips-row" },
    Object.keys(ui.types).map((t) =>
      chip({ space: "Spaces", memory: "Memories", task: "Tasks", goal: "Goals", metric: "Metrics" }[t],
        { ic: { space: "rocket", memory: "spark", task: "check", goal: "target", metric: "chart" }[t], active: ui.types[t], onclick: () => { ui.types[t] = !ui.types[t]; refresh(); } })));
  const modeSeg = h("div", { class: "seg" },
    ["map", "timeline"].map((m) =>
      h("button", { class: "seg-btn" + (ui.mode === m ? " on" : ""), onclick: () => { ui.mode = m; refresh(); } },
        icon(m === "map" ? "map" : "list", 15), m === "map" ? "Map" : "Timeline")));

  const stage = h("div", { class: "map-stage card mode-map" });
  const relayout = ui.mode === "map" ? iconBtn("refresh", "Shuffle layout", () => refresh(true), { cls: "big" }) : null;
  const linkBtn = ui.mode === "map"
    ? chip("Connect", {
        ic: "link", active: ui.linkMode,
        title: "Draw your own lines between items",
        onclick: () => {
          ui.linkMode = !ui.linkMode;
          ui.linkSel = null;
          refresh();
          if (ui.linkMode) toast({ title: "Connect mode", body: "Tap one item, then another — tap an existing pair to remove its line.", ic: "link", timeout: 3400 });
        },
      })
    : null;
  root.append(h("div", { class: "toolbar wrap" }, search, typeChips, modeSeg, linkBtn, relayout), stage);

  search.addEventListener("input", () => { ui.q = search.value; applyDim(); });

  let svgRef = null, nodeEls = new Map(), edgeEls = [], vp = null;
  const graph = { nodes: [], edges: [], byId: new Map() };
  const view = ui.view || (ui.view = { x: 0, y: 0, k: 1 });

  function refresh(shuffle) {
    clear(stage);
    stage.className = ui.mode === "map" ? "map-stage card mode-map" : "tl-stage card";
    const st = getState();
    Object.assign(graph, buildGraph(st));
    if (ui.mode === "timeline") return renderTimeline(stage, st);
    if (!graph.nodes.length) {
      stage.append(emptyState({ ic: "map", title: "Nothing to map yet", hint: "Save memories, tasks and spaces — they'll appear here as a constellation." }));
      return;
    }
    const fresh = graph.nodes.filter((n) => n.x == null);
    let didLayout = false;
    if (shuffle) { runLayout(graph.nodes, graph.edges); didLayout = true; }
    else if (fresh.length) {
      runLayout(fresh, graph.edges, new Set(graph.nodes.filter((n) => n.x != null).map((n) => n.id)));
      didLayout = true;
    }
    if (didLayout) {
      for (const n of graph.nodes) posStore.set(n.id, { x: +n.x.toFixed(1), y: +n.y.toFixed(1) });
      savePos();
    }
    if (shuffle) Object.assign(view, { x: 0, y: 0, k: 1 });

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("class", "map-svg" + (ui.linkMode ? " linking" : ""));
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    svgRef = svg;
    nodeEls = new Map();
    edgeEls = [];

    /* zoom / pan controls */
    const zoomBy = (f, anchor) => {
      const k2 = Math.max(0.35, Math.min(3.2, view.k * f));
      const u = anchor || { x: W / 2, y: H / 2 };
      view.x = u.x - ((u.x - view.x) * k2) / view.k;
      view.y = u.y - ((u.y - view.y) * k2) / view.k;
      view.k = k2;
      applyView();
    };
    const zoomBar = h("div", { class: "map-zoom" },
      h("button", { class: "map-zoom-btn", title: "Zoom in", onclick: () => zoomBy(1.3) }, "＋"),
      h("button", { class: "map-zoom-btn", title: "Zoom out", onclick: () => zoomBy(1 / 1.3) }, "−"),
      h("button", { class: "map-zoom-btn", title: "Reset view", onclick: () => { view.x = 0; view.y = 0; view.k = 1; applyView(); } }, icon("refresh", 14)));

    vp = document.createElementNS("http://www.w3.org/2000/svg", "g");
    svg.append(vp);
    const applyView = () => vp.setAttribute("transform", `translate(${view.x.toFixed(1)} ${view.y.toFixed(1)}) scale(${view.k.toFixed(3)})`);
    applyView();

    const edgeGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const linkGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
    vp.append(edgeGroup, linkGroup);
    for (const e of graph.edges) {
      const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ln.setAttribute("class", "map-edge");
      edgeGroup.append(ln);
      edgeEls.push({ el: ln, e });
    }
    /* user-drawn lines — saved with your data, so they never disappear */
    for (const l of st.mapLinks || []) {
      const a = graph.byId.get(l.a), b = graph.byId.get(l.b);
      if (!a || !b || a === b) continue;
      const ln = document.createElementNS("http://www.w3.org/2000/svg", "line");
      ln.setAttribute("class", "map-link");
      linkGroup.append(ln);
      edgeEls.push({ el: ln, e: { a, b } });
    }
    for (const n of graph.nodes) {
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "map-node type-" + n.type);
      g.dataset.id = n.id;
      const halo = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      halo.setAttribute("r", n.r + 10);
      halo.setAttribute("fill", n.color);
      halo.setAttribute("opacity", "0.18");
      halo.setAttribute("class", "map-halo");
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("r", n.r);
      c.setAttribute("fill", n.color);
      const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
      label.textContent = n.type === "task" ? "✓" : n.emoji || (n.type === "space" ? "🚀" : "•");
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("dominant-baseline", "central");
      label.setAttribute("font-size", Math.round(n.r * 1.24));
      label.setAttribute("pointer-events", "none");
      const name = document.createElementNS("http://www.w3.org/2000/svg", "text");
      name.textContent = n.label.length > 18 ? n.label.slice(0, 17) + "…" : n.label;
      name.setAttribute("text-anchor", "middle");
      name.setAttribute("y", n.r + 18);
      name.setAttribute("class", "map-node-label");
      const tip = document.createElementNS("http://www.w3.org/2000/svg", "title");
      tip.textContent = `${n.label} (${n.type})`;
      g.append(halo, c, label, name, tip);
      place(g, n);
      vp.append(g);
      nodeEls.set(n.id, { g, n });

      let drag = null;
      g.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation(); // don't pan the canvas while moving a node
        drag = { sx: ev.clientX, sy: ev.clientY, moved: false };
        try { g.setPointerCapture(ev.pointerId); } catch {}
      });
      g.addEventListener("pointermove", (ev) => {
        if (!drag) return;
        if (Math.abs(ev.clientX - drag.sx) + Math.abs(ev.clientY - drag.sy) > 4) drag.moved = true;
        const pt = toGraph(ev.clientX, ev.clientY);
        if (!pt) return;
        n.x = Math.max(30, Math.min(W - 30, pt.x));
        n.y = Math.max(30, Math.min(H - 30, pt.y));
        place(g, n);
        redrawEdges();
      });
      g.addEventListener("pointerup", () => {
        const wasDrag = drag && drag.moved;
        if (wasDrag) { posStore.set(n.id, { x: +n.x.toFixed(1), y: +n.y.toFixed(1) }); savePos(); }
        drag = null;
        if (!wasDrag) { if (ui.linkMode) linkTap(n); else openEntity(n.id); }
      });
    }
    redrawEdges();
    paintSel();

    /* background pan + wheel zoom + pinch */
    const pointers = new Map();
    let pan = null, pinch = null;
    svg.addEventListener("pointerdown", (ev) => {
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      try { svg.setPointerCapture(ev.pointerId); } catch {}
      if (pointers.size === 1) {
        const p = toRoot(ev.clientX, ev.clientY);
        pan = { startView: { ...view }, p, sx: ev.clientX, sy: ev.clientY, moved: false };
      } else if (pointers.size === 2) {
        pan = null;
        const [a, b] = [...pointers.values()];
        pinch = {
          startView: { ...view },
          d0: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          // zoom where the fingers are, not the middle of the canvas
          u: toRoot((a.x + b.x) / 2, (a.y + b.y) / 2) || { x: W / 2, y: H / 2 },
        };
      }
    });
    svg.addEventListener("pointermove", (ev) => {
      if (!pointers.has(ev.pointerId)) return;
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pinch && pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const k2 = Math.max(0.35, Math.min(3.2, pinch.startView.k * (d / pinch.d0)));
        const u = pinch.u;
        view.x = u.x - ((u.x - pinch.startView.x) * k2) / pinch.startView.k;
        view.y = u.y - ((u.y - pinch.startView.y) * k2) / pinch.startView.k;
        view.k = k2;
        applyView();
        return;
      }
      if (pan) {
        if (Math.abs(ev.clientX - pan.sx) + Math.abs(ev.clientY - pan.sy) > 4) pan.moved = true;
        const p = toRoot(ev.clientX, ev.clientY);
        view.x = pan.startView.x + (p.x - pan.p.x);
        view.y = pan.startView.y + (p.y - pan.p.y);
        applyView();
      }
    });
    const endPointer = (ev) => {
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) pan = null;
    };
    svg.addEventListener("pointerup", endPointer);
    svg.addEventListener("pointercancel", endPointer);
    svg.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      const u = toRoot(ev.clientX, ev.clientY) || { x: W / 2, y: H / 2 };
      zoomBy(Math.exp(-ev.deltaY * 0.0016), u);
    }, { passive: false });

    stage.append(svg, zoomBar);
    applyDim();
  }

  function place(g, n) {
    g.setAttribute("transform", `translate(${n.x.toFixed(1)},${n.y.toFixed(1)})`);
  }
  function redrawEdges() {
    for (const { el, e } of edgeEls) {
      el.setAttribute("x1", e.a.x); el.setAttribute("y1", e.a.y);
      el.setAttribute("x2", e.b.x); el.setAttribute("y2", e.b.y);
    }
  }
  /* connect mode: tap item A, then item B — draws (or removes) a line */
  function linkTap(n) {
    if (!ui.linkSel) {
      ui.linkSel = n.id;
      paintSel();
      toast({ title: `Picked “${n.label.slice(0, 24)}”`, body: "Now tap what to connect it to.", ic: "link", timeout: 2200 });
      return;
    }
    if (ui.linkSel === n.id) { ui.linkSel = null; paintSel(); return; }
    const a = ui.linkSel, b = n.id;
    const exists = (getState().mapLinks || []).some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
    update((d) => {
      d.mapLinks = (d.mapLinks || []).filter((l) => !((l.a === a && l.b === b) || (l.a === b && l.b === a)));
      if (!exists) d.mapLinks.push({ id: uid(), a, b });
    });
    toast({ title: exists ? "Line removed" : "Connected 🔗", ic: "link", timeout: 1600 });
    ui.linkSel = exists ? null : b; // keep chaining from the second item
  }
  function paintSel() {
    for (const { g, n } of nodeEls.values()) g.classList.toggle("sel", ui.linkMode && n.id === ui.linkSel);
  }
  /* screen point → graph coordinates (accounts for pan/zoom) */
  function toGraph(cx, cy) {
    try {
      const pt = svgRef.createSVGPoint();
      pt.x = cx; pt.y = cy;
      return pt.matrixTransform(vp.getScreenCTM().inverse());
    } catch { return null; }
  }
  /* screen point → root svg coordinates */
  function toRoot(cx, cy) {
    try {
      const pt = svgRef.createSVGPoint();
      pt.x = cx; pt.y = cy;
      return pt.matrixTransform(svgRef.getScreenCTM().inverse());
    } catch { return null; }
  }
  function applyDim() {
    if (!svgRef || ui.mode !== "map") return;
    const q = ui.q;
    const match = new Set();
    if (q) {
      for (const n of graph.nodes) if (fuzzy(q, n.label)) match.add(n.id);
      for (const e of graph.edges) {
        if (match.has(e.a.id)) match.add(e.b.id);
        if (match.has(e.b.id)) match.add(e.a.id);
      }
    }
    for (const { n, g } of nodeEls.values())
      g.style.opacity = !q || match.has(n.id) ? "" : "0.12";
    for (const { el, e } of edgeEls)
      el.style.opacity = !q || (match.has(e.a.id) && match.has(e.b.id)) ? "" : "0.06";
  }

  refresh();
}

/* ------------------------------ timeline ------------------------------ */

function renderTimeline(stage, s) {
  const items = [];
  for (const m of s.memories) items.push({ id: m.id, date: m.date, ic: m.kind === "person" ? "user" : m.kind === "place" ? "pin" : "spark", emoji: m.emoji, title: m.title, sub: m.body?.slice(0, 90), type: "memory" });
  for (const t of s.tasks) if (t.due) items.push({ id: t.id, date: t.due, ic: "check", emoji: "", title: t.title, sub: t.done ? "completed" : "task", type: "task" });
  for (const g of s.goals) items.push({ id: g.id, date: g.deadline || g.created?.slice(0, 10), ic: "target", emoji: g.emoji, title: g.name, sub: "goal", type: "goal" });
  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  if (!items.length) {
    stage.append(emptyState({ ic: "clock", title: "Timeline is empty", hint: "Dated things you save will show up here." }));
    return;
  }
  const byMonth = new Map();
  for (const it of items) {
    if (!it.date) continue;
    const mk = it.date.slice(0, 7);
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk).push(it);
  }
  stage.append(h("div", { class: "timeline wide" },
    [...byMonth.entries()].map(([mk, arr]) =>
      h("div", { class: "tl-month" },
        h("div", { class: "tl-month-label" }, fmtMonth(mk)),
        arr.map((it) =>
          h("button", { class: "tl-item", onclick: () => openEntity(it.id) },
            h("span", { class: "tl-dot" }, it.emoji || icon(it.ic, 15)),
            h("span", { class: "tl-content" },
              h("span", { class: "tl-title" }, it.title),
              h("span", { class: "tl-sub" }, it.sub || "")),
            h("span", { class: "tl-date" }, fmtDate(it.date, { short: true }))))))));
}
