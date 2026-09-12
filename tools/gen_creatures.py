#!/usr/bin/env python3
"""Erzeugt den Kreaturen-Katalog unter data/creatures/.

Die JSON-Dateien sind die Quelle der Wahrheit fuer das Spiel; dieses Skript
dokumentiert, wie der Startbestand erzeugt wurde, und erlaubt konsistente
Massenaenderungen. Neue Kreaturen koennen jederzeit auch von Hand als JSON
ergaenzt werden.
"""
import json, pathlib, sys, hashlib, collections

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import rigs

ROOT = pathlib.Path(__file__).resolve().parent.parent

# --------------------------------------------------------------------------
# Attackenpool aus den generierten Attacken-Dateien
# --------------------------------------------------------------------------
MOVES = {}
for f in sorted((ROOT / "data/moves").glob("*.json")):
    for m in json.loads(f.read_text()):
        MOVES[m["id"]] = m

def pool(t, kind):
    out = []
    for m in MOVES.values():
        if m["type"] != t or m.get("giganticOnly"):
            continue
        cat, p = m["category"], m["power"]
        if kind == "status" and cat == "status": out.append(m)
        elif kind == "weak" and cat != "status" and p <= 55: out.append(m)
        elif kind == "mid" and cat != "status" and 55 < p <= 90: out.append(m)
        elif kind == "strong" and cat != "status" and p > 90: out.append(m)
    out.sort(key=lambda m: (m["power"], m["id"]))
    return [m["id"] for m in out]

def seeded(key, n):
    h = hashlib.sha256(key.encode()).digest()
    return h[0] % n if n else 0

def build_learnset(cid, types, stage, max_level):
    """Baut ein plausibles, typgerechtes Lernset auf.

    Wechselt zwischen Primaer-/Sekundaertyp und Normal-Faellback ab und sorgt
    dafuer, dass jede Kreatur auf jedem Level mindestens eine Schadensattacke
    kennt.
    """
    t1 = types[0]
    t2 = types[1] if len(types) > 1 else None
    chosen, used = [], set()

    def take(t, kind, level, offset=0):
        cands = [m for m in pool(t, kind) if m not in used]
        if not cands:
            cands = [m for m in pool("normal", kind) if m not in used]
        if not cands:
            return
        idx = (seeded(cid + t + kind, len(cands)) + offset) % len(cands)
        mid = cands[idx]
        used.add(mid)
        chosen.append({"level": level, "move": mid})

    take(t1, "weak", 1)
    take("normal", "weak", 1, 1)
    take("normal", "status", 4)
    take(t1, "status", 7) if pool(t1, "status") else take("normal", "status", 7)
    if t2: take(t2, "weak", 10)
    else:  take(t1, "weak", 10, 1)
    take(t1, "mid", 13)
    take("normal", "mid", 17) if stage >= 2 else take(t1, "status", 17)
    if t2: take(t2, "mid", 21)
    else:  take(t1, "mid", 21, 1)
    take(t1, "mid", 25, 1)
    if stage >= 2:
        take(t1, "strong", 30)
        if t2: take(t2, "mid", 34, 1)
        else:  take("normal", "mid", 34)
        take("normal", "strong", 39)
    else:
        take(t1, "mid", 30, 2)
        take("normal", "mid", 36)
    if stage >= 3:
        if t2: take(t2, "strong", 44)
        else:  take(t1, "strong", 44, 1)
        take(t1, "strong", 50, 1)
    seen = set()
    ls = []
    for e in chosen:
        if e["move"] in seen: continue
        seen.add(e["move"])
        if e["level"] > max_level: continue
        ls.append(e)
    ls.sort(key=lambda e: (e["level"], e["move"]))
    return ls

TM_BY_TYPE = {}
for f in sorted((ROOT / "data/items").glob("disk.json")):
    for d in json.loads(f.read_text()):
        mv = MOVES[d["teachesMove"]]
        TM_BY_TYPE.setdefault(mv["type"], []).append(mv["id"])

def build_tms(types):
    out = []
    for t in list(types) + ["normal"]:
        out += TM_BY_TYPE.get(t, [])
    return sorted(set(out))

# --------------------------------------------------------------------------
# Statverteilung nach Archetyp
# --------------------------------------------------------------------------
ARCHETYPES = {
    "balanced":   dict(hp=1.00, atk=1.00, df=1.00, spa=1.00, spd=1.00, spe=1.00),
    "physical":   dict(hp=1.00, atk=1.42, df=1.05, spa=0.62, spd=0.85, spe=1.06),
    "special":    dict(hp=0.94, atk=0.62, df=0.86, spa=1.46, spd=1.08, spe=1.04),
    "tank":       dict(hp=1.30, atk=0.98, df=1.45, spa=0.80, spd=1.12, spe=0.55),
    "specWall":   dict(hp=1.28, atk=0.72, df=1.06, spa=0.92, spd=1.48, spe=0.64),
    "speedster":  dict(hp=0.82, atk=1.18, df=0.78, spa=1.02, spd=0.80, spe=1.60),
    "bruiser":    dict(hp=1.14, atk=1.50, df=1.08, spa=0.66, spd=0.86, spe=0.86),
    "glass":      dict(hp=0.74, atk=0.82, df=0.66, spa=1.62, spd=0.82, spe=1.44),
    "bulkyMixed": dict(hp=1.20, atk=1.12, df=1.18, spa=1.12, spd=1.10, spe=0.68),
}

def stats(bst, arch, cid=""):
    """Verteilt die Basiswertsumme gemaess Archetyp.

    Eine kleine, aus der ID abgeleitete Streuung verhindert, dass mehrere
    Kreaturen desselben Archetyps identische Werte bekommen - ohne die
    Summe zu veraendern und ohne Zufall (reproduzierbar).
    """
    w = dict(ARCHETYPES[arch])
    keys = [("hp","hp"),("atk","atk"),("def","df"),("spa","spa"),("spd","spd"),("spe","spe")]
    if cid:
        h = hashlib.sha256(cid.encode()).digest()
        for i, (_, wk) in enumerate(keys):
            w[wk] *= 1.0 + ((h[i] / 255.0) - 0.5) * 0.16
    total = sum(w.values())
    raw = {k: bst * w[wk] / total for k, wk in keys}
    out = {k: max(15, int(round(v))) for k, v in raw.items()}
    diff = bst - sum(out.values())
    order = sorted(out, key=lambda k: -out[k])
    i = 0
    while diff != 0:
        k = order[i % len(order)]
        step = 1 if diff > 0 else -1
        if out[k] + step >= 15:
            out[k] += step
            diff -= step
        i += 1
    return out

EV_FOR = {"hp":"hp","atk":"atk","def":"def","spa":"spa","spd":"spd","spe":"spe"}

def ev_yield(st, stage):
    best = max(st, key=lambda k: st[k])
    return {EV_FOR[best]: stage}

# --------------------------------------------------------------------------
# Kreaturendefinitionen
# --------------------------------------------------------------------------
SPECIES = []
DEX = [1]

def C(cid, name, category, types, bst, arch, rig, cfg, palette, abilities, hidden,
      capture, growth, gender, h, w, friendship, evos, entry, habitat,
      giga=False, giga_move=None, cry=None, stage=1, max_level=100, field_scale=None,
      hover=None, idle=None):
    st = stats(bst, arch, cid)
    model = {"rig": rig, "palette": palette, "parts": rigs.build(rig, cfg)}
    if cfg.get("modelScale"): model["scale"] = cfg["modelScale"]
    if hover is not None: model["hover"] = hover
    if idle is not None: model["idleSpeed"] = idle
    d = {
        "id": cid, "dex": DEX[0], "name": name, "category": category,
        "types": list(types), "baseStats": st, "abilities": list(abilities),
        "captureRate": capture, "baseExp": int(round(bst * 0.32)),
        "growthRate": growth, "genderRatio": gender,
        "heightM": h, "weightKg": w,
        "evYield": ev_yield(st, stage), "baseFriendship": friendship,
        "learnset": build_learnset(cid, types, stage, max_level),
        "tmMoves": build_tms(types),
        "evolutions": evos, "dexEntry": entry,
        "canGigantic": giga, "habitat": list(habitat), "model": model,
    }
    if hidden: d["hiddenAbility"] = hidden
    if giga_move: d["giganticMove"] = giga_move
    if field_scale: d["fieldScale"] = field_scale
    if cry: d["cry"] = cry
    SPECIES.append(d)
    DEX[0] += 1
    return d

def pal(primary, secondary, accent, dark="#2a2320", light="#f3efe6",
        eye="#fbfbf7", pupil="#22201d", glow=None):
    p = {"primary": primary, "secondary": secondary, "accent": accent,
         "dark": dark, "light": light, "eye": eye, "pupil": pupil}
    if glow: p["glow"] = glow
    return p

def ev_level(to, lvl): return [{"to": to, "method": {"kind": "level", "level": lvl}}]
def ev_item(to, item): return [{"to": to, "method": {"kind": "item", "item": item}}]
def ev_friend(to): return [{"to": to, "method": {"kind": "friendship", "min": 200}}]
def ev_night(to, lvl): return [{"to": to, "method": {"kind": "levelNight", "level": lvl}}]
def ev_day(to, lvl): return [{"to": to, "method": {"kind": "levelDay", "level": lvl}}]
def ev_area(to, lvl, area): return [{"to": to, "method": {"kind": "area", "level": lvl, "area": area}}]

# ============================ STARTER: PFLANZE ============================
C("sprossling", "Sprossling", "Keimling", ["grass"], 318, "balanced", "quadruped",
  dict(body=(0.26,0.22,0.36), legLen=0.18, legR=0.075, head=(0.23,0.21,0.22),
       snout=(0.09,0.07,0.11), ears=(0.07,0.15,0.07), earColor="secondary",
       tail=(0.05,0.05,0.2), tailTip=(0.09,0.09,0.09), tailTipColor="secondary",
       paws=True, chest=True),
  pal("#7bc46b", "#4e8f46", "#e3d089"), ["wildwuchs"], "duftlockung",
  45, "mediumSlow", 0.875, 0.4, 6.2, 70, ev_level("blattbock", 16),
  "Auf seinem Ruecken waechst ein Blatttrieb, der bei Sonnenlicht Energie sammelt.",
  ["grassland","forest"], cry={"baseHz": 520, "kind": "chirp"}, stage=1)

C("blattbock", "Blattbock", "Hainhueter", ["grass"], 420, "physical", "quadruped",
  dict(body=(0.38,0.32,0.55), legLen=0.3, legR=0.11, head=(0.32,0.3,0.32),
       snout=(0.12,0.1,0.16), horns=(0.06,0.26,0.06), hornColor="secondary",
       ears=(0.08,0.16,0.08), tail=(0.07,0.07,0.34), tailTip=(0.12,0.12,0.12),
       tailTipColor="secondary", paws=True, chest=True),
  pal("#66b25c", "#3d7a38", "#dcc470"), ["wildwuchs"], "duftlockung",
  45, "mediumSlow", 0.875, 1.0, 28.5, 70, ev_level("forstwaechter", 34),
  "Die Blattkrone auf seinem Kopf faerbt sich mit den Jahreszeiten.",
  ["forest"], cry={"baseHz": 380, "kind": "growl"}, stage=2)

