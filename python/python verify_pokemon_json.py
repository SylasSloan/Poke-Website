import argparse
import json
import os
import sys

required_fields = [
    "id", "name", "types", "sprite", "abilities", "stats", "region", "flavor_text", "evolves_from"
]


def verify(path: str) -> int:
    if not os.path.exists(path):
        print(f"[Error] JSON not found: {path}")
        return 2
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    bad = 0
    for idx, entry in enumerate(data, 1):
        missing = [field for field in required_fields if field not in entry]
        if missing:
            print(f"Entry {idx} is missing fields: {missing}")
            bad += 1
    if bad == 0:
        print(f"All {len(data)} entries look good.")
        return 0
    else:
        print(f"Found {bad} entries with missing fields.")
        return 1


def main():
    default = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'json', 'pokemon-full-data.json')
    parser = argparse.ArgumentParser(description='Verify pokemon JSON structure')
    parser.add_argument('path', nargs='?', default=default, help='Path to pokemon-full-data.json')
    args = parser.parse_args()
    rc = verify(os.path.abspath(args.path))
    sys.exit(rc)


if __name__ == '__main__':
    main()