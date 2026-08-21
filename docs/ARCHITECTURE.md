Architecture — Pokémon Site

Purpose

This document explains the structure, key modules, design choices, and runtime behavior of the Pokémon web app (`index.html` + `pokemon-detail.html`). It's intended for developers who want to maintain or extend the application.

High-level structure

- No build step: `css/app.css` and `js/*.js` are loaded as plain `<link>`/`<script>` tags — no bundler, works from `file://` or a local server. The app uses the DOM API without frameworks.
- `index.html` holds the markup for the main list page, plus a small inline `<script>` at the bottom for page-specific bootstrap (DOM wiring, keyboard shortcuts, the initial data-load kickoff) that isn't shared with `pokemon-detail.html`.
- `js/storage.js` — `LocalStorageCache`, `StorageManager`, `markSeenCaught()` and the seen/caught DOM-update helpers, favorites persistence.
- `js/render.js` — `Utils`, `renderPokemon()`, side nav / region tabs / types panel, `LazyImageObserver`, the ability modal, browse-mode state.
- `js/data.js` — dataset loading (embedded JS file, JSON fetch, or file-picker fallback), region grouping, type-icon detection.
- `js/text-utils.js` — `cap()`/`titleCase()`, shared between `index.html` and `pokemon-detail.html`.
- `pokemon-detail.html` has its own markup/CSS/inline script (a distinct design from the list page) but loads `js/text-utils.js` for `titleCase()` rather than duplicating it, and caches its dataset fallback fetch in `sessionStorage`.
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

Known issues (present independent of the module split, not yet fixed)

- The sidebar's type filter buttons (`#types-list`, built by `renderTypesPanel`) live outside `#pokemon-list`'s DOM subtree, but the click delegation that handles `data-action="toggle-type"` is attached to `#pokemon-list`. Clicking a type filter currently does nothing.
- A card's favorite star (`.fav-badge`) and its seen/caught status badges (`.status-badges`) can visually overlap once both seen and caught are set, making the star unclickable at that position.

Files to inspect

- `js/storage.js`, `js/render.js`, `js/data.js`, `js/text-utils.js` — see the module list above for what's in each.
- `index.html` — markup plus the inline bootstrap `<script>` at the bottom (DOM wiring specific to this page).