C("forstwaechter", "Forstwaechter", "Waldwaechter", ["grass","fighting"], 534, "bruiser", "biped",
  dict(body=(0.42,0.5,0.36), legLen=0.55, legR=0.16, head=(0.33,0.32,0.33),
       snout=(0.11,0.09,0.14), horns=(0.07,0.36,0.07), hornColor="secondary",
       armLen=0.62, armR=0.13, hands=True, chest=True,
       tail=(0.08,0.08,0.42), tailTip=(0.14,0.14,0.14), tailTipColor="secondary",
       crest=(0.14,0.3,0.14), crestColor="secondary"),
  pal("#4f9d49", "#2f6b2e", "#d4b95f"), ["wildwuchs"], "kampfeswille",
  45, "mediumSlow", 0.875, 1.9, 96.0, 70, [],
  "Es verteidigt seinen Wald mit Faeusten, die Baumstaemme spalten.",
  ["forest"], giga=True, giga_move="gmax_grass",
  cry={"baseHz": 250, "kind": "roar"}, stage=3, field_scale=1.15)

# ============================ STARTER: FEUER ============================
C("glutkitz", "Glutkitz", "Funkenkitz", ["fire"], 318, "speedster", "quadruped",
  dict(body=(0.24,0.21,0.34), legLen=0.2, legR=0.07, head=(0.22,0.2,0.21),
       snout=(0.09,0.07,0.12), ears=(0.08,0.18,0.05), earShape="cone",
       tail=(0.05,0.05,0.24), tailTip=(0.1,0.13,0.1), tailTipColor="glow",
       tailTipShape="cone", tailTipGlow=0.9, paws=True),
  pal("#ef8043", "#c1502a", "#ffd86b", glow="#ffb03a"), ["lodernd"], "gluthaut",
  45, "mediumSlow", 0.875, 0.5, 8.1, 70, ev_level("flammenbock", 16),
  "Die Flamme an seiner Schweifspitze zeigt seine Stimmung an.",
  ["grassland","volcanic"], cry={"baseHz": 560, "kind": "chirp"}, stage=1)

C("flammenbock", "Flammenbock", "Glutbock", ["fire"], 420, "speedster", "quadruped",
  dict(body=(0.34,0.3,0.5), legLen=0.34, legR=0.1, head=(0.3,0.27,0.3),
       snout=(0.12,0.1,0.17), ears=(0.09,0.22,0.06), horns=(0.05,0.2,0.05),
       hornColor="glow", tail=(0.06,0.06,0.36), tailTip=(0.13,0.18,0.13),
       tailTipColor="glow", tailTipShape="cone", tailTipGlow=1.0, paws=True, chest=True),
  pal("#e56f35", "#a83f20", "#ffcf5c", glow="#ff9b2a"), ["lodernd"], "gluthaut",
  45, "mediumSlow", 0.875, 1.1, 31.0, 70, ev_level("infernohorn", 34),
  "Sein Galopp hinterlaesst versengte Spuren im Gras.",
  ["volcanic","grassland"], cry={"baseHz": 400, "kind": "growl"}, stage=2)

C("infernohorn", "Infernohorn", "Lohenfuerst", ["fire","dark"], 534, "physical", "biped",
  dict(body=(0.4,0.48,0.34), legLen=0.58, legR=0.15, head=(0.31,0.3,0.31),
       snout=(0.11,0.09,0.15), horns=(0.08,0.42,0.08), hornColor="glow",
       armLen=0.6, armR=0.12, hands=True, chest=True, crest=(0.12,0.34,0.12),
       crestColor="glow", tail=(0.08,0.08,0.46), tailTip=(0.16,0.22,0.16),
       tailTipColor="glow", tailTipShape="cone", tailTipGlow=1.0),
  pal("#d85c2c", "#7a2418", "#ffc148", dark="#241612", glow="#ff8420"), ["lodernd"], "einschuechtern",
  45, "mediumSlow", 0.875, 1.8, 88.0, 70, [],
  "In der Dunkelheit gluehen seine Hoerner wie geschmolzenes Eisen.",
  ["volcanic"], giga=True, giga_move="gmax_fire",
  cry={"baseHz": 220, "kind": "roar"}, stage=3, field_scale=1.12)

# ============================ STARTER: WASSER ============================
C("tropfling", "Tropfling", "Quellwesen", ["water"], 318, "specWall", "blob",
  dict(radius=0.26, squash=0.92, mouth=(0.07,0.05,0.04), footR=0.09,
       blobs=[{"pos":[0,0.52,-0.08],"size":[0.12,0.1,0.12],"color":"secondary"}]),
  pal("#63b6e0", "#3b7ea8", "#d7f0ff"), ["sturzbach"], "regenhaut",
  45, "mediumSlow", 0.875, 0.4, 7.4, 70, ev_level("wellenotter", 16),
  "Sein Koerper besteht zu grossen Teilen aus lebendigem Quellwasser.",
  ["wetland","coastal"], cry={"baseHz": 600, "kind": "trill"}, stage=1)

C("wellenotter", "Wellenotter", "Flussjaeger", ["water"], 420, "balanced", "quadruped",
  dict(body=(0.32,0.28,0.52), legLen=0.24, legR=0.095, head=(0.28,0.26,0.28),
       snout=(0.11,0.09,0.16), ears=(0.06,0.09,0.06), tail=(0.08,0.06,0.4),
       tailShape="box", tailTip=(0.12,0.06,0.14), tailTipColor="secondary",
       paws=True, chest=True),
  pal("#4f9ecd", "#2f6b91", "#c8e8f7"), ["sturzbach"], "regenhaut",
  45, "mediumSlow", 0.875, 1.0, 26.8, 70, ev_level("fluthueter", 34),
  "Mit seinem flachen Schweif steuert es selbst reissende Stroemungen.",
  ["wetland","coastal","lake"], cry={"baseHz": 430, "kind": "trill"}, stage=2)

C("fluthueter", "Fluthueter", "Gezeitenhueter", ["water","psychic"], 534, "special", "biped",
  dict(body=(0.38,0.46,0.33), legLen=0.5, legR=0.14, head=(0.32,0.31,0.32),
       snout=(0.1,0.08,0.13), armLen=0.58, armR=0.12, hands=True, chest=True,
       crest=(0.16,0.34,0.16), crestColor="accent",
       tail=(0.1,0.07,0.48), tailTip=(0.17,0.08,0.2), tailTipColor="accent"),
  pal("#3f8fc4", "#22587f", "#a7e6ff"), ["sturzbach"], "wasserschlund",
  45, "mediumSlow", 0.875, 1.7, 79.5, 70, [],
  "Es spuert Gezeiten voraus und warnt Fischer vor kommenden Stuermen.",
  ["coastal","lake"], giga=True, giga_move="gmax_water",
  cry={"baseHz": 300, "kind": "hum"}, stage=3, field_scale=1.1)

# --------------------------------------------------------------------------
# Kompakte Bauplan-Vorlagen: skalieren eine Standardform auf die Zielgroesse
# --------------------------------------------------------------------------
def qcfg(s, **kw):
    """Vierbeiner-Vorlage, s = Skalierungsfaktor (1.0 ~ 1 m Schulterhoehe)."""
    c = dict(body=(0.32*s,0.28*s,0.48*s), legLen=0.28*s, legR=0.095*s,
             head=(0.28*s,0.26*s,0.28*s), snout=(0.11*s,0.09*s,0.15*s),
             tail=(0.07*s,0.07*s,0.34*s), paws=True, chest=True)
    c.update(kw); return c

def bcfg(s, **kw):
    """Zweibeiner-Vorlage."""
    c = dict(body=(0.34*s,0.42*s,0.3*s), legLen=0.42*s, legR=0.13*s,
             head=(0.3*s,0.29*s,0.3*s), armLen=0.5*s, armR=0.11*s,
             hands=True, chest=True)
    c.update(kw); return c

def fcfg(s, **kw):
    """Flieger-Vorlage."""
    c = dict(body=(0.26*s,0.28*s,0.34*s), baseY=0.7*s, head=(0.22*s,0.22*s,0.22*s),
             wings=(0.48*s,0.05*s,0.32*s), beak=(0.06*s,0.16*s,0.06*s),
             tail=(0.16*s,0.04*s,0.3*s), legLen=0.2*s, legR=0.035*s)
    c.update(kw); return c

def icfg(s, **kw):
    """Insekten-Vorlage."""
    c = dict(body=(0.24*s,0.2*s,0.4*s), legLen=0.22*s, legR=0.028*s,
             head=(0.19*s,0.18*s,0.19*s), antennae=(0.018*s,0.16*s,0.018*s),
             mandibles=(0.045*s,0.11*s,0.045*s))
    c.update(kw); return c

def scfg(s, **kw):
    """Schlangen-Vorlage."""
    c = dict(radius=0.26*s, segments=8, step=0.32*s, head=(0.25*s,0.23*s,0.3*s),
             snout=(0.08*s,0.14*s,0.08*s), tailTip=(0.08*s,0.2*s,0.08*s))
    c.update(kw); return c

def acfg(s, **kw):
    """Wasserform-Vorlage."""
    c = dict(body=(0.24*s,0.24*s,0.48*s), baseY=0.62*s, head=(0.2*s,0.2*s,0.2*s),
             dorsal=(0.05*s,0.26*s,0.3*s), sideFins=(0.24*s,0.05*s,0.16*s),
             tailFin=(0.3*s,0.34*s,0.08*s))
    c.update(kw); return c

def ocfg(s, **kw):
    """Rundform-Vorlage."""
    c = dict(radius=0.32*s, squash=0.9, mouth=(0.07*s,0.05*s,0.04*s), footR=0.1*s)
    c.update(kw); return c

def xcfg(s, **kw):
    """Schwebeform-Vorlage."""
    c = dict(radius=0.3*s, baseY=1.1*s, veil=(0.34*s,0.5*s,0.34*s))
    c.update(kw); return c

# ======================= ROUTE-KREATUREN: FRUEHE STUFEN ===================
C("nagezahn", "Nagezahn", "Nagetier", ["normal"], 258, "speedster", "quadruped",
  qcfg(0.55, ears=(0.06,0.13,0.05), earColor="secondary", tail=(0.04,0.04,0.22),
       tailTip=(0.06,0.06,0.06), tailTipColor="secondary"),
  pal("#b79a74", "#8a6f4e", "#e8d9bd"), ["kampfeswille"], "wachsamkeit",
  255, "mediumFast", 0.5, 0.3, 3.6, 70, ev_level("bissnager", 18),
  "Seine Nagezaehne wachsen lebenslang nach und muessen staendig abgewetzt werden.",
  ["grassland","urban"], cry={"baseHz": 700, "kind": "chirp"}, stage=1)

