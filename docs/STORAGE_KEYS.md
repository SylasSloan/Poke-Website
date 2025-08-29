Storage Keys & Meaning — Pokémon Site

This document lists the localStorage keys used by the app and their formats.

- 'pokemonProgress'
  - JSON object mapping region -> { seen: [ids], caught: [ids] }
  - Accessed via `StorageManager.getProgress()` and updated via `StorageManager.saveProgress(progress)`.

- 'selectedRegions'
  - JSON array of region names (strings).
  - Updated via `StorageManager.saveSelectedRegions()`.

- 'selectedTypesV1'
  - JSON array of lower-case type names.
  - Updated via `StorageManager.saveSelectedTypes()`.

- 'pokemonFavoritesV1'
  - JSON array of numeric Pokémon ids.
  - Read/written via `loadFavorites()` / `saveFavorites()`.

- 'typesPanelCollapsed'
  - "1" or "0" — whether the left types panel is collapsed.

- 'nav-open'
  - "1" or "0" — whether the side-nav is open by default. Restored on load.

Notes

- Use `LocalStorageCache` to read/write keys to benefit from in-memory caching.
- `StorageManager.invalidateProgress()` clears the progress cache; this is important for cross-tab coherence when other tabs change the storage directly.

