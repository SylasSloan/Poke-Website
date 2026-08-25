const params = new URLSearchParams(window.location.search);
const pokemonId = params.get('id');
const statusEl = document.getElementById('status');
const detailCard = document.getElementById('detail-card');

// Small inline fallback image (data URI), matching js/render.js's FALLBACK_IMG,
// used when a sprite URL 404s (common for older generations / rarer forms).
const FALLBACK_IMG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='%23f6f8fa'/><circle cx='32' cy='32' r='28' fill='%23ef5350'/><rect x='0' y='30' width='64' height='4' fill='%23fff'/></svg>";

function withFallbackImg(img) {
    img.onerror = () => { img.onerror = null; img.src = FALLBACK_IMG; };
    return img;
}

function typeClass(type) {
    return 'type-' + String(type || '').toLowerCase();
}

function renderTypes(types) {
    const container = document.getElementById('types');
    container.innerHTML = '';
    (types || []).forEach(type => {
        const pill = document.createElement('span');
        pill.className = 'type-pill ' + typeClass(type);
        pill.textContent = titleCase(type);
        container.appendChild(pill);
    });
}

function renderStats(stats) {
    const container = document.getElementById('stats');
    container.innerHTML = '';
    const rows = [
        ['HP', stats?.hp],
        ['Attack', stats?.attack],
        ['Defense', stats?.defense],
        ['Sp. Atk', stats?.['special-attack']],
        ['Sp. Def', stats?.['special-defense']],
        ['Speed', stats?.speed]
    ];
    const MAX_STAT = 255; // standard max base stat across all Pokémon
    rows.forEach(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'stat-row';

        const labels = document.createElement('div');
        labels.className = 'stat-row-labels';
        const strong = document.createElement('strong');
        strong.textContent = label;
        const span = document.createElement('span');
        span.textContent = value ?? '—';
        labels.appendChild(strong);
        labels.appendChild(span);

        const track = document.createElement('div');
        track.className = 'stat-track';
        const fill = document.createElement('div');
        fill.className = 'stat-fill';
        const pct = Number.isFinite(value) ? Math.max(0, Math.min(100, (value / MAX_STAT) * 100)) : 0;
        fill.style.width = pct + '%';
        track.appendChild(fill);

        row.appendChild(labels);
        row.appendChild(track);
        container.appendChild(row);
    });
}

function renderList(containerId, items) {
    const container = document.getElementById(containerId);
    if (!items || !items.length) {
        container.innerHTML = '<div class="muted">No data available yet.</div>';
        return;
    }
    const list = document.createElement('ul');
    items.forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
    });
    container.innerHTML = '';
    container.appendChild(list);
}

// areas: [{ area: string, chips: string[] }]
function renderEncounters(containerId, areas) {
    const container = document.getElementById(containerId);
    if (!areas || !areas.length) {
        container.innerHTML = '<div class="muted">No data available yet.</div>';
        return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'encounter-list';
    areas.forEach(({ area, chips }) => {
        const block = document.createElement('div');
        const heading = document.createElement('div');
        heading.className = 'encounter-area';
        heading.textContent = area;
        block.appendChild(heading);
        const chipRow = document.createElement('div');
        chipRow.className = 'encounter-chips';
        chips.forEach(text => {
            const chip = document.createElement('span');
            chip.className = 'encounter-chip';
            chip.textContent = text;
            chipRow.appendChild(chip);
        });
        block.appendChild(chipRow);
        wrap.appendChild(block);
    });
    container.innerHTML = '';
    container.appendChild(wrap);
}

// Renders a row of generation tab buttons into `tabsContainer`, wires each
// to call `onSelect(genLabel)` and mark itself active, and immediately
// selects the most recent generation. Shared by the moves and encounters
// sections below, which need identical by-generation tab UI.
function renderGenTabs(tabsContainer, genEntries, onSelect) {
    tabsContainer.innerHTML = '';
    function selectGeneration(genLabel) {
        onSelect(genLabel);
        tabsContainer.querySelectorAll('.gen-tab').forEach(b => b.classList.toggle('active', b.dataset.gen === genLabel));
    }
    genEntries.forEach(genEntry => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gen-tab';
        btn.dataset.gen = genEntry.label;
        btn.textContent = genEntry.label;
        btn.addEventListener('click', () => selectGeneration(genEntry.label));
        tabsContainer.appendChild(btn);
    });
    if (genEntries.length) selectGeneration(genEntries[genEntries.length - 1].label);
}