C("bissnager", "Bissnager", "Beisser", ["normal"], 418, "physical", "quadruped",
  qcfg(0.85, ears=(0.08,0.18,0.06), earColor="secondary", horns=None,
       tail=(0.06,0.06,0.32), tailTip=(0.09,0.09,0.09), tailTipColor="secondary"),
  pal("#9b7d59", "#6d5437", "#ddc9a6"), ["kampfeswille"], "einschuechtern",
  127, "mediumFast", 0.5, 0.8, 22.5, 70, [],
  "Es verteidigt sein Revier gegen jeden Eindringling, egal wie gross.",
  ["grassland","urban"], cry={"baseHz": 430, "kind": "growl"}, stage=2)

C("federflaum", "Federflaum", "Kleinvogel", ["normal","flying"], 262, "speedster", "flyer",
  fcfg(0.6, crest=(0.06,0.12,0.06), crestColor="accent"),
  pal("#cfd8e6", "#8fa3bd", "#e8b03b", light="#fff6e0"), ["kampfeswille"], "zielsicher",
  255, "mediumSlow", 0.5, 0.3, 1.9, 70, ev_level("windschwinge", 18),
  "Ein alltaeglicher Anblick ueber Feldern - flink, neugierig und laut.",
  ["grassland","urban","forest"], cry={"baseHz": 820, "kind": "chirp"}, stage=1)

C("windschwinge", "Windschwinge", "Gleiter", ["normal","flying"], 400, "speedster", "flyer",
  fcfg(0.95, crest=(0.08,0.2,0.08), crestColor="accent"),
  pal("#b6c3d6", "#71869f", "#e8a33b", light="#fff6e0"), ["kampfeswille"], "zielsicher",
  120, "mediumSlow", 0.5, 0.9, 15.4, 70, ev_level("sturmaar", 36),
  "Es nutzt Aufwinde so geschickt, dass es stundenlang nicht schlagen muss.",
  ["grassland","mountain"], cry={"baseHz": 620, "kind": "screech"}, stage=2)

C("sturmaar", "Sturmaar", "Sturmjaeger", ["normal","flying"], 512, "physical", "flyer",
  fcfg(1.5, crest=(0.12,0.34,0.12), crestColor="accent"),
  pal("#93a3ba", "#4d6076", "#e08a23", light="#fff0d0"), ["einschuechtern"], "zielsicher",
  45, "mediumSlow", 0.5, 1.6, 42.0, 70, [],
  "Sein Ruf kuendigt Unwetter an; Seefahrer kehren dann sofort um.",
  ["mountain","coastal"], giga=True, giga_move="gmax_flying",
  cry={"baseHz": 380, "kind": "screech"}, stage=3, field_scale=1.2)

C("kribbelkaefer", "Kribbelkaefer", "Krabbler", ["bug"], 224, "balanced", "insectoid",
  icfg(0.55, wings=None, stinger=None),
  pal("#9bc44b", "#6d8f2f", "#d8e89b"), ["schwarmkraft"], "dornenhaut",
  255, "mediumFast", 0.5, 0.3, 3.2, 70, ev_level("puppenpanzer", 9),
  "Es frisst rund um die Uhr Blaetter, um schnell zu verpuppen.",
  ["forest","meadow"], cry={"baseHz": 900, "kind": "chirp"}, stage=1)

C("puppenpanzer", "Puppenpanzer", "Kokon", ["bug"], 290, "tank", "blob",
  ocfg(0.7, squash=1.25, mouth=None, footR=0.06),
  pal("#c2c26b", "#8f8f3f", "#e8e8bd"), ["robustheit"], None,
  120, "mediumFast", 0.5, 0.6, 9.8, 70, ev_level("klingenkaefer", 20),
  "Waehrend der Verwandlung haertet sein Panzer zu Metall aus.",
  ["forest"], cry={"baseHz": 300, "kind": "hum"}, stage=2)

C("klingenkaefer", "Klingenkaefer", "Klingenwesen", ["bug","steel"], 465, "physical", "insectoid",
  icfg(1.1, wings=(0.34,0.02,0.24), wingOpacity=0.45, stinger=(0.06,0.2,0.06),
       mandibles=(0.07,0.2,0.07), shellColor="accent"),
  pal("#7f9b4b", "#4e6b2b", "#b8c4cf"), ["schwarmkraft"], "dickpanzer",
  45, "mediumFast", 0.5, 1.3, 39.5, 70, [],
  "Seine Kieferklingen schneiden muehelos durch Eisenrohre.",
  ["forest","industrial"], cry={"baseHz": 420, "kind": "screech"}, stage=3)

C("knollknospe", "Knollknospe", "Knospe", ["grass"], 250, "specWall", "blob",
  ocfg(0.6, blobs=[{"pos":[0,0.62,0],"size":[0.13,0.17,0.13],"color":"secondary"}]),
  pal("#8fc46b", "#d86b9b", "#e8d89b"), ["wildwuchs"], "immunsystem",
  235, "mediumSlow", 0.5, 0.3, 4.1, 70, ev_level("bluetenherz", 21),
  "Die Knospe auf seinem Kopf oeffnet sich nur bei voller Zuneigung.",
  ["meadow","grassland"], cry={"baseHz": 640, "kind": "trill"}, stage=1)

C("bluetenherz", "Bluetenherz", "Bluetenwesen", ["grass","fairy"], 448, "special", "biped",
  bcfg(0.85, crest=(0.2,0.22,0.2), crestColor="accent", ears=(0.07,0.14,0.07)),
  pal("#7fb85c", "#e07fb0", "#ffe27f"), ["wildwuchs"], "robustheit",
  75, "mediumSlow", 0.25, 1.0, 18.6, 90, [],
  "Der Duft seiner Bluete beruhigt selbst aufgebrachte Kreaturen.",
  ["meadow"], cry={"baseHz": 520, "kind": "trill"}, stage=2)

C("funkenfell", "Funkenfell", "Blitznager", ["electric"], 268, "speedster", "quadruped",
  qcfg(0.5, ears=(0.07,0.17,0.05), earColor="accent",
       tail=(0.05,0.05,0.24), tailTip=(0.1,0.12,0.06), tailTipColor="glow",
       tailTipShape="cone", tailTipGlow=0.9),
  pal("#f2d24b", "#c9a022", "#3b3320", glow="#fff08a"), ["statikfeld"], "blitzfaenger",
  190, "mediumFast", 0.5, 0.4, 5.8, 70, ev_level("voltnager", 20),
  "Bei Aufregung springen Funken zwischen seinen Backentaschen ueber.",
  ["grassland","forest"], cry={"baseHz": 760, "kind": "chirp"}, stage=1)

C("voltnager", "Voltnager", "Hochspannung", ["electric"], 445, "special", "biped",
  bcfg(0.8, ears=(0.08,0.22,0.06), earColor="accent",
       tail=(0.07,0.07,0.36), tailTip=(0.13,0.16,0.08), tailTipColor="glow",
       tailTipShape="cone", tailTipGlow=1.0),
  pal("#e8c63b", "#b88f1a", "#3b3320", glow="#fff5a0"), ["statikfeld"], "hochspannung",
  75, "mediumFast", 0.5, 1.0, 24.2, 70, [],
  "Ein einziger Sprung von ihm kann ein ganzes Umspannwerk lahmlegen.",
  ["grassland","industrial"], giga=True, giga_move="gmax_electric",
  cry={"baseHz": 500, "kind": "screech"}, stage=2)

C("glutkohle", "Glutkohle", "Kohlewesen", ["fire"], 256, "tank", "blob",
  ocfg(0.62, blobs=[{"pos":[0,0.68,0],"size":[0.12,0.16,0.12],"color":"glow","emissive":0.9}]),
  pal("#5b4a44", "#3b302c", "#ff8f3b", glow="#ffa83b"), ["lodernd"], "hitzeresistenz",
  190, "mediumFast", 0.5, 0.4, 12.5, 70, ev_level("aschebrand", 22),
  "Im Inneren glimmt seit Jahrhunderten dieselbe Glut.",
  ["volcanic","cave"], cry={"baseHz": 340, "kind": "hum"}, stage=1)

C("aschebrand", "Aschebrand", "Schlotwesen", ["fire"], 452, "special", "biped",
  bcfg(0.95, crest=(0.14,0.26,0.14), crestColor="glow", hands=True),
  pal("#4d3f39", "#2e2724", "#ff7f2b", glow="#ff9b2b"), ["lodernd"], "hitzeresistenz",
  75, "mediumFast", 0.5, 1.3, 48.0, 70, [],
  "Aus den Schloten auf seinem Ruecken steigt bestaendig heisse Asche.",
  ["volcanic","industrial"], cry={"baseHz": 280, "kind": "growl"}, stage=2)

C("kieselkopf", "Kieselkopf", "Geroellwesen", ["rock"], 262, "tank", "blob",
  ocfg(0.66, squash=0.98, bodyShape="dodeca"),
  pal("#9b9184", "#6d6459", "#c4bbaa"), ["dickpanzer"], "sandschleuder",
  230, "mediumSlow", 0.5, 0.4, 26.0, 70, ev_level("felsbrocken", 22),
  "Es rollt Haenge hinab und waechst dabei durch anhaftendes Geroell.",
  ["rocky","cave","mountain"], cry={"baseHz": 260, "kind": "growl"}, stage=1)

C("felsbrocken", "Felsbrocken", "Blockwesen", ["rock","ground"], 412, "tank", "blob",
  ocfg(1.05, squash=0.96, bodyShape="dodeca"),
  pal("#8a8075", "#5c544a", "#b5ab99"), ["dickpanzer"], "sandschleuder",
  120, "mediumSlow", 0.5, 1.1, 128.0, 70, ev_level("bergkoloss", 38),
  "Sein Koerper besteht aus verdichtetem Gestein mehrerer Erdzeitalter.",
  ["rocky","mountain"], cry={"baseHz": 190, "kind": "growl"}, stage=2)

C("bergkoloss", "Bergkoloss", "Gebirgswacht", ["rock","ground"], 528, "tank", "biped",
  bcfg(1.5, bodyShape="dodeca", headShape="dodeca", hands=True,
       horns=(0.1,0.3,0.1), hornColor="light"),
  pal("#7a7168", "#4d453d", "#a89e8b"), ["dickpanzer"], "sandaufwirbler",
  45, "mediumSlow", 0.5, 2.6, 420.0, 70, [],
  "Schlafend ist es von einem echten Felsvorsprung kaum zu unterscheiden.",
  ["mountain"], giga=True, giga_move="gmax_rock",
  cry={"baseHz": 140, "kind": "roar"}, stage=3, field_scale=1.35)

# ======================= MITTLERE ROUTEN / HOEHLEN =======================
C("schlammlurch", "Schlammlurch", "Moorwesen", ["water","ground"], 290, "tank", "quadruped",
  qcfg(0.6, bodyShape="sphere", tail=(0.06,0.05,0.26), tailShape="box"),
  pal("#6b8f7a", "#47604f", "#c4b88f"), ["sturzbach"], "regenhaut",
  190, "mediumFast", 0.5, 0.4, 11.2, 70, ev_level("sumpfhueter", 24),
  "Es verbirgt sich im Moor und atmet ueber die feuchte Haut.",
  ["wetland"], cry={"baseHz": 380, "kind": "growl"}, stage=1)

