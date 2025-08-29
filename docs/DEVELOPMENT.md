Development & Contribution Guide — Pokémon Site

Purpose

This guide helps contributors run, test, and extend the Pokémon single-file app.

Prerequisites

- Modern browser (Chrome, Edge, Firefox) with developer tools.
- Optional: Python 3 if you want to run data generation scripts located in `python/`.

Running locally

1. Open `Test Site.html` in your browser. For convenience, place `json/pokemon-full-data.json` next to the HTML file and the app will attempt to load it.
2. If you prefer a simple local server, run (from a shell) in the project folder:

```powershell
# Windows PowerShell
python -m http.server 8000
```

and open `http://localhost:8000/Test%20Site.html` in your browser.

Editing & live reload

- The file is a single-file app. Edit `Test Site.html` and refresh the browser to see changes.
- For faster iteration add a simple live-reload workflow using an editor extension or a small server that reloads on file changes.

Key areas to understand before making changes

- Rendering: `renderPokemon()` is the central function. Try to keep it idempotent and fast. Use `PerfMonitor` to measure slow spots.
- Storage: Centralize writes/reads to `StorageManager` when possible to keep `_progressCache` consistent.
- Event delegation: Use the existing delegated handlers for repeated UI elements to avoid adding per-card listeners.
- Lazy-loading: Reuse `LazyImageObserver` for images.

Testing changes

- Manual testing: toggle types, regions, favorites, mark seen/caught, import/export progress, and test persistence across reloads.
- Cross-tab: open the app in two tabs and update progress in one; the other tab should update after a short delay thanks to the `storage` event handling.

Performance tips

- Avoid heavy synchronous work in `renderPokemon()`. Defer enrichment (e.g., fetching ability descriptions) to background tasks.
- Cache heavy computed values (type maps, abilities) and reuse them between renders.

Commit & PR guidelines

- Keep diffs small and focused; this is a single-file app so large PRs can be hard to review.
- Add descriptive comments for any structural change.

