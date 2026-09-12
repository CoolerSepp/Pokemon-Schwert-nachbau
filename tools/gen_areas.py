#!/usr/bin/env python3
"""Erzeugt die Gebietsdaten unter data/regions/.

Die Region "Aetheria" wird hier als Layout beschrieben; alles Sichtbare
(Terrain, Props, Gebaeude) entsteht zur Laufzeit prozedural aus diesen
Parametern.
"""
import json, pathlib, math

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data/regions"

AREAS = []

def area(**kw):
    a = {
        "props": [], "buildings": [], "npcs": [], "items": [],
        "connections": [], "spawnPoints": [],
    }
    a.update(kw)
    AREAS.append(a)
    return a

def sp(id, x, z, facing=0.0):
    return {"id": id, "pos": [x, z], "facing": facing}

def conn(to, x, z, w, d, spawn, requires=None, blocked=None, label=None):
    c = {"to": to, "trigger": {"x": x, "z": z, "width": w, "depth": d}, "spawnPoint": spawn}
    if requires: c["requires"] = requires
    if blocked: c["blockedText"] = blocked
    if label: c["label"] = label
    return c

def building(kind, x, z, rot=0.0, interior=None, spawn=None, label=None,
             door=None, scale=1.0, variant=0):
    b = {"kind": kind, "pos": [x, z], "rotation": rot, "scale": scale, "variant": variant}
    if interior: b["interior"] = interior
    if spawn: b["spawnPoint"] = spawn
    if label: b["label"] = label
    if door: b["doorOffset"] = door
    return b

def grass(x, z, w, d, density=1.6):
    return {"x": x, "z": z, "width": w, "depth": d, "density": density}

def npc(id, x, z, facing=0.0, **kw):
    n = {"id": id, "pos": [x, z], "facing": facing}
    n.update(kw)
    return n

def item(id, what, x, z, qty=1, hidden=False, stage=None):
    d = {"id": id, "item": what, "pos": [x, z], "quantity": qty, "hidden": hidden}
    if stage is not None: d["minStoryStage"] = stage
    return d

def prop(kind, x, z, rot=0.0, scale=1.0, variant=0):
    return {"kind": kind, "pos": [x, z], "rotation": rot, "scale": scale, "variant": variant}

def fence_line(x0, z0, x1, z1, count):
    """Reiht Zaunsegmente entlang einer Strecke auf."""
    out = []
    ang = math.atan2(x1 - x0, z1 - z0) + math.pi / 2
    for i in range(count):
        t = (i + 0.5) / count
        out.append(prop("fence", x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, ang, 1.0, i))
    return out

EAST = math.pi / 2     # Tuer zeigt nach +X
WEST = -math.pi / 2    # Tuer zeigt nach -X
SOUTH = math.pi        # Tuer zeigt nach -Z
NORTH = 0.0            # Tuer zeigt nach +Z

# ==========================================================================
# HEIMATORT
# ==========================================================================
area(
    id="startdorf", name="Startdorf", kind="town", biome="meadow",
    size=[92, 84], seed=1001,
    terrain={
        "baseHeight": 0, "amplitude": 1.4, "frequency": 0.045, "octaves": 3,
        "cliffBorder": True,
        "paths": [
            {"points": [[46, 2], [46, 80]], "width": 8},
            {"points": [[24, 34], [68, 34]], "width": 5},
        ],
    },
    music="town", mapPos=[50, 88],
    description="Ein ruhiges Dorf am suedlichen Rand der Region Aetheria.",
    weather=["clear", "cloudy", "rain"],
    connections=[
        conn("route_1", 38, 81, 16, 3, "from_startdorf",
             requires={"flag": "starterChosen"},
             blocked="Ohne eigene Kreatur solltest du Route 1 nicht betreten."),
    ],
    spawnPoints=[
        sp("default", 46, 20, 0),
        sp("from_home", 38, 22, 0),
        sp("from_rival", 54, 22, 0),
        sp("from_lab", 46, 56, math.pi),
        sp("from_route1", 46, 76, math.pi),
        sp("from_house_a", 22, 44, EAST),
        sp("from_house_b", 70, 44, WEST),
    ],
    buildings=[
        building("house", 32, 24, EAST, "home_ground", "entrance", "Dein Zuhause", [0, 3.4]),
        building("house", 60, 24, WEST, "rival_house", "entrance", "Haus der Nachbarn", [0, 3.4], variant=3),
        building("lab", 46, 64, SOUTH, "lab_interior", "entrance", "Forschungsstation", [0, 5.0]),
        building("hut", 20, 46, EAST, "house_a", "entrance", "Wohnhaus", [0, 2.8], variant=5),
        building("hut", 72, 46, WEST, "house_b", "entrance", "Wohnhaus", [0, 2.8], variant=7),
    ],
    props=(
        fence_line(8, 6, 84, 6, 22)
        + fence_line(8, 6, 8, 78, 20)
        + fence_line(84, 6, 84, 78, 20)
        + [prop("tree", 14, 16, 0.3, 1.2, 1), prop("tree", 78, 14, 1.1, 1.1, 2),
           prop("tree", 16, 66, 2.2, 1.3, 3), prop("tree", 80, 68, 0.8, 1.15, 4),
           prop("well", 46, 34, 0, 1.0, 0),
           prop("sign", 42, 74, 0, 1.0, 0),
           prop("bench", 38, 40, EAST, 1.0, 0), prop("bench", 54, 40, WEST, 1.0, 1),
           prop("flower", 30, 32, 0, 1.2, 1), prop("flower", 62, 32, 0, 1.1, 2),
           prop("flower", 34, 52, 0, 1.0, 3), prop("flower", 58, 52, 0, 1.3, 4),
           prop("mailbox", 36, 22, WEST, 1.0, 0), prop("mailbox", 56, 22, EAST, 1.0, 1),
           prop("lamp", 40, 46, 0, 1.0, 0), prop("lamp", 52, 46, 0, 1.0, 1)]
    ),
    npcs=[
        npc("dorf_alt", 40, 38, EAST, name="Alter Nachbar", dialogue="startdorf_alt",
            appearance={"skin": "#d8b08a", "hair": "#cfcfcf", "shirt": "#6b7a8f",
                        "pants": "#4a4a52", "accent": "#e0d8c4", "hat": "none", "height": 0.95}),
        npc("dorf_kind", 56, 44, WEST, name="Kind", dialogue="startdorf_kind", wander=4,
            appearance={"skin": "#f0cfa8", "hair": "#8a5a2b", "shirt": "#4bbf7a",
                        "pants": "#3f5f8f", "accent": "#ffe08a", "hat": "cap", "height": 0.78}),
        npc("dorf_wache", 46, 72, SOUTH, name="Wegweiser", dialogue="startdorf_wache",
            maxStoryStage=2,
            appearance={"skin": "#c99a6b", "hair": "#2b2b2b", "shirt": "#8f6b3f",
                        "pants": "#3a3a42", "accent": "#c4b08a", "hat": "beanie"}),
    ],
    triggers=[
        {"id": "startdorf_prof_ruf", "pos": [46, 50], "radius": 6, "once": True,
         "requires": {"storyStage": 1}, "action": {"kind": "cutscene", "cutscene": "prolog_labor"}},
    ],
    ambience={"fogNear": 60, "fogFar": 320},
)