C("sumpfhueter", "Sumpfhueter", "Moorwacht", ["water","ground"], 478, "bulkyMixed", "biped",
  bcfg(1.15, hands=True, crest=(0.14,0.18,0.14), crestColor="accent"),
  pal("#5c8069", "#36503f", "#b8ab7f"), ["sturzbach"], "regenhaut",
  60, "mediumFast", 0.5, 1.5, 78.0, 70, [],
  "Es haelt das Gleichgewicht der Moore, indem es Zufluesse aufstaut.",
  ["wetland"], giga=True, giga_move="gmax_water",
  cry={"baseHz": 240, "kind": "roar"}, stage=2)

C("nachtschleier", "Nachtschleier", "Schemen", ["ghost"], 285, "glass", "floater",
  xcfg(0.75, orbs=[{"pos":[0.3,1.35,0],"size":[0.07,0.07,0.07],"emissive":0.9},
                   {"pos":[-0.3,1.2,0.1],"size":[0.055,0.055,0.055],"emissive":0.9}],
       opacity=0.82, veilOpacity=0.7),
  pal("#6b5b8f", "#463b63", "#c4b0ff", glow="#d8c0ff"), ["wachsamkeit"], "arenafalle",
  190, "mediumSlow", 0.5, 0.7, 1.2, 60, ev_night("geisterfuerst", 32),
  "Wer es anblickt, erinnert sich am naechsten Morgen an nichts mehr.",
  ["cave","ruins"], hover=0.55, cry={"baseHz": 300, "kind": "hum"}, stage=1)

C("geisterfuerst", "Geisterfuerst", "Nachtfuerst", ["ghost","dark"], 495, "special", "floater",
  xcfg(1.25, arms=(0.06,0.28,0.06), armColor="secondary",
       orbs=[{"pos":[0.46,1.9,0],"size":[0.09,0.09,0.09],"emissive":1.0},
             {"pos":[-0.46,1.7,0.1],"size":[0.075,0.075,0.075],"emissive":1.0}],
       opacity=0.86, veilOpacity=0.75),
  pal("#54467f", "#2e2547", "#b09bff", glow="#c4a8ff"), ["arenafalle"], "einschuechtern",
  45, "mediumSlow", 0.5, 1.6, 3.4, 60, [],
  "Es herrscht ueber die Schatten alter Ruinen und duldet keine Eindringlinge.",
  ["ruins","cave"], giga=True, giga_move="gmax_ghost", hover=0.9,
  cry={"baseHz": 190, "kind": "hum"}, stage=2)

C("giftkappe", "Giftkappe", "Sporenwesen", ["poison","grass"], 275, "specWall", "blob",
  ocfg(0.6, blobs=[{"pos":[0,0.6,0],"size":[0.28,0.12,0.28],"color":"secondary"}]),
  pal("#c2b0d8", "#8f4bb0", "#e8d8ff"), ["immunsystem"], "dornenhaut",
  190, "mediumFast", 0.5, 0.4, 6.8, 70, ev_level("sporenherr", 26),
  "Der Hut auf seinem Kopf verstreut bei Gefahr betaeubende Sporen.",
  ["forest","cave"], cry={"baseHz": 420, "kind": "hum"}, stage=1)

C("sporenherr", "Sporenherr", "Pilzfuerst", ["poison","grass"], 462, "bulkyMixed", "biped",
  bcfg(1.0, crest=(0.3,0.16,0.3), crestColor="secondary", hands=True),
  pal("#b09bc9", "#7a2f9b", "#e0cfff"), ["immunsystem"], "dornenhaut",
  75, "mediumFast", 0.5, 1.4, 39.0, 70, [],
  "Sein Sporennetz durchzieht ganze Waelder unter der Erde.",
  ["forest"], cry={"baseHz": 260, "kind": "growl"}, stage=2)

C("sandwuehler", "Sandwuehler", "Graeber", ["ground"], 280, "physical", "quadruped",
  qcfg(0.6, snout=(0.13,0.1,0.2), tail=(0.06,0.06,0.2)),
  pal("#d8b884", "#a8884f", "#f0e0bd"), ["sandschleuder"], "arenafalle",
  200, "mediumFast", 0.5, 0.5, 12.4, 70, ev_level("duenenklaue", 24),
  "Es graebt Tunnel, die ganze Duenenlandschaften durchziehen.",
  ["desert","rocky"], cry={"baseHz": 440, "kind": "growl"}, stage=1)

C("duenenklaue", "Duenenklaue", "Duenenjaeger", ["ground"], 455, "physical", "biped",
  bcfg(1.05, hands=True, horns=(0.06,0.2,0.06), hornColor="light"),
  pal("#c9a670", "#94743f", "#e8d5aa"), ["sandschleuder"], "arenafalle",
  90, "mediumFast", 0.5, 1.4, 52.0, 70, [],
  "Seine Klauen zerteilen Sandstein wie trockenes Brot.",
  ["desert"], cry={"baseHz": 280, "kind": "roar"}, stage=2)

C("traumkatze", "Traumkatze", "Schlummerwesen", ["psychic"], 292, "special", "quadruped",
  qcfg(0.62, ears=(0.07,0.16,0.05), earColor="accent",
       tail=(0.05,0.05,0.32), tailTip=(0.08,0.08,0.08), tailTipColor="accent"),
  pal("#c9a0d8", "#8f5ba8", "#ffe8b0"), ["wachsamkeit"], "klarblick",
  190, "mediumSlow", 0.5, 0.5, 8.4, 70, ev_night("mondpanther", 30),
  "Sie schlaeft 20 Stunden am Tag und liest dabei die Traeume Vorbeigehender.",
  ["urban","meadow"], cry={"baseHz": 560, "kind": "trill"}, stage=1)

C("mondpanther", "Mondpanther", "Mondjaeger", ["psychic","dark"], 496, "speedster", "quadruped",
  qcfg(1.25, ears=(0.09,0.24,0.06), earColor="accent",
       tail=(0.07,0.07,0.5), tailTip=(0.11,0.11,0.11), tailTipColor="accent",
       horns=(0.04,0.16,0.04), hornColor="accent"),
  pal("#7f5ba8", "#3f2b5c", "#ffd88a"), ["klarblick"], "einschuechtern",
  50, "mediumSlow", 0.5, 1.4, 46.5, 70, [],
  "Im Mondlicht wird sie so schnell, dass das Auge ihr nicht folgen kann.",
  ["meadow","ruins"], cry={"baseHz": 320, "kind": "roar"}, stage=2)

C("frostwelpe", "Frostwelpe", "Eiswelpe", ["ice"], 290, "balanced", "quadruped",
  qcfg(0.58, ears=(0.07,0.14,0.06), tail=(0.07,0.07,0.24), tailTip=(0.1,0.1,0.1),
       tailTipColor="accent"),
  pal("#d8ecf7", "#8fb8d8", "#5b8fb0"), ["frostkern"], "schneeschuh",
  190, "mediumSlow", 0.5, 0.5, 9.6, 70, ev_level("eiswolf", 24),
  "Sein Atem laesst Regentropfen im Flug zu Eis erstarren.",
  ["snow"], cry={"baseHz": 600, "kind": "chirp"}, stage=1)

C("eiswolf", "Eiswolf", "Frostjaeger", ["ice"], 440, "physical", "quadruped",
  qcfg(1.05, ears=(0.08,0.2,0.06), horns=(0.05,0.2,0.05), hornColor="accent",
       tail=(0.08,0.08,0.38), tailTip=(0.12,0.12,0.12), tailTipColor="accent"),
  pal("#c4e0f2", "#6b9bc4", "#3f7799"), ["frostkern"], "schneeschuh",
  75, "mediumSlow", 0.5, 1.2, 44.0, 70, ev_level("gletscherfang", 42),
  "Rudel von ihnen jagen lautlos durch den Schneesturm.",
  ["snow","mountain"], cry={"baseHz": 340, "kind": "roar"}, stage=2)

C("gletscherfang", "Gletscherfang", "Gletscherwacht", ["ice","steel"], 540, "bulkyMixed", "quadruped",
  qcfg(1.55, horns=(0.08,0.34,0.08), hornColor="light", ears=(0.08,0.18,0.06),
       tail=(0.1,0.1,0.5), tailTip=(0.16,0.16,0.16), tailTipColor="light"),
  pal("#a8cfe6", "#4d7d9b", "#c9d8e0"), ["dickpanzer"], "schneetreiber",
  30, "slow", 0.5, 2.2, 265.0, 70, [],
  "Sein Panzer besteht aus Eis, das so alt ist wie der Gletscher selbst.",
  ["snow"], giga=True, giga_move="gmax_ice",
  cry={"baseHz": 170, "kind": "roar"}, stage=3, field_scale=1.3)

C("kampffaust", "Kampffaust", "Ringkaempfer", ["fighting"], 305, "bruiser", "biped",
  bcfg(0.85, hands=True, handColor="accent"),
  pal("#c97f5b", "#8f4f2f", "#e8d8c4"), ["kampfeswille"], "fausthieb",
  180, "mediumFast", 0.75, 0.9, 28.0, 70, ev_level("ringmeister", 28),
  "Es trainiert taeglich gegen Felsen, bis seine Knoechel hart wie Stein sind.",
  ["urban","mountain"], cry={"baseHz": 420, "kind": "growl"}, stage=1)

C("ringmeister", "Ringmeister", "Ringmeister", ["fighting"], 490, "bruiser", "biped",
  bcfg(1.3, hands=True, handColor="accent", crest=(0.1,0.2,0.1), crestColor="secondary"),
  pal("#b56a48", "#70391f", "#e0ccb4"), ["kampfeswille"], "fausthieb",
  60, "mediumFast", 0.75, 1.7, 92.0, 70, [],
  "Es fordert jeden heraus, der stark genug aussieht - und verliert selten.",
  ["urban"], giga=True, giga_move="gmax_fighting",
  cry={"baseHz": 250, "kind": "roar"}, stage=2)

C("feenfunke", "Feenfunke", "Lichtwesen", ["fairy"], 278, "special", "floater",
  xcfg(0.6, orbs=[{"pos":[0.26,1.05,0],"size":[0.05,0.05,0.05],"emissive":1.0},
                  {"pos":[-0.22,0.92,0.12],"size":[0.04,0.04,0.04],"emissive":1.0}],
       veilOpacity=0.8),
  pal("#ffc0e0", "#e08fc4", "#fff0b0", glow="#ffe8ff"), ["robustheit"], "wachsamkeit",
  190, "fast", 0.25, 0.3, 1.1, 100, ev_friend("lichtfee"),
  "Es naehrt sich von froehlichen Gefuehlen und leuchtet dann heller.",
  ["meadow","forest"], hover=0.5, cry={"baseHz": 880, "kind": "trill"}, stage=1)

