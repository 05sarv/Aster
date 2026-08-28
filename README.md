# ASTER ✦

**A cozy personal memory + productivity + progress system.** Local-first, offline-first, zero dependencies.

> remember · do · grow

ASTER is a single-page web app where a part of your life can live together: memories of people and places, tasks with gentle reminders, custom "Spaces" for anything you're growing (gym, guitar, finance, travel…), progress metrics and goals —  all yours, all on your device.

---

## Quick start

```bash
node serve.mjs          # → http://localhost:4173
```

That's it — no build step, no npm install, no dependencies. Any of these also works:

```bash
node serve.mjs 3000           # custom port
python -m http.server 4173    # or any static file server
npx serve .
```

The server prints a LAN URL too — open it on your phone to use ASTER from your couch.

### Desktop & phone apps

Prefer real apps? Build the same code into a portable Windows exe and a signed Android apk:

```bash
npm run build:exe     # → releases/ASTER.exe
npm run build:apk     # → releases/ASTER-<version>.apk
```

See **BUILDING.md** for how they work, how to install them, and how edits get repackaged.

## What's inside

### 🌱 Memory helper
Save **moments, people and places** with photos (auto-compressed), moods, tags and stories. Browse as cards or a month timeline, search everything, link any memory to spaces, tasks and goals.

### ✅ Tasks
Quick-add, due dates + times, priorities, and **recurring tasks that roll forward** when completed (daily / weekly / biweekly / monthly). Gentle reminders respect quiet hours and a daily limit — ASTER never nags.

### 📈 Progress
Custom metrics with types: **number, count, duration, distance, rating (stars), percent and text notes** — with units, decimals and "higher/lower is better" direction. Hand-rolled SVG charts: line charts, sparklines, streak flames, calendar heatmaps, progress rings. Goals track a metric target (per week/month/all-time) or milestones, and celebrate with confetti when you cross the finish line.

### 🚀 Spaces
Create a Space for *anything*. Start from an idea (Gym, Guitar, Reading, Travel, Finance, Wellness, Language, Cooking) or build your own — each Space holds its own metrics, entries, goals and links. Nothing is hardcoded to fitness or any single domain.

### 🗺️ Map & Timeline
A living constellation of your data: spaces, memories, people, places, tasks, goals and metrics as draggable nodes, connected by structural links (memory → space, goal → metric…) and your own manual links. Toggle to Timeline for a chronological view.

### 🎨 Dashboard
Customizable home with widgets — greeting, today's tasks, upcoming, recent memories, throwbacks ("on this day"), metric sparklines, goal rings and Space quick-log tiles. Hit **Customize** to drag widgets around, remove them, or add new ones. 9 accent colors, light/dark/auto themes, cozy dotted backdrop.

### 🔒 Local-first & sync
Everything lives in your browser's IndexedDB (localStorage fallback). Photos get their own store. **Move between devices** by exporting a backup file in Settings → Data & sync and importing it on the other device. Nothing ever touches a server.

---

## Architecture

No frameworks, no bundler — plain ES modules with a tiny reactive store.

```
index.html            shell + instant-theme bootstrap
serve.mjs             zero-dependency static server (dev)
src/
  main.js             boot, hash router, navigation shell, welcome
  store.js            state + IndexedDB persistence + attachments + backup
  seed.js → seedState() lives in store.js
  utils.js            h() DOM helper, dates, formatting, image resize
  icons.js            inline SVG icon set
  components.js       modal, toast, popover, chips, swatches, confetti, palette
  charts.js           sparkline, line/bar charts, rings, heatmaps, stars
  logic.js            metric stats, streaks, goal progress (pure functions)
  notify.js           gentle scheduler: quiet hours + daily caps
  editors.js          editors/detail modals for every entity, link picker, quick-add
  views/
    dashboard.js      draggable customizable widgets
    memories.js       cards + timeline, filters
    tasks.js          sections, quick add, recurrence roll-forward
    spaces.js         space grid + detail (Overview/Log/Goals/Links)
    progress.js       goals + per-space metric analytics
    mapview.js        force-directed graph + timeline
    settings.js       appearance, notifications, data & sync
styles/               base tokens/themes, components, views
```

### Entities (all linkable via `relations`)

| Entity     | Purpose |
|------------|---------|
| `Space`    | a user-created corner of life (emoji, color, description) |
| `Memory`   | moment / person / place — text, photos, mood, tags, date |
| `Task`     | due date+time, priority, recurrence, reminder, history |
| `Metric`   | typed custom metric (number/count/duration/distance/rating/percent/text) |
| `Entry`    | one logged value/note for a metric |
| `Goal`     | metric target + period, or milestones / manual progress |
| `Relation` | user-created link between any two entities |
| `Widget`   | dashboard unit (type + config + span) |

State is a single JSON document (schema-versioned, migrated on load), mutated through `update()` which clones, persists (debounced) and re-renders. Photos are stored separately as data-URLs to keep state light.

## Design notes

- Warm cream / cozy-dark themes, pastel accents, 18px radii, soft shadows
- Springy micro-interactions (`cubic-bezier(.34,1.56,.64,1)`), pop-in checkboxes, floating empty states, confetti on goals
- `prefers-reduced-motion` respected everywhere
- Responsive: sidebar on desktop → sticky header + bottom tab bar + FAB on phones

## Roadmap ideas

- PWA (service worker + install) — the app already works fully offline once served locally
- Optional end-to-end encrypted sync adapter (the export/import layer is the seam)
- Recurring metrics ("log every Monday"), richer map filters

---

Made with 💛 — ASTER v1.0