# ==========================================================================
# INNENRAEUME HEIMATORT
# ==========================================================================
area(
    id="home_ground", name="Zuhause", kind="interior", biome="urban",
    size=[16, 13], seed=1101, indoor=True,
    terrain={"baseHeight": 0, "amplitude": 0, "frequency": 0.1, "flat": True},
    music="home", mapPos=[50, 88],
    interiorStyle={
        "wallColor": "#e8dcc4", "floorColor": "#a8763f", "accentColor": "#6b4f33",
        "wallHeight": 3.2, "ceiling": True,
        "exits": [{"x": 8, "z": 0, "width": 2.4, "side": "south"}],
        "furniture": [
            {"kind": "table", "pos": [5, 7], "rotation": 0},
            {"kind": "chair", "pos": [5, 8.6], "rotation": math.pi},
            {"kind": "chair", "pos": [5, 5.4], "rotation": 0},
            {"kind": "sofa", "pos": [12.4, 8.5], "rotation": WEST, "color": "#4b6b8f"},
            {"kind": "tv", "pos": [12.6, 4.5], "rotation": WEST},
            {"kind": "shelf", "pos": [2.2, 10.5], "rotation": EAST},
            {"kind": "plant", "pos": [14, 11.4]},
            {"kind": "rug", "pos": [8, 4], "color": "#b5533f"},
            {"kind": "stairs", "pos": [13.4, 11.2], "rotation": SOUTH},
            {"kind": "lamp", "pos": [1.8, 2.2]},
        ],
    },
    spawnPoints=[sp("default", 8, 3, 0), sp("entrance", 8, 2.2, 0), sp("from_bedroom", 13.4, 9.6, SOUTH)],
    connections=[
        conn("startdorf", 6.6, 0, 2.8, 1.6, "from_home"),
        conn("home_bedroom", 12.2, 11.0, 2.4, 1.6, "from_ground", label="Treppe"),
    ],
    npcs=[
        npc("mutter", 6.6, 6.8, EAST, name="Mutter", dialogue="mutter", role="guide",
            appearance={"skin": "#e8c19b", "hair": "#8a5a2b", "shirt": "#c4738f",
                        "pants": "#5f4a6b", "accent": "#f0e6d2", "hat": "none"}),
    ],
    ambience={"fogNear": 24, "fogFar": 60, "lightIntensity": 1.0},
)

area(
    id="home_bedroom", name="Dein Zimmer", kind="interior", biome="urban",
    size=[11, 10], seed=1102, indoor=True,
    terrain={"baseHeight": 0, "amplitude": 0, "frequency": 0.1, "flat": True},
    music="home",
    interiorStyle={
        "wallColor": "#e0e8f0", "floorColor": "#c99a6b", "accentColor": "#4b6b8f",
        "wallHeight": 2.8, "ceiling": True,
        "exits": [{"x": 5.5, "z": 0, "width": 2.2, "side": "south"}],
        "furniture": [
            {"kind": "bed", "pos": [2.4, 7.2], "rotation": 0, "color": "#4bbf9b"},
            {"kind": "computer", "pos": [8.4, 8.0], "rotation": SOUTH},
            {"kind": "shelf", "pos": [8.6, 3.0], "rotation": WEST},
            {"kind": "rug", "pos": [5.5, 5], "color": "#8f6bbf"},
            {"kind": "plant", "pos": [1.4, 1.6]},
        ],
    },
    spawnPoints=[sp("default", 4.0, 6.6, SOUTH), sp("from_ground", 5.5, 2.2, 0)],
    connections=[conn("home_ground", 4.3, 0, 2.4, 1.6, "from_bedroom")],
    ambience={"fogNear": 20, "fogFar": 50},
)

