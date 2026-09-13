#!/usr/bin/env python3
"""Erzeugt die Raid-Definitionen (data/raids/*.json).

Die Bosse werden aus den vorhandenen Kreaturen nach Basiswertsumme
ausgewaehlt: niedrige Stufen bekommen mittelstarke Arten, Stufe 5 die
staerksten und gigantifizierbaren. JSON ist die Quelle der Wahrheit - das
Spiel liest ausschliesslich diese Dateien.
"""
import glob
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')


def load_all(sub):
    out = []
    for path in sorted(glob.glob(os.path.join(DATA, sub, '*.json'))):
        with open(path, encoding='utf-8') as fh:
            doc = json.load(fh)
        out.extend(doc if isinstance(doc, list) else [doc])
    return out


def bst(species):
    return sum(species['baseStats'].values())


TIERS = [
    # stufe, level, schilde, rundenlimit, bst-fenster, preise
    (1, 16, [0.5], 12, (300, 400), [('trank', 2, 5), ('fangkugel', 3, 4), ('sternenstaub', 1, 2)]),
    (2, 25, [0.62, 0.36], 12, (380, 460), [('supertrank', 2, 5), ('superkugel', 3, 4), ('perle', 1, 3)]),
    (3, 35, [0.7, 0.48, 0.26], 11, (440, 520), [('hypertrank', 2, 5), ('hyperkugel', 3, 4), ('grossperle', 1, 3), ('sonnenstein', 1, 1)]),
    (4, 45, [0.75, 0.55, 0.36, 0.18], 10, (500, 600), [('top_trank', 2, 5), ('beleber', 2, 4), ('nugget', 1, 3), ('angriffsplus', 1, 2)]),
    (5, 58, [0.8, 0.62, 0.45, 0.3, 0.15], 10, (540, 700), [('top_trank', 3, 5), ('top_beleber', 2, 4), ('nugget', 3, 3), ('meisterkugel', 1, 1)]),
]

ALLY_POOL = {
    1: ['faehrtenleser_bo', 'kaefersammler_tom', 'jaegerin_pax'],
    2: ['bergsteiger_falk', 'kletterin_sona', 'hoehlenforscher_bela'],
    3: ['glutlaeufer_nero', 'aschewanderin_rea', 'bergfuehrer_kell'],
    4: ['irrlichtjaegerin_noor', 'grabwaechter_idris', 'gratlaeufer_ilan'],
    5: ['drachenschuelerin_vi', 'faustkaempfer_ove', 'champion_aurel'],
}


def main():
    species = load_all('creatures')
    trainers = {t['id'] for t in load_all('trainers')}
    items = {i['id'] for i in load_all('items')}

    out_dir = os.path.join(DATA, 'raids')
    os.makedirs(out_dir, exist_ok=True)
    written = []

    for tier, level, shields, turn_limit, (lo, hi), rewards in TIERS:
        pool = [s for s in species if lo <= bst(s) <= hi]
        if tier == 5:
            pool = [s for s in species if s.get('canGigantic') and bst(s) >= 480]
        pool.sort(key=lambda s: (-bst(s), s['id']))
        chosen = pool[:8] if len(pool) >= 8 else pool
        if not chosen:
            raise SystemExit(f'Keine Bosse fuer Stufe {tier} gefunden')

        bosses = []
        for index, s in enumerate(chosen):
            bosses.append({
                'species': s['id'],
                'level': level + (2 if index < 2 else 0),
                'weight': 6 if index >= 2 else 3,
                'gigantic': bool(s.get('canGigantic')) and tier >= 3,
            })

        allies = [a for a in ALLY_POOL[tier] if a in trainers]
        if len(allies) < 3:
            raise SystemExit(f'Stufe {tier}: nur {len(allies)} gueltige Verbuendete')

        reward_items = []
        for item_id, qty, weight in rewards:
            if item_id not in items:
                raise SystemExit(f'Unbekannter Gegenstand "{item_id}" in Stufe {tier}')
            reward_items.append({'item': item_id, 'quantity': qty, 'weight': weight})

        doc = {
            'id': f'raid_tier{tier}',
            'tier': tier,
            'bosses': bosses,
            'allies': allies,
            'shieldThresholds': shields,
            'rewardItems': reward_items,
            'turnLimit': turn_limit,
        }
        path = os.path.join(out_dir, f'raid_tier{tier}.json')
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(doc, fh, ensure_ascii=False, indent=2)
            fh.write('\n')
        written.append((doc['id'], len(bosses), allies))

    for raid_id, count, allies in written:
        print(f'{raid_id}: {count} Bosse, Verbuendete {", ".join(allies)}')
    print(f'{len(written)} Raid-Definitionen geschrieben')


if __name__ == '__main__':
    main()
