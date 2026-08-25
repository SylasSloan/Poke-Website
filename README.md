Pokémon Database — Quick Start

This project is a Pokémon browser with no build step: `index.html` and
`pokemon-detail.html` load their CSS/JS from `css/app.css` and `js/*.js` via
plain `<link>`/`<script>` tags. `index.html` loads its list from the lean
`json/pokemon-index.json`; `pokemon-detail.html` additionally fetches one
small `json/details/{id}.json` file per Pokémon viewed. Both are generated
from `json/pokemon-full-data.json` by `python/split_pokemon_data.py` — see
`docs/DATA_MODEL.md` for how the three relate. If you open the site via
`file://` the browser may block network-like `fetch()` calls; running a
local HTTP server is the simplest fix.

Quick start — serve locally (recommended)

- With Python (works if Python 3 is installed):

```powershell
# from the project folder
python -m http.server 8000
# then open in your browser:
http://localhost:8000/index.html
```

- With Node (no install if you use npx):

```bash
npx http-server -p 8000
# then open in your browser:
http://localhost:8000/index.html
```

- VS Code Live Server: open the folder in VS Code and use "Open with Live Server".

Fallback when running from file:// (no server)

- If the page shows "Couldn't auto-load Pokémon data", click the prominent
  "Choose JSON file…" button and select `json/pokemon-index.json` from
  this repository. Note: under `file://`, individual `pokemon-detail.html`
  detail sections (moves, encounters, sprite gallery, etc.) still need
  `fetch()` for `json/details/{id}.json`, so a local server is recommended
  for the detail page even when the main list works via the file picker.
- Alternatively, drop a file named `pokemon-data.js` next to `index.html`
  that sets `window.ALL_POKEMON = [...]` (an array) and click "I have pokemon-data.js (offline)".
  Generate it from the index with `python python/generate_pokemon_data_js.py json/pokemon-index.json js/pokemon-data.js`
  (this file is gitignored since it's a generated duplicate of the JSON dataset).

Using the detail page

- Click a Pokémon's name in the list to open the richer detail page in a new tab.
- You can also open a detail page directly with a URL like:

```
pokemon-detail.html?id=1
```

Troubleshooting

- If nothing loads, open DevTools (F12) and check the Console for errors.
  Common issue: browsers block `fetch('json/pokemon-index.json')` (and the
  detail page's per-Pokémon `fetch('json/details/{id}.json')`) when running
  under `file://`. Use a local server as shown above.
- Ensure `json/pokemon-index.json` and `json/details/` exist. If you've only
  got `json/pokemon-full-data.json`, run `python python/split_pokemon_data.py`
  to generate them.
- If you still have trouble, paste Console errors here and I will help.

Want me to do this for you?

- I can add a tiny `serve.ps1` script to start Python/Node automatically.
- I can further enhance the offline UX to auto-detect `pokemon-data.js` drops.