// Renders the TM/HM/Tutor/Egg move lists for one generation as labeled
// sub-groups within the "Other moves" panel (a group is omitted entirely
// when empty, e.g. no HMs from Generation VII onward).
function renderOtherMoves(genEntry) {
    const container = document.getElementById('machine-moves');
    container.innerHTML = '';
    const groups = [
        ['TM Moves', genEntry.tm],
        ['HM Moves', genEntry.hm],
        ['Move Tutor', genEntry.tutor],
        ['Egg Moves', genEntry.egg]
    ].filter(([, moves]) => moves && moves.length);
    if (!groups.length) {
        container.innerHTML = '<div class="muted">No data available yet.</div>';
        return;
    }
    groups.forEach(([label, moves]) => {
        const wrap = document.createElement('div');
        wrap.className = 'move-subgroup';
        const h = document.createElement('h4');
        h.textContent = label;
        wrap.appendChild(h);
        const list = document.createElement('ul');
        moves.forEach(name => {
            const li = document.createElement('li');
            li.textContent = name;
            list.appendChild(li);
        });
        wrap.appendChild(list);
        container.appendChild(wrap);
    });
}

// Renders the generation tab bar and wires it to swap the level-up/TM/HM/
// tutor/egg move lists shown below. `genData` comes straight from
// python/enrich_moves_and_encounters.py's `moves_by_generation` field --
// no PokeAPI fetch or per-generation grouping happens client-side anymore.
function renderMovesByGeneration(genData) {
    const tabsContainer = document.getElementById('move-gen-tabs');
    if (!genData || !genData.length) {
        tabsContainer.innerHTML = '';
        renderList('level-up-moves', []);
        document.getElementById('machine-moves').innerHTML = '<div class="muted">No data available yet.</div>';
        return;
    }
    function showGeneration(genLabel) {
        const genEntry = genData.find(g => g.label === genLabel) || genData[genData.length - 1];
        renderList('level-up-moves', (genEntry.level_up || []).map(m => `${m.label}: ${m.name}`));
        renderOtherMoves(genEntry);
    }
    renderGenTabs(tabsContainer, genData, showGeneration);
}

// Renders the generation tab bar for wild encounters and wires it to swap
// the area/chip list shown below. `genData` comes straight from
// python/enrich_moves_and_encounters.py's `encounters_by_generation` field.
function renderEncountersByGeneration(genData) {
    const tabsContainer = document.getElementById('encounter-gen-tabs');
    if (!genData || !genData.length) {
        tabsContainer.innerHTML = '';
        renderEncounters('encounters', []);
        return;
    }
    function showGeneration(genLabel) {
        const genEntry = genData.find(g => g.label === genLabel) || genData[genData.length - 1];
        renderEncounters('encounters', genEntry.areas || []);
    }
    renderGenTabs(tabsContainer, genData, showGeneration);
}

// Caches the fetched index text in sessionStorage so refreshing this page
// (or navigating back to it) within the same tab doesn't re-download the
// lean grid index every time the selectedPokemon handoff is missing. This
// index only carries the fields needed for the pager and evolution-family
// lookup below -- per-Pokémon detail (moves, encounters, Pokédex entries,
// sprite gallery, etc.) comes from loadPokemonDetail() instead.
async function loadPokemonData() {
    let cached = null;
    try { cached = sessionStorage.getItem('pokemonIndexCache'); } catch (e) { /* storage unavailable; ignore */ }
    if (cached) {
        try { return JSON.parse(cached); } catch (e) { /* corrupt cache; fall through to re-fetch */ }
    }
    try {
        const response = await fetch('./json/pokemon-index.json');
        if (!response.ok) throw new Error('Unable to load local data');
        const text = await response.text();
        try { sessionStorage.setItem('pokemonIndexCache', text); } catch (e) { /* storage full/unavailable; ignore */ }
        return JSON.parse(text);
    } catch (error) {
        console.error(error);
        return [];
    }
}