area(
    id="rival_house", name="Nachbarhaus", kind="interior", biome="urban",
    size=[14, 12], seed=1103, indoor=True,
    terrain={"baseHeight": 0, "amplitude": 0, "frequency": 0.1, "flat": True},
    music="home",
    interiorStyle={
        "wallColor": "#f0e4d8", "floorColor": "#9b7346", "accentColor": "#7a4f6b",
        "wallHeight": 3.0, "ceiling": True,
        "exits": [{"x": 7, "z": 0, "width": 2.4, "side": "south"}],
        "furniture": [
            {"kind": "table", "pos": [4.5, 6.5]},
            {"kind": "chair", "pos": [4.5, 8.0], "rotation": math.pi},
            {"kind": "sofa", "pos": [11, 7.5], "rotation": WEST, "color": "#8f4b6b"},
            {"kind": "shelf", "pos": [2.0, 9.8], "rotation": EAST},
            {"kind": "plant", "pos": [12.2, 10.4]},
            {"kind": "lamp", "pos": [2.0, 2.4]},
        ],
    },
    spawnPoints=[sp("default", 7, 3, 0), sp("entrance", 7, 2.2, 0)],
    connections=[conn("startdorf", 5.8, 0, 2.4, 1.6, "from_rival")],
    npcs=[
        npc("rivalen_mutter", 8.6, 6.0, WEST, name="Nachbarin", dialogue="rivalen_mutter",
            appearance={"skin": "#d8b08a", "hair": "#c24b6b", "shirt": "#4b8f7a",
                        "pants": "#3f3f4a", "accent": "#f0e0c4", "hat": "none"}),
    ],
)

area(
    id="house_a", name="Wohnhaus", kind="interior", biome="urban",
    size=[11, 9], seed=1104, indoor=True,
    terrain={"baseHeight": 0, "amplitude": 0, "frequency": 0.1, "flat": True},
    music="home",
    interiorStyle={
        "wallColor": "#e6d8c0", "floorColor": "#a8763f", "accentColor": "#5f7a4f",
        "wallHeight": 2.9, "ceiling": True,
        "exits": [{"x": 5.5, "z": 0, "width": 2.2, "side": "south"}],
        "furniture": [
            {"kind": "table", "pos": [3.6, 5.4]},
            {"kind": "chair", "pos": [3.6, 6.8], "rotation": math.pi},
            {"kind": "shelf", "pos": [9.0, 6.6], "rotation": WEST},
            {"kind": "plant", "pos": [1.5, 7.4]},
        ],
    },
    spawnPoints=[sp("default", 5.5, 3, 0), sp("entrance", 5.5, 2.2, 0)],
    connections=[conn("startdorf", 4.4, 0, 2.2, 1.6, "from_house_a")],
    npcs=[
        npc("dorf_sammler", 6.8, 5.2, WEST, name="Sammler", dialogue="dorf_sammler",
            appearance={"skin": "#c99a6b", "hair": "#4a3524", "shirt": "#c2a04b",
                        "pants": "#4a4a52", "accent": "#e0d8c4", "hat": "cap"}),
    ],
)

area(
    id="house_b", name="Wohnhaus", kind="interior", biome="urban",
    size=[11, 9], seed=1105, indoor=True,
    terrain={"baseHeight": 0, "amplitude": 0, "frequency": 0.1, "flat": True},
    music="home",
    interiorStyle={
        "wallColor": "#dcd0e0", "floorColor": "#9b7346", "accentColor": "#6b4f8f",
        "wallHeight": 2.9, "ceiling": True,
        "exits": [{"x": 5.5, "z": 0, "width": 2.2, "side": "south"}],
        "furniture": [
            {"kind": "sofa", "pos": [8.4, 5.6], "rotation": WEST, "color": "#6b4f8f"},
            {"kind": "tv", "pos": [2.2, 5.6], "rotation": EAST},
            {"kind": "rug", "pos": [5.4, 5.6], "color": "#8f7a4f"},
            {"kind": "plant", "pos": [9.4, 7.6]},
        ],
    },
    spawnPoints=[sp("default", 5.5, 3, 0), sp("entrance", 5.5, 2.2, 0)],
    connections=[conn("startdorf", 4.4, 0, 2.2, 1.6, "from_house_b")],
    npcs=[
        npc("dorf_heilerin", 6.6, 7.0, SOUTH, name="Heilkundige", dialogue="dorf_heilerin", role="heal",
            appearance={"skin": "#e8c19b", "hair": "#2b2b2b", "shirt": "#4b8fbf",
                        "pants": "#3a3a42", "accent": "#ffffff", "hat": "none"}),
    ],
)