C("lichtfee", "Lichtfee", "Sternenwesen", ["fairy"], 468, "special", "floater",
  xcfg(1.0, arms=(0.05,0.22,0.05), armColor="secondary",
       orbs=[{"pos":[0.42,1.7,0],"size":[0.07,0.07,0.07],"emissive":1.0},
             {"pos":[-0.38,1.5,0.14],"size":[0.06,0.06,0.06],"emissive":1.0},
             {"pos":[0.05,2.0,-0.1],"size":[0.05,0.05,0.05],"emissive":1.0}]),
  pal("#ffb0d8", "#d87fb8", "#fff0a0", glow="#fff0ff"), ["robustheit"], "klarblick",
  60, "fast", 0.25, 1.1, 6.4, 100, [],
  "In klaren Naechten tanzen ganze Schwaerme ueber den Bergseen.",
  ["meadow"], giga=True, giga_move="gmax_fairy", hover=0.85,
  cry={"baseHz": 700, "kind": "trill"}, stage=2)

C("schattenwolf", "Schattenwolf", "Schattenjaeger", ["dark"], 300, "speedster", "quadruped",
  qcfg(0.7, ears=(0.08,0.18,0.06), tail=(0.07,0.07,0.34),
       tailTip=(0.1,0.1,0.1), tailTipColor="accent"),
  pal("#4b4457", "#2b2733", "#c46b4b"), ["einschuechtern"], "wachsamkeit",
  180, "mediumFast", 0.5, 0.7, 17.0, 70, ev_night("nachtwolf", 30),
  "Es jagt nur bei Neumond und verschwindet bei Tagesanbruch spurlos.",
  ["forest","ruins"], cry={"baseHz": 400, "kind": "growl"}, stage=1)

C("nachtwolf", "Nachtwolf", "Rudelfuerst", ["dark"], 492, "physical", "quadruped",
  qcfg(1.3, ears=(0.1,0.24,0.07), horns=(0.05,0.18,0.05), hornColor="accent",
       tail=(0.09,0.09,0.48), tailTip=(0.13,0.13,0.13), tailTipColor="accent"),
  pal("#3b3547", "#201d28", "#d8734f"), ["einschuechtern"], "siegesrausch",
  50, "mediumFast", 0.5, 1.5, 58.0, 70, [],
  "Sein Heulen sammelt binnen Minuten ein ganzes Rudel um sich.",
  ["forest","ruins"], giga=True, giga_move="gmax_dark",
  cry={"baseHz": 230, "kind": "roar"}, stage=2)

C("flatterling", "Flatterling", "Falter", ["bug","flying"], 270, "speedster", "insectoid",
  icfg(0.6, wings=(0.42,0.02,0.3), wingOpacity=0.6, stinger=None, mandibles=None),
  pal("#e0a0c9", "#b06b9b", "#fff0d8"), ["schwarmkraft"], "zielsicher",
  190, "mediumFast", 0.5, 0.4, 2.1, 70, ev_level("falterglanz", 25),
  "Der Staub seiner Fluegel schimmert in allen Farben des Regenbogens.",
  ["meadow","forest"], hover=0.35, cry={"baseHz": 820, "kind": "trill"}, stage=1)

C("falterglanz", "Falterglanz", "Prachtfalter", ["bug","flying"], 462, "special", "insectoid",
  icfg(1.15, wings=(0.62,0.02,0.44), wingOpacity=0.66, stinger=None,
       mandibles=None, antennae=(0.02,0.22,0.02)),
  pal("#d88fc4", "#9b4f8f", "#fff0c4"), ["schwarmkraft"], "zielsicher",
  60, "mediumFast", 0.5, 1.1, 9.8, 70, [],
  "Seine Fluegelmuster wirken auf Angreifer hypnotisch.",
  ["meadow"], hover=0.6, cry={"baseHz": 620, "kind": "trill"}, stage=2)

# ===================== EINZELARTEN / SPEZIALGEBIETE ======================
C("quallenlicht", "Quallenlicht", "Leuchtqualle", ["water","electric"], 420, "special", "floater",
  xcfg(1.0, veil=(0.42,0.7,0.42), veilOpacity=0.55, opacity=0.75,
       orbs=[{"pos":[0.2,1.2,0.18],"size":[0.05,0.05,0.05],"emissive":1.0},
             {"pos":[-0.24,1.15,-0.14],"size":[0.05,0.05,0.05],"emissive":1.0}]),
  pal("#7fd8e0", "#4b9bb0", "#fff08a", glow="#a0ffff"), ["blitzfaenger"], "regenhaut",
  60, "slow", 0.5, 1.2, 22.0, 70, [],
  "Nachts erhellen ganze Schwaerme die Buchten wie ein zweiter Sternenhimmel.",
  ["coastal","lake"], hover=0.7, cry={"baseHz": 520, "kind": "hum"}, stage=2)

C("korallenherz", "Korallenherz", "Riffwesen", ["water","rock"], 415, "specWall", "blob",
  ocfg(1.0, squash=1.0, bodyShape="dodeca",
       blobs=[{"pos":[0.2,0.85,0.08],"size":[0.09,0.22,0.09],"color":"accent"},
              {"pos":[-0.16,0.78,-0.1],"size":[0.08,0.18,0.08],"color":"accent"}]),
  pal("#e08f9b", "#b05b6b", "#ffd8c4"), ["dickpanzer"], "sturzbach",
  60, "slow", 0.5, 1.0, 68.0, 70, [],
  "Ueber Jahrzehnte waechst es fest und bildet ganze Riffe.",
  ["coastal"], cry={"baseHz": 300, "kind": "hum"}, stage=2)

C("lavagnom", "Lavagnom", "Schlackewesen", ["fire","rock"], 300, "tank", "biped",
  bcfg(0.75, bodyShape="dodeca", headShape="dodeca", hands=True),
  pal("#6b4438", "#3b241d", "#ff7326", glow="#ff8f2b"), ["hitzeresistenz"], "dickpanzer",
  120, "mediumSlow", 0.5, 0.7, 32.0, 70, ev_level("magmaherr", 32),
  "Aus den Rissen seiner Haut quillt langsam fliessende Lava.",
  ["volcanic","cave"], cry={"baseHz": 300, "kind": "growl"}, stage=1)

C("magmaherr", "Magmaherr", "Schmelzfuerst", ["fire","rock"], 510, "bruiser", "biped",
  bcfg(1.4, bodyShape="dodeca", headShape="dodeca", hands=True,
       horns=(0.08,0.26,0.08), hornColor="glow"),
  pal("#5b382e", "#2b1a15", "#ff6b1a", glow="#ff8a1a"), ["hitzeresistenz"], "duerreherz",
  45, "mediumSlow", 0.5, 2.1, 210.0, 70, [],
  "Wo es steht, verwandelt sich der Boden binnen Minuten in Glas.",
  ["volcanic"], giga=True, giga_move="gmax_fire",
  cry={"baseHz": 160, "kind": "roar"}, stage=2, field_scale=1.25)

C("wolkenlamm", "Wolkenlamm", "Wolkenwesen", ["fairy","flying"], 402, "specWall", "quadruped",
  qcfg(0.85, bodyShape="sphere", ears=(0.07,0.14,0.06), tail=(0.08,0.08,0.16),
       tailTip=(0.12,0.12,0.12), tailTipColor="light"),
  pal("#f2f0ff", "#c4c0e0", "#ffd8a0"), ["robustheit"], "regenmacher",
  90, "mediumSlow", 0.5, 0.9, 14.0, 90, [],
  "Sein Vlies saugt Nebel auf und gibt ihn als feinen Regen wieder ab.",
  ["mountain","meadow"], cry={"baseHz": 560, "kind": "trill"}, stage=2)

C("ruestungsigel", "Ruestungsigel", "Panzerwesen", ["steel"], 310, "tank", "quadruped",
  qcfg(0.6, bodyShape="sphere", tail=None, ears=(0.05,0.08,0.05)),
  pal("#a8b0bd", "#6b7380", "#3b3f47"), ["dickpanzer"], "robustheit",
  150, "mediumFast", 0.5, 0.5, 42.0, 70, ev_level("panzerwacht", 30),
  "Seine Stacheln bestehen aus einer Legierung, die kaum rostet.",
  ["cave","industrial"], cry={"baseHz": 380, "kind": "growl"}, stage=1)

C("panzerwacht", "Panzerwacht", "Bollwerk", ["steel"], 495, "tank", "quadruped",
  qcfg(1.25, bodyShape="dodeca", horns=(0.08,0.26,0.08), hornColor="light", tail=None),
  pal("#949daa", "#555d69", "#2b2f36"), ["dickpanzer"], "robustheit",
  45, "mediumFast", 0.5, 1.5, 198.0, 70, [],
  "Es blockiert Bergpfade und laesst nur durch, wen es fuer wuerdig haelt.",
  ["industrial","mountain"], giga=True, giga_move="gmax_steel",
  cry={"baseHz": 200, "kind": "roar"}, stage=2)

C("glockenblume", "Glockenblume", "Lockpflanze", ["grass","poison"], 395, "specWall", "floater",
  xcfg(0.95, veil=(0.4,0.6,0.4), veilColor="primary", veilOpacity=1.0, baseY=0.95),
  pal("#8fc44b", "#c98fd8", "#e8e0a0"), ["immunsystem"], "duftlockung",
  90, "mediumSlow", 0.5, 1.1, 16.5, 70, [],
  "Ihr suesser Duft lockt Beute direkt in den Kelch.",
  ["wetland","forest"], hover=0.15, cry={"baseHz": 440, "kind": "hum"}, stage=2)

C("windfuchs", "Windfuchs", "Boeenfuchs", ["normal"], 298, "speedster", "quadruped",
  qcfg(0.68, ears=(0.08,0.2,0.06), earColor="accent", tail=(0.1,0.1,0.4),
       tailTip=(0.14,0.14,0.14), tailTipColor="light"),
  pal("#e0a86b", "#b07a3f", "#fff0d8"), ["kampfeswille"], "zielsicher",
  190, "mediumFast", 0.5, 0.6, 11.0, 70, ev_level("sturmfuchs", 28),
  "Seine Pfoten beruehren beim Rennen kaum den Boden.",
  ["grassland","meadow"], cry={"baseHz": 620, "kind": "chirp"}, stage=1)

C("sturmfuchs", "Sturmfuchs", "Windfuerst", ["normal","flying"], 480, "speedster", "quadruped",
  qcfg(1.15, ears=(0.1,0.26,0.07), earColor="accent", tail=(0.13,0.13,0.55),
       tailTip=(0.18,0.18,0.18), tailTipColor="light",
       horns=(0.04,0.14,0.04), hornColor="light"),
  pal("#d89b5b", "#9b6733", "#fff0d8"), ["zielsicher"], "kampfeswille",
  60, "mediumFast", 0.5, 1.3, 34.0, 70, [],
  "Es rennt schneller, als der Wind seine Spur verwehen kann.",
  ["grassland","mountain"], cry={"baseHz": 420, "kind": "screech"}, stage=2)