// Fetches the per-Pokémon detail file (Pokédex/training/breeding stats,
// per-game entries, sprite gallery, other-language names, and
// moves/encounters by generation) generated by
// python/split_pokemon_data.py. Returns {} on failure so callers can merge
// unconditionally and simply show "No data available yet" for missing
// sections.
async function loadPokemonDetail(id) {
    try {
        const response = await fetch(`./json/details/${id}.json`);
        if (!response.ok) throw new Error(`Unable to load detail data for id ${id}`);
        return await response.json();
    } catch (error) {
        console.error(error);
        return {};
    }
}

// --- Pokédex data / Training / Breeding info boxes ---

function formatHeight(decimetres) {
    if (decimetres == null) return '—';
    const metres = decimetres / 10;
    const totalInches = Math.round(metres * 39.3701);
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;
    return `${metres.toFixed(1)} m (${feet}'${String(inches).padStart(2, '0')}")`;
}

function formatWeight(hectograms) {
    if (hectograms == null) return '—';
    const kg = hectograms / 10;
    const lbs = kg * 2.20462;
    return `${kg.toFixed(1)} kg (${lbs.toFixed(1)} lbs)`;
}

function formatGenderRatio(rate) {
    if (rate == null) return '—';
    if (rate === -1) return 'Genderless';
    const femalePct = (rate / 8) * 100;
    const malePct = 100 - femalePct;
    return `${malePct}% male, ${femalePct}% female`;
}

function formatEvYield(evYield) {
    if (!evYield || !evYield.length) return 'None';
    return evYield.map(e => `${e.value} ${titleCase(e.stat)}`).join(', ');
}

function formatAbilityNames(pokemon) {
    const details = Array.isArray(pokemon.ability_details) && pokemon.ability_details.length
        ? pokemon.ability_details
        : (pokemon.abilities || []).map(name => ({ name, is_hidden: false }));
    if (!details.length) return '—';
    return details.map(a => titleCase(a?.name || '') + (a?.is_hidden ? ' (Hidden)' : '')).join(', ');
}

function addInfoRow(box, label, value) {
    const row = document.createElement('div');
    row.className = 'info-row';
    const l = document.createElement('span');
    l.textContent = label;
    const v = document.createElement('span');
    v.textContent = value ?? '—';
    row.appendChild(l);
    row.appendChild(v);
    box.appendChild(row);
}

function makeInfoBox(title) {
    const box = document.createElement('div');
    box.className = 'info-box';
    const titleEl = document.createElement('div');
    titleEl.className = 'info-box-title';
    titleEl.textContent = title;
    box.appendChild(titleEl);
    return box;
}

function renderInfoBoxes(pokemon) {
    const container = document.getElementById('info-boxes');
    container.innerHTML = '';

    const dexBox = makeInfoBox('Pokédex data');
    addInfoRow(dexBox, 'National No.', `#${String(pokemon.id).padStart(3, '0')}`);
    addInfoRow(dexBox, 'Type', (pokemon.types || []).map(titleCase).join(' / ') || '—');
    addInfoRow(dexBox, 'Species', pokemon.genus || '—');
    addInfoRow(dexBox, 'Height', formatHeight(pokemon.height));
    addInfoRow(dexBox, 'Weight', formatWeight(pokemon.weight));
    addInfoRow(dexBox, 'Abilities', formatAbilityNames(pokemon));

    const trainingBox = makeInfoBox('Training');
    addInfoRow(trainingBox, 'EV yield', formatEvYield(pokemon.ev_yield));
    addInfoRow(trainingBox, 'Catch rate', pokemon.capture_rate ?? '—');
    addInfoRow(trainingBox, 'Base Friendship', pokemon.base_happiness ?? '—');
    addInfoRow(trainingBox, 'Base Exp.', pokemon.base_experience ?? '—');
    addInfoRow(trainingBox, 'Growth Rate', pokemon.growth_rate ? titleCase(pokemon.growth_rate) : '—');

    const breedingBox = makeInfoBox('Breeding');
    addInfoRow(breedingBox, 'Egg Groups', (pokemon.egg_groups || []).map(titleCase).join(', ') || '—');
    addInfoRow(breedingBox, 'Gender ratio', formatGenderRatio(pokemon.gender_rate));
    addInfoRow(breedingBox, 'Egg Cycles', pokemon.hatch_counter ?? '—');

    container.appendChild(dexBox);
    container.appendChild(trainingBox);
    container.appendChild(breedingBox);
}