area(
    id="lab_interior", name="Forschungsstation", kind="lab", biome="urban",
    size=[22, 16], seed=1106, indoor=True,
    terrain={"baseHeight": 0, "amplitude": 0, "frequency": 0.1, "flat": True},
    music="lab",
    interiorStyle={
        "wallColor": "#e4eaee", "floorColor": "#c9d2d8", "accentColor": "#5f8fae",
        "wallHeight": 4.0, "ceiling": True,
        "exits": [{"x": 11, "z": 0, "width": 3.0, "side": "south"}],
        "furniture": [
            {"kind": "machine", "pos": [3.2, 12.4], "rotation": 0},
            {"kind": "machine", "pos": [6.2, 12.4], "rotation": 0},
            {"kind": "machine", "pos": [18.6, 12.4], "rotation": 0},
            {"kind": "computer", "pos": [15.6, 12.6], "rotation": 0},
            {"kind": "table", "pos": [11, 9.5], "rotation": 0},
            {"kind": "shelf", "pos": [1.6, 5.5], "rotation": EAST},
            {"kind": "shelf", "pos": [20.4, 5.5], "rotation": WEST},
            {"kind": "plant", "pos": [2.0, 2.2]},
            {"kind": "plant", "pos": [20.0, 2.2]},
            {"kind": "crateStack", "pos": [18.4, 3.2]},
        ],
    },
    spawnPoints=[sp("default", 11, 3, 0), sp("entrance", 11, 2.4, 0), sp("starterwahl", 11, 7.4, 0)],
    connections=[conn("startdorf", 9.5, 0, 3.0, 1.8, "from_lab")],
    npcs=[
        npc("professorin", 11, 12.0, SOUTH, name="Professorin Farnholz",
            dialogue="professorin", role="professor",
            appearance={"skin": "#e0b894", "hair": "#c4c4c4", "shirt": "#ffffff",
                        "pants": "#5f6b7a", "accent": "#8fc4e0", "hat": "none", "height": 1.02}),
        npc("assistent", 4.6, 8.4, EAST, name="Assistent", dialogue="lab_assistent",
            appearance={"skin": "#c99a6b", "hair": "#3a2a1c", "shirt": "#ffffff",
                        "pants": "#4a4a52", "accent": "#7fc4a0", "hat": "none"}),
    ],
    triggers=[
        {"id": "lab_starter_trigger", "pos": [11, 7.4], "radius": 3.2, "once": True,
         "requires": {"storyStage": 1}, "action": {"kind": "cutscene", "cutscene": "starterwahl"}},
    ],
)

# ==========================================================================
# ROUTE 1
# ==========================================================================
area(
    id="route_1", name="Route 1", kind="route", biome="grassland",
    size=[64, 150], seed=1201,
    terrain={
        "baseHeight": 0, "amplitude": 5.5, "frequency": 0.028, "octaves": 4,
        "cliffBorder": True,
        "paths": [{"points": [[32, 2], [28, 40], [36, 80], [30, 120], [32, 148]], "width": 7}],
    },
    music="route", mapPos=[50, 74],
    description="Ein sanft geschwungener Weg zwischen Wiesen und Hecken.",
    weather=["clear", "cloudy", "rain", "fog"],
    grassZones=[
        grass(14, 26, 18, 20, 2.0),
        grass(50, 34, 16, 18, 1.8),
        grass(16, 66, 20, 22, 2.0),
        grass(50, 78, 18, 20, 1.9),
        grass(14, 108, 18, 22, 2.1),
        grass(50, 118, 16, 20, 1.8),
    ],
    spawnTable=[
        {"species": "nagezahn", "minLevel": 2, "maxLevel": 5, "weight": 30, "behaviour": "skittish"},
        {"species": "federflaum", "minLevel": 2, "maxLevel": 5, "weight": 26, "behaviour": "wander"},
        {"species": "kribbelkaefer", "minLevel": 2, "maxLevel": 4, "weight": 20, "behaviour": "wander"},
        {"species": "knollknospe", "minLevel": 3, "maxLevel": 5, "weight": 14, "behaviour": "static"},
        {"species": "funkenfell", "minLevel": 3, "maxLevel": 6, "weight": 8, "behaviour": "shy", "rare": True},
        {"species": "windfuchs", "minLevel": 4, "maxLevel": 6, "weight": 6, "behaviour": "skittish",
         "timeOfDay": ["dawn", "day"]},
        {"species": "nachtschleier", "minLevel": 4, "maxLevel": 6, "weight": 5, "behaviour": "aggressive",
         "timeOfDay": ["dusk", "night"], "rare": True},
    ],
    maxWild=14,
    spawnPoints=[
        sp("from_startdorf", 32, 6, 0),
        sp("from_quellheim", 32, 144, math.pi),
        sp("default", 32, 6, 0),
    ],
    connections=[
        conn("startdorf", 24, 0, 16, 3, "from_route1"),
        conn("quellheim", 24, 147, 16, 3, "from_route1"),
    ],
    props=[
        prop("sign", 36, 10, SOUTH, 1.0, 0),
        prop("sign", 28, 142, 0, 1.0, 1),
        prop("tree", 8, 18, 0.4, 1.3, 1), prop("tree", 56, 22, 1.2, 1.2, 2),
        prop("tree", 10, 52, 2.0, 1.35, 3), prop("tree", 54, 60, 0.6, 1.25, 4),
        prop("tree", 8, 96, 1.6, 1.3, 5), prop("tree", 56, 104, 2.4, 1.2, 6),
        prop("tree", 12, 134, 0.9, 1.28, 7), prop("tree", 52, 138, 1.9, 1.22, 8),
        prop("stump", 40, 48, 0, 1.0, 0), prop("boulder", 22, 92, 0.5, 1.1, 0),
        prop("bush", 44, 24, 0, 1.0, 1), prop("bush", 20, 44, 0, 1.1, 2),
    ],
    npcs=[
        npc("route1_trainer_1", 34, 56, SOUTH, name="Wanderer Kai", trainer="wanderer_kai",
            appearance={"skin": "#d8b08a", "hair": "#3a2a1c", "shirt": "#4b8f5f",
                        "pants": "#5f4a33", "accent": "#c4b08a", "hat": "cap"}),
        npc("route1_trainer_2", 30, 104, 0, name="Kaeferfreundin Ida", trainer="kaeferfreundin_ida",
            minStoryStage=3,
            appearance={"skin": "#f0cfa8", "hair": "#8f5f2b", "shirt": "#9bc44b",
                        "pants": "#4a5f33", "accent": "#e0e8a0", "hat": "beanie", "height": 0.9}),
        npc("route1_wanderer", 38, 128, WEST, name="Spaziergaengerin", dialogue="route1_spaziergaengerin",
            wander=5,
            appearance={"skin": "#c99a6b", "hair": "#5f3a2b", "shirt": "#c47a9b",
                        "pants": "#3f3f4a", "accent": "#f0e0c4", "hat": "none"}),
    ],
    items=[
        item("route1_ball", "fangkugel", 18, 40, 3),
        item("route1_trank", "trank", 52, 88, 1),
        item("route1_beere", "beere_rot", 20, 122, 2),
    ],
    ambience={"fogNear": 55, "fogFar": 300},
)