C("tintenschleim", "Tintenschleim", "Schlickwesen", ["poison"], 288, "specWall", "blob",
  ocfg(0.72, squash=0.78, mouth=(0.09,0.06,0.05)),
  pal("#8f5bb0", "#5b2f7a", "#c9a0e0"), ["immunsystem"], "dornenhaut",
  190, "mediumFast", 0.5, 0.6, 22.0, 70, ev_level("schlickmonarch", 30),
  "Es loest Metall auf und ernaehrt sich von den Rueckstaenden.",
  ["industrial","wetland"], cry={"baseHz": 340, "kind": "hum"}, stage=1)

C("schlickmonarch", "Schlickmonarch", "Schlickfuerst", ["poison","dark"], 486, "bulkyMixed", "blob",
  ocfg(1.5, squash=0.8, mouth=(0.16,0.1,0.08),
       blobs=[{"pos":[0.3,1.0,0.1],"size":[0.14,0.14,0.14],"color":"accent"},
              {"pos":[-0.28,0.9,-0.12],"size":[0.12,0.12,0.12],"color":"accent"}]),
  pal("#7a4b9b", "#3f1d5b", "#b88fd8"), ["immunsystem"], "einschuechtern",
  45, "mediumFast", 0.5, 1.8, 124.0, 70, [],
  "Ganze Fabrikhallen wurden schon von seinem Sekret zersetzt.",
  ["industrial"], giga=True, giga_move="gmax_poison",
  cry={"baseHz": 180, "kind": "growl"}, stage=2, field_scale=1.2)

C("kristallmotte", "Kristallmotte", "Frostfalter", ["bug","ice"], 430, "special", "insectoid",
  icfg(1.0, wings=(0.5,0.02,0.36), wingOpacity=0.5, wingColor="accent",
       stinger=None, mandibles=None, shellColor="accent"),
  pal("#b0e0f2", "#6b9bb8", "#e8f7ff"), ["frostkern"], "schneeschuh",
  75, "mediumFast", 0.5, 1.0, 8.2, 70, [],
  "Ihre Fluegel bestehen aus echten Eiskristallen, die nie schmelzen.",
  ["snow"], hover=0.5, cry={"baseHz": 700, "kind": "trill"}, stage=2)

C("donnerhorn", "Donnerhorn", "Sturmbock", ["electric","rock"], 475, "bruiser", "quadruped",
  qcfg(1.3, horns=(0.09,0.34,0.09), hornColor="glow", ears=(0.08,0.16,0.06),
       tail=(0.09,0.09,0.34), tailTip=(0.12,0.12,0.12), tailTipColor="glow"),
  pal("#8f8a7a", "#5b5748", "#ffd83b", glow="#fff08a"), ["statikfeld"], "dickpanzer",
  45, "slow", 0.5, 1.8, 185.0, 70, [],
  "Bei Gewitter ziehen seine Hoerner Blitze auf sich, ohne Schaden zu nehmen.",
  ["mountain","rocky"], cry={"baseHz": 210, "kind": "roar"}, stage=2)

C("waldschrat", "Waldschrat", "Baumgeist", ["grass","ghost"], 455, "bulkyMixed", "biped",
  bcfg(1.25, bodyShape="cylinder", headShape="dodeca", hands=True,
       horns=(0.07,0.3,0.07), hornColor="secondary"),
  pal("#6b5b3f", "#3f3524", "#7fb84b"), ["wachsamkeit"], "arenafalle",
  60, "slow", None, 1.7, 96.0, 70, [],
  "Es bewacht uralte Baeume und erwacht nur, wenn sie bedroht werden.",
  ["forest","ruins"], cry={"baseHz": 190, "kind": "growl"}, stage=2)

C("eisbaerchen", "Eisbaerchen", "Frostbaer", ["ice"], 300, "tank", "quadruped",
  qcfg(0.72, bodyShape="sphere", ears=(0.07,0.11,0.06), tail=(0.06,0.06,0.12)),
  pal("#eef6ff", "#b8cfe0", "#8fb0c4"), ["frostkern"], "dickpanzer",
  120, "mediumSlow", 0.5, 0.7, 38.0, 70, ev_level("frostkoloss", 34),
  "Sein dichtes Fell haelt selbst minus vierzig Grad muehelos stand.",
  ["snow"], cry={"baseHz": 420, "kind": "growl"}, stage=1)

C("frostkoloss", "Frostkoloss", "Eistitan", ["ice","fighting"], 515, "bruiser", "biped",
  bcfg(1.6, hands=True, handColor="accent", crest=(0.12,0.2,0.12), crestColor="accent"),
  pal("#e0eefa", "#9bb8cf", "#6b8fa8"), ["frostkern"], "kampfeswille",
  45, "mediumSlow", 0.5, 2.4, 275.0, 70, [],
  "Ein einziger Hieb von ihm spaltet meterdicke Eisschollen.",
  ["snow","mountain"], giga=True, giga_move="gmax_ice",
  cry={"baseHz": 150, "kind": "roar"}, stage=2, field_scale=1.3)

C("wuestenskorpion", "Duenenstachel", "Sandjaeger", ["ground","poison"], 460, "physical", "insectoid",
  icfg(1.1, wings=None, stinger=(0.07,0.28,0.07), stingerColor="accent",
       mandibles=(0.06,0.16,0.06), shellColor="secondary"),
  pal("#d8b06b", "#a8803f", "#8f4bb0"), ["sandschleuder"], "immunsystem",
  75, "mediumFast", 0.5, 1.2, 44.0, 70, [],
  "Sein Stachel traegt ein Gift, das selbst Felskreaturen laehmt.",
  ["desert","rocky"], cry={"baseHz": 400, "kind": "screech"}, stage=2)

C("himmelsrochen", "Himmelsrochen", "Luftsegler", ["water","flying"], 452, "specWall", "aquatic",
  acfg(1.3, dorsal=None, sideFins=(0.6,0.05,0.4), tailFin=(0.16,0.3,0.06), baseY=1.1),
  pal("#6bb0d8", "#3f7a9b", "#e8f4ff"), ["regenhaut"], "zielsicher",
  60, "slow", 0.5, 1.8, 52.0, 70, [],
  "Es gleitet ueber Wasserflaechen, als waere die Luft ein zweites Meer.",
  ["coastal","lake"], hover=0.9, cry={"baseHz": 380, "kind": "hum"}, stage=2)

C("glutfalter", "Glutfalter", "Aschefalter", ["fire","bug"], 445, "special", "insectoid",
  icfg(1.05, wings=(0.52,0.02,0.38), wingOpacity=0.6, wingColor="glow",
       stinger=None, mandibles=None),
  pal("#e0824b", "#a8501f", "#ffcf6b", glow="#ff9b3b"), ["lodernd"], "gluthaut",
  75, "mediumFast", 0.5, 1.1, 9.4, 70, [],
  "Seine Fluegel hinterlassen im Flug eine Spur gluehender Asche.",
  ["volcanic","forest"], hover=0.55, cry={"baseHz": 640, "kind": "trill"}, stage=2)

C("steinwaechter", "Steinwaechter", "Ruinenwacht", ["rock","steel"], 490, "tank", "biped",
  bcfg(1.45, bodyShape="box", headShape="box", hands=True, handColor="secondary"),
  pal("#9b9384", "#5b564b", "#b0a88f"), ["dickpanzer"], "robustheit",
  40, "slow", None, 2.3, 320.0, 70, [],
  "Seit Jahrhunderten bewacht es dieselbe Ruine, ohne sich zu ruehren.",
  ["ruins"], cry={"baseHz": 160, "kind": "roar"}, stage=2, field_scale=1.25)

C("nebelkraehe", "Nebelkraehe", "Schattenvogel", ["dark","flying"], 442, "speedster", "flyer",
  fcfg(1.1, crest=(0.08,0.18,0.08), crestColor="accent"),
  pal("#3f3b4b", "#232029", "#b0544b", light="#e0dce6"), ["einschuechtern"], "wachsamkeit",
  90, "mediumFast", 0.5, 1.1, 12.5, 70, [],
  "Sie stiehlt glaenzende Gegenstaende und versteckt sie in hohen Nestern.",
  ["ruins","urban"], cry={"baseHz": 480, "kind": "screech"}, stage=2)

C("blitzotter", "Blitzotter", "Stromjaeger", ["electric","water"], 448, "speedster", "quadruped",
  qcfg(1.0, ears=(0.06,0.1,0.05), tail=(0.09,0.06,0.42), tailShape="box",
       tailTip=(0.13,0.07,0.15), tailTipColor="glow", tailTipGlow=0.9),
  pal("#5bb0c9", "#2f7a94", "#ffe04b", glow="#fff08a"), ["statikfeld"], "sturzbach",
  75, "mediumFast", 0.5, 1.2, 31.0, 70, [],
  "Es laedt das Wasser um sich auf und betaeubt damit ganze Fischschwaerme.",
  ["lake","coastal"], cry={"baseHz": 560, "kind": "trill"}, stage=2)

C("traumwolke", "Traumwolke", "Schwebewesen", ["psychic","flying"], 438, "special", "floater",
  xcfg(1.1, veil=(0.44,0.5,0.44), veilOpacity=0.7, opacity=0.9,
       orbs=[{"pos":[0.36,1.5,0.1],"size":[0.06,0.06,0.06],"emissive":0.9},
             {"pos":[-0.32,1.35,-0.1],"size":[0.06,0.06,0.06],"emissive":0.9}]),
  pal("#c4b8f2", "#8f7fd8", "#fff0b0", glow="#e0d8ff"), ["klarblick"], "wachsamkeit",
  75, "slow", 0.5, 1.4, 3.8, 70, [],
  "Sie sammelt die Traeume Schlafender und gibt sie als Farbspiel wieder.",
  ["meadow","mountain"], hover=1.1, cry={"baseHz": 460, "kind": "hum"}, stage=2)

C("goldpanzer", "Goldpanzer", "Schatzwesen", ["steel","ground"], 470, "tank", "quadruped",
  qcfg(1.0, bodyShape="dodeca", tail=(0.07,0.07,0.24), horns=(0.06,0.16,0.06),
       hornColor="accent"),
  pal("#d8b84b", "#a8861f", "#f2e08f"), ["dickpanzer"], "sandschleuder",
  50, "slow", 0.5, 1.1, 168.0, 70, [],
  "Sein Panzer ist mit echtem Gold durchsetzt - Diebe kommen selten weit.",
  ["cave","desert"], cry={"baseHz": 240, "kind": "growl"}, stage=2)

C("vulkanschlange", "Vulkanschlange", "Glutschlange", ["fire","dragon"], 505, "special", "serpentine",
  scfg(1.25, segments=10, hood=(0.28,0.36,0.28), hoodColor="glow"),
  pal("#c95b2f", "#7a2b15", "#ffb03b", glow="#ff8f2b"), ["lodernd"], "duerreherz",
  40, "slow", 0.5, 3.4, 148.0, 70, [],
  "Sie nistet in erloschenen Kratern und erwacht bei jedem Beben.",
  ["volcanic"], giga=True, giga_move="gmax_dragon",
  cry={"baseHz": 200, "kind": "roar"}, stage=2, field_scale=1.2)