// --- Type defenses chart ---
// Fixed game knowledge (Gen 6+ type chart), not per-Pokémon data.
const TYPE_CHART = {
    normal:   { weak: ['fighting'], resist: [], immune: ['ghost'] },
    fire:     { weak: ['water', 'ground', 'rock'], resist: ['fire', 'grass', 'ice', 'bug', 'steel', 'fairy'], immune: [] },
    water:    { weak: ['electric', 'grass'], resist: ['fire', 'water', 'ice', 'steel'], immune: [] },
    electric: { weak: ['ground'], resist: ['electric', 'flying', 'steel'], immune: [] },
    grass:    { weak: ['fire', 'ice', 'poison', 'flying', 'bug'], resist: ['water', 'electric', 'grass', 'ground'], immune: [] },
    ice:      { weak: ['fire', 'fighting', 'rock', 'steel'], resist: ['ice'], immune: [] },
    fighting: { weak: ['flying', 'psychic', 'fairy'], resist: ['bug', 'rock', 'dark'], immune: [] },
    poison:   { weak: ['ground', 'psychic'], resist: ['grass', 'fighting', 'poison', 'bug', 'fairy'], immune: [] },
    ground:   { weak: ['water', 'grass', 'ice'], resist: ['poison', 'rock'], immune: ['electric'] },
    flying:   { weak: ['electric', 'ice', 'rock'], resist: ['grass', 'fighting', 'bug'], immune: ['ground'] },
    psychic:  { weak: ['bug', 'ghost', 'dark'], resist: ['fighting', 'psychic'], immune: [] },
    bug:      { weak: ['fire', 'flying', 'rock'], resist: ['grass', 'fighting', 'ground'], immune: [] },
    rock:     { weak: ['water', 'grass', 'fighting', 'ground', 'steel'], resist: ['normal', 'fire', 'poison', 'flying'], immune: [] },
    ghost:    { weak: ['ghost', 'dark'], resist: ['poison', 'bug'], immune: ['normal', 'fighting'] },
    dragon:   { weak: ['ice', 'dragon', 'fairy'], resist: ['fire', 'water', 'electric', 'grass'], immune: [] },
    dark:     { weak: ['fighting', 'bug', 'fairy'], resist: ['ghost', 'dark'], immune: ['psychic'] },
    steel:    { weak: ['fire', 'fighting', 'ground'], resist: ['normal', 'grass', 'ice', 'flying', 'psychic', 'bug', 'rock', 'dragon', 'steel', 'fairy'], immune: ['poison'] },
    fairy:    { weak: ['poison', 'steel'], resist: ['fighting', 'bug', 'dark'], immune: ['dragon'] }
};
const ALL_TYPES = Object.keys(TYPE_CHART);

function computeTypeDefenses(types) {
    const result = {};
    ALL_TYPES.forEach(atk => { result[atk] = 1; });
    (types || []).forEach(t => {
        const chart = TYPE_CHART[String(t).toLowerCase()];
        if (!chart) return;
        chart.weak.forEach(atk => { result[atk] *= 2; });
        chart.resist.forEach(atk => { result[atk] *= 0.5; });
        chart.immune.forEach(atk => { result[atk] = 0; });
    });
    return result;
}

