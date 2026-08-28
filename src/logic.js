/* ASTER — domain logic: metric stats, streaks, goal progress. Pure functions over state. */

import { todayKey, addDays, fmtVal } from "./utils.js";

export function entriesOfMetric(state, metricId) {
  return state.entries
    .filter((e) => e.metricId === metricId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.created.localeCompare(a.created)));
}

/** A metric's value fields: explicit parts, or a synthetic one for classic single-value metrics. */
export function metricParts(metric) {
  return metric.parts?.length
    ? metric.parts
    : [{ id: "v", label: "", kind: metric.type, unit: metric.unit, decimals: metric.decimals }];
}

/** Numeric value of an entry for a given field (multi-field entries store {partId: value}). */
export function entryNum(entry, metric, partId) {
  const parts = metricParts(metric);
  let v = entry.val;
  if (parts.length > 1 && v != null && typeof v === "object") {
    const p = parts.find((x) => x.id === partId) || parts.find((x) => !["text", "custom"].includes(x.kind)) || parts[0];
    v = v[p.id];
  }
  return v === "" || v == null || isNaN(Number(v)) ? NaN : Number(v);
}

/** Which field stats/charts use by default: the requested one, else the first numeric. */
export function statPart(metric, partId) {
  const parts = metricParts(metric);
  return parts.find((p) => p.id === partId) || parts.find((p) => !["text", "custom"].includes(p.kind)) || parts[0];
}

export function numericEntries(state, metricId, partId) {
  const m = state.metrics.find((x) => x.id === metricId);
  if (!m || ["text", "custom"].includes(statPart(m, partId).kind)) return [];
  return state.entries.filter((e) => e.metricId === metricId && !isNaN(entryNum(e, m, partId)));
}

/** Consecutive-day streak within a set of 'YYYY-MM-DD' keys (counts today or yesterday as alive). */
export function streakOf(dateSet) {
  let streak = 0;
  let cur = todayKey();
  if (!dateSet.has(cur)) {
    cur = addDays(cur, -1);
    if (!dateSet.has(cur)) return 0;
  }
  while (dateSet.has(cur)) {
    streak++;
    cur = addDays(cur, -1);
  }
  return streak;
}

export function periodStart(period) {
  const t = todayKey();
  if (period === "week") {
    const d = new Date();
    return addDays(t, -(d.getDay() === 0 ? 6 : d.getDay() - 1)); // Monday
  }
  if (period === "month") return t.slice(0, 7) + "-01";
  return null; // all time
}

/** Aggregate stats for a metric (numeric fields only). partId picks a multi-field's column. */
export function metricStats(state, metric, partId) {
  const part = statPart(metric, partId);
  const ents = numericEntries(state, metric.id, partId);
  const byDay = new Map();
  for (const e of ents) byDay.set(e.date, (byDay.get(e.date) || 0) + entryNum(e, metric, partId));
  const days = [...byDay.keys()].sort();
  const vals = days.map((d) => byDay.get(d));
  const last = vals.length ? vals[vals.length - 1] : null;
  const total = vals.reduce((a, b) => a + b, 0);
  const best = metric.direction === "down" ? (vals.length ? Math.min(...vals) : null) : vals.length ? Math.max(...vals) : null;
  const avg = vals.length ? total / vals.length : null;
  return {
    count: ents.length,
    days,
    vals,
    byDay,
    last,
    total,
    best,
    avg,
    streak: streakOf(byDay),
    part,
    fmt: (v) => fmtVal(part.kind, v, part.unit, part.decimals),
  };
}

/** How a goal tracks progress: check | slider | milestones | metric. */
export function goalTrack(goal) {
  if (goal.track) return goal.track;
  if (goal.metricId) return "metric";
  if (goal.milestones?.length) return "milestones";
  return "slider";
}

/** Progress for a goal. Returns {pct, current, target, unit, metric, milestonesPct} */
export function goalProgress(state, goal) {
  const metric = goal.metricId ? state.metrics.find((m) => m.id === goal.metricId) : null;
  const ms = goal.milestones || [];
  const msPct = ms.length ? (ms.filter((m) => m.done).length / ms.length) * 100 : null;
  const track = goalTrack(goal);
  if (track === "metric" && metric) {
    const ents = numericEntries(state, metric.id);
    const from = periodStart(goal.period || "all");
    let current = 0;
    for (const e of ents) if (!from || e.date >= from) current += entryNum(e, metric);
    const target = goal.target || 0;
    let pct = target > 0 ? (current / target) * 100 : 0;
    if (metric.direction === "down" && current > 0 && target > 0) pct = Math.min(160, (target / current) * 100);
    return { pct: Math.min(100, pct), over: pct > 100, current, target, unit: metric.unit, metric, msPct, fmt: (v) => fmtVal(metric.type, v, metric.unit, metric.decimals) };
  }
  if (track === "milestones" && msPct != null) return { pct: msPct, current: null, target: null, unit: "", metric: null, msPct };
  if (track === "check") return { pct: goal.done ? 100 : 0, current: null, target: null, unit: "", metric: null, msPct };
  return { pct: goal.progress || 0, current: null, target: null, unit: "", metric: null, msPct };
}

/** Mark goal done + confetti when it crosses 100 for the first time. Call inside update() then check. */
export function goalJustCompleted(state, goal) {
  const p = goalProgress(state, goal);
  return p.pct >= 100 && !goal.done;
}
