Development & Contribution Guide — Pokémon Site

Purpose

This guide helps contributors run, test, and extend the Pokémon app.

Prerequisites

- Modern browser (Chrome, Edge, Firefox) with developer tools.
- Optional: Python 3 if you want to run data generation scripts located in `python/`.

Running locally

1. Open `index.html` in your browser. It loads `json/pokemon-index.json` (and `pokemon-detail.html` additionally loads `json/details/{id}.json` per Pokémon viewed) — both already exist in the repo, generated from `json/pokemon-full-data.json`.
2. If you prefer a simple local server, run (from a shell) in the project folder:

```powershell
# Windows PowerShell
python -m http.server 8000
```

and open `http://localhost:8000/index.html` in your browser.

Editing & live reload

- No build step: edit `css/app.css` or `js/*.js` directly and refresh the browser to see changes. `index.html`'s own inline `<script>` handles page-specific wiring (see `docs/ARCHITECTURE.md` for what lives where).
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

Regenerating the dataset

The `python/` scripts form a pipeline; each step depends on fields the
previous one adds to `json/pokemon-full-data.json`. Run them in this order:

1. `python python/download_pokemon_data.py` — seeds base fields (id, name,
   types, sprite, abilities, stats, region, flavor_text, evolves_from) for
   every Pokémon from PokeAPI. Only needed to bootstrap from scratch.
2. `python python/enrich_abilities.py` — fills `ability_details[].description`.
   Caches to `json/ability_cache.json`.
3. `python python/enrich_pokedex_details.py` — adds height/weight/genus,
   training/breeding stats, per-game Pokédex entries, other-language names,
   the sprite gallery, and evolution-trigger data. Caches raw PokeAPI
   responses (by URL) to `python/pokedex_details_cache.json`.
4. `python python/enrich_moves_and_encounters.py` — adds `moves_by_generation`
   (level-up/TM/HM/tutor/egg, split per generation) and
   `encounters_by_generation` (wild-encounter areas/methods/levels/chance/
   conditions, per generation). Shares the same
   `python/pokedex_details_cache.json` cache as step 3, plus a one-time
   global TM/HM/TR lookup.
5. `python python/split_pokemon_data.py` — splits the fully-enriched file
   into `json/pokemon-index.json` (what `index.html` and the detail page's
   pager/evolution-chart need) and `json/details/{id}.json` (everything else,
   fetched lazily by `pokemon-detail.html`). **Run this last, and re-run it
   any time `pokemon-full-data.json` changes** — it's the only step that
   updates the files the app actually serves.
6. `python python/generate_pokemon_data_js.py` — optional; regenerates the
   gitignored `js/pokemon-data-local.js` offline fallback from
   `json/pokemon-index.json`.

Each enrichment script (2-4) is resumable: re-running it skips Pokémon
already enriched and reuses its cache, so an interrupted run just picks up
where it left off. `python/verify_pokemon_json.py` sanity-checks that every
entry in `pokemon-full-data.json` still has the original seed fields.

Commit & PR guidelines

- Keep diffs small and focused so PRs are easy to review.
- Add descriptive comments for any structural change.