function formatMultiplier(mult) {
    if (mult === 0) return '0×';
    if (mult === 0.25) return '¼×';
    if (mult === 0.5) return '½×';
    if (mult === 1) return '1×';
    if (mult === 2) return '2×';
    if (mult === 4) return '4×';
    return `${mult}×`;
}

function multiplierClass(mult) {
    if (mult === 0) return 'immune';
    if (mult >= 2) return mult >= 4 ? 'super-weak' : 'weak';
    if (mult < 1) return 'resist';
    return '';
}

function renderTypeDefenses(pokemon) {
    const container = document.getElementById('type-defenses');
    const defenses = computeTypeDefenses(pokemon.types);
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'type-chart-grid';
    ALL_TYPES.forEach(atk => {
        const mult = defenses[atk];
        const cell = document.createElement('div');
        cell.className = 'type-chart-cell ' + multiplierClass(mult);
        const pill = document.createElement('span');
        pill.className = 'type-pill ' + typeClass(atk);
        pill.textContent = titleCase(atk);
        const multEl = document.createElement('span');
        multEl.className = 'type-chart-mult';
        multEl.textContent = formatMultiplier(mult);
        cell.appendChild(pill);
        cell.appendChild(multEl);
        grid.appendChild(cell);
    });
    container.appendChild(grid);
}

// --- Evolution chart ---

function formatEvolutionTrigger(trigger) {
    if (!trigger) return '';
    const parts = [];
    switch (trigger.type) {
        case 'level-up':
            if (trigger.min_level) parts.push(`Level ${trigger.min_level}`);
            if (trigger.min_happiness) parts.push('High Friendship');
            if (trigger.min_beauty) parts.push('High Beauty');
            if (trigger.min_affection) parts.push('High Affection');
            if (trigger.known_move) parts.push(`Knows ${titleCase(trigger.known_move)}`);
            if (trigger.known_move_type) parts.push(`Knows a ${titleCase(trigger.known_move_type)} move`);
            if (trigger.time_of_day) parts.push(titleCase(trigger.time_of_day));
            if (trigger.location) parts.push(`At ${titleCase(trigger.location)}`);
            if (trigger.held_item) parts.push(`Holding ${titleCase(trigger.held_item)}`);
            if (!parts.length) parts.push('Level up');
            break;
        case 'trade':
            parts.push(trigger.trade_species ? `Trade for ${titleCase(trigger.trade_species)}` : 'Trade');
            if (trigger.held_item) parts.push(`holding ${titleCase(trigger.held_item)}`);
            break;
        case 'use-item':
            parts.push(trigger.item ? `Use ${titleCase(trigger.item)}` : 'Use item');
            break;
        case 'shed':
            parts.push('Empty party slot + Poké Ball');
            break;
        default:
            parts.push(titleCase(trigger.type || 'Special condition'));
    }
    if (trigger.gender === 1) parts.push('(Female)');
    if (trigger.gender === 2) parts.push('(Male)');
    return parts.join(', ');
}

// Walks `evolves_from` back to the root, then forward by scanning the full
// dataset for anything whose evolves_from points at the current stage --
// this naturally reconstructs branching families (e.g. Eevee) without any
// dedicated chain data having to be baked into the dataset.
function buildEvolutionFamily(pokemon, allPokemon) {
    const byName = new Map(allPokemon.map(p => [p.name, p]));
    let root = pokemon;
    const seenRoots = new Set([root.name]);
    while (root.evolves_from && byName.has(root.evolves_from) && !seenRoots.has(root.evolves_from)) {
        root = byName.get(root.evolves_from);
        seenRoots.add(root.name);
    }

    const stages = [];
    let currentLevel = [root];
    const visited = new Set([root.name]);
    while (currentLevel.length) {
        stages.push(currentLevel);
        const next = [];
        currentLevel.forEach(node => {
            allPokemon.filter(p => p.evolves_from === node.name).forEach(child => {
                if (!visited.has(child.name)) { visited.add(child.name); next.push(child); }
            });
        });
        currentLevel = next;
    }
    return stages;
}

