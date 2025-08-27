#!/usr/bin/env python3
"""
Enrich pokemon-full-data.json by filling missing ability descriptions via PokéAPI.
- Reads ../pokemon-full-data.json (relative to this file) by default, or a path passed as first arg.
- Fetches descriptions from https://pokeapi.co/api/v2/ability/{name}
- If a Pokémon lacks ability_details, it will be synthesized from abilities and hidden_ability.
- Fills description for each ability into ability_details[].description.
- Writes a backup of the original JSON to pokemon-full-data.backup.json next to the file.
- Overwrites the original JSON with descriptions filled.
- Caches fetched ability descriptions to python/ability_cache.json to avoid re-fetching.

Run:
    python python/enrich_abilities.py
or
    python python/enrich_abilities.py "c:/path/to/pokemon-full-data.json"
"""
from __future__ import annotations
import json
import sys
import time
import urllib.request
import urllib.error
from pathlib import Path

CACHE_FILE = Path(__file__).with_name("ability_cache.json")
POKEAPI_URL = "https://pokeapi.co/api/v2/ability/{name}"


def load_cache() -> dict:
    if CACHE_FILE.exists():
        try:
            return json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_cache(cache: dict) -> None:
    try:
        CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        print(f"[WARN] Failed to write cache: {e}")


def http_get_json(url: str) -> dict | None:
    req = urllib.request.Request(url, headers={"User-Agent": "ability-enricher/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status != 200:
                print(f"[WARN] HTTP {resp.status} for {url}")
                return None
            data = resp.read()
            return json.loads(data.decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"[WARN] HTTPError {e.code} for {url}")
    except urllib.error.URLError as e:
        print(f"[WARN] URLError {e.reason} for {url}")
    except Exception as e:
        print(f"[WARN] Error fetching {url}: {e}")
    return None


def extract_description(ability_json: dict) -> str | None:
    if not ability_json:
        return None
    # Prefer effect_entries short_effect in English
    try:
        for entry in ability_json.get("effect_entries", []) or []:
            if (entry.get("language", {}) or {}).get("name") == "en":
                short = (entry.get("short_effect") or "").strip()
                if short:
                    return short
        # Fallback to effect text
        for entry in ability_json.get("effect_entries", []) or []:
            if (entry.get("language", {}) or {}).get("name") == "en":
                eff = (entry.get("effect") or "").strip()
                if eff:
                    return eff
    except Exception:
        pass
    # Fallback to flavor_text_entries if available
    try:
        for entry in ability_json.get("flavor_text_entries", []) or []:
            if (entry.get("language", {}) or {}).get("name") == "en":
                txt = (entry.get("flavor_text") or "").replace("\n", " ").replace("\f", " ").strip()
                if txt:
                    return txt
    except Exception:
        pass
    return None


def fetch_ability_description(name: str, cache: dict) -> str | None:
    key = name.strip().lower()
    if not key:
        return None
    if key in cache and cache[key]:
        return cache[key]
    url = POKEAPI_URL.format(name=key)
    data = http_get_json(url)
    if not data:
        return None
    desc = extract_description(data)
    if desc:
        cache[key] = desc
        save_cache(cache)
    return desc


def main():
    # Resolve input JSON path
    if len(sys.argv) > 1:
        json_path = Path(sys.argv[1])
    else:
        json_path = Path(__file__).parents[1] / "pokemon-full-data.json"
    if not json_path.exists():
        print(f"[ERROR] JSON file not found: {json_path}")
        sys.exit(1)

    # Load JSON (keep original text to back up unmodified file)
    try:
        original_text = json_path.read_text(encoding="utf-8")
        data = json.loads(original_text)
    except Exception as e:
        print(f"[ERROR] Failed to read JSON: {e}")
        sys.exit(1)

    cache = load_cache()

    # Helpers
    def get_ability_name(a) -> str:
        """Extract ability name from various shapes."""
        if isinstance(a, dict):
            if a.get("name"):
                return str(a.get("name")).strip()
            ab = a.get("ability")
            if isinstance(ab, dict) and ab.get("name"):
                return str(ab.get("name")).strip()
            if isinstance(ab, str):
                return ab.strip()
            return ""
        if isinstance(a, str):
            return a.strip()
        return ""

    def has_description(a: dict) -> bool:
        return bool((a.get("description") or a.get("effect") or a.get("short_effect") or "").strip())

    # Collect abilities needing descriptions (from ability_details if present, otherwise from abilities/hidden_ability)
    abilities_needed: set[str] = set()
    for p in data:
        ads = p.get("ability_details")
        if isinstance(ads, list) and ads:
            for a in ads:
                name = get_ability_name(a)
                if not name:
                    continue
                if not has_description(a):
                    abilities_needed.add(name.lower())
        else:
            # Fall back to plain fields
            for n in p.get("abilities", []) or []:
                if n:
                    abilities_needed.add(str(n).strip().lower())
            hidden = p.get("hidden_ability")
            if hidden:
                abilities_needed.add(str(hidden).strip().lower())

    print(f"[Info] Abilities missing descriptions: {len(abilities_needed)}")

    # Fetch and fill
    filled = 0
    for i, name in enumerate(sorted(abilities_needed)):
        desc = fetch_ability_description(name, cache)
        if not desc:
            print(f"[WARN] Could not fetch description for ability: {name}")
        else:
            filled += 1
        # Be kind to the API
        time.sleep(0.15)

    print(f"[Info] Newly fetched descriptions: {filled}")

    # Apply descriptions into data; also synthesize ability_details when missing
    updated = 0
    for p in data:
        ads = p.get("ability_details")
        if not isinstance(ads, list) or not ads:
            # Build from plain fields
            new_ads = []
            normals = p.get("abilities", []) or []
            for n in normals:
                name = get_ability_name(n)
                if not name:
                    continue
                key = name.strip().lower()
                entry = {"name": name, "is_hidden": False}
                if key in cache and cache[key]:
                    entry["description"] = cache[key]
                    updated += 1
                new_ads.append(entry)
            hidden = p.get("hidden_ability")
            if hidden:
                name = get_ability_name(hidden)
                key = name.strip().lower()
                entry = {"name": name, "is_hidden": True}
                if key in cache and cache[key]:
                    entry["description"] = cache[key]
                    updated += 1
                new_ads.append(entry)
            p["ability_details"] = new_ads
        else:
            # Fill in missing descriptions in existing ability_details
            for a in ads:
                name = get_ability_name(a)
                key = name.strip().lower()
                if not key:
                    continue
                if not has_description(a) and key in cache and cache[key]:
                    a["description"] = cache[key]
                    updated += 1

    print(f"[Info] Updated JSON entries with descriptions: {updated}")

    # Backup original and write
    backup_path = json_path.with_suffix(".backup.json")
    try:
        if not backup_path.exists():
            backup_path.write_text(original_text, encoding="utf-8")
    except Exception:
        pass
    try:
        # Actually write the modified JSON to the main path
        json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[Done] Wrote updated JSON with descriptions: {json_path}")
    except Exception as e:
        print(f"[ERROR] Failed to write JSON: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