C("tiefseelicht", "Tiefseelicht", "Abgrundwesen", ["water","dark"], 468, "special", "aquatic",
  acfg(1.2, dorsal=(0.06,0.34,0.34), snout=(0.1,0.18,0.1)),
  pal("#2f4b6b", "#1a2b3f", "#7fe0d8", glow="#8ff0e8"), ["arenafalle"], "wachsamkeit",
  50, "slow", 0.5, 1.6, 74.0, 70, [],
  "Das Leuchtorgan ueber seinem Maul lockt Beute in voelliger Dunkelheit an.",
  ["coastal","cave"], cry={"baseHz": 220, "kind": "hum"}, stage=2)

C("kristallgeist", "Kristallgeist", "Frostschemen", ["ghost","ice"], 458, "special", "floater",
  xcfg(1.05, veil=(0.38,0.6,0.38), veilOpacity=0.6, opacity=0.8,
       orbs=[{"pos":[0.34,1.55,0],"size":[0.07,0.11,0.07],"emissive":0.9},
             {"pos":[-0.3,1.4,0.12],"size":[0.06,0.1,0.06],"emissive":0.9}]),
  pal("#a8d8e6", "#5b8fa8", "#e8f7ff", glow="#c4f0ff"), ["frostkern"], "arenafalle",
  55, "slow", 0.5, 1.4, 2.6, 60, [],
  "In Eishoehlen erscheint es als Spiegelung, die sich selbststaendig bewegt.",
  ["snow","cave"], hover=1.0, cry={"baseHz": 340, "kind": "hum"}, stage=2)

C("schneehase", "Schneehase", "Frosthuepfer", ["ice","normal"], 310, "speedster", "quadruped",
  qcfg(0.62, ears=(0.07,0.26,0.05), earColor="accent", tail=(0.08,0.08,0.1),
       tailTip=(0.1,0.1,0.1), tailTipColor="light"),
  pal("#f2f7ff", "#c4d8e6", "#d88f9b"), ["schneeschuh"], "frostkern",
  190, "mediumFast", 0.5, 0.4, 6.2, 70, [],
  "Es huepft so leicht ueber Pulverschnee, dass es keine Spur hinterlaesst.",
  ["snow"], cry={"baseHz": 720, "kind": "chirp"}, stage=1)

C("rostritter", "Rostritter", "Schrottwacht", ["steel","dark"], 482, "physical", "biped",
  bcfg(1.3, bodyShape="box", headShape="box", hands=True, handColor="accent",
       horns=(0.06,0.2,0.06), hornColor="accent"),
  pal("#7a6b5b", "#473f36", "#c95b3b"), ["dickpanzer"], "einschuechtern",
  50, "slow", None, 1.9, 186.0, 70, [],
  "Es entstand aus vergessenen Maschinen und sucht noch immer seinen Auftrag.",
  ["industrial","ruins"], cry={"baseHz": 180, "kind": "growl"}, stage=2)

C("dornenranke", "Dornenranke", "Rankenwesen", ["grass"], 420, "physical", "serpentine",
  scfg(0.95, segments=9, tailTip=(0.09,0.24,0.09), tailTipColor="accent"),
  pal("#5b8f3f", "#3b6b28", "#c9a04b"), ["wildwuchs"], "dornenhaut",
  90, "mediumFast", 0.5, 2.4, 32.0, 70, [],
  "Ihre Ranken durchbrechen Mauerwerk auf der Suche nach Sonnenlicht.",
  ["forest","ruins"], cry={"baseHz": 300, "kind": "hum"}, stage=2)

C("sandnatter", "Sandnatter", "Wuestennatter", ["ground","dark"], 435, "speedster", "serpentine",
  scfg(1.0, segments=9, hood=(0.24,0.3,0.24), hoodColor="accent"),
  pal("#c9a86b", "#94783f", "#5b4433"), ["sandschleuder"], "einschuechtern",
  90, "mediumFast", 0.5, 2.6, 38.0, 70, [],
  "Sie bewegt sich unter der Sandoberflaeche und schlaegt ohne Vorwarnung zu.",
  ["desert"], cry={"baseHz": 380, "kind": "screech"}, stage=2)

C("perlenmuschel", "Perlenmuschel", "Riffhueter", ["water"], 305, "specWall", "blob",
  ocfg(0.66, squash=0.62, bodyShape="sphere", mouth=None,
       blobs=[{"pos":[0,0.42,0.1],"size":[0.11,0.11,0.11],"color":"light","emissive":0.4}]),
  pal("#e6dcc9", "#b8a88f", "#fff6e6"), ["dickpanzer"], "sturzbach",
  150, "mediumSlow", 0.5, 0.4, 18.0, 70, [],
  "Die Perle in ihrem Inneren waechst mit jedem Jahr ein Stueck.",
  ["coastal"], cry={"baseHz": 480, "kind": "hum"}, stage=1)

C("bergziege", "Kletterbock", "Felsspringer", ["rock","fighting"], 452, "physical", "quadruped",
  qcfg(1.05, horns=(0.08,0.3,0.08), hornColor="light", ears=(0.07,0.13,0.06),
       tail=(0.06,0.06,0.18)),
  pal("#b8a894", "#7a6b57", "#e0d4bd"), ["kampfeswille"], "dickpanzer",
  90, "mediumFast", 0.5, 1.2, 78.0, 70, [],
  "Es springt zwischen Felsnadeln, auf denen kaum ein Huf Platz findet.",
  ["mountain","rocky"], cry={"baseHz": 340, "kind": "growl"}, stage=2)

C("moorlicht", "Moorlicht", "Irrlicht", ["ghost","fire"], 430, "glass", "floater",
  xcfg(0.85, veil=(0.3,0.44,0.3), veilOpacity=0.5, opacity=0.65,
       orbs=[{"pos":[0.26,1.25,0],"size":[0.07,0.07,0.07],"emissive":1.0},
             {"pos":[-0.22,1.1,0.1],"size":[0.06,0.06,0.06],"emissive":1.0}]),
  pal("#5b7a6b", "#33473f", "#8fffc4", glow="#a0ffd8"), ["arenafalle"], "hitzeresistenz",
  75, "slow", 0.5, 0.9, 1.0, 60, [],
  "Es fuehrt Wanderer vom Weg ab - manche sagen, aus purer Neugier.",
  ["wetland","ruins"], hover=0.95, cry={"baseHz": 420, "kind": "hum"}, stage=2)

# ======================= PSEUDO-LEGENDAERE LINIE ========================
C("klauenwelpe", "Klauenwelpe", "Drachenwelpe", ["dragon"], 300, "balanced", "quadruped",
  qcfg(0.6, horns=(0.04,0.12,0.04), hornColor="light", ears=(0.06,0.1,0.05),
       tail=(0.07,0.07,0.3), tailTip=(0.09,0.14,0.09), tailTipShape="cone",
       tailTipColor="accent"),
  pal("#5b7ac9", "#33508f", "#e0d84b"), ["kampfeswille"], "dickpanzer",
  45, "slow", 0.5, 0.6, 14.0, 35, ev_level("sichelklaue", 30),
  "Schon als Welpe zerkratzt es Felsen, um seine Klauen zu schaerfen.",
  ["cave","mountain"], cry={"baseHz": 520, "kind": "growl"}, stage=1)

C("sichelklaue", "Sichelklaue", "Sichelkrieger", ["dragon","ground"], 430, "physical", "biped",
  bcfg(1.1, hands=True, handColor="accent", horns=(0.06,0.2,0.06), hornColor="light",
       tail=(0.08,0.08,0.44), tailTip=(0.1,0.18,0.1), tailTipShape="cone",
       tailTipColor="accent"),
  pal("#4b6bb8", "#2b4276", "#d8cf3b"), ["kampfeswille"], "arenafalle",
  45, "slow", 0.5, 1.4, 68.0, 35, ev_level("titanklaue", 52),
  "Es graebt sich ein und wartet tagelang regungslos auf Beute.",
  ["cave","desert"], cry={"baseHz": 300, "kind": "roar"}, stage=2)

C("titanklaue", "Titanklaue", "Titanenkrieger", ["dragon","ground"], 600, "bruiser", "biped",
  bcfg(1.75, hands=True, handColor="accent", horns=(0.09,0.34,0.09), hornColor="light",
       crest=(0.12,0.28,0.12), crestColor="accent",
       tail=(0.11,0.11,0.62), tailTip=(0.14,0.26,0.14), tailTipShape="cone",
       tailTipColor="accent"),
  pal("#3f5ba8", "#1f3566", "#d8cf3b"), ["einschuechtern"], "dickpanzer",
  30, "slow", 0.5, 2.5, 315.0, 35, [],
  "Ein einziger Klauenhieb hat schon einen Bergpass neu geformt.",
  ["mountain","endgame"], giga=True, giga_move="gmax_dragon",
  cry={"baseHz": 130, "kind": "roar"}, stage=3, field_scale=1.45)

# ============================ LEGENDAERE ================================
C("terravor", "Terravor", "Erdtitan", ["ground","steel"], 640, "tank", "quadruped",
  qcfg(1.9, bodyShape="dodeca", headShape="dodeca", horns=(0.12,0.44,0.12),
       hornColor="glow", tail=(0.14,0.14,0.66), tailTip=(0.2,0.2,0.2),
       tailTipColor="glow", tailTipGlow=0.8),
  pal("#8a7a5b", "#4b4133", "#ffb83b", glow="#ffc44b"), ["dickpanzer"], None,
  3, "slow", None, 3.6, 880.0, 0, [],
  "Der Legende nach traegt es die Gebirge der Region auf seinem Ruecken.",
  ["mountain","endgame"], cry={"baseHz": 110, "kind": "roar"},
  stage=3, field_scale=1.8, max_level=70)

C("noctaris", "Noctaris", "Nachtherrscher", ["dark","ghost"], 640, "special", "floater",
  xcfg(1.9, arms=(0.08,0.42,0.08), armColor="secondary",
       veil=(0.62,1.0,0.62), veilOpacity=0.8, opacity=0.9,
       orbs=[{"pos":[0.72,2.7,0],"size":[0.13,0.13,0.13],"emissive":1.0},
             {"pos":[-0.72,2.45,0.18],"size":[0.11,0.11,0.11],"emissive":1.0},
             {"pos":[0.1,3.0,-0.2],"size":[0.1,0.1,0.1],"emissive":1.0}]),
  pal("#3b2f5b", "#1a1330", "#c48fff", glow="#d8a0ff"), ["einschuechtern"], None,
  3, "slow", None, 3.2, 42.0, 0, [],
  "Es erscheint nur in Neumondnaechten und loescht jede Erinnerung an sich.",
  ["ruins","endgame"], hover=1.4, cry={"baseHz": 120, "kind": "hum"},
  stage=3, field_scale=1.7, max_level=70)