function renderEvolutionChart(pokemon, allPokemon) {
    const container = document.getElementById('evolution-chart');
    container.innerHTML = '';
    const stages = buildEvolutionFamily(pokemon, allPokemon);
    if (stages.length <= 1 && stages[0]?.length <= 1) {
        container.innerHTML = '<div class="muted">This Pokémon does not evolve.</div>';
        return;
    }
    const chart = document.createElement('div');
    chart.className = 'evo-chart';
    stages.forEach((stageNodes, idx) => {
        if (idx > 0) {
            const arrow = document.createElement('div');
            arrow.className = 'evo-arrow';
            arrow.textContent = '→';
            chart.appendChild(arrow);
        }
        const stageEl = document.createElement('div');
        stageEl.className = 'evo-stage';
        stageNodes.forEach(node => {
            const monEl = document.createElement('div');
            monEl.className = 'evo-mon';
            if (idx > 0) {
                const trig = document.createElement('div');
                trig.className = 'evo-trigger';
                trig.textContent = formatEvolutionTrigger(node.evolution_trigger) || 'Evolves';
                monEl.appendChild(trig);
            }
            const img = withFallbackImg(document.createElement('img'));
            img.src = node.sprite || '';
            img.alt = node.name;
            img.loading = 'lazy';
            const name = document.createElement('div');
            name.className = 'evo-name';
            name.textContent = titleCase(node.name);
            monEl.appendChild(img);
            monEl.appendChild(name);
            stageEl.appendChild(monEl);
        });
        chart.appendChild(stageEl);
    });
    container.appendChild(chart);
}

// --- Pokédex entries (per game) ---

function renderDexEntries(pokemon) {
    const container = document.getElementById('dex-entries');
    const entries = pokemon.pokedex_entries;
    if (!entries || !entries.length) {
        container.innerHTML = '<div class="muted">No data available yet.</div>';
        return;
    }
    const wrap = document.createElement('div');
    wrap.className = 'dex-entries';
    entries.forEach(({ versions, text }) => {
        const block = document.createElement('div');
        block.className = 'dex-entry';
        const versionsEl = document.createElement('div');
        versionsEl.className = 'dex-entry-versions';
        versionsEl.textContent = (versions || []).map(titleCase).join(', ');
        const textEl = document.createElement('div');
        textEl.className = 'dex-entry-text';
        textEl.textContent = text;
        block.appendChild(versionsEl);
        block.appendChild(textEl);
        wrap.appendChild(block);
    });
    container.innerHTML = '';
    container.appendChild(wrap);
}

// --- Sprite gallery ---

const ROMAN_NUMERALS = { i: 'I', ii: 'II', iii: 'III', iv: 'IV', v: 'V', vi: 'VI', vii: 'VII', viii: 'VIII', ix: 'IX' };

function formatGenerationLabel(genKey) {
    const roman = String(genKey || '').split('-')[1];
    return 'Generation ' + (ROMAN_NUMERALS[roman] || (roman || '').toUpperCase());
}

function renderSpriteGallery(pokemon) {
    const container = document.getElementById('sprite-gallery');
    const byGen = pokemon.sprites_by_gen;
    const genKeys = byGen ? Object.keys(byGen) : [];
    if (!genKeys.length) {
        container.innerHTML = '<div class="muted">No data available yet.</div>';
        return;
    }
    const table = document.createElement('table');
    table.className = 'sprite-table';
    const thead = document.createElement('tr');
    thead.appendChild(document.createElement('th'));
    genKeys.forEach(gen => {
        const th = document.createElement('th');
        th.textContent = formatGenerationLabel(gen);
        thead.appendChild(th);
    });
    table.appendChild(thead);

    ['normal', 'shiny'].forEach(kind => {
        const row = document.createElement('tr');
        const label = document.createElement('td');
        label.textContent = kind === 'normal' ? 'Normal' : 'Shiny';
        row.appendChild(label);
        genKeys.forEach(gen => {
            const games = byGen[gen] || {};
            const gameKey = Object.keys(games)[0];
            const url = gameKey ? games[gameKey]?.[kind] : null;
            const cell = document.createElement('td');
            if (url) {
                const img = withFallbackImg(document.createElement('img'));
                img.src = url;
                img.alt = `${titleCase(pokemon.name)} (${formatGenerationLabel(gen)}, ${kind})`;
                img.loading = 'lazy';
                cell.appendChild(img);
            }
            row.appendChild(cell);
        });
        table.appendChild(row);
    });

    const wrap = document.createElement('div');
    wrap.className = 'sprite-table-wrap';
    wrap.appendChild(table);
    container.innerHTML = '';
    container.appendChild(wrap);
}

