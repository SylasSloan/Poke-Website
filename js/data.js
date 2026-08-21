// Dataset acquisition and shaping: loading Pokémon data (embedded JS file, JSON
// fetch, or file-picker fallback), grouping by region, and type-icon detection.

        // Ability descriptions and modal helpers (global)
        // Base descriptions; will be enriched from JSON data if present
        const abilityDescriptions = {
            "Overgrow": "Boosts the power of Grass-type moves when the Pokémon's HP is low.",
            "Blaze": "Boosts the power of Fire-type moves when the Pokémon's HP is low.",
            "Torrent": "Boosts the power of Water-type moves when the Pokémon's HP is low.",
            "Intimidate": "Lowers the opposing Pokémon's Attack stat when entering battle.",
            "Levitate": "Gives full immunity to all Ground-type moves.",
            "Pressure": "The Pokémon raises the foe's PP usage.",
            "Synchronize": "Passes a burn, poison, or paralysis to the foe."
        };
        // Lowercase lookup for base descriptions
        const abilityDescriptionsLC = (() => {
            const out = {};
            for (const k in abilityDescriptions) out[k.toLowerCase()] = abilityDescriptions[k];
            return out;
        })();
        // Runtime-detected map of type name -> icon file (png/)
        let typeIconMap = {};

        // Try candidate file paths for a given type and attach icon when found
        function detectIconForType(type, candidates, cb) {
            if (!candidates || !candidates.length) return cb(null);
            const next = candidates.shift();
            const img = new Image();
            img.onload = () => cb(next);
            img.onerror = () => detectIconForType(type, candidates, cb);
            img.src = next;
        }

        // Attach an icon element to existing sidebar buttons and card labels for a type
        function attachIconForType(type, path) {
            if (!type || !path) return;
            typeIconMap[type] = path;
            // Sidebar buttons
            try {
                const container = document.getElementById('types-list');
                if (container) {
                    Array.from(container.querySelectorAll('.type-item')).forEach(b => {
                        const text = (b.textContent || '').trim().toLowerCase();
                        if (text === type && !b.querySelector('img.type-icon')) {
                            const img = document.createElement('img');
                            img.className = 'type-icon';
                            img.src = path;
                            img.alt = type;
                            img.onerror = () => img.style.display = 'none';
                            b.insertBefore(img, b.firstChild);
                        }
                    });
                }
            } catch (e) { /* noop */ }
            // Card labels
            try {
                Array.from(document.querySelectorAll('.type-label')).forEach(lbl => {
                    const text = (lbl.textContent || '').trim().toLowerCase();
                    if (text === type && !lbl.querySelector('img.type-icon')) {
                        const img = document.createElement('img');
                        img.className = 'type-icon';
                        img.style.width = '14px'; img.style.height = '14px'; img.style.marginRight = '6px';
                        img.src = path;
                        img.alt = type;
                        img.onerror = () => img.style.display = 'none';
                        lbl.insertBefore(img, lbl.firstChild);
                    }
                });
            } catch (e) { /* noop */ }
        }

        // Given the dataset, attempt to detect icons for each type using plausible filename patterns.
        function detectTypeIcons(allPokemon) {
            const types = new Set();
            (allPokemon || []).forEach(p => { if (Array.isArray(p.types)) p.types.forEach(t => types.add((t||'').toString().toLowerCase())); });
            const base = 'png/';
            Array.from(types).forEach(type => {
                const capType = cap(type);
                const candidates = [
                    `${base}48px-${capType}_icon_SV.png`,
                    `${base}${capType}_icon_SV.png`,
                    `${base}48px-${capType}_icon.png`,
                    `${base}${type}.png`,
                    `${base}${capType}.png`,
                    `${base}File_${capType}_icon_SV.png`,
                    `${base}48px-${capType}_icon_SV.PNG`,
                    `${base}${type}_icon.png`
                ];
                // Kick off detection
                detectIconForType(type, candidates.slice(), (found) => {
                    if (found) attachIconForType(type, found);
                });
            });
        }
        // Cache of enriched abilities (keys are lowercase ability names)
        const abilityCache = {};
        // Persisted local cache for ability descriptions
        const LS_ABILITY_CACHE_KEY = 'abilityDescCacheV1';
        function loadAbilityDescCache() {
            try { return JSON.parse(localStorage.getItem(LS_ABILITY_CACHE_KEY) || '{}'); } catch { return {}; }
        }
        function saveAbilityDescCache(obj) {
            try { localStorage.setItem(LS_ABILITY_CACHE_KEY, JSON.stringify(obj)); } catch {}
        }
        const abilityDescCacheLS = loadAbilityDescCache();
        // Track abilities we've already warned about to prevent console spam
        const unknownAbilityLogged = new Set();

    // Helper function to format generation names for display
        function formatGeneration(genName) {
          const genMap = {
            'generation-i': 'Generation I',
            'generation-ii': 'Generation II',
            'generation-iii': 'Generation III',
            'generation-iv': 'Generation IV',
            'generation-v': 'Generation V',
            'generation-vi': 'Generation VI',
            'generation-vii': 'Generation VII',
            'generation-viii': 'Generation VIII',
            'generation-ix': 'Generation IX'
          };
          // If the name matches a known generation, use the formatted name
          return genMap[genName.toLowerCase()] || genName.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        }

        // GLOBAL VARIABLES
        // regions: array of generation objects (e.g., {name: 'generation-i'})
        // regionPokemon: object mapping generation name to array of Pokémon
        // selectedRegions: array of currently selected generation names
        let regions = [];
        let regionPokemon = {};
        let selectedRegions = [];
    // selectedTypes: currently active type filters (set of strings)
    let selectedTypes = new Set();
    // Global search query used by renderPokemon()
    let searchQuery = '';

        // Ensure region names match the known keys from the dataset exactly
        function canonicalizeRegionName(name) {
            const key = (name ?? '').toString().trim().toLowerCase();
            for (const r of regions) {
                if ((r?.name ?? '').toString().trim().toLowerCase() === key) {
                    return r.name; // return exact dataset key
                }
            }
            return (name ?? '').toString().trim();
        }

        // --- Data bootstrapping helpers to run without a server ---
        function processPokemonData(allPokemon) {
            // Get or create the region tabs container
            const tabsDiv = getOrCreateRegionTabs();
            if (tabsDiv) tabsDiv.innerHTML = '';
            console.log('Loaded dataset:', allPokemon && allPokemon.length);
            // Render the types panel (right column)
            try { renderTypesPanel(allPokemon); } catch (e) { console.warn('renderTypesPanel failed', e); }
            // Merge any locally cached descriptions from previous sessions
            try {
                let lsCount = 0;
                for (const k in abilityDescCacheLS) {
                    if (abilityDescCacheLS[k] && !abilityCache[k]) {
                        abilityCache[k] = { description: abilityDescCacheLS[k] };
                        lsCount++;
                    }
                }
                if (lsCount) console.log(`[Abilities] Restored ${lsCount} descriptions from localStorage cache.`);
            } catch {}
            try {
                let loadedDescriptions = 0;
                for (const p of allPokemon) {
                    if (Array.isArray(p.ability_details)) {
                        for (const a of p.ability_details) {
                            const name = (a?.name ?? a?.ability?.name ?? a?.ability ?? '').toString().trim().toLowerCase();
                            const description = (a?.description ?? a?.effect ?? a?.short_effect ?? '').toString().trim();
                            if (name && description && !abilityCache[name]) {
                                abilityCache[name] = { description };
                                loadedDescriptions++;
                            }
                        }
                    }
                }
                if (loadedDescriptions) console.log(`[Abilities] Loaded ${loadedDescriptions} descriptions from JSON.`);
            } catch {}
            // Group Pokémon by generation
            const regionGroups = {};
            allPokemon.forEach(p => {
                if (!regionGroups[p.region]) regionGroups[p.region] = [];
                regionGroups[p.region].push(p);
            });
            regions = Object.keys(regionGroups).map(region => ({ name: region }));
            regionPokemon = regionGroups;
            // Render region actions and filter tabs at the top
            if (tabsDiv) tabsDiv.innerHTML = '';
            // Action buttons: Clear All / Select All
            const clearBtn = document.createElement('button');
            clearBtn.className = 'region-tab region-action';
            clearBtn.textContent = 'Clear All';
            clearBtn.title = 'Clear all selections';
            clearBtn.addEventListener('click', () => clearAllRegions());
            const selectAllBtn = document.createElement('button');
            selectAllBtn.className = 'region-tab region-action';
            selectAllBtn.textContent = 'Select All';
            selectAllBtn.title = 'Select all generations';
            selectAllBtn.addEventListener('click', () => selectAllRegions());
            if (tabsDiv) {
                tabsDiv.appendChild(clearBtn);
                tabsDiv.appendChild(selectAllBtn);
            }
            // Region tabs
            regions.forEach(region => {
                // Use formatted generation name for tab label
                let displayName = formatGeneration(region.name);
                const btn = document.createElement('button');
                btn.className = 'region-tab';
                btn.textContent = displayName;
                btn.setAttribute('data-region', region.name); // Store raw region name
                // Mark as toggle buttons in the toolbar
                btn.setAttribute('role', 'button');
                // Make tabbable and reflect selection state via aria-pressed
                btn.tabIndex = 0;
                btn.setAttribute('aria-pressed', 'false');
                btn.setAttribute('aria-controls', `section-${region.name}`);
                // When clicked, toggles region selection using the data attribute
                btn.addEventListener('click', (e) => {
                    const rn = e.currentTarget.getAttribute('data-region');
                    if (e.altKey) {
                        singleSelectRegion(rn);
                    } else {
                        toggleRegion(rn);
                    }
                });
                if (tabsDiv) tabsDiv.appendChild(btn);
            });
            // Restore previously selected regions if available
            try {
                const saved = JSON.parse(localStorage.getItem('selectedRegions') || '[]');
                if (Array.isArray(saved) && saved.length) {
                    selectedRegions = saved.filter(name => !!regionGroups[name]);
                }
            } catch {}
            // Select all regions by default if none selected
            if (!selectedRegions || selectedRegions.length === 0) {
                selectedRegions = regions.map(r => r.name);
            }
            updateTabsUI();
            // Keyboard navigation for tabs: ArrowLeft/ArrowRight/Home/End to move focus, Enter/Space to toggle
            if (tabsDiv) {
                tabsDiv.addEventListener('keydown', (e) => {
                    const focusable = Array.from(tabsDiv.querySelectorAll('.region-tab')).filter(b => !b.classList.contains('region-action'));
                if (!focusable.length) return;
                const idx = focusable.indexOf(document.activeElement);
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    e.preventDefault();
                    const next = focusable[(idx + 1) % focusable.length];
                    next.focus();
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const prev = focusable[(idx - 1 + focusable.length) % focusable.length];
                    prev.focus();
                } else if (e.key === 'Home') {
                    e.preventDefault();
                    focusable[0].focus();
                } else if (e.key === 'End') {
                    e.preventDefault();
                    focusable[focusable.length - 1].focus();
                } else if (e.key === 'Enter' || e.key === ' ') {
                    // Activate the focused tab
                    if (document.activeElement && document.activeElement.classList.contains('region-tab')) {
                        // Toggle selection like a button
                        document.activeElement.click();
                        e.preventDefault();
                    }
                }
                });
            }
            renderPokemonSafe();
            try { if (typeof detectTypeIcons === 'function') detectTypeIcons(allPokemon); } catch (e) { console.warn('detectTypeIcons failed', e); }
        }

        function showLocalFileLoader(error) {
            console.warn('Falling back to local file loader.', error);
            const container = document.getElementById('pokemon-list');
            const helper = document.createElement('div');
            helper.style.padding = '18px';
            helper.style.textAlign = 'center';
            helper.innerHTML = `
                <div style="font-size:1.2em;font-weight:800;color:#ef5350;margin-bottom:12px;">Couldn't auto-load Pokémon data</div>
                <div style="color:#333;margin-bottom:14px;">To continue, please select the <strong>pokemon-full-data.json</strong> file from this project's <em>json</em> folder. This file contains the database the app needs.</div>
                <input id="data-file" type="file" accept="application/json,.json" style="display:none;" />
                <div style="display:flex;gap:12px;align-items:center;justify-content:center;margin-bottom:12px;">
                    <button id="choose-file" class="region-tab region-action" style="font-size:1.05em;padding:12px 18px;border-radius:12px;">Choose JSON file…</button>
                    <button id="use-js-data" class="region-tab" style="font-size:0.95em;padding:8px 12px;border-radius:8px;">I have pokemon-data.js (offline)</button>
                </div>
                <div style="color:#777;font-size:0.9em;">Tip: You can also drop a <code>pokemon-data.js</code> file that sets <code>window.ALL_POKEMON = [...]</code> next to this HTML.</div>
            `;
            container.innerHTML = '';
            container.appendChild(helper);
            const input = helper.querySelector('#data-file');
            const btn = helper.querySelector('#choose-file');
            const useJsBtn = helper.querySelector('#use-js-data');
            btn.onclick = () => input.click();
            if (useJsBtn) useJsBtn.onclick = () => {
                // Try to load an offline JS data file if the user indicates they have one
                tryLoadScriptDataThenFallback();
            };
            // Make the choose button obvious and focus it so users see the fallback action
            try { btn.focus(); btn.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {}
            input.onchange = () => {
                const file = input.files && input.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                    // Debug: report filename and size
                    try { console.info('Selected file:', file.name, 'size:', file.size); } catch (e) {}
                    try {
                        const parsed = JSON.parse(String(reader.result));
                        let dataArray = null;
                        if (Array.isArray(parsed)) {
                            dataArray = parsed;
                        } else if (parsed && typeof parsed === 'object') {
                            for (const k of Object.keys(parsed)) {
                                if (Array.isArray(parsed[k])) { dataArray = parsed[k]; break; }
                            }
                        }
                        if (!Array.isArray(dataArray)) {
                            const msg = `Invalid JSON structure in ${file.name}. Expected an array at the root or a property containing an array.`;
                            alert(msg);
                            console.error(msg, parsed);
                            return;
                        }
                        try { console.info(`Loaded ${dataArray.length} entries from ${file.name}`); } catch (e) {}
                        processPokemonData(dataArray);
                    } catch (e) {
                        const message = e && e.message ? e.message : String(e);
                        alert(`Invalid JSON file "${file.name}": ${message}`);
                        console.error('Failed to parse selected JSON file', file.name, e);
                    }
                };
                reader.readAsText(file);
            };
        }

        function tryLoadScriptDataThenFallback() {
            // Try optional JS dataset for fully offline use: pokemon-data.js (load from js/ folder)
            const script = document.createElement('script');
            script.src = 'js/pokemon-data.js';
            script.onload = () => {
                if (Array.isArray(window.ALL_POKEMON)) {
                    processPokemonData(window.ALL_POKEMON);
                } else {
                    showLocalFileLoader(new Error('js/pokemon-data.js loaded but no ALL_POKEMON found'));
                }
            };
            script.onerror = () => showLocalFileLoader(new Error('js/pokemon-data.js not found'));
            document.head.appendChild(script);
        }
