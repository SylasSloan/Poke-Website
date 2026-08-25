#!/usr/bin/env python3
"""
Split the fully-enriched pokemon-full-data.json into:
  - json/pokemon-index.json: a lean array with only the fields the main grid
    (index.html) and the detail page's pager/evolution-family lookups need.
  - json/details/{id}.json: one file per Pokémon with everything else
    (Pokédex/training/breeding stats, per-game entries, sprite gallery,
    other-language names, and the moves/encounters enrichment from
    enrich_moves_and_encounters.py).

This lets index.html fetch a small file instead of the whole dataset, while
pokemon-detail.html fetches the index (for the pager and evolution chart)
plus exactly one small detail file for the Pokémon being viewed.

Run after the enrichment scripts (enrich_abilities.py,
enrich_pokedex_details.py, enrich_moves_and_encounters.py):
    python python/split_pokemon_data.py
or:
    python python/split_pokemon_data.py "c:/path/to/pokemon-full-data.json"
"""
from __future__ import annotations
import json
import sys
from pathlib import Path

# Fields the main grid and the detail page's pager/evolution-chart need.
# evolves_from + evolution_trigger stay here (not in the per-id detail file)
# because buildEvolutionFamily() in pokemon-detail.js reconstructs branching
# evolution families (e.g. Eevee) by scanning every record's evolves_from,
# and needs each family member's evolution_trigger to label the arrows --
# doing that would otherwise require fetching every sibling's detail file.
INDEX_FIELDS = [
    "id", "name", "sprite", "types", "region", "stats", "flavor_text",
    "abilities", "ability_details", "hidden_ability",
    "evolves_from", "evolution_trigger",
]

# Everything else: per-Pokémon detail, fetched lazily by pokemon-detail.html.
DETAIL_FIELDS = [
    "height", "weight", "base_experience", "ev_yield", "genus",
    "capture_rate", "base_happiness", "hatch_counter", "growth_rate",
    "egg_groups", "gender_rate", "names", "pokedex_entries",
    "sprites_by_gen", "moves_by_generation", "encounters_by_generation",
]


def main():
    if len(sys.argv) > 1:
        json_path = Path(sys.argv[1])
    else:
        json_path = Path(__file__).parents[1] / "json" / "pokemon-full-data.json"
    if not json_path.exists():
        print(f"[ERROR] JSON file not found: {json_path}")
        sys.exit(1)

    repo_root = Path(__file__).parents[1]
    index_path = repo_root / "json" / "pokemon-index.json"
    details_dir = repo_root / "json" / "details"
    details_dir.mkdir(parents=True, exist_ok=True)

    data = json.loads(json_path.read_text(encoding="utf-8"))

    index = []
    missing_enrichment = []
    for entry in data:
        index.append({k: entry.get(k) for k in INDEX_FIELDS if k in entry})

        pid = entry.get("id")
        detail = {k: entry[k] for k in DETAIL_FIELDS if k in entry}
        if "moves_by_generation" not in entry or "encounters_by_generation" not in entry:
            missing_enrichment.append(entry.get("name"))
        (details_dir / f"{pid}.json").write_text(
            json.dumps(detail, ensure_ascii=False), encoding="utf-8"
        )

    index_path.write_text(json.dumps(index, ensure_ascii=False), encoding="utf-8")

    if missing_enrichment:
        print(f"[WARN] {len(missing_enrichment)} entries are missing moves/encounters enrichment "
              f"(run python/enrich_moves_and_encounters.py first): {missing_enrichment[:10]}"
              f"{'...' if len(missing_enrichment) > 10 else ''}")

    index_size = index_path.stat().st_size
    details_size = sum(f.stat().st_size for f in details_dir.glob("*.json"))
    print(f"[Info] Wrote {index_path} ({index_size / 1024:.1f} KB, {len(index)} entries)")
    print(f"[Info] Wrote {len(list(details_dir.glob('*.json')))} files to {details_dir} "
          f"({details_size / 1024:.1f} KB total)")
    print(f"[Info] Original {json_path.name}: {json_path.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