// --- Other languages ---

const LANGUAGE_NAMES = {
    ja: 'Japanese', 'ja-hrkt': 'Japanese (Katakana)', 'ja-roma': 'Japanese (Romaji)',
    ko: 'Korean', 'zh-hans': 'Chinese (Simplified)', 'zh-hant': 'Chinese (Traditional)',
    fr: 'French', de: 'German', es: 'Spanish', 'es-419': 'Spanish (Latin America)',
    it: 'Italian', cs: 'Czech', 'pt-br': 'Portuguese (Brazil)'
};

function formatLanguageName(code) {
    return LANGUAGE_NAMES[String(code || '').toLowerCase()] || titleCase(code || '');
}

function renderLanguages(pokemon) {
    const container = document.getElementById('languages');
    const names = pokemon.names;
    if (!names || !names.length) {
        container.innerHTML = '<div class="muted">No data available yet.</div>';
        return;
    }
    const table = document.createElement('table');
    table.className = 'lang-table';
    names.forEach(({ language, name }) => {
        const row = document.createElement('tr');
        const langCell = document.createElement('th');
        langCell.textContent = formatLanguageName(language);
        const nameCell = document.createElement('td');
        nameCell.textContent = name || '—';
        row.appendChild(langCell);
        row.appendChild(nameCell);
        table.appendChild(row);
    });
    container.innerHTML = '';
    container.appendChild(table);
}

// --- Prev/next pager ---

function setupPager(pokemon, allPokemon) {
    const ids = new Set(allPokemon.map(p => Number(p.id)));
    const currentId = Number(pokemon.id);
    const prevEl = document.getElementById('pager-prev');
    const nextEl = document.getElementById('pager-next');
    if (ids.has(currentId - 1)) {
        prevEl.href = `pokemon-detail.html?id=${currentId - 1}`;
        prevEl.removeAttribute('aria-disabled');
    } else {
        prevEl.removeAttribute('href');
        prevEl.setAttribute('aria-disabled', 'true');
    }
    if (ids.has(currentId + 1)) {
        nextEl.href = `pokemon-detail.html?id=${currentId + 1}`;
        nextEl.removeAttribute('aria-disabled');
    } else {
        nextEl.removeAttribute('href');
        nextEl.setAttribute('aria-disabled', 'true');
    }
}