# ==========================================================================
# QUELLHEIM - ERSTE STADT MIT ARENA
# ==========================================================================
area(
    id="quellheim", name="Quellheim", kind="town", biome="grassland",
    size=[112, 98], seed=1301,
    terrain={
        "baseHeight": 0, "amplitude": 1.8, "frequency": 0.04, "octaves": 3,
        "cliffBorder": True,
        "paths": [
            {"points": [[56, 2], [56, 94]], "width": 9},
            {"points": [[10, 46], [102, 46]], "width": 7},
        ],
    },
    music="town", mapPos=[50, 58],
    description="Eine Stadt rund um eine uralte Quelle - Heimat der ersten Arena.",
    weather=["clear", "cloudy", "rain"],
    connections=[
        conn("route_1", 48, 0, 16, 3, "from_quellheim"),
    ],
    spawnPoints=[
        sp("default", 56, 10, 0),
        sp("from_route1", 56, 8, 0),
        sp("from_route2", 56, 92, math.pi),
        sp("from_center", 30, 40, SOUTH),
        sp("from_shop", 82, 40, SOUTH),
        sp("from_gym", 56, 64, SOUTH),
        sp("from_haus1", 20, 74, EAST),
        sp("from_haus2", 92, 74, WEST),
    ],
    buildings=[
        building("center", 30, 48, SOUTH, "center_quellheim", "entrance", "Heilstation", [0, 4.6]),
        building("shop", 82, 48, SOUTH, "shop_quellheim", "entrance", "Warenlager", [0, 3.8]),
        building("gym", 56, 74, SOUTH, "gym_quellheim", "entrance", "Arena von Quellheim", [0, 6.4]),
        building("hut", 18, 76, EAST, "haus_quellheim_1", "entrance", "Wohnhaus", [0, 2.8], variant=2),
        building("hut", 94, 76, WEST, "haus_quellheim_2", "entrance", "Wohnhaus", [0, 2.8], variant=9),
        building("house", 20, 18, EAST, None, None, "Wohnhaus", None, variant=4),
        building("house", 92, 18, WEST, None, None, "Wohnhaus", None, variant=6),
    ],
    props=(
        fence_line(6, 6, 44, 6, 10)
        + fence_line(68, 6, 106, 6, 10)
        + [prop("well", 56, 46, 0, 1.3, 0),
           prop("lamp", 46, 30, 0, 1.0, 0), prop("lamp", 66, 30, 0, 1.0, 1),
           prop("lamp", 46, 62, 0, 1.0, 2), prop("lamp", 66, 62, 0, 1.0, 3),
           prop("bench", 48, 52, EAST, 1.0, 0), prop("bench", 64, 52, WEST, 1.0, 1),
           prop("tree", 12, 32, 0.4, 1.2, 1), prop("tree", 100, 32, 1.4, 1.15, 2),
           prop("tree", 14, 90, 2.1, 1.25, 3), prop("tree", 98, 90, 0.7, 1.2, 4),
           prop("flower", 42, 44, 0, 1.2, 1), prop("flower", 70, 44, 0, 1.1, 2),
           prop("flower", 40, 68, 0, 1.0, 3), prop("flower", 72, 68, 0, 1.3, 4),
           prop("sign", 52, 12, 0, 1.0, 0),
           prop("statue", 56, 88, SOUTH, 0.9, 0)]
    ),
    npcs=[
        npc("quellheim_fuehrer", 56, 22, SOUTH, name="Stadtfuehrer", dialogue="quellheim_fuehrer",
            appearance={"skin": "#d8b08a", "hair": "#4a3524", "shirt": "#4b6b9b",
                        "pants": "#3a3a42", "accent": "#e0d8c4", "hat": "cap"}),
        npc("quellheim_kind", 66, 56, WEST, name="Kind", dialogue="quellheim_kind", wander=6,
            appearance={"skin": "#f0cfa8", "hair": "#c24b4b", "shirt": "#ffd84b",
                        "pants": "#4b6b8f", "accent": "#ffffff", "hat": "cap", "height": 0.76}),
        npc("quellheim_trainerin", 84, 66, WEST, name="Schuelerin Mira", trainer="schuelerin_mira",
            minStoryStage=4,
            appearance={"skin": "#e8c19b", "hair": "#2b2b2b", "shirt": "#8f4bbf",
                        "pants": "#3f3f4a", "accent": "#ffffff", "hat": "none", "height": 0.94}),
    ],
    items=[item("quellheim_disk", "td19", 100, 88, 1)],
    ambience={"fogNear": 65, "fogFar": 340},
)

