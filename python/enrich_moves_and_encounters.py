#!/usr/bin/env python3
"""
Enrich pokemon-full-data.json with per-generation moves (level-up / TM / HM /
tutor / egg, split out instead of lumped into one "machine" bucket) and
per-generation wild-encounter data, replacing the live pokeapi.co fetches
pokemon-detail.js used to do on every page view.

- Reads json/pokemon-full-data.json (relative to the repo root) by default,
  or a path passed as the first arg.
- Fetches /pokemon/{id} (for moves) and /pokemon/{id}/encounters per
  Pokémon, plus a one-time global /machine list + per-machine /machine/{id}
  lookup to resolve which "machine" moves are TMs, HMs, or (Sword/Shield)
  TRs -- PokeAPI's move learn-method data alone only reports "machine", not
  which kind of machine.
- Shares python/pokedex_details_cache.json (URL-keyed) with
  enrich_pokedex_details.py, so /pokemon/{id} responses that script already
  fetched are reused here instead of re-fetched.
- Writes a backup of the original JSON to pokemon-full-data.backup.json
  next to the file, if one doesn't already exist.
- Saves progress periodically so an interrupted run doesn't lose work.

Run:
    python python/enrich_moves_and_encounters.py
or:
    python python/enrich_moves_and_encounters.py "c:/path/to/pokemon-full-data.json"
"""
from __future__ import annotations
import json
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

CACHE_FILE = Path(__file__).with_name("pokedex_details_cache.json")
POKEMON_URL = "https://pokeapi.co/api/v2/pokemon/{id}"
ENCOUNTERS_URL = "https://pokeapi.co/api/v2/pokemon/{id}/encounters"
# Deliberately huge limit to fetch the whole machine list in one page rather
# than implementing pagination for a list that's only fetched once, ever.
MACHINE_LIST_URL = "https://pokeapi.co/api/v2/machine?limit=100000"
SAVE_EVERY = 25

# Chronological generation groups. This is the single source of truth for
# generation grouping now -- it used to be duplicated in js/pokemon-detail.js
# but moves/encounters are precomputed here instead of live-fetched, so the
# JS copy was deleted.
GENERATION_GROUPS = [
    ("Generation I", ["red-blue", "yellow"]),
    ("Generation II", ["gold-silver", "crystal"]),
    ("Generation III", ["ruby-sapphire", "emerald", "firered-leafgreen"]),
    ("Generation IV", ["diamond-pearl", "platinum", "heartgold-soulsilver"]),
    ("Generation V", ["black-white", "black-2-white-2"]),
    ("Generation VI", ["x-y", "omega-ruby-alpha-sapphire"]),
    ("Generation VII", ["sun-moon", "ultra-sun-ultra-moon", "lets-go-pikachu-lets-go-eevee"]),
    ("Generation VIII", ["sword-shield", "brilliant-diamond-and-shining-pearl", "legends-arceus"]),
    ("Generation IX", ["scarlet-violet"]),
]
VERSION_GROUP_ORDER = [vg for _, groups in GENERATION_GROUPS for vg in groups]
GEN_BY_VERSION_GROUP = {vg: label for label, groups in GENERATION_GROUPS for vg in groups}

VERSION_TO_GENERATION = {
    "red": "Generation I", "blue": "Generation I", "yellow": "Generation I",
    "gold": "Generation II", "silver": "Generation II", "crystal": "Generation II",
    "ruby": "Generation III", "sapphire": "Generation III", "emerald": "Generation III",
    "firered": "Generation III", "leafgreen": "Generation III",
    "diamond": "Generation IV", "pearl": "Generation IV", "platinum": "Generation IV",
    "heartgold": "Generation IV", "soulsilver": "Generation IV",
    "black": "Generation V", "white": "Generation V", "black-2": "Generation V", "white-2": "Generation V",
    "x": "Generation VI", "y": "Generation VI", "omega-ruby": "Generation VI", "alpha-sapphire": "Generation VI",
    "sun": "Generation VII", "moon": "Generation VII", "ultra-sun": "Generation VII", "ultra-moon": "Generation VII",
    "lets-go-pikachu": "Generation VII", "lets-go-eevee": "Generation VII",
    "sword": "Generation VIII", "shield": "Generation VIII",
    "brilliant-diamond": "Generation VIII", "shining-pearl": "Generation VIII", "legends-arceus": "Generation VIII",
    "scarlet": "Generation IX", "violet": "Generation IX",
}
VERSION_ORDER = list(VERSION_TO_GENERATION.keys())


