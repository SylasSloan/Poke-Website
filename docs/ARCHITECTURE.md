Architecture — Pokémon Site

Purpose

This document explains the structure, key modules, design choices, and runtime behavior of the Pokémon single-file web app (`Test Site.html`). It's intended for developers who want to maintain or extend the application.

High-level structure

- Single-file app: `Test Site.html` contains HTML, CSS, and JavaScript. The app uses the DOM API without frameworks to remain portable and simple.
- Data: Pokémon data is loaded from `js/pokemon-data.js` (optional global `ALL_POKEMON`) or `json/pokemon-full-data.json` via fetch or file picker fallback.
- Rendering: The app renders region sections and a responsive grid of Pokémon cards using DocumentFragment for batch updates.

Core modules and responsibilities

- LocalStorageCache
  - A small wrapper that caches `localStorage.getItem()` results in memory (Map) to reduce repeated DOM-blocking localStorage access.
  - Methods: `get(key)`, `set(key, value)`, `remove(key)`.

- StorageManager
  - Central manager for application state persisted to localStorage.
  - Responsibilities: caching parsed `pokemonProgress`, saving and retrieving selected regions and types, and saving progress in a single place.
  - Important properties/methods: `_progressCache`, `getProgress()`, `saveProgress(progress)`, `invalidateProgress()`.

- Utils
  - Reusable UI helper functions for small bits of markup or DOM nodes (progress bars, status badges, toggle chips, search matching).

- Rendering pipeline
  - `renderPokemon()` — main render function. It:
    - Reads progress via `StorageManager.getProgress()`.
    - Filters Pokémon per selected regions, types, and search query.
    - Uses a DocumentFragment to assemble region sections and cards.
    - Appends fragment into `#pokemon-list` and then calls `enableLazyImages()`.
  - `renderTypesPanel(allPokemon)` — builds the list of types in the right/left panel and wires interactions.

- Lazy images
  - `LazyImageObserver` — a singleton IntersectionObserver instance reused across renders to lazily set `img.src` from `data-src`.

- Event handling
  - Delegated actions: a single click handler on `#pokemon-list` listens for `[data-action]` attributes (toggle-favorite, toggle-seen, toggle-caught) to avoid many per-card listeners.
  - Top-level listeners: search input debounce, resize debounce, keyboard shortcuts, and menu actions.

Performance considerations

- Avoiding repeated JSON.parse: `StorageManager` caches parsed progress to prevent frequent parse on hot render path.
- Delegation: reduces closure allocations per card and memory churn when many cards are created.
- Shared IntersectionObserver: reduces resource use compared to creating observers per render.
- Debouncing: search and resize handlers are debounced to avoid excessive renders.

Cross-tab synchronization

- The app listens to the `storage` event and invalidates caches when relevant keys change (e.g., `pokemonProgress`) to keep different tabs in sync.

Accessibility and UX

- ARIA attributes added to menu/panel toggles (e.g., `aria-expanded`, `aria-controls`).
- Keyboard shortcuts: `/` focuses search, `t` toggles types panel, Alt+E imports/exports.
- Focus outlines for keyboard users.

Extending the app

- Adding new filters: extend `Utils.matchesSearchQuery` and update `renderTypesPanel` and `renderPokemon` to respect the new filter states.
- Adding a new persisted state: add helpers in `StorageManager` and use `LocalStorageCache` to persist the string value.

Files to inspect

- `Test Site.html` — read top-to-bottom. Key symbols to search for: `StorageManager`, `renderPokemon`, `renderTypesPanel`, `LazyImageObserver`, `LocalStorageCache`, `Utils`, `markSeenCaught()`.