# ---- Innenraeume Quellheim ------------------------------------------------
area(
    id="center_quellheim", name="Heilstation Quellheim", kind="interior", biome="urban",
    size=[20, 15], seed=1302, indoor=True,
    terrain={"baseHeight": 0, "amplitude": 0, "frequency": 0.1, "flat": True},
    music="center",
    interiorStyle={
        "wallColor": "#f5efe4", "floorColor": "#e0d4c0", "accentColor": "#d8455f",
        "wallHeight": 3.6, "ceiling": True,
        "exits": [{"x": 10, "z": 0, "width": 3.0, "side": "south"}],
        "furniture": [
            {"kind": "counter", "pos": [10, 11.6], "rotation": 0, "color": "#d8455f"},
            {"kind": "machine", "pos": [15.6, 11.8], "rotation": 0},
            {"kind": "computer", "pos": [3.4, 11.8], "rotation": 0},
            {"kind": "sofa", "pos": [3.2, 5.0], "rotation": EAST, "color": "#4b7a9b"},
            {"kind": "sofa", "pos": [16.8, 5.0], "rotation": WEST, "color": "#4b7a9b"},
            {"kind": "table", "pos": [10, 5.0]},
            {"kind": "plant", "pos": [1.6, 13.2]},
            {"kind": "plant", "pos": [18.4, 13.2]},
            {"kind": "rug", "pos": [10, 3.2], "color": "#d8455f"},
        ],
    },
    spawnPoints=[sp("default", 10, 3, 0), sp("entrance", 10, 2.4, 0)],
    connections=[conn("quellheim", 8.5, 0, 3.0, 1.8, "from_center")],
    npcs=[
        npc("nurse_quellheim", 10, 9.8, SOUTH, name="Pflegerin", dialogue="heilstation", role="heal",
            appearance={"skin": "#e8c19b", "hair": "#d8455f", "shirt": "#ffffff",
                        "pants": "#f0e6d2", "accent": "#d8455f", "hat": "band"}),
        npc("center_gast", 5.2, 5.6, EAST, name="Reisender", dialogue="center_gast",
            appearance={"skin": "#c99a6b", "hair": "#3a2a1c", "shirt": "#7a9b4b",
                        "pants": "#4a4a52", "accent": "#c4b08a", "hat": "beanie"}),
    ],
)

area(
    id="shop_quellheim", name="Warenlager Quellheim", kind="interior", biome="urban",
    size=[17, 13], seed=1303, indoor=True,
    terrain={"baseHeight": 0, "amplitude": 0, "frequency": 0.1, "flat": True},
    music="shop",
    interiorStyle={
        "wallColor": "#f0e8d8", "floorColor": "#c9b08a", "accentColor": "#3f7fbf",
        "wallHeight": 3.4, "ceiling": True,
        "exits": [{"x": 8.5, "z": 0, "width": 2.8, "side": "south"}],
        "furniture": [
            {"kind": "counter", "pos": [8.5, 9.8], "rotation": 0, "color": "#3f7fbf"},
            {"kind": "shelf", "pos": [1.8, 6.5], "rotation": EAST},
            {"kind": "shelf", "pos": [15.2, 6.5], "rotation": WEST},
            {"kind": "crateStack", "pos": [3.0, 11.4]},
            {"kind": "crateStack", "pos": [14.0, 11.4]},
            {"kind": "plant", "pos": [15.4, 2.0]},
        ],
    },
    spawnPoints=[sp("default", 8.5, 3, 0), sp("entrance", 8.5, 2.4, 0)],
    connections=[conn("quellheim", 7.1, 0, 2.8, 1.8, "from_shop")],
    npcs=[
        npc("haendler_quellheim", 8.5, 8.0, SOUTH, name="Haendler", dialogue="shop_haendler",
            role="shop", shop="shop_quellheim",
            appearance={"skin": "#d8b08a", "hair": "#4a3524", "shirt": "#3f7fbf",
                        "pants": "#3a3a42", "accent": "#ffffff", "hat": "cap"}),
    ],
)