def load_cache() -> dict:
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_cache(cache: dict) -> None:
    # The repo lives in a OneDrive-synced folder, which transiently locks
    # files it's actively syncing -- retry a couple of times before giving
    # up, since a single missed save just means a bit of re-fetching later,
    # but a run of bad luck shouldn't lose an entire SAVE_EVERY batch.
    text = json.dumps(cache, ensure_ascii=False)
    for attempt in range(3):
        try:
            CACHE_FILE.write_text(text, encoding="utf-8")
            return
        except PermissionError as e:
            if attempt == 2:
                print(f"[WARN] Failed to write cache after retries: {e}")
            else:
                time.sleep(0.5)
        except Exception as e:
            print(f"[WARN] Failed to write cache: {e}")
            return


def http_get_json(url: str, cache: dict) -> dict | None:
    if url in cache:
        return cache[url]
    req = urllib.request.Request(url, headers={"User-Agent": "moves-encounters-enricher/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status != 200:
                print(f"[WARN] HTTP {resp.status} for {url}")
                return None
            data = json.loads(resp.read().decode("utf-8"))
            cache[url] = data
            time.sleep(0.2)  # polite throttling, matches enrich_pokedex_details.py
            return data
    except urllib.error.HTTPError as e:
        print(f"[WARN] HTTPError {e.code} for {url}")
    except urllib.error.URLError as e:
        print(f"[WARN] URLError {e.reason} for {url}")
    except Exception as e:
        print(f"[WARN] Error fetching {url}: {e}")
    return None


def title_case(s: str) -> str:
    return " ".join(w.capitalize() for w in (s or "").replace("-", " ").split())


def pick_latest(names, order):
    """Returns whichever entry in `names` sits furthest right in `order`."""
    best = None
    best_index = -1
    for name in names:
        idx = order.index(name) if name in order else -1
        if idx > best_index:
            best_index = idx
            best = name
        elif best is None:
            best = name
    return best


# --- Machine (TM/HM/TR) map -------------------------------------------------

def build_machine_map(cache: dict) -> dict:
    """Returns {(version_group_name, move_name): 'tm'|'hm'|'tr'}.

    PokeAPI's per-move version_group_details only reports the learn method
    as "machine" -- it never says which kind of machine. The item associated
    with each /machine/{id} entry does (tm##, hm##, or tr## for
    Sword/Shield's Technical Records), so this fetches the full machine list
    once, globally, and is reused across every Pokémon below.
    """
    listing = http_get_json(MACHINE_LIST_URL, cache)
    if not listing:
        print("[WARN] Could not fetch machine list; TM/HM split will default to TM for all machine moves")
        return {}
    results = listing.get("results", []) or []
    print(f"[Info] Resolving {len(results)} machine entries (one-time, cached)...")
    machine_map: dict = {}
    for i, entry in enumerate(results, 1):
        url = entry.get("url")
        if not url:
            continue
        data = http_get_json(url, cache)
        if not data:
            continue
        item_name = ((data.get("item") or {}).get("name") or "").lower()
        move_name = (data.get("move") or {}).get("name")
        vg_name = (data.get("version_group") or {}).get("name")
        if not move_name or not vg_name:
            continue
        if item_name.startswith("hm"):
            kind = "hm"
        else:
            # Sword/Shield's "TR" (Technical Record) items function as that
            # generation's TM equivalent -- Generation VIII is already its
            # own bucket in moves_by_generation, so there's no need for a
            # separate "tr" category alongside level_up/tm/hm/tutor/egg.
            kind = "tm"
        machine_map[(vg_name, move_name)] = kind
        if i % 200 == 0:
            print(f"  ...{i}/{len(results)} machines")
            save_cache(cache)
    save_cache(cache)
    return machine_map


# --- Moves by generation -----------------------------------------------------

def build_moves_by_generation(moves: list, machine_map: dict) -> list:
    # Within a generation that spans multiple version groups (e.g. Gen III
    # has Ruby/Sapphire, Emerald, FireRed/LeafGreen), use only the most
    # recent version group present so version-exclusive learnsets within a
    # generation don't get double-counted -- same heuristic the old JS
    # implementation used for its single global "latest game" view, just
    # applied once per generation.
    present_groups_by_gen: dict[str, set] = {}
    for move in moves or []:
        for detail in move.get("version_group_details", []) or []:
            vg = (detail.get("version_group") or {}).get("name")
            gen_label = GEN_BY_VERSION_GROUP.get(vg)
            if not gen_label:
                continue
            present_groups_by_gen.setdefault(gen_label, set()).add(vg)

    latest_group_by_gen = {
        gen_label: pick_latest(list(groups), VERSION_GROUP_ORDER)
        for gen_label, groups in present_groups_by_gen.items()
    }

    per_gen = {
        label: {"label": label, "level_up": [], "tm": [], "hm": [], "tutor": [], "egg": []}
        for label, _ in GENERATION_GROUPS
    }
    for move in moves or []:
        raw_move_name = (move.get("move") or {}).get("name") or ""
        move_name = title_case(raw_move_name)
        for detail in move.get("version_group_details", []) or []:
            vg = (detail.get("version_group") or {}).get("name")
            gen_label = GEN_BY_VERSION_GROUP.get(vg)
            if not gen_label or latest_group_by_gen.get(gen_label) != vg:
                continue
            method = (detail.get("move_learn_method") or {}).get("name")
            level = detail.get("level_learned_at")
            gen_entry = per_gen[gen_label]
            if method == "level-up":
                gen_entry["level_up"].append({
                    "level": level or 0,
                    "label": "Evolve" if level == 0 else f"Level {level}",
                    "name": move_name,
                })
            elif method == "machine":
                kind = machine_map.get((vg, raw_move_name), "tm")
                gen_entry[kind].append(move_name)
            elif method == "tutor":
                gen_entry["tutor"].append(move_name)
            elif method == "egg":
                gen_entry["egg"].append(move_name)

    result = []
    for label, _ in GENERATION_GROUPS:
        entry = per_gen[label]
        if not any(entry[k] for k in ("level_up", "tm", "hm", "tutor", "egg")):
            continue
        entry["level_up"].sort(key=lambda m: m["level"])
        for key in ("tm", "hm", "tutor", "egg"):
            entry[key] = sorted(set(entry[key]))
        result.append(entry)
    return result


# --- Encounters by generation ------------------------------------------------

def build_encounters_by_generation(encounters: list) -> list:
    # Bucket every area/version encounter by generation, then within a
    # generation keep only the most recent version present -- mirrors the
    # "most-recent version" heuristic used for moves above so a Pokémon
    # doesn't show duplicate/conflicting area lists for e.g. both Sword and
    # Shield within the same generation.
    versions_by_gen: dict[str, set] = {}
    for entry in encounters or []:
        for vd in entry.get("version_details", []) or []:
            v = (vd.get("version") or {}).get("name")
            gen_label = VERSION_TO_GENERATION.get(v)
            if gen_label:
                versions_by_gen.setdefault(gen_label, set()).add(v)
    latest_version_by_gen = {
        gen_label: pick_latest(list(vs), VERSION_ORDER)
        for gen_label, vs in versions_by_gen.items()
    }

    per_gen: dict[str, list] = {}
    for entry in encounters or []:
        area = title_case((entry.get("location_area") or {}).get("name") or "Unknown area")
        for vd in entry.get("version_details", []) or []:
            v = (vd.get("version") or {}).get("name")
            gen_label = VERSION_TO_GENERATION.get(v)
            if not gen_label or latest_version_by_gen.get(gen_label) != v:
                continue
            chips = []
            for slot in vd.get("encounter_details", []) or []:
                method = title_case((slot.get("method") or {}).get("name") or "")
                chance = f"{slot['chance']}%" if slot.get("chance") is not None else None
                lo, hi = slot.get("min_level"), slot.get("max_level")
                levels = None
                if lo is not None and hi is not None:
                    levels = f"Lv {lo}" if lo == hi else f"Lv {lo}-{hi}"
                conditions = [title_case(cv.get("name") or "") for cv in slot.get("condition_values", []) or []]
                parts = [p for p in [method, levels, chance] if p]
                if conditions:
                    parts.append(", ".join(conditions))
                chip = " • ".join(parts)
                if chip and chip not in chips:
                    chips.append(chip)
            if chips:
                per_gen.setdefault(gen_label, []).append({"area": area, "chips": chips})

    result = []
    for label, _ in GENERATION_GROUPS:
        areas = per_gen.get(label)
        if areas:
            result.append({"label": label, "areas": areas})
    return result


def enrich_one(entry: dict, cache: dict, machine_map: dict) -> None:
    pid = entry.get("id")
    pokemon_data = http_get_json(POKEMON_URL.format(id=pid), cache)
    if not pokemon_data:
        print(f"[WARN] Skipping moves for id={pid} ({entry.get('name')}): fetch failed")
    else:
        entry["moves_by_generation"] = build_moves_by_generation(pokemon_data.get("moves", []) or [], machine_map)

    encounters_data = http_get_json(ENCOUNTERS_URL.format(id=pid), cache)
    if encounters_data is None:
        print(f"[WARN] Skipping encounters for id={pid} ({entry.get('name')}): fetch failed")
    else:
        entry["encounters_by_generation"] = build_encounters_by_generation(encounters_data)


def main():
    if len(sys.argv) > 1:
        json_path = Path(sys.argv[1])
    else:
        json_path = Path(__file__).parents[1] / "json" / "pokemon-full-data.json"
    if not json_path.exists():
        print(f"[ERROR] JSON file not found: {json_path}")
        sys.exit(1)

    try:
        original_text = json_path.read_text(encoding="utf-8")
        data = json.loads(original_text)
    except Exception as e:
        print(f"[ERROR] Failed to read JSON: {e}")
        sys.exit(1)

    backup_path = json_path.with_name(json_path.stem + ".backup.json")
    if not backup_path.exists():
        backup_path.write_text(original_text, encoding="utf-8")
        print(f"[Info] Backed up original to {backup_path}")

    cache = load_cache()
    print(f"[Info] Loaded cache with {len(cache)} cached URLs")

    machine_map = build_machine_map(cache)
    print(f"[Info] Machine map built: {len(machine_map)} (version_group, move) -> tm/hm/tr entries")

    total = len(data)
    for i, entry in enumerate(data, 1):
        if entry.get("moves_by_generation") is not None and entry.get("encounters_by_generation") is not None:
            continue  # already enriched in a prior run
        print(f"Enriching moves/encounters for {entry.get('name')} ({i}/{total})")
        enrich_one(entry, cache, machine_map)
        if i % SAVE_EVERY == 0:
            save_cache(cache)
            json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    save_cache(cache)
    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[Info] Done! Enriched data saved to {json_path}")


if __name__ == "__main__":
    main()
