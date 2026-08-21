Pokémon Database — Quick Start

This project is a single-file Pokémon browser. The app loads data from
`json/pokemon-full-data.json` and displays a browsable list in
`index.html`. If you open the site via `file://` the browser may block
network-like `fetch()` calls; running a local HTTP server is the simplest fix.

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
  "Choose JSON file…" button and select `json/pokemon-full-data.json` from
  this repository.
- Alternatively, drop a file named `pokemon-data.js` next to `index.html`
  that sets `window.ALL_POKEMON = [...]` (an array) and click "I have pokemon-data.js (offline)".
  Generate it from the JSON with `python python/generate_pokemon_data_js.py json/pokemon-full-data.json js/pokemon-data.js`
  (this file is gitignored since it's a generated duplicate of the JSON dataset).

Using the detail page

- Click a Pokémon's name in the list to open the richer detail page in a new tab.
- You can also open a detail page directly with a URL like:

```
pokemon-detail.html?id=1
```

Troubleshooting

- If nothing loads, open DevTools (F12) and check the Console for errors.
  Common issue: browsers block `fetch('json/pokemon-full-data.json')` when
  running under `file://`. Use a local server as shown above.
- Ensure `json/pokemon-full-data.json` exists and is valid JSON.
- If you still have trouble, paste Console errors here and I will help.

Want me to do this for you?

- I can add a tiny `serve.ps1` script to start Python/Node automatically.
- I can further enhance the offline UX to auto-detect `pokemon-data.js` drops.