area(
    id="haus_quellheim_1", name="Wohnhaus", kind="interior", biome="urban",
    size=[11, 9], seed=1304, indoor=True,
    terrain={"baseHeight": 0, "amplitude": 0, "frequency": 0.1, "flat": True},
    music="home",
    interiorStyle={
        "wallColor": "#e6dcc8", "floorColor": "#a8763f", "accentColor": "#7a5f3f",
        "wallHeight": 2.9, "ceiling": True,
        "exits": [{"x": 5.5, "z": 0, "width": 2.2, "side": "south"}],
        "furniture": [
            {"kind": "table", "pos": [3.6, 5.4]},
            {"kind": "chair", "pos": [3.6, 6.8], "rotation": math.pi},
            {"kind": "shelf", "pos": [9.0, 6.6], "rotation": WEST},
        ],
    },
    spawnPoints=[sp("default", 5.5, 3, 0), sp("entrance", 5.5, 2.2, 0)],
    connections=[conn("quellheim", 4.4, 0, 2.2, 1.6, "from_haus1")],
    npcs=[
        npc("quellheim_forscher", 6.6, 5.4, WEST, name="Naturkundler", dialogue="quellheim_forscher",
            appearance={"skin": "#c99a6b", "hair": "#cfcfcf", "shirt": "#5f8f7a",
                        "pants": "#4a4a52", "accent": "#e0d8c4", "hat": "none"}),
    ],
)

area(
    id="haus_quellheim_2", name="Wohnhaus", kind="interior", biome="urban",
    size=[11, 9], seed=1305, indoor=True,
    terrain={"baseHeight": 0, "amplitude": 0, "frequency": 0.1, "flat": True},
    music="home",
    interiorStyle={
        "wallColor": "#e0e0ec", "floorColor": "#9b7346", "accentColor": "#4b6b8f",
        "wallHeight": 2.9, "ceiling": True,
        "exits": [{"x": 5.5, "z": 0, "width": 2.2, "side": "south"}],
        "furniture": [
            {"kind": "sofa", "pos": [8.2, 5.6], "rotation": WEST, "color": "#4b6b8f"},
            {"kind": "tv", "pos": [2.2, 5.6], "rotation": EAST},
            {"kind": "plant", "pos": [9.4, 7.6]},
        ],
    },
    spawnPoints=[sp("default", 5.5, 3, 0), sp("entrance", 5.5, 2.2, 0)],
    connections=[conn("quellheim", 4.4, 0, 2.2, 1.6, "from_haus2")],
    npcs=[
        npc("quellheim_tipp", 6.4, 6.6, SOUTH, name="Alte Trainerin", dialogue="quellheim_tipp",
            appearance={"skin": "#e8c19b", "hair": "#cfcfcf", "shirt": "#8f6b9b",
                        "pants": "#4a4a52", "accent": "#ffe0a0", "hat": "none", "height": 0.94}),
    ],
)

area(
    id="gym_quellheim", name="Arena von Quellheim", kind="stadium", biome="urban",
    size=[30, 44], seed=1306, indoor=True,
    terrain={"baseHeight": 0, "amplitude": 0, "frequency": 0.1, "flat": True},
    music="gym",
    interiorStyle={
        "wallColor": "#d8e8cf", "floorColor": "#6b9b4f", "accentColor": "#7fc44b",
        "wallHeight": 7.0, "ceiling": True,
        "exits": [{"x": 15, "z": 0, "width": 4.0, "side": "south"}],
        "furniture": [
            {"kind": "podium", "pos": [15, 36], "color": "#7fc44b"},
            {"kind": "plant", "pos": [3.0, 8.0], "scale": 1.4},
            {"kind": "plant", "pos": [27.0, 8.0], "scale": 1.4},
            {"kind": "plant", "pos": [3.0, 30.0], "scale": 1.4},
            {"kind": "plant", "pos": [27.0, 30.0], "scale": 1.4},
            {"kind": "lamp", "pos": [6.0, 20.0]},
            {"kind": "lamp", "pos": [24.0, 20.0]},
        ],
    },
    spawnPoints=[
        sp("default", 15, 4, 0), sp("entrance", 15, 3.2, 0), sp("leader", 15, 30, 0),
    ],
    connections=[conn("quellheim", 13, 0, 4.0, 2.0, "from_gym")],
    npcs=[
        npc("gym1_minion_1", 9, 14, EAST, name="Arena-Trainer Ben", trainer="arena1_ben",
            appearance={"skin": "#d8b08a", "hair": "#4a3524", "shirt": "#7fc44b",
                        "pants": "#3f5f33", "accent": "#ffffff", "hat": "cap"}),
        npc("gym1_minion_2", 21, 22, WEST, name="Arena-Trainerin Lin", trainer="arena1_lin",
            appearance={"skin": "#f0cfa8", "hair": "#2b2b2b", "shirt": "#7fc44b",
                        "pants": "#3f5f33", "accent": "#ffffff", "hat": "none", "height": 0.93}),
        npc("gym1_leader", 15, 34, SOUTH, name="Arenaleiterin Thalia",
            trainer="arenaleiterin_thalia", role="gymLeader",
            appearance={"skin": "#e0b894", "hair": "#4f8a42", "shirt": "#d8e8cf",
                        "pants": "#5f7a4f", "accent": "#7fc44b", "hat": "band", "height": 1.02}),
    ],
    ambience={"fogNear": 40, "fogFar": 120},
)

