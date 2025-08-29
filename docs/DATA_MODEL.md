Data model — Pokémon Site

This document explains the shape of Pokémon records the app expects and the localStorage formats used.

Pokémon record shape

The application is resilient to slightly different dataset shapes, but the expected fields for a Pokémon record are:

- id: number or numeric string (e.g., 1 or "1") — unique identifier.
- name: string — Pokémon name (lowercase or mixed case, UI capitalizes where helpful).
- region: string — the generation or region name (e.g., "generation-i" or "Gen I"). The app uses canonicalized region names internally.
- sprite: string — URL path to a sprite image.
- types: array of strings — e.g., ["Grass","Poison"].
- abilities: array of strings — simple list of ability names.
- ability_details: optional array — objects containing { name, is_hidden } or nested shapes from PokeAPI.
- stats: object with numeric keys such as { hp, attack, defense, "special-attack", "special-defense", speed }.
- flavor_text: optional string for search.

The app accepts datasets where some of these fields are missing and will gracefully omit UI parts.

localStorage formats

- pokemonProgress (key: 'pokemonProgress')
  - JSON object keyed by region name:
    { "region-1": { seen: [1,2,3], caught: [2,3] }, "region-2": { ... } }
  - Stored via `StorageManager.saveProgress(progress)` which also caches the parsed value.

- selectedRegions (key: 'selectedRegions')
  - JSON array of region names, e.g. `["generation-i","generation-ii"]`.

- selectedTypesV1 (key: 'selectedTypesV1')
  - JSON array of lower-case type names, e.g. `["grass","poison"]`.

- pokemonFavoritesV1 (key: 'pokemonFavoritesV1')
  - JSON array of numeric Pokémon ids, e.g. `[1,25,150]`.

- typesPanelCollapsed (key: 'typesPanelCollapsed')
  - "1" or "0" string to indicate the persisted collapsed state of the left types panel.

Notes on robustness

- StorageManager caches parsed progress and exposes `invalidateProgress()` — callers that change storage outside StorageManager should call this method or use StorageManager.saveProgress to maintain cache coherence.
- Data imported from files should follow the same `pokemonProgress` shape. The import logic will validate the structure where possible.

