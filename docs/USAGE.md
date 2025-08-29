Usage & Troubleshooting — Pokémon Site

User-facing features

- Filter by generation (region tabs) — click the buttons at the top to toggle generations.
- Filter by type — left panel contains a collapsible list of types; click to select/deselect.
- Favorites — click the star on a card to toggle favorite.
- Seen / Caught — use the chips on a card (or the delegated controls) to toggle seen/caught states.
- Import / Export — the "More" menu has actions to export and import progress JSON.

Keyboard shortcuts

- / — focus search input
- t — toggle the types panel (left)
- Alt+E — export progress
- Alt+I — import progress

Troubleshooting

- Sprites don't load when opening via file:// — some browsers block fetch under file://. Use the embedded `js/pokemon-data.js` or run a local server: `python -m http.server`.
- Cross-tab edits not showing up — the app listens to `storage` events and should update within 100ms after changes; ensure other tabs write to the same keys (see `docs/STORAGE_KEYS.md`).
- Import fails — validate the JSON structure is an object keyed by region containing `seen` and `caught` arrays.

