// Persistence layer: localStorage caching, saved seen/caught/favorites/region/type
// state, and the DOM updates that follow a seen/caught toggle.

    // Performance optimization: Cache localStorage operations
    // LocalStorage can be synchronous and slow when used heavily during rendering.
    // LocalStorageCache provides a small Map-backed cache so repeated reads within
    // a single page load hit memory instead of invoking the blocking localStorage API.
    // This cache is intentionally simple; callers should still write through to
    // localStorage via LocalStorageCache.set so other tabs can observe changes.
    const LocalStorageCache = {
            cache: new Map(),
            get(key) {
                if (this.cache.has(key)) return this.cache.get(key);
                try {
                    const value = localStorage.getItem(key);
                    this.cache.set(key, value);
                    return value;
                } catch { return null; }
            },
            // Returns true if the value was actually persisted to localStorage.
            // The in-memory cache is only updated on success, so a failed write
            // (e.g. quota exceeded) doesn't leave callers believing it saved.
            set(key, value) {
                try {
                    localStorage.setItem(key, value);
                    this.cache.set(key, value);
                    return true;
                } catch {
                    return false;
                }
            },
            // Forgets the in-memory copy only — this does NOT delete the key from
            // localStorage. Both current callers (StorageManager.invalidateProgress
            // and the cross-tab `storage` handler) use this to mean "my cached copy
            // is stale, re-read on next get()", not "delete this data".
            remove(key) {
                this.cache.delete(key);
            }
        };

    // Favorites: persisted set of pokemon ids (numbers)
    // Key: LS_FAVORITES_KEY stored as JSON array of ids. We keep an in-memory Set
    // for efficient lookup when rendering and filtering.
    const LS_FAVORITES_KEY = 'pokemonFavoritesV1';
    let favorites = new Set();

    // Load favorites from localStorage into an in-memory Set. This function tolerates
    // invalid or missing data by falling back to an empty set.
    function loadFavorites() { 
        try { 
            const j = JSON.parse(LocalStorageCache.get(LS_FAVORITES_KEY) || '[]'); 
            if (Array.isArray(j)) { 
                favorites = new Set(j.map(n=>Number(n)).filter(x=>Number.isFinite(x))); 
            } 
        } catch(e){ favorites = new Set(); } 
    }

    // Persist favorites into localStorage via LocalStorageCache. Using LocalStorageCache
    // keeps the in-memory cache consistent and reduces repeated blocking localStorage calls.
    function saveFavorites() { 
        try { 
            LocalStorageCache.set(LS_FAVORITES_KEY, JSON.stringify(Array.from(favorites))); 
        } catch(e){} 
    }
    loadFavorites();

    /**
     * StorageManager
     * Centralized localStorage helper that caches parsed progress to avoid repeated JSON.parse
     * on hot render paths. All reads/writes related to persisted UI state should go through
     * this object when possible.
     *
     * Keys used:
     * - 'pokemonProgress' => JSON object mapping region -> { seen: [], caught: [] }
     * - 'selectedRegions'  => JSON array of region keys
     * - 'selectedTypesV1'  => JSON array of lower-case type names
     */
    // --- Progress and Region Management with Cached localStorage ---
    const StorageManager = {
            // Progress operations (cache parsed progress to avoid repeated JSON.parse on hot paths)
            _progressCache: null,
            invalidateProgress() {
                this._progressCache = null;
                LocalStorageCache.remove('pokemonProgress');
            },
            // Progress is cached in memory as { seen: Set<number>, caught: Set<number> }
            // per region for O(1) membership checks on the hot render/filter path.
            // The on-disk format stays plain arrays for backwards/export compatibility.
            getProgress() {
                try {
                    if (this._progressCache !== null) return this._progressCache;
                    const raw = LocalStorageCache.get('pokemonProgress');
                    const parsed = raw ? JSON.parse(raw) : {};
                    const progress = {};
                    for (const region in parsed) {
                        progress[region] = {
                            seen: new Set(Array.isArray(parsed[region]?.seen) ? parsed[region].seen : []),
                            caught: new Set(Array.isArray(parsed[region]?.caught) ? parsed[region].caught : [])
                        };
                    }
                    this._progressCache = progress;
                    return progress;
                } catch {
                    this._progressCache = {};
                    return this._progressCache;
                }
            },

            // Persists `progress` (Set-based, as returned by getProgress()) to localStorage
            // as plain arrays. Only updates the in-memory cache once the write actually
            // succeeds, so a failed save (e.g. quota exceeded) doesn't get treated as saved.
            saveProgress(progress) {
                let serialized;
                try {
                    serialized = JSON.stringify(progress, (key, value) => value instanceof Set ? Array.from(value) : value);
                } catch (e) {
                    console.warn('Failed to serialize progress', e);
                    alert('Failed to save your progress: the data could not be serialized.');
                    return false;
                }
                if (!LocalStorageCache.set('pokemonProgress', serialized)) {
                    console.warn('Failed to persist pokemonProgress to localStorage');
                    alert('Failed to save your progress (storage may be full or unavailable). Your latest change may be lost on reload.');
                    return false;
                }
                this._progressCache = progress;
                return true;
            },
            
            // Region selection operations
            saveSelectedRegions(regions) {
                LocalStorageCache.set('selectedRegions', JSON.stringify(regions));
            },
            
            getSelectedRegions() {
                try {
                    return JSON.parse(LocalStorageCache.get('selectedRegions') || '[]');
                } catch {
                    return [];
                }
            },
            
            // Type selection operations  
            saveSelectedTypes(types) {
                LocalStorageCache.set('selectedTypesV1', JSON.stringify(Array.from(types)));
            },
            
            getSelectedTypes() {
                try {
                    const st = JSON.parse(LocalStorageCache.get('selectedTypesV1') || '[]');
                    return Array.isArray(st) ? new Set(st.filter(s => !!s).map(s => s.toString().toLowerCase())) : new Set();
                } catch {
                    return new Set();
                }
            }
        };

        // Cross-tab synchronization: if localStorage changes elsewhere, invalidate caches and re-render
        window.addEventListener('storage', (e) => {
            try {
                if (!e) return;
                // Clear any cached copies that may be stale
                if (e.key === 'pokemonProgress' || e.key === 'selectedTypesV1' || e.key === 'selectedRegions' || e.key === 'pokemonFavoritesV1') {
                    try { LocalStorageCache.remove(e.key); } catch {}
                    if (e.key === 'pokemonProgress') StorageManager.invalidateProgress();
                    // Defer re-render slightly to allow many storage events to settle
                    setTimeout(() => { try { renderPokemonSafe(); } catch(e){ } }, 80);
                }
            } catch (err) { /* noop */ }
        });

        /**
         * getProgress / saveProgress
         * Small wrappers that delegate to StorageManager for clearer call sites.
         */
        // --- Seen/Caught progress helpers ---
        function getProgress() {
            return StorageManager.getProgress();
        }
        function saveProgress(progress) {
            StorageManager.saveProgress(progress);
        }
        function ensureRegionProgress(progress, regionName) {
            if (!progress[regionName]) progress[regionName] = { seen: new Set(), caught: new Set() };
            if (!(progress[regionName].seen instanceof Set)) progress[regionName].seen = new Set(progress[regionName].seen || []);
            if (!(progress[regionName].caught instanceof Set)) progress[regionName].caught = new Set(progress[regionName].caught || []);
            return progress[regionName];
        }
    // Removes `card` from the DOM, and if that leaves its region section with no cards
    // left, removes the whole section too — renderPokemon() never renders a region
    // section with zero matching Pokémon, so a single-card update must match that.
    function removeCardIfEmptyRegion(card) {
        const regionSection = card.closest('.region-section');
        card.remove();
        if (regionSection && !regionSection.querySelector('.pokemon-card')) {
            regionSection.remove();
        }
    }

    // Applies `current`/`total` to an already-rendered progress bar's fill width and
    // label without touching the icon, so callers avoid rebuilding markup for a
    // single-number change.
    function setProgressBarValues(bar, current, total) {
        if (!bar) return;
        const pct = total > 0 ? Math.round(current / total * 100) : 0;
        const fill = bar.querySelector('.progress-fill');
        const text = bar.querySelector('.progress-text');
        if (fill) fill.style.width = pct + '%';
        if (text) text.textContent = `${current}/${total}`;
    }

    function updateRegionProgressBar(regionName, progress) {
        const regionSection = document.getElementById(`section-${regionName}`);
        if (!regionSection) return;
        const total = regionPokemon[regionName] ? regionPokemon[regionName].length : 0;
        const seen = progress[regionName]?.seen?.size || 0;
        const caught = progress[regionName]?.caught?.size || 0;
        const bars = regionSection.querySelectorAll('.progress-container .progress-bar');
        setProgressBarValues(bars[0], seen, total);
        setProgressBarValues(bars[1], caught, total);
    }

    // Updates a single card's seen/caught badges and toggle chips in place, refreshes its
    // region's progress bar, and removes the card from view if it no longer belongs in
    // the current browse mode (e.g. un-marking "seen" while viewing the Seen list). This
    // is what lets markSeenCaught() avoid a full renderPokemon() rebuild for what's
    // otherwise a single boolean flip.
    function applySeenCaughtToCard(regionName, id) {
        const card = document.querySelector(`[data-card-key="${regionName}:${id}"]`);
        if (!card) return;
        const progress = getProgress();
        const isSeen = !!(progress[regionName]?.seen?.has(id));
        const isCaught = !!(progress[regionName]?.caught?.has(id));

        const badgesContainer = card.querySelector('.status-badges');
        if (badgesContainer) {
            badgesContainer.replaceChildren();
            if (isSeen) badgesContainer.appendChild(Utils.createStatusBadge('seen', 'Seen', true));
            if (isCaught) badgesContainer.appendChild(Utils.createStatusBadge('caught', 'Caught', true));
        }
        const seenChip = card.querySelector('.toggle-chip.seen');
        if (seenChip) seenChip.classList.toggle('active', isSeen);
        const caughtChip = card.querySelector('.toggle-chip.caught');
        if (caughtChip) caughtChip.classList.toggle('active', isCaught);

        updateRegionProgressBar(regionName, progress);

        const mode = getCurrentBrowseMode();
        if (!matchesBrowseMode(mode, { id, region: regionName }, progress)) {
            removeCardIfEmptyRegion(card);
        }
    }

    /**
     * markSeenCaught(regionName, pokemonId, isCaught)
     * Toggle seen/caught state for a Pokémon in a given region. This function is the
     * canonical way to mutate progress; it ensures consistency (caught => seen) and
     * persists via StorageManager.saveProgress(). It updates that Pokémon's card (and,
     * if needed, its region's progress bar) directly rather than re-rendering the list.
     *
     * Parameters:
     * - regionName: string (region/generation identifier)
     * - pokemonId: number|string (will be coerced to Number)
     * - isCaught: boolean (true toggles caught, false toggles seen)
     */
    // Toggle seen/caught for a Pokémon; caught implies seen
    function markSeenCaught(regionName, pokemonId, isCaught) {
            regionName = canonicalizeRegionName(regionName);
            const id = Number(pokemonId);
            if (!regionName || !Number.isFinite(id)) return;
            const progress = getProgress();
            const entry = ensureRegionProgress(progress, regionName);
            if (isCaught) {
                // Toggle caught
                if (entry.caught.has(id)) {
                    entry.caught.delete(id);
                    // Keep seen as-is when uncatching
                } else {
                    entry.caught.add(id);
                    entry.seen.add(id); // caught implies seen
                }
            } else {
                // Toggle seen; removing seen also removes caught for consistency
                if (entry.seen.has(id)) {
                    entry.seen.delete(id);
                    entry.caught.delete(id);
                } else {
                    entry.seen.add(id);
                }
            }
            saveProgress(progress);
            applySeenCaughtToCard(regionName, id);
        }
