Project index — where to find things

This page helps you quickly find code areas and documentation in this project.

Core runtime symbols (search `Test Site.html` for these):

- `LocalStorageCache` — cache wrapper for localStorage reads/writes.
- `StorageManager` — central persistence manager (progress cache).
- `renderPokemon()` — main render function (cards + regions).
- `renderTypesPanel(allPokemon)` — builds the type filter panel.
- `LazyImageObserver` — singleton intersection observer for images.
- `markSeenCaught()` — toggles seen/caught and persists changes.
- `Utils` — helper functions (createProgressBar, createStatusBadge, createToggleChip, matchesSearchQuery).

Docs:
- `README.md` — overview and quick start.
- `docs/ARCHITECTURE.md` — architecture and performance decisions.
- `docs/DATA_MODEL.md` — dataset shape and storage formats.
- `docs/DEVELOPMENT.md` — running and contributing.
- `docs/STORAGE_KEYS.md` — localStorage key reference.
- `docs/USAGE.md` — user-facing usage tips and keyboard shortcuts.

Where to start editing

1. Small UI tweaks: edit CSS sections at the top of `Test Site.html`.
2. Rendering or data changes: edit `renderPokemon()` and helper functions near the middle of the file.
3. Persistence or cross-tab logic: edit `StorageManager` and the `storage` event handler near the bottom.