C("solaria", "Solaria", "Sonnenherrin", ["fire","fairy"], 640, "special", "flyer",
  fcfg(2.1, crest=(0.18,0.5,0.18), crestColor="glow",
       wings=(1.15,0.07,0.7), wingColor="glow"),
  pal("#ffb84b", "#d8722b", "#fff0a0", glow="#ffd86b", light="#fff6d8"),
  ["duerreherz"], None,
  3, "slow", None, 3.0, 68.0, 0, [],
  "Mit ausgebreiteten Schwingen soll sie einst einen ganzen Winter beendet haben.",
  ["mountain","endgame"], hover=1.2, cry={"baseHz": 260, "kind": "screech"},
  stage=3, field_scale=1.7, max_level=70)

C("pelagos", "Pelagos", "Tiefenherrscher", ["water","ice"], 640, "specWall", "serpentine",
  scfg(2.1, segments=12, hood=(0.5,0.66,0.5), hoodColor="accent",
       tailTip=(0.18,0.42,0.18), tailTipColor="accent"),
  pal("#3f8fc4", "#1f5580", "#c4f0ff", glow="#a0e8ff"), ["frostkern"], None,
  3, "slow", None, 8.4, 520.0, 0, [],
  "Sein Erwachen laesst ganze Buchten ueber Nacht zufrieren.",
  ["coastal","endgame"], cry={"baseHz": 100, "kind": "roar"},
  stage=3, field_scale=1.6, max_level=70)

C("zephyros", "Zephyros", "Sturmherrscher", ["flying","electric"], 640, "speedster", "flyer",
  fcfg(2.0, crest=(0.16,0.46,0.16), crestColor="glow",
       wings=(1.2,0.06,0.62), wingColor="secondary"),
  pal("#8fc4e6", "#4b7a9b", "#ffe84b", glow="#fff08a"), ["statikfeld"], None,
  3, "slow", None, 3.4, 58.0, 0, [],
  "Es reitet auf Gewitterfronten und hat seit Menschengedenken nie gerastet.",
  ["mountain","endgame"], hover=1.5, cry={"baseHz": 240, "kind": "screech"},
  stage=3, field_scale=1.65, max_level=70)

C("aetherion", "Aetherion", "Urherrscher", ["dragon","psychic"], 690, "balanced", "biped",
  bcfg(2.3, hands=True, handColor="glow", horns=(0.12,0.52,0.12), hornColor="glow",
       crest=(0.18,0.46,0.18), crestColor="glow",
       tail=(0.14,0.14,0.8), tailTip=(0.2,0.34,0.2), tailTipShape="cone",
       tailTipColor="glow", tailTipGlow=1.0),
  pal("#c4b8e6", "#6b5b9b", "#ffe08a", glow="#e0d8ff", light="#fff6ff"),
  ["klarblick"], None,
  3, "slow", None, 4.2, 340.0, 0, [],
  "Aus ihm soll die Region selbst entstanden sein - und mit ihm wieder vergehen.",
  ["endgame"], giga=True, giga_move="gmax_dragon", cry={"baseHz": 95, "kind": "roar"},
  stage=3, field_scale=2.0, max_level=80)

C("luminis", "Luminis", "Sternenkind", ["fairy","psychic"], 600, "special", "floater",
  xcfg(1.1, veil=(0.36,0.56,0.36), veilOpacity=0.75, opacity=0.92,
       orbs=[{"pos":[0.42,1.7,0],"size":[0.08,0.08,0.08],"emissive":1.0},
             {"pos":[-0.4,1.55,0.14],"size":[0.07,0.07,0.07],"emissive":1.0},
             {"pos":[0.06,1.95,-0.12],"size":[0.065,0.065,0.065],"emissive":1.0}]),
  pal("#fff0d8", "#e0c4ff", "#ffd86b", glow="#fffae0"), ["robustheit"], None,
  3, "slow", None, 0.6, 2.4, 100, [],
  "Man sagt, es erfuellt einen einzigen Wunsch - aber nur einen ehrlichen.",
  ["endgame"], hover=1.0, cry={"baseHz": 900, "kind": "trill"},
  stage=3, field_scale=0.9, max_level=70)

# =================== ARENA-SIGNATURKREATUREN / ENDGAME ==================
C("grasmaehne", "Grasmaehne", "Weidenhueter", ["grass"], 470, "bulkyMixed", "quadruped",
  qcfg(1.2, ears=(0.08,0.18,0.06), horns=(0.06,0.22,0.06), hornColor="secondary",
       tail=(0.1,0.1,0.42), tailTip=(0.15,0.15,0.15), tailTipColor="secondary"),
  pal("#8fb85b", "#5b7a33", "#e0d88f"), ["wildwuchs"], "duftlockung",
  60, "mediumSlow", 0.5, 1.4, 86.0, 70, [],
  "Seine Maehne besteht aus echtem Gras, das jede Saison neu austreibt.",
  ["meadow","grassland"], cry={"baseHz": 300, "kind": "growl"}, stage=2)

C("wasserharfe", "Wasserharfe", "Klangwesen", ["water","fairy"], 466, "special", "floater",
  xcfg(1.05, arms=(0.05,0.26,0.05), veil=(0.4,0.56,0.4), veilOpacity=0.7,
       orbs=[{"pos":[0.4,1.6,0],"size":[0.06,0.06,0.06],"emissive":0.9}]),
  pal("#8fd8e6", "#4b9bb0", "#ffd8f2", glow="#c4f7ff"), ["sturzbach"], "robustheit",
  60, "slow", 0.25, 1.3, 14.0, 90, [],
  "Der Klang ihrer Stimme laesst Wasserflaechen in Mustern erzittern.",
  ["lake","coastal"], cry={"baseHz": 640, "kind": "trill"}, stage=2)

C("aschewolf", "Aschewolf", "Glutjaeger", ["fire","dark"], 498, "physical", "quadruped",
  qcfg(1.25, ears=(0.09,0.22,0.06), horns=(0.05,0.18,0.05), hornColor="glow",
       tail=(0.09,0.09,0.46), tailTip=(0.13,0.13,0.13), tailTipColor="glow",
       tailTipGlow=0.9),
  pal("#7a4b3b", "#3b241d", "#ff8f3b", glow="#ffa84b"), ["lodernd"], "einschuechtern",
  45, "mediumSlow", 0.5, 1.5, 62.0, 70, [],
  "Es jagt in verbrannten Waeldern, wo seine Spur unsichtbar bleibt.",
  ["volcanic","forest"], giga=True, giga_move="gmax_fire",
  cry={"baseHz": 220, "kind": "roar"}, stage=2)

C("himmelsritter", "Himmelsritter", "Sturmwacht", ["flying","steel"], 510, "physical", "flyer",
  fcfg(1.7, crest=(0.12,0.3,0.12), crestColor="accent", wings=(0.92,0.06,0.56)),
  pal("#b0bccf", "#5b6b80", "#d8a83b", light="#eef2f7"), ["dickpanzer"], "zielsicher",
  40, "slow", 0.5, 2.0, 128.0, 70, [],
  "Es patrouilliert ueber den Bergpaessen und duldet keine Eindringlinge.",
  ["mountain"], giga=True, giga_move="gmax_steel",
  cry={"baseHz": 280, "kind": "screech"}, stage=2, field_scale=1.25)

C("abgrundschrecken", "Abgrundschrecken", "Tiefenwesen", ["dark","dragon"], 540, "bruiser", "serpentine",
  scfg(1.6, segments=11, hood=(0.4,0.5,0.4), hoodColor="accent",
       tailTip=(0.14,0.34,0.14), tailTipColor="accent"),
  pal("#2f2b47", "#171427", "#c94b6b", glow="#ff5b7f"), ["einschuechtern"], "arenafalle",
  25, "slow", 0.5, 5.2, 240.0, 20, [],
  "Aus den tiefsten Spalten der Region gestiegen - niemand weiss, wie tief sie reichen.",
  ["endgame","cave"], giga=True, giga_move="gmax_dark",
  cry={"baseHz": 120, "kind": "roar"}, stage=3, field_scale=1.5)

# --------------------------------------------------------------------------
# Ausgabe
# --------------------------------------------------------------------------
def main():
    by_id = {s["id"]: s for s in SPECIES}
    problems = []

    # Rueckverweise (prevo) automatisch ergaenzen
    for s in SPECIES:
        for evo in s["evolutions"]:
            target = by_id.get(evo["to"])
            if target is None:
                problems.append(f"{s['id']}: Entwicklungsziel '{evo['to']}' existiert nicht")
            else:
                target["prevo"] = s["id"]

    # Referenzpruefung: Attacken, Faehigkeiten, Gigantifizierungsattacken
    abilities = {a["id"] for a in json.loads((ROOT/"data/abilities/abilities.json").read_text())}
    for s in SPECIES:
        for e in s["learnset"]:
            if e["move"] not in MOVES:
                problems.append(f"{s['id']}: unbekannte Attacke '{e['move']}'")
        for m in s.get("tmMoves", []):
            if m not in MOVES:
                problems.append(f"{s['id']}: unbekannte Disk-Attacke '{m}'")
        for a in s["abilities"] + ([s["hiddenAbility"]] if s.get("hiddenAbility") else []):
            if a not in abilities:
                problems.append(f"{s['id']}: unbekannte Faehigkeit '{a}'")
        if s.get("giganticMove") and s["giganticMove"] not in MOVES:
            problems.append(f"{s['id']}: unbekannte Gigantifizierungsattacke")
        if not s["learnset"]:
            problems.append(f"{s['id']}: leeres Lernset")
        if s["learnset"][0]["level"] != 1:
            problems.append(f"{s['id']}: keine Attacke auf Level 1")
        for p in s["model"]["parts"]:
            col = p["color"]
            if not col.startswith("#") and col not in s["model"]["palette"]:
                problems.append(f"{s['id']}: Farbschluessel '{col}' fehlt in der Palette")

    if problems:
        print("FEHLER in den Kreaturendaten:")
        for p in problems: print("  -", p)
        sys.exit(1)

    outdir = ROOT / "data/creatures"
    for f in outdir.glob("*.json"): f.unlink()
    # Nach Familien gruppieren, damit verwandte Arten in einer Datei stehen.
    family = {}
    for s in SPECIES:
        root_id = s["id"]
        guard = 0
        while by_id[root_id].get("prevo") and guard < 10:
            root_id = by_id[root_id]["prevo"]; guard += 1
        family.setdefault(root_id, []).append(s)
    for root_id, members in family.items():
        members.sort(key=lambda s: s["dex"])
        (outdir / f"{members[0]['dex']:03d}_{root_id}.json").write_text(
            json.dumps(members, indent=1, ensure_ascii=False) + "\n")

    types = collections.Counter()
    for s in SPECIES:
        for t in s["types"]: types[t] += 1
    print(f"{len(SPECIES)} Kreaturen in {len(family)} Familien-Dateien geschrieben")
    print("Typverteilung:", ", ".join(f"{t}={n}" for t, n in sorted(types.items())))
    print("Gigantifizierbar:", sum(1 for s in SPECIES if s["canGigantic"]))
    print("Durchschn. Lernset:", round(sum(len(s['learnset']) for s in SPECIES)/len(SPECIES), 1))

if __name__ == "__main__":
    main()