async function loadDetails() {
    if (!pokemonId) {
        statusEl.textContent = 'No Pokémon selected.';
        return;
    }

    // Kick off both loads in parallel: the lean index (needed for the
    // evolution chart's family lookup and the prev/next pager regardless of
    // whether the current Pokémon itself comes from the transient handoff
    // below) and this Pokémon's own detail file (moves, encounters,
    // Pokédex/training/breeding stats, sprite gallery, etc.).
    const allPokemonPromise = loadPokemonData();
    const detailPromise = loadPokemonDetail(pokemonId);

    // Prefer the transiently-passed Pokémon object (set by index.html) when present
    let pokemon = null;
    try {
        const raw = localStorage.getItem('selectedPokemon');
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && String(parsed.id) === String(pokemonId)) {
                    pokemon = parsed;
                    try { localStorage.removeItem('selectedPokemon'); } catch (e) {}
                }
            } catch (e) { console.warn('selectedPokemon parse failed', e); }
        }
    } catch (e) { console.warn('reading selectedPokemon failed', e); }

    const allPokemon = await allPokemonPromise;
    if (!pokemon) {
        pokemon = allPokemon.find(entry => String(entry.id) === String(pokemonId));
    }

    if (!pokemon) {
        statusEl.textContent = 'Pokémon not found.';
        return;
    }

    // Merge in the per-Pokémon detail file (pokedex_entries, sprites_by_gen,
    // names, ev_yield, moves_by_generation, encounters_by_generation, etc.)
    // so the render functions below can keep reading these fields straight
    // off `pokemon`, same as when they all lived in one combined record.
    Object.assign(pokemon, await detailPromise);

    document.getElementById('name').textContent = titleCase(pokemon.name);
    document.getElementById('meta').textContent = `#${String(pokemon.id).padStart(3, '0')} • ${titleCase(pokemon.region || 'unknown region')}`;
    document.getElementById('eyebrow').textContent = 'Pokémon details';
    withFallbackImg(document.getElementById('sprite'));
    document.getElementById('sprite').src = pokemon.sprite || '';
    document.getElementById('sprite').alt = pokemon.name;
    renderTypes(pokemon.types || []);
    renderInfoBoxes(pokemon);
    setupPager(pokemon, allPokemon);

    const latestEntryText = pokemon.pokedex_entries?.[pokemon.pokedex_entries.length - 1]?.text;
    document.getElementById('description').textContent = latestEntryText || pokemon.flavor_text || 'No flavor text available yet.';

    renderStats(pokemon.stats || {});
    renderTypeDefenses(pokemon);
    renderEvolutionChart(pokemon, allPokemon);

    const abilities = [];
    if (Array.isArray(pokemon.ability_details) && pokemon.ability_details.length) {
        pokemon.ability_details.forEach(ability => {
            abilities.push({
                name: titleCase(ability?.name || ''),
                hidden: !!ability?.is_hidden,
                description: (ability?.description || '').trim()
            });
        });
    } else {
        (pokemon.abilities || []).forEach(ability => abilities.push({ name: titleCase(ability), hidden: false, description: '' }));
    }
    const abilitiesContainer = document.getElementById('abilities');
    abilitiesContainer.textContent = '';
    if (abilities.length) {
        const wrap = document.createElement('div');
        wrap.className = 'ability-list';
        abilities.forEach(item => {
            const card = document.createElement('div');
            card.className = 'ability-item';

            const row = document.createElement('div');
            row.className = 'ability-name-row';
            const name = document.createElement('span');
            name.className = 'ability-name';
            name.textContent = item.name;
            row.appendChild(name);
            if (item.hidden) {
                const badge = document.createElement('span');
                badge.className = 'ability-hidden-badge';
                badge.textContent = 'Hidden';
                row.appendChild(badge);
            }
            card.appendChild(row);

            const desc = document.createElement('div');
            desc.className = 'ability-desc';
            desc.textContent = item.description || 'No description available.';
            card.appendChild(desc);

            wrap.appendChild(card);
        });
        abilitiesContainer.appendChild(wrap);
    } else {
        const muted = document.createElement('div');
        muted.className = 'muted';
        muted.textContent = 'No abilities recorded.';
        abilitiesContainer.appendChild(muted);
    }

    renderMovesByGeneration(pokemon.moves_by_generation || []);
    renderEncountersByGeneration(pokemon.encounters_by_generation || []);

    renderDexEntries(pokemon);
    renderSpriteGallery(pokemon);
    renderLanguages(pokemon);

    document.getElementById('notes').innerHTML = `
        <div>This page uses the local database for all details, including moves and wild encounters by generation -- no live PokéAPI calls are made when viewing a Pokémon.</div>
        <div style="margin-top:8px;">Tip: use the browser back button to return to the main list.</div>
    `;
    detailCard.hidden = false;
    statusEl.textContent = 'Details ready.';
}

loadDetails();
