Project index — where to find things

This page helps you quickly find code areas and documentation in this project.

index.html's CSS and JS are split across css/app.css and js/*.js (index.html itself
keeps only markup plus a small inline bootstrap script — DOM wiring and the data-load
kickoff — that isn't shared with pokemon-detail.html).

Core runtime symbols:

- `LocalStorageCache`, `StorageManager`, `markSeenCaught()` — `js/storage.js`
- `renderPokemon()`, `renderTypesPanel(allPokemon)`, `LazyImageObserver`, `Utils` — `js/render.js`
- Dataset loading, region grouping, type-icon detection — `js/data.js`
- `cap()`, `titleCase()` — `js/text-utils.js` (shared with pokemon-detail.html)

Docs:
- `README.md` — overview and quick start.
- `docs/ARCHITECTURE.md` — architecture and performance decisions.
- `docs/DATA_MODEL.md` — dataset shape and storage formats.
- `docs/DEVELOPMENT.md` — running and contributing.
- `docs/STORAGE_KEYS.md` — localStorage key reference.
- `docs/USAGE.md` — user-facing usage tips and keyboard shortcuts.
- `docs/CONTRIBUTING.md` — guidance for contributors.

Where to start editing

1. Small UI tweaks: edit `css/app.css`.
2. Rendering or data changes: edit `js/render.js` (or `js/data.js` for dataset loading/shaping).
3. Persistence or cross-tab logic: edit `js/storage.js` (`StorageManager` and the `storage` event handler).
4. Page-specific wiring (search input, toolbar buttons, keyboard shortcuts, the initial data-load kickoff): edit the inline `<script>` at the bottom of `index.html`.

