#!/usr/bin/env python3
"""
Enrich pokemon-full-data.json with Pokedex/Training/Breeding stats, a type
chart-ready set of raw fields, per-game Pokedex entries, other-language
names, evolution trigger conditions, and a sprite gallery across
generations -- everything the Bulbapedia-style detail page redesign needs
that PokeAPI's /pokemon and /pokemon-species endpoints provide directly.

- Reads json/pokemon-full-data.json (relative to the repo root) by default,
  or a path passed as the first arg.
- Fetches /pokemon-species/{id}, /pokemon/{id}, and (deduped by URL)
  /evolution-chain/{n} from PokeAPI.
- Caches every raw response fetched to python/pokedex_details_cache.json,
  keyed by URL, so re-running after an interruption doesn't re-fetch.
- Writes a backup of the original JSON to pokemon-full-data.backup.json
  next to the file before overwriting it.
- Saves progress periodically so an interrupted run doesn't lose work.

Run:
    python python/enrich_pokedex_details.py
or:
    python python/enrich_pokedex_details.py "c:/path/to/pokemon-full-data.json"
"""
from __future__ import annotations
import json
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

CACHE_FILE = Path(__file__).with_name("pokedex_details_cache.json")
SPECIES_URL = "https://pokeapi.co/api/v2/pokemon-species/{id}"
POKEMON_URL = "https://pokeapi.co/api/v2/pokemon/{id}"
SAVE_EVERY = 25


def load_cache() -> dict:
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_cache(cache: dict) -> None:
    try:
        CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    except Exception as e:
        print(f"[WARN] Failed to write cache: {e}")