# ==========================================================================
# AUSGABE
# ==========================================================================
def main():
    ids = set()
    problems = []
    warnings = []
    by_id = {}
    for a in AREAS:
        if a["id"] in ids:
            problems.append(f"Doppelte Gebiets-ID: {a['id']}")
        ids.add(a["id"])
        by_id[a["id"]] = a

    for a in AREAS:
        w, d = a["size"]
        # Verbindungsziele und Spawnpunkte pruefen
        for c in a["connections"]:
            if c["to"] not in ids:
                problems.append(f"{a['id']}: Verbindung zu unbekanntem Gebiet '{c['to']}'")
            else:
                target = by_id[c["to"]]
                if not any(s["id"] == c["spawnPoint"] for s in target["spawnPoints"]):
                    problems.append(
                        f"{a['id']}: Spawnpunkt '{c['spawnPoint']}' fehlt in '{c['to']}'")
            t = c["trigger"]
            if t["x"] < 0 or t["z"] < 0 or t["x"] + t["width"] > w or t["z"] + t["depth"] > d:
                problems.append(f"{a['id']}: Verbindungs-Trigger liegt ausserhalb des Gebiets")
        # Gebaeude-Innenraeume pruefen
        for b in a["buildings"]:
            if b.get("interior") and b["interior"] not in ids:
                problems.append(f"{a['id']}: Innenraum '{b['interior']}' existiert nicht")
            if b.get("interior"):
                target = by_id.get(b["interior"])
                if target and not any(s["id"] == b.get("spawnPoint") for s in target["spawnPoints"]):
                    problems.append(
                        f"{a['id']}: Gebaeude-Spawnpunkt '{b.get('spawnPoint')}' fehlt in '{b['interior']}'")
        # Positionen innerhalb der Grenzen
        for key in ("spawnPoints",):
            for s in a[key]:
                if not (0 <= s["pos"][0] <= w and 0 <= s["pos"][1] <= d):
                    problems.append(f"{a['id']}: Spawnpunkt '{s['id']}' liegt ausserhalb")
        for n in a["npcs"]:
            if not (0 <= n["pos"][0] <= w and 0 <= n["pos"][1] <= d):
                problems.append(f"{a['id']}: NPC '{n['id']}' liegt ausserhalb")
        for p in a["props"]:
            if not (0 <= p["pos"][0] <= w and 0 <= p["pos"][1] <= d):
                problems.append(f"{a['id']}: Prop '{p['kind']}' liegt ausserhalb ({p['pos']})")
        for b in a["buildings"]:
            if not (0 <= b["pos"][0] <= w and 0 <= b["pos"][1] <= d):
                problems.append(f"{a['id']}: Gebaeude '{b['kind']}' liegt ausserhalb")

    # Aussengebiete muessen in beide Richtungen begehbar sein - eine Stadt
    # ohne Rueckweg ist eine Sackgasse und faellt sonst erst beim Spielen auf.
    for a in AREAS:
        if a.get("indoor"):
            continue
        for c in a["connections"]:
            target = by_id.get(c["to"])
            if target is None or target.get("indoor"):
                continue
            back = [x for x in target["connections"] if x["to"] == a["id"]]
            if not back:
                problems.append(
                    f"{a['id']} -> {c['to']}: keine Rueckverbindung von '{c['to']}'")

    # Jeder Spawnpunkt muss von mindestens einer Verbindung oder einem
    # Gebaeude erreichbar sein (oder 'default' heissen).
    for a in AREAS:
        referenced = {"default"}
        for other in AREAS:
            for c in other["connections"]:
                if c["to"] == a["id"]:
                    referenced.add(c["spawnPoint"])
            for b in other["buildings"]:
                if b.get("interior") == a["id"] and b.get("spawnPoint"):
                    referenced.add(b["spawnPoint"])
        for s_ in a["spawnPoints"]:
            if s_["id"] not in referenced:
                warnings.append(
                    f"{a['id']}: Spawnpunkt '{s_['id']}' wird (noch) von keiner "
                    f"Verbindung benutzt - erwartet bei Cutscene-Zielen und "
                    f"geplanten Nachbargebieten")

    if problems:
        print("FEHLER in den Gebietsdaten:")
        for p in problems:
            print("  -", p)
        raise SystemExit(1)
    for w in warnings:
        print("  Hinweis:", w)

    OUT.mkdir(parents=True, exist_ok=True)
    for f in OUT.glob("*.json"):
        f.unlink()
    for a in AREAS:
        (OUT / f"{a['id']}.json").write_text(json.dumps(a, indent=1, ensure_ascii=False) + "\n")
    print(f"{len(AREAS)} Gebiete geschrieben:", ", ".join(a["id"] for a in AREAS))


if __name__ == "__main__":
    main()
