// Rendering: card/list construction, side nav, region tabs, the types panel,
// the ability modal, lazy image loading, and view-mode (browse mode) state.

    // Utility functions for common operations
    // These helpers are small, reusable pieces of UI logic used across the app.
    // Keep functions pure where possible; when DOM nodes are returned they are
    // created but not attached to the document so callers can position them.
    const Utils = {
            // Reusable function for creating progress bars
            createProgressBar(type, current, total, iconSrc) {
                const percentage = total > 0 ? Math.round(current / total * 100) : 0;
                const className = type === 'caught' ? 'caught' : '';
                return `
                    <div>
                        <img src='${iconSrc}' alt='${type}' style='width:22px;height:22px;vertical-align:middle;margin-right:6px;'>
                        <div class='progress-bar'>
                            <div class='progress-fill ${className}' style='width:${percentage}%'></div>
                            <div class='progress-text'>${current}/${total}</div>
                        </div>
                    </div>
                `;
            },

            // Reusable function for creating status badges
            createStatusBadge(type, title, isActive) {
                const badge = document.createElement('div');
                badge.className = `status-badge ${type}`;
                badge.title = title;
                badge.textContent = type === 'seen' ? 'S' : 'C';
                return badge;
            },

            // Reusable function for creating toggle chips
            // If onClick is provided, it will be attached; otherwise callers can set data-* attributes
            // so a delegated handler can process clicks (reduces closures / listeners).
            createToggleChip(type, isActive, iconSrc, onClick) {
                const chip = document.createElement('div');
                chip.className = `toggle-chip ${type}${isActive ? ' active' : ''}`;
                const icon = document.createElement('span');
                icon.className = 'icon';
                const img = document.createElement('img');
                img.src = iconSrc;
                img.alt = '';
                icon.appendChild(img);
                const label = document.createElement('span');
                label.textContent = type === 'seen' ? 'Seen' : 'Caught';
                chip.appendChild(icon);
                chip.appendChild(label);
                if (typeof onClick === 'function') chip.onclick = onClick;
                return chip;
            },

            // Enhanced search matching
            matchesSearchQuery(pokemon, query) {
                if (!query) return true;
                const q = query.toLowerCase();
                
                // Match ID
                if (pokemon.id && String(pokemon.id) === q) return true;
                
                // Match name
                if (pokemon.name?.toLowerCase().includes(q)) return true;
                
                // Match types
                if (Array.isArray(pokemon.types) && 
                    pokemon.types.some(t => t.toLowerCase().includes(q))) return true;
                
                // Match flavor text
                if (pokemon.flavor_text?.toLowerCase().includes(q)) return true;
                
                // Match abilities
                if (Array.isArray(pokemon.abilities)) {
                    for (const ab of pokemon.abilities) {
                        const name = (ab || '').toString().toLowerCase();
                        if (name.includes(q)) return true;
                        const desc = (abilityCache[name]?.description || '').toString().toLowerCase();
                        if (desc?.includes(q)) return true;
                    }
                }
                
                return false;
            }
        };

    // Small inline fallback image (data URI) used when a sprite fails to load.
    // Using a tiny inline SVG prevents layout shift and provides a visible placeholder.
    const FALLBACK_IMG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='%23f6f8fa'/><circle cx='32' cy='32' r='28' fill='%23ef5350'/><rect x='0' y='30' width='64' height='4' fill='%23fff'/></svg>";

    // favorites filter state (when true, only favorites are shown)
    let favoritesFilterOn = false;
    let browseMode = 'all';

                // Renders the Pokémon cards and progress bars for selected regions
    // Performance monitoring utility (development only)
    // Use PerfMonitor.start(label) and PerfMonitor.end(label) around expensive ops
    // to log operations that exceed the threshold (50ms by default).
    const PerfMonitor = {
            timers: new Map(),
            
            start(label) {
                this.timers.set(label, performance.now());
            },
            
            end(label) {
                const start = this.timers.get(label);
                if (start) {
                    const duration = performance.now() - start;
                    if (duration > 50) { // Only log operations taking more than 50ms
                        console.log(`⚡ ${label}: ${duration.toFixed(2)}ms`);
                    }
                    this.timers.delete(label);
                    return duration;
                }
                return null;
            }
        };


    function toggleCardSelection(card) {
        if (!card) return;
        const isSelected = card.classList.contains('is-selected');
        document.querySelectorAll('.pokemon-card.is-selected').forEach((el) => {
            el.classList.remove('is-selected');
            el.setAttribute('aria-expanded', 'false');
        });
        if (!isSelected) {
            card.classList.add('is-selected');
            card.setAttribute('aria-expanded', 'true');
        } else {
            card.setAttribute('aria-expanded', 'false');
        }
    }

    function setBrowseMode(mode) {
        const normalized = ['all', 'favorites', 'seen', 'caught'].includes(mode) ? mode : 'all';
        browseMode = normalized;
        favoritesFilterOn = normalized === 'favorites';
        try { renderPokemonSafe(); } catch (e) { console.warn('Failed to apply browse mode', e); }
        try { renderSideNav(); } catch (e) { console.warn('Failed to update sidebar browse state', e); }
    }

    /**
     * renderPokemon()
     * Main rendering function. Responsible for building the DOM for all selected regions
     * and their Pokémon cards.
     *
     * Side effects:
     * - Reads persisted progress via StorageManager.getProgress()
     * - Updates #pokemon-list inner DOM (batch-insert via DocumentFragment)
     * - Calls enableLazyImages() to attach lazy loading to new images
     *
     * Performance notes:
     * - Uses PerfMonitor to log slow renders (>50ms)
     * - Filters data in-memory before DOM creation to minimize node churn
     */
    // Performance-monitored render function
    // Browse mode currently in effect (mirrors #favorites-filter / browseMode). Shared by
    // renderPokemon's filter and by the single-card DOM updates below it in this file, so
    // "is this card still visible" can never disagree between the two code paths.
    function getCurrentBrowseMode() {
        const favoritesFilter = document.getElementById('favorites-filter');
        const favFilterOn = (favoritesFilter && favoritesFilter.getAttribute('aria-pressed') === 'true') || favoritesFilterOn;
        return browseMode || (favFilterOn ? 'favorites' : 'all');
    }

    // Whether `pokemon` belongs in the given browse mode. Shared for the same reason as
    // getCurrentBrowseMode() above.
    function matchesBrowseMode(mode, pokemon, progress) {
        if (mode === 'favorites') return favorites.has(Number(pokemon.id));
        if (mode === 'seen') return !!(progress[pokemon.region]?.seen?.has(pokemon.id));
        if (mode === 'caught') return !!(progress[pokemon.region]?.caught?.has(pokemon.id));
        return true;
    }

    function renderPokemon() {
            PerfMonitor.start('renderPokemon');

            try {
                    // Cache progress data via StorageManager to avoid repeated localStorage parsing
                    const progress = StorageManager.getProgress() || {};

                    // Cache DOM queries and common computations
                    const globalDiv = document.getElementById('global-progress');
                    const listDiv = document.getElementById('pokemon-list');
                    const currentBrowseMode = getCurrentBrowseMode();
                    const hasTypeFilter = selectedTypes && selectedTypes.size > 0;
                    const hasSearchQuery = searchQuery && searchQuery.length > 0;
                    const selectedTypesArray = hasTypeFilter ? Array.from(selectedTypes) : [];

                    // Update global progress (across all regions)
                    if (globalDiv) {
                        const regionKeys = Object.keys(regionPokemon || {});
                        const totalAll = regionKeys.reduce((sum, rn) => sum + (regionPokemon[rn]?.length || 0), 0);
                        const seenAll = regionKeys.reduce((sum, rn) => sum + (progress[rn]?.seen?.size || 0), 0);
                        const caughtAll = regionKeys.reduce((sum, rn) => sum + (progress[rn]?.caught?.size || 0), 0);
                        if (totalAll > 0) {
                            // Use utility function for cleaner progress bar creation
                            globalDiv.innerHTML = `
                                <div class='progress-container'>
                                    ${Utils.createProgressBar('seen', seenAll, totalAll, 'png/wide-lens.png')}
                                    ${Utils.createProgressBar('caught', caughtAll, totalAll, 'png/pokeball.png')}
                                </div>
                            `;
                        } else {
                            globalDiv.innerHTML = '';
                        }
                    }

                    if (!listDiv) return;
                    listDiv.innerHTML = '';
                    // If no generations are selected, show a friendly hint and stop
                    if (!selectedRegions || selectedRegions.length === 0) {
                        const msg = document.createElement('div');
                        msg.style.padding = '16px';
                        msg.style.textAlign = 'center';
                        msg.style.color = '#666';
                        msg.textContent = 'No generations selected. Use the tabs above to choose one or more.';
                        listDiv.appendChild(msg);
                        return;
                    }
                    for (const regionName of selectedRegions) {
                        if (!regionPokemon[regionName]) continue;
                        const regionSection = document.createElement('div');
                        regionSection.className = 'region-section';
                        regionSection.id = `section-${regionName}`;
                        regionSection.setAttribute('role', 'region');
                        const regionTitle = document.createElement('div');
                        regionTitle.className = 'region-title';
                        regionTitle.id = `region-title-${regionName}`;
                        regionTitle.textContent = formatGeneration(regionName);
                        regionSection.setAttribute('aria-labelledby', regionTitle.id);
                        regionSection.appendChild(regionTitle);
                        const total = regionPokemon[regionName].length;
                        const seen = progress[regionName]?.seen?.size || 0;
                        const caught = progress[regionName]?.caught?.size || 0;
                        const progressContainer = document.createElement('div');
                        progressContainer.className = 'progress-container';
                        // Use utility function for consistent progress bar creation
                        progressContainer.innerHTML = 
                            Utils.createProgressBar('seen', seen, total, 'png/wide-lens.png') +
                            Utils.createProgressBar('caught', caught, total, 'png/pokeball.png');
                        regionSection.appendChild(progressContainer);
                        const grid = document.createElement('div');
                        // Responsive columns: compute columns based on available window width and desired card width
                        // Use cssText for better performance than individual style assignments
                        (function applyResponsiveGridStyles(g){
                            // Gap & max site width
                            const gap = 20;
                            const maxContainer = 1600;

                            // Estimate a reasonable column count based on a preferred card width,
                            // then clamp to [1, 8] columns so we don't over-dense on very large screens.
                            const preferred = 220;
                            const approxCols = Math.max(1, Math.floor(Math.min(window.innerWidth, maxContainer) / (preferred + gap)));
                            const columns = Math.min(8, Math.max(1, approxCols));

                            // Compute a min card width that fills the available space without getting too small.
                            // Clamp between 140px and 260px for consistent readability.
                            const minWidth = Math.max(140, Math.min(260, Math.floor((Math.min(window.innerWidth, maxContainer) - gap * (columns - 1)) / columns)));
                            const maxWidth = Math.min(maxContainer, columns * minWidth + (columns - 1) * gap);

                            // Use auto-fit / minmax so the grid adapts and cards stretch evenly.
                            g.style.cssText = `display:grid;grid-template-columns:repeat(auto-fit, minmax(${minWidth}px, 1fr));gap:${gap}px;max-width:${maxWidth}px;margin:0 auto;justify-content:center;padding:0 12px;box-sizing:border-box;`;
                        })(grid);
                        let visibleCount = 0;
                        
                        // Pre-filter Pokémon to avoid repeated DOM queries and computations
                        const filteredPokemon = regionPokemon[regionName].filter(pokemon => {
                            if (!matchesBrowseMode(currentBrowseMode, pokemon, progress)) return false;
                            
                            // Type filters
                            if (hasTypeFilter) {
                                if (!Array.isArray(pokemon.types)) return false;
                                const lowerTypes = pokemon.types.map(x => x.toLowerCase());
                                if (selectedTypesArray.length === 1) {
                                    if (!lowerTypes.includes(selectedTypesArray[0])) return false;
                                } else if (selectedTypesArray.length > 1) {
                                    if (!selectedTypesArray.every(t => lowerTypes.includes(t))) return false;
                                }
                            }

                            // Search query filter - use utility function
                            if (hasSearchQuery && !Utils.matchesSearchQuery(pokemon, searchQuery)) {
                                return false;
                            }
                            
                            return true;
                        });
                        
                        // Create document fragment for batch DOM insertion
                        const fragment = document.createDocumentFragment();
                        
                        for (const pokemon of filteredPokemon) {
                            const card = document.createElement('div');
                            card.className = 'pokemon-card compact-reference';
                            card.setAttribute('role', 'button');
                            card.setAttribute('tabindex', '0');
                            card.setAttribute('aria-expanded', 'false');
                            card.setAttribute('data-card-key', `${pokemon.region || ''}:${pokemon.id}`);
                            // Favorite badge (star) — top-right
                            const favBadge = document.createElement('button');
                            favBadge.className = 'fav-badge' + (favorites.has(Number(pokemon.id)) ? ' fav' : '');
                            favBadge.title = 'Toggle favorite';
                            favBadge.setAttribute('aria-pressed', favorites.has(Number(pokemon.id)) ? 'true' : 'false');
                            favBadge.innerHTML = '★';
                            // Use delegated event handling to reduce per-card closures
                            favBadge.setAttribute('data-action', 'toggle-favorite');
                            favBadge.setAttribute('data-pokemon-id', String(pokemon.id));
                            card.appendChild(favBadge);
                            const number = document.createElement('div');
                            number.className = 'pokemon-number';
                            number.textContent = `#${pokemon.id.toString().padStart(3, '0')}`;
                            card.appendChild(number);
                            const name = document.createElement('button');
                            name.className = 'pokemon-name';
                            name.type = 'button';
                            name.textContent = pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1);
                            name.setAttribute('data-action', 'open-details');
                            name.setAttribute('data-pokemon-id', String(pokemon.id));
                            name.style.background = 'none';
                            name.style.border = 'none';
                            name.style.padding = '0';
                            name.style.cursor = 'pointer';
                            name.style.color = 'var(--text)';
                            name.style.font = 'inherit';
                            name.style.width = '100%';
                            card.appendChild(name);
                            if (pokemon.sprite) {
                                const img = document.createElement('img');
                                img.className = 'pokemon-img lazy-img';
                                // use data-src for lazy loader; set a small placeholder src to reserve layout
                                img.setAttribute('data-src', pokemon.sprite);
                                img.setAttribute('loading', 'lazy');
                                img.alt = pokemon.name + ' sprite';
                                img.src = FALLBACK_IMG;
                                // ensure fallback on any error once the real src is applied
                                img.addEventListener('error', () => {
                                    if (!img.dataset._tried_unown) {
                                        img.dataset._tried_unown = '1';
                                        img.src = 'png/unown-question.png';
                                    } else {
                                        img.src = FALLBACK_IMG;
                                    }
                                }, { once: false });
                                card.appendChild(img);
                                // Status badges overlay - use utility function
                                const badges = document.createElement('div');
                                badges.className = 'status-badges';
                                if (progress[pokemon.region]?.seen?.has(pokemon.id)) {
                                    badges.appendChild(Utils.createStatusBadge('seen', 'Seen', true));
                                }
                                if (progress[pokemon.region]?.caught?.has(pokemon.id)) {
                                    badges.appendChild(Utils.createStatusBadge('caught', 'Caught', true));
                                }
                                card.appendChild(badges);
                            }
                            if (pokemon.types) {
                                pokemon.types.forEach(type => {
                                    const typeSpan = document.createElement('span');
                                    typeSpan.className = `type-label type-${type.toLowerCase()}`;
                                    const key = (type || '').toString().toLowerCase();
                                    const iconPath = (typeof typeIconMap !== 'undefined') ? typeIconMap[key] : null;
                                    if (iconPath) {
                                        const img = document.createElement('img');
                                        img.className = 'type-icon';
                                        img.style.width = '14px';
                                        img.style.height = '14px';
                                        img.style.marginRight = '6px';
                                        img.src = iconPath;
                                        img.alt = type;
                                        img.onerror = () => { img.style.display = 'none'; };
                                        typeSpan.appendChild(img);
                                    }
                                    const txt = document.createTextNode(type.charAt(0).toUpperCase() + type.slice(1));
                                    typeSpan.appendChild(txt);
                                    card.appendChild(typeSpan);
                                });
                            }
                            const detailHint = document.createElement('div');
                            detailHint.className = 'detail-hint';
                            detailHint.textContent = 'Click the name for full details';
                            card.appendChild(detailHint);
                            const detailPanel = document.createElement('div');
                            detailPanel.className = 'pokemon-detail-panel';
                            // Abilities block (numbered list + hidden ability) — standardized display
                            {
                                // Normalize abilities from possible shapes
                                const normals = [];
                                const hidden = [];
                                const seenNormal = new Set();
                                const seenHidden = new Set();
                                if (Array.isArray(pokemon.ability_details)) {
                                    for (const a of pokemon.ability_details) {
                                        const name = (a?.name || a?.ability?.name || a?.ability || '').toString().trim();
                                        const isHidden = !!(a?.is_hidden ?? a?.hidden ?? a?.isHidden);
                                        if (!name) continue;
                                        const key = name.toLowerCase();
                                        if (isHidden) { if (!seenHidden.has(key)) { hidden.push(name); seenHidden.add(key); } }
                                        else { if (!seenNormal.has(key)) { normals.push(name); seenNormal.add(key); } }
                                    }
                                } else {
                                    if (Array.isArray(pokemon.abilities)) {
                                        for (const n of pokemon.abilities) {
                                            const name = (n || '').toString().trim();
                                            if (!name) continue;
                                            const key = name.toLowerCase();
                                            if (!seenNormal.has(key)) { normals.push(name); seenNormal.add(key); }
                                        }
                                    }
                                    if (pokemon.hidden_ability) {
                                        const name = (pokemon.hidden_ability || '').toString().trim();
                                        if (name) {
                                            const key = name.toLowerCase();
                                            if (!seenHidden.has(key)) { hidden.push(name); seenHidden.add(key); }
                                        }
                                    }
                                }
                                if (normals.length || hidden.length) {
                                    const abilitiesGrid = document.createElement('div');
                                    abilitiesGrid.className = 'abilities-grid';
                                    const label = document.createElement('div');
                                    label.className = 'abilities-label';
                                    label.textContent = 'Abilities';
                                    const list = document.createElement('div');
                                    list.className = 'abilities-list';
                                    // Prepare a set for quick hidden lookup (some datasets may include the same name in different lists)
                                    const hiddenSet = new Set(hidden.map(n => (n || '').toString().toLowerCase()));
                                    // Fallback: treat the last listed normal ability as the hidden ability
                                    // so the UI always flags the last ability with H when explicit hidden
                                    // markers are not present. Only do this if there are 2+ abilities.
                                    if (normals.length > 1) {
                                        const lastName = (normals[normals.length - 1] || '').toString().toLowerCase();
                                        if (lastName) hiddenSet.add(lastName);
                                    }
                                    // Numbered visible abilities
                                    normals.forEach((name, i) => {
                                        const line = document.createElement('div');
                                        line.className = 'ability-item';
                                        const meta = document.createElement('div');
                                        meta.className = 'ability-meta';
                                        const idxSpan = document.createElement('span');
                                        idxSpan.className = 'ability-index';
                                        idxSpan.textContent = `${i + 1}.`;
                                        const link = document.createElement('button');
                                        link.className = 'ability-link';
                                        link.type = 'button';
                                        link.textContent = (typeof titleCase === 'function') ? titleCase(name) : name;
                                        link.setAttribute('data-ability', name);
                                        link.onclick = () => showAbilityModal(name);
                                        // If this ability is flagged hidden elsewhere, create the hidden flag and
                                        // place it inside the meta container before the index so layout remains stable.
                                        if (hiddenSet.has((name || '').toString().toLowerCase())) {
                                            const flag = document.createElement('span');
                                            flag.className = 'ability-hidden-badge';
                                            flag.textContent = 'H';
                                            flag.setAttribute('aria-label', 'Hidden ability');
                                            meta.appendChild(flag);
                                        }
                                        meta.appendChild(idxSpan);
                                        line.appendChild(meta);
                                        line.appendChild(link);
                                        list.appendChild(line);
                                    });
                                    // Hidden abilities, one line: Name (hidden ability)
                                    if (hidden.length) {
                                        hidden.forEach(name => {
                                            const h = document.createElement('div');
                                            h.className = 'hidden-ability';
                                            const link = document.createElement('button');
                                            link.className = 'ability-link';
                                            link.type = 'button';
                                            link.textContent = (typeof titleCase === 'function') ? titleCase(name) : name;
                                            link.setAttribute('data-ability', name);
                                            link.onclick = () => showAbilityModal(name);
                                            const meta = document.createElement('div');
                                            meta.className = 'ability-meta';
                                            const flag = document.createElement('span');
                                            flag.className = 'ability-hidden-badge';
                                            flag.textContent = 'H';
                                            flag.setAttribute('aria-label', 'Hidden ability');
                                            const idxSpacer = document.createElement('span');
                                            idxSpacer.className = 'ability-index';
                                            idxSpacer.textContent = '';
                                            meta.appendChild(flag);
                                            meta.appendChild(idxSpacer);
                                            h.appendChild(meta);
                                            h.appendChild(link);
                                            list.appendChild(h);
                                        });
                                    }
                                    abilitiesGrid.appendChild(label);
                                    abilitiesGrid.appendChild(list);
                                    detailPanel.appendChild(abilitiesGrid);
                                }
                            }
                            if (pokemon.stats) {
                                const statOrder = [
                                    { key: 'hp', label: 'HP', class: 'stat-hp' },
                                    { key: 'attack', label: 'Attack', class: 'stat-attack' },
                                    { key: 'defense', label: 'Defense', class: 'stat-defense' },
                                    { key: 'special-attack', label: 'Sp. Atk', class: 'stat-spatk' },
                                    { key: 'special-defense', label: 'Sp. Def', class: 'stat-spdef' },
                                    { key: 'speed', label: 'Speed', class: 'stat-speed' }
                                ];
                                const statTable = document.createElement('table');
                                statTable.className = 'stat-table';
                                statOrder.forEach(stat => {
                                    const tr = document.createElement('tr');
                                    const tdLabel = document.createElement('td');
                                    tdLabel.className = 'stat-label';
                                    tdLabel.textContent = stat.label;
                                    tr.appendChild(tdLabel);
                                    const tdValue = document.createElement('td');
                                    tdValue.className = 'stat-value';
                                    tdValue.textContent = pokemon.stats[stat.key] || '-';
                                    tr.appendChild(tdValue);
                                    const tdBar = document.createElement('td');
                                    tdBar.className = 'stat-bar';
                                    const statVal = pokemon.stats[stat.key] || 0;
                                      const percent = Math.max(0, Math.min(1, (statVal - 1) / 254));
                                      const fill = document.createElement('div');
                                      fill.className = 'stat-fill';
                                      fill.style.width = `${percent * 100}%`;
                                      // Multi-stop gradient: orange (#ff9800), yellow (#ffe082), light green (#cddc39), green (#8bc34a), cyan (#00bcd4)
                                      function lerp(a, b, t) {
                                          return Math.round(a + (b - a) * t);
                                      }
                                      const stops = [
                                          { value: 0, color: [255, 152, 0] },      // orange
                                          { value: 0.27, color: [255, 224, 130] }, // yellow
                                          { value: 0.47, color: [205, 220, 57] },  // light green
                                          { value: 0.71, color: [139, 195, 74] },  // green
                                          { value: 1, color: [0, 188, 212] }       // cyan
                                      ];
                                      let lower = stops[0], upper = stops[stops.length - 1];
                                      for (let i = 0; i < stops.length - 1; i++) {
                                          if (percent >= stops[i].value && percent <= stops[i + 1].value) {
                                              lower = stops[i];
                                              upper = stops[i + 1];
                                              break;
                                          }
                                      }
                                      const range = upper.value - lower.value;
                                      const frac = range === 0 ? 0 : (percent - lower.value) / range;
                                      const r = lerp(lower.color[0], upper.color[0], frac);
                                      const g = lerp(lower.color[1], upper.color[1], frac);
                                      const b = lerp(lower.color[2], upper.color[2], frac);
                                      fill.style.background = `rgb(${r},${g},${b})`;
                                                        tdBar.appendChild(fill);
                                    tr.appendChild(tdBar);
                                    statTable.appendChild(tr);
                                });
                                detailPanel.appendChild(statTable);
                            }
                            if (pokemon.flavor_text) {
                                const flavorDiv = document.createElement('div');
                                flavorDiv.className = 'flavor-text';
                                flavorDiv.textContent = pokemon.flavor_text;
                                detailPanel.appendChild(flavorDiv);
                            }
                            // Toggle chips using utility function
                            const toggleRow = document.createElement('div');
                            toggleRow.className = 'toggle-row';
                            const isSeen = !!(progress[pokemon.region]?.seen?.has(pokemon.id));
                            const isCaught = !!(progress[pokemon.region]?.caught?.has(pokemon.id));
                            
                            const seenChip = Utils.createToggleChip('seen', isSeen, 'png/wide-lens.png');
                            seenChip.setAttribute('data-action', 'toggle-seen');
                            seenChip.setAttribute('data-pokemon-id', String(pokemon.id));
                            seenChip.setAttribute('data-region', String(pokemon.region));
                            const caughtChip = Utils.createToggleChip('caught', isCaught, 'png/pokeball.png');
                            caughtChip.setAttribute('data-action', 'toggle-caught');
                            caughtChip.setAttribute('data-pokemon-id', String(pokemon.id));
                            caughtChip.setAttribute('data-region', String(pokemon.region));
                                
                            toggleRow.appendChild(seenChip);
                            toggleRow.appendChild(caughtChip);
                            detailPanel.appendChild(toggleRow);
                            card.appendChild(detailPanel);
                            card.addEventListener('keydown', (event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    toggleCardSelection(card);
                                }
                            });
                            fragment.appendChild(card);
                            visibleCount++;
                        }
                        
                        // Batch append all cards at once for better performance
                        if (visibleCount > 0) {
                            grid.appendChild(fragment);
                            regionSection.appendChild(grid);
                            listDiv.appendChild(regionSection);
                        }
                    }
                    // After rendering, update the left navigation
                    renderSideNav();
                    // Activate lazy-loading on any newly created images
                    enableLazyImages();
            } catch (error) {
                console.error('Render failed:', error);
                const listDiv = document.getElementById('pokemon-list');
                if (listDiv) {
                    listDiv.innerHTML = '<div style="padding:20px;text-align:center;color:red;">Rendering error. Please refresh the page.</div>';
                }
            } finally {
                PerfMonitor.end('renderPokemon');
            }
                }
                // Render the left-side generation jump list
                function renderSideNav() {
                    const container = document.getElementById('side-nav-items');
                    if (!container) return;
                    container.innerHTML = '';
                    const gens = (Array.isArray(selectedRegions) && selectedRegions.length)
                        ? selectedRegions.slice()
                        : (Array.isArray(regions) ? regions.map(r => r.name) : []);

                    const quickViewsSection = document.createElement('div');
                    quickViewsSection.className = 'side-section';
                    const quickViewsTitle = document.createElement('div');
                    quickViewsTitle.className = 'side-section-title';
                    quickViewsTitle.textContent = 'Quick views';
                    quickViewsSection.appendChild(quickViewsTitle);

                    const quickViewButtons = [
                        { mode: 'all', label: 'All Pokémon' },
                        { mode: 'favorites', label: 'Favorites' },
                        { mode: 'seen', label: 'Seen' },
                        { mode: 'caught', label: 'Caught' }
                    ];
                    quickViewButtons.forEach(item => {
                        const btn = document.createElement('button');
                        btn.className = 'side-nav-item' + (browseMode === item.mode ? ' active' : '');
                        btn.textContent = item.label;
                        btn.onclick = () => setBrowseMode(item.mode);
                        quickViewsSection.appendChild(btn);
                    });
                    container.appendChild(quickViewsSection);

                    const generationsSection = document.createElement('div');
                    generationsSection.className = 'side-section';
                    const generationsTitle = document.createElement('div');
                    generationsTitle.className = 'side-section-title';
                    generationsTitle.textContent = 'Generations';
                    generationsSection.appendChild(generationsTitle);

                    if (!gens.length) {
                        const e = document.createElement('div');
                        e.className = 'side-empty';
                        e.textContent = 'No generations selected';
                        generationsSection.appendChild(e);
                        container.appendChild(generationsSection);
                        return;
                    }
                    gens.forEach(name => {
                        const btn = document.createElement('button');
                        btn.className = 'side-nav-item' + (selectedRegions.includes(name) ? ' active' : '');
                        btn.textContent = formatGeneration(name);
                        btn.title = `Jump to ${formatGeneration(name)}`;
                        btn.onclick = () => {
                            const el = document.getElementById(`section-${name}`);
                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        };
                        generationsSection.appendChild(btn);
                    });
                    container.appendChild(generationsSection);

                    const typesSection = document.createElement('div');
                    typesSection.className = 'side-section';
                    const typeTitle = document.createElement('div');
                    typeTitle.className = 'side-section-title';
                    typeTitle.textContent = 'Filter by type';
                    typesSection.appendChild(typeTitle);
                    const typesList = document.createElement('div');
                    typesList.id = 'types-list';
                    typesList.setAttribute('aria-label', 'Type filters');
                    typesSection.appendChild(typesList);
                    container.appendChild(typesSection);

                    try {
                        const allPokemonForTypes = Object.values(regionPokemon || {}).flat();
                        renderTypesPanel(allPokemonForTypes);
                    } catch (error) {
                        console.warn('Failed to render sidebar type filters', error);
                    }
                }
                // Updates the appearance of region tabs (selected/unselected)
                function getOrCreateRegionTabs() {
                    let tabsDiv = document.getElementById('region-tabs');
                    if (tabsDiv) return tabsDiv;
                    // Create a lightweight tabs container and insert it near the top toolbar
                    try {
                        tabsDiv = document.createElement('div');
                        tabsDiv.id = 'region-tabs';
                        tabsDiv.className = 'region-tabs';
                        const toolbar = document.querySelector('.top-toolbar');
                        if (toolbar && toolbar.parentNode) {
                            toolbar.parentNode.insertBefore(tabsDiv, toolbar.nextSibling);
                        } else if (document.querySelector('.page-with-right')) {
                            const pw = document.querySelector('.page-with-right');
                            pw.insertBefore(tabsDiv, pw.firstChild);
                        } else {
                            document.body.insertBefore(tabsDiv, document.body.firstChild);
                        }
                    } catch (e) {
                        console.warn('Failed to create region-tabs container', e);
                    }
                    return document.getElementById('region-tabs');
                }

                // Updates the appearance of region tabs (selected/unselected)
                function updateTabsUI() {
                            const tabsDiv = getOrCreateRegionTabs();
                            if (!tabsDiv) return;
                            const tabs = Array.from(tabsDiv.querySelectorAll('.region-tab'));
                    tabs.forEach(tab => {
                        const regionName = tab.getAttribute('data-region');
                        if (!regionName) return; // Skip action buttons
                        const isSelected = selectedRegions.includes(regionName);
                        tab.classList.toggle('selected', isSelected);
                        tab.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
                        // Keep them tabbable normally
                        tab.tabIndex = 0;
                    });
                    // Keep left nav in sync with current selection
                    if (typeof renderSideNav === 'function') renderSideNav();
                }

        // showAbilityModal(abilityName)
        // - Displays an accessible modal with a short description for `abilityName`.
        // - Lookup order: in-memory enriched cache (`abilityCache`) -> base map (`abilityDescriptionsLC`) ->
        //   persisted localStorage cache (`abilityDescCacheLS`) -> remote fetch from PokeAPI.
        // - Side-effects: may write to `abilityDescCacheLS` (persisted under `LS_ABILITY_CACHE_KEY`) and
        //   populate the in-memory `abilityCache` to avoid repeated fetches.
        // - Accessibility: sets role/aria-modal, focus-traps the dialog, and uses aria-live on the description
        //   to announce remote fetch results to screen readers.
        function showAbilityModal(abilityName) {
                const modal = document.getElementById('ability-modal');
                const title = document.getElementById('ability-modal-title');
                const desc = document.getElementById('ability-modal-desc');
                const content = document.getElementById('ability-modal-content');
            if (!modal || !title || !desc) return;
                // Human-friendly title
                title.textContent = titleCase(abilityName);
                // Accessibility: mark modal dialog and set role/labels
                modal.setAttribute('role', 'dialog');
                modal.setAttribute('aria-modal', 'true');
                title.id = title.id || 'ability-modal-title';
                content.setAttribute('aria-labelledby', title.id);
                // Save the element that had focus so we can restore focus on close
                const previouslyFocused = document.activeElement;
                // Ensure description area is focusable for announcement
                desc.tabIndex = 0;
            // Prefer cached/enriched description; fallback to base map
            const key = (abilityName || '').toString().trim().toLowerCase();
            const hasCache = !!abilityCache[key]?.description;
            const hasBase = Object.prototype.hasOwnProperty.call(abilityDescriptionsLC, key);
            const hasLS = !!abilityDescCacheLS[key];
            let text = abilityCache[key]?.description || abilityDescriptionsLC[key] || (hasLS ? abilityDescCacheLS[key] : 'No description available.');
            if (hasLS && !hasCache) {
                // Seed the in-memory cache from persisted localStorage
                abilityCache[key] = { description: abilityDescCacheLS[key] };
            }
            // If we have no local description, fetch from the API and persist result.
            if (!hasCache && !hasBase && !hasLS && key) {
                desc.innerHTML = '<span class="ability-loading">Fetching description…</span>';
                // add an aria-live region so screen readers announce updates when fetch completes
                desc.setAttribute('aria-live', 'polite');
                fetch(`https://pokeapi.co/api/v2/ability/${encodeURIComponent(key)}`)
                    .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
                    .then(data => {
                        // Prefer short_effect or effect from the English effect_entries; fallback to flavor_text_entries.
                        let newText = '';
                        try {
                            const entries = data && Array.isArray(data.effect_entries) ? data.effect_entries : [];
                            const en = entries.find(e => e && e.language && e.language.name === 'en');
                            if (en && en.short_effect) newText = String(en.short_effect).trim();
                            if (!newText && en && en.effect) newText = String(en.effect).trim();
                        } catch (e) { /* noop */ }
                        if (!newText) {
                            try {
                                const f = data && Array.isArray(data.flavor_text_entries) ? data.flavor_text_entries : [];
                                const enft = f.find(e => e && e.language && e.language.name === 'en');
                                if (enft && enft.flavor_text) newText = String(enft.flavor_text).replace(/\n|\f/g, ' ').trim();
                            } catch (e) { /* noop */ }
                        }
                        if (!newText) newText = 'No description available.';
                        // Update UI and caches
                        desc.textContent = newText;
                        abilityCache[key] = { description: newText };
                        abilityDescCacheLS[key] = newText;
                        saveAbilityDescCache(abilityDescCacheLS);
                    })
                    .catch(err => {
                        // Log fetch failures but keep UI usable
                        console.warn('[Abilities] Fetch failed for', key, err);
                        desc.textContent = 'No description available.';
                    });
            } else {
                // Immediately render existing description
                desc.textContent = text;
            }
            // (copy description feature removed)

            // Wire close handlers and focus trapping
            const closeBtn = document.getElementById('ability-modal-close');
            function closeModal() {
                modal.style.display = 'none';
                modal.classList.remove('open');
                document.removeEventListener('keydown', escHandler);
                document.removeEventListener('keydown', trapHandler);
                modal.onclick = null;
                if (previouslyFocused && previouslyFocused.focus) previouslyFocused.focus();
            }
            if (closeBtn) closeBtn.onclick = closeModal;
            modal.onclick = (e) => { if (e.target === modal) closeModal(); };
            // Esc-to-close
            const escHandler = (e) => { if (e.key === 'Escape') { closeModal(); } };
            document.addEventListener('keydown', escHandler);
            // Focus trap: keep tab inside modal
            const focusableSelector = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
            const trapHandler = (e) => {
                if (e.key !== 'Tab') return;
                const nodes = Array.from(content.querySelectorAll(focusableSelector)).filter(n => n.offsetParent !== null);
                if (!nodes.length) return;
                const first = nodes[0];
                const last = nodes[nodes.length - 1];
                if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            };
            document.addEventListener('keydown', trapHandler);
            // Show modal centered and move focus in
            modal.style.display = 'flex';
            modal.classList.add('open');
            modal.style.justifyContent = 'center';
            modal.style.alignItems = 'center';
            // Focus the description area for screen reader users
            setTimeout(() => { try { desc.focus(); } catch (e) {} }, 40);
        }

        // Build and render the types filter panel
        // Responsibilities:
        // - Inspect allPokemon to discover available type strings and counts
        // - Render a compact grid of type buttons into `#types-list`
        // - Do NOT retain per-button event handlers here; instead set data-* attributes
        //   so the global delegation handler can process clicks. This reduces
        //   per-card allocations and keeps event routing centralized.
        // Inputs:
        // - allPokemon: array of pokemon objects, each may have `types: string[]`
        // Side effects:
        // - Updates DOM under `#types-list`
        // - Persists the selected types set to localStorage via StorageManager APIs
        function renderTypesPanel(allPokemon) {
            // Build a frequency map of types -> count
            const typesSet = new Map();
            (allPokemon || []).forEach(p => {
                if (Array.isArray(p.types)) p.types.forEach(t => {
                    const key = (t || '').toString();
                    typesSet.set(key, (typesSet.get(key) || 0) + 1);
                });
            });

            // Sort type keys for predictable UI order
            const types = Array.from(typesSet.keys()).sort();
            const container = document.getElementById('types-list');
            if (!container) return; // defensive
            container.innerHTML = '';

            // Render each type as a button with data-type and data-action attributes.
            // The delegated click handler listens for data-action="toggle-type" and
            // will toggle membership in `selectedTypes` and persist via StorageManager.
            types.forEach(t => {
                const key = t.toLowerCase();
                const el = document.createElement('button');
                el.className = 'type-item';
                el.setAttribute('data-action', 'toggle-type');
                el.setAttribute('data-type', key);
                el.setAttribute('type', 'button');

                // add icon if available (non-blocking)
                const iconPath = typeIconMap[key];
                if (iconPath) {
                    const img = document.createElement('img');
                    img.className = 'type-icon';
                    img.src = iconPath;
                    img.alt = t;
                    img.onerror = () => { img.style.display = 'none'; };
                    el.appendChild(img);
                }

                const txt = document.createTextNode(t.charAt(0).toUpperCase() + t.slice(1));
                el.appendChild(txt);

                // Reflect selected state via class; click handling performed by delegation
                if (selectedTypes.has(key)) el.classList.add('selected');
                container.appendChild(el);
            });

            // Add a clear filter button that the delegated handler will recognize
            const clear = document.createElement('button');
            clear.className = 'type-item';
            clear.textContent = 'Show all';
            clear.style.fontWeight = '600';
            clear.setAttribute('data-action', 'clear-types');
            clear.setAttribute('type', 'button');
            container.appendChild(clear);
        }

    /**
     * LazyImageObserver
     * Singleton wrapper around IntersectionObserver used to lazily set `img.src` from `data-src`.
     * This avoids creating many observers across renders and centralizes error handling.
     * Usage: LazyImageObserver.observe(imgElement)
     */
    // Shared IntersectionObserver for lazy images to avoid recreating observers on every render
    const LazyImageObserver = (function(){
            if (!('IntersectionObserver' in window)) return null;
            let observer = null;
            function getObserver() {
                if (observer) return observer;
                observer = new IntersectionObserver((entries) => {
                    entries.forEach(entry => {
                        if (!entry.isIntersecting) return;
                        const img = entry.target;
                        const src = img.dataset?.src;
                        if (src) {
                            img.src = src;
                            delete img.dataset.src;
                            img.addEventListener('error', () => {
                                if (!img.dataset._errorHandled) {
                                    img.dataset._errorHandled = '1';
                                    img.src = FALLBACK_IMG;
                                }
                            }, { once: true });
                        }
                        observer.unobserve(img);
                    });
                }, { root: null, rootMargin: '100px', threshold: 0.01 });
                return observer;
            }
            return {
                observe(img) {
                    const obs = getObserver();
                    if (!obs) {
                        if (img.dataset && img.dataset.src) {
                            img.src = img.dataset.src;
                            delete img.dataset.src;
                        }
                        return;
                    }
                    obs.observe(img);
                }
            };
        })();

        // lazy-loading helper: observes images with data-src using the shared observer
        /**
         * enableLazyImages()
         * Find all images with class `lazy-img` and attach lazy loading behavior.
         * Uses LazyImageObserver when available, otherwise falls back to immediately
         * setting `img.src` from `data-src`.
         * Call this after new images are added to the DOM (e.g., after renderPokemon()).
         */
        function enableLazyImages() {
            const imgs = Array.from(document.querySelectorAll('img.lazy-img'));
            if (!imgs.length) return;
            imgs.forEach(i => LazyImageObserver ? LazyImageObserver.observe(i) : (function(){ if (i.dataset && i.dataset.src) { i.src = i.dataset.src; delete i.dataset.src; } })());
        }

        // Error boundary wrapper for main operations
        const ErrorHandler = {
            wrap(fn, fallback = () => {}) {
                return (...args) => {
                    try {
                        return fn(...args);
                    } catch (error) {
                        console.error('Operation failed:', error);
                        return fallback(...args);
                    }
                };
            },
            
            async wrapAsync(fn, fallback = async () => {}) {
                return async (...args) => {
                    try {
                        return await fn(...args);
                    } catch (error) {
                        console.error('Async operation failed:', error);
                        return await fallback(...args);
                    }
                };
            }
        };

        // Wrap critical functions with error handling
        const renderPokemonSafe = ErrorHandler.wrap(renderPokemon, () => {
            console.warn('Render failed, attempting recovery...');
            const listDiv = document.getElementById('pokemon-list');
            if (listDiv) {
                listDiv.innerHTML = '<div style="padding:20px;text-align:center;color:red;">Rendering error. Please refresh the page.</div>';
            }
        });

        // Toggle region selection (show/hide specific generation)
        function toggleRegion(regionName) {
            regionName = canonicalizeRegionName(regionName);
            if (!regionName || !Array.isArray(selectedRegions)) return;
            
            const idx = selectedRegions.indexOf(regionName);
            if (idx >= 0) {
                selectedRegions.splice(idx, 1);
            } else {
                selectedRegions.push(regionName);
            }
            
            // Dedupe and preserve known region order
            const order = regions.map(r => r.name);
            selectedRegions = order.filter(name => new Set(selectedRegions).has(name));
            StorageManager.saveSelectedRegions(selectedRegions);
            updateTabsUI();
            renderPokemonSafe();
        }

        // Single-select a region (Alt+Click): only show this generation
        function singleSelectRegion(regionName) {
            regionName = canonicalizeRegionName(regionName);
            if (!regionName) return;
            selectedRegions = [regionName];
            StorageManager.saveSelectedRegions(selectedRegions);
            updateTabsUI();
            renderPokemonSafe();
        }

        // Select all generations
        function selectAllRegions() {
            selectedRegions = regions.map(r => r.name);
            StorageManager.saveSelectedRegions(selectedRegions);
            updateTabsUI();
            renderPokemonSafe();
        }

        // Clear all generations
        function clearAllRegions() {
            selectedRegions = [];
            StorageManager.saveSelectedRegions(selectedRegions);
            updateTabsUI();
            renderPokemon();
        }