def http_get_json(url: str, cache: dict) -> dict | None:
    if url in cache:
        return cache[url]
    req = urllib.request.Request(url, headers={"User-Agent": "pokedex-details-enricher/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status != 200:
                print(f"[WARN] HTTP {resp.status} for {url}")
                return None
            data = json.loads(resp.read().decode("utf-8"))
            cache[url] = data
            time.sleep(0.2)  # polite throttling, matches download_pokemon_data.py
            return data
    except urllib.error.HTTPError as e:
        print(f"[WARN] HTTPError {e.code} for {url}")
    except urllib.error.URLError as e:
        print(f"[WARN] URLError {e.reason} for {url}")
    except Exception as e:
        print(f"[WARN] Error fetching {url}: {e}")
    return None


def strip_none(d: dict) -> dict:
    return {k: v for k, v in d.items() if v is not None}


def find_evolution_details(chain_link: dict, target_name: str, parent_details=None):
    """Recursively search an evolution-chain tree for `target_name`.

    Returns the evolution_details list attached to the edge leading INTO
    target_name (i.e. the requirements to become this species), or None if
    target_name is the chain's root (a base form) or not found.
    """
    species_name = (chain_link.get("species") or {}).get("name")
    if species_name == target_name:
        return parent_details
    for child in chain_link.get("evolves_to") or []:
        found = find_evolution_details(child, target_name, child.get("evolution_details"))
        if found is not None:
            return found
    return None


def build_evolution_trigger(details_list) -> dict | None:
    if not details_list:
        return None
    d = details_list[0]
    return strip_none({
        "type": (d.get("trigger") or {}).get("name"),
        "min_level": d.get("min_level"),
        "item": (d.get("item") or {}).get("name"),
        "held_item": (d.get("held_item") or {}).get("name"),
        "min_happiness": d.get("min_happiness"),
        "min_beauty": d.get("min_beauty"),
        "min_affection": d.get("min_affection"),
        "time_of_day": d.get("time_of_day") or None,
        "known_move": (d.get("known_move") or {}).get("name"),
        "known_move_type": (d.get("known_move_type") or {}).get("name"),
        "location": (d.get("location") or {}).get("name"),
        "trade_species": (d.get("trade_species") or {}).get("name"),
        "gender": d.get("gender"),
        "needs_overworld_rain": d.get("needs_overworld_rain") or None,
        "turn_upside_down": d.get("turn_upside_down") or None,
    }) or None


def build_pokedex_entries(species_data: dict) -> list[dict]:
    by_text: dict[str, list[str]] = {}
    order: list[str] = []
    for entry in species_data.get("flavor_text_entries", []) or []:
        if (entry.get("language") or {}).get("name") != "en":
            continue
        text = (entry.get("flavor_text") or "").replace("\n", " ").replace("\f", " ").strip()
        text = " ".join(text.split())
        version = (entry.get("version") or {}).get("name")
        if not text or not version:
            continue
        if text not in by_text:
            by_text[text] = []
            order.append(text)
        if version not in by_text[text]:
            by_text[text].append(version)
    return [{"versions": by_text[text], "text": text} for text in order]


def build_sprites_by_gen(pokemon_data: dict) -> dict:
    versions = ((pokemon_data.get("sprites") or {}).get("versions")) or {}
    out = {}
    for gen_key, games in versions.items():
        if not isinstance(games, dict):
            continue
        gen_out = {}
        for game_key, sprite_set in games.items():
            if not isinstance(sprite_set, dict):
                continue
            normal = sprite_set.get("front_default")
            shiny = sprite_set.get("front_shiny")
            if normal or shiny:
                gen_out[game_key] = {"normal": normal, "shiny": shiny}
        if gen_out:
            out[gen_key] = gen_out
    return out


def enrich_one(entry: dict, cache: dict) -> None:
    pid = entry.get("id")
    species_data = http_get_json(SPECIES_URL.format(id=pid), cache)
    pokemon_data = http_get_json(POKEMON_URL.format(id=pid), cache)
    if not species_data or not pokemon_data:
        print(f"[WARN] Skipping id={pid} ({entry.get('name')}): fetch failed")
        return

    entry["height"] = pokemon_data.get("height")
    entry["weight"] = pokemon_data.get("weight")
    entry["base_experience"] = pokemon_data.get("base_experience")
    entry["ev_yield"] = [
        {"stat": s.get("stat", {}).get("name"), "value": s.get("effort")}
        for s in pokemon_data.get("stats", []) or []
        if (s.get("effort") or 0) > 0
    ]

    entry["genus"] = next(
        (g.get("genus") for g in species_data.get("genera", []) or []
         if (g.get("language") or {}).get("name") == "en"),
        None,
    )
    entry["capture_rate"] = species_data.get("capture_rate")
    entry["base_happiness"] = species_data.get("base_happiness")
    entry["hatch_counter"] = species_data.get("hatch_counter")
    entry["growth_rate"] = (species_data.get("growth_rate") or {}).get("name")
    entry["egg_groups"] = [g.get("name") for g in species_data.get("egg_groups", []) or [] if g.get("name")]
    entry["gender_rate"] = species_data.get("gender_rate")
    entry["names"] = [
        {"language": (n.get("language") or {}).get("name"), "name": n.get("name")}
        for n in species_data.get("names", []) or []
        if (n.get("language") or {}).get("name") not in (None, "en")
    ]
    entry["pokedex_entries"] = build_pokedex_entries(species_data)
    entry["sprites_by_gen"] = build_sprites_by_gen(pokemon_data)

    evo_chain_url = (species_data.get("evolution_chain") or {}).get("url")
    if evo_chain_url:
        chain_data = http_get_json(evo_chain_url, cache)
        if chain_data and chain_data.get("chain"):
            details = find_evolution_details(chain_data["chain"], entry.get("name"))
            entry["evolution_trigger"] = build_evolution_trigger(details)
        else:
            entry["evolution_trigger"] = None
    else:
        entry["evolution_trigger"] = None


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

    total = len(data)
    for i, entry in enumerate(data, 1):
        if entry.get("evolution_trigger", "MISSING") != "MISSING" and entry.get("sprites_by_gen"):
            continue  # already enriched in a prior run
        print(f"Enriching {entry.get('name')} ({i}/{total})")
        enrich_one(entry, cache)
        if i % SAVE_EVERY == 0:
            save_cache(cache)
            json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    save_cache(cache)
    json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[Info] Done! Enriched data saved to {json_path}")


if __name__ == "__main__":
    main()
