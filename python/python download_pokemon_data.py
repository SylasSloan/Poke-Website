import argparse
import json
import os
import sys
import time
from urllib.parse import urljoin

try:
    import requests
except Exception:
    print("[Error] requests library is required. Install with: pip install requests")
    sys.exit(1)


def get_json(url):
    time.sleep(0.2)  # polite throttling
    r = requests.get(url)
    r.raise_for_status()
    return r.json()


def main():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), os.pardir))
    default_out = os.path.join(base_dir, 'json', 'pokemon-full-data.json')

    parser = argparse.ArgumentParser(description='Download Pokémon data into json/pokemon-full-data.json')
    parser.add_argument('output', nargs='?', default=default_out, help='Output JSON path')
    args = parser.parse_args()

    out_path = os.path.abspath(args.output)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    print("Fetching Pokémon species list...")
    species_list = get_json("https://pokeapi.co/api/v2/pokemon-species?limit=1000")['results']

    all_pokemon = []

    for idx, species in enumerate(species_list, 1):
        try:
            print(f"Fetching {species['name']} ({idx}/{len(species_list)})")
            species_data = get_json(species['url'])
            variety = next((v for v in species_data['varieties'] if v.get('is_default')), None)
            if not variety:
                continue
            pokemon_data = get_json(variety['pokemon']['url'])
            entry = {
                'id': pokemon_data.get('id'),
                'name': pokemon_data.get('name'),
                'types': [t['type']['name'] for t in pokemon_data.get('types', [])],
                'sprite': pokemon_data.get('sprites', {}).get('front_default'),
                'abilities': [a['ability']['name'] for a in pokemon_data.get('abilities', [])],
                'stats': {s['stat']['name']: s['base_stat'] for s in pokemon_data.get('stats', [])},
                'region': species_data.get('generation', {}).get('name'),
                'flavor_text': next((ft['flavor_text'] for ft in species_data.get('flavor_text_entries', []) if ft.get('language', {}).get('name') == 'en'), ''),
                'evolves_from': species_data.get('evolves_from_species', {}).get('name') if species_data.get('evolves_from_species') else None
            }
            all_pokemon.append(entry)
        except Exception as e:
            print(f"Warning: failed to fetch {species.get('name')}: {e}")

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(all_pokemon, f, indent=2, ensure_ascii=False)

    print(f"Done! Data saved to {out_path}")


if __name__ == '__main__':
    main()