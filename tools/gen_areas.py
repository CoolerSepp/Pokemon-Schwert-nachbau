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
             door=None, scale=1.0, variant=0, requires=None, blocked_text=None):
    b = {"kind": kind, "pos": [x, z], "rotation": rot, "scale": scale, "variant": variant}
    if interior: b["interior"] = interior
    if spawn: b["spawnPoint"] = spawn
    if label: b["label"] = label
    if door: b["doorOffset"] = door
    if requires: b["requires"] = requires
    if blocked_text: b["blockedText"] = blocked_text
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
        npc("rivale_r1", 32, 138, SOUTH, name="Rivale Jorin", trainer="rivale_1",
            minStoryStage=3, maxStoryStage=4,
            appearance={"skin": "#d8b08a", "hair": "#c24b4b", "shirt": "#4b8f7a", "pants": "#3f3f4a", "accent": "#f0e0c4", "hat": "cap", "height": 1.01}),
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
        conn("route_2", 48, 95, 16, 3, "from_quellheim"),
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
    triggers=[
        {"id": "gym1_einzug", "pos": [15, 7.0], "radius": 3.0, "once": True,
         "action": {"kind": "cutscene", "cutscene": "arena_einzug"}},
    ],
    ambience={"fogNear": 40, "fogFar": 120},
)


# ==========================================================================
# VORLAGEN FUER DEN REGION-AUSBAU
# ==========================================================================
CENTER_STYLE = {
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
    ],
}

SHOP_STYLE = {
    "wallColor": "#f0e8d8", "floorColor": "#c9b08a", "accentColor": "#3f7fbf",
    "wallHeight": 3.4, "ceiling": True,
    "exits": [{"x": 8.5, "z": 0, "width": 2.8, "side": "south"}],
    "furniture": [
        {"kind": "counter", "pos": [8.5, 9.8], "rotation": 0, "color": "#3f7fbf"},
        {"kind": "shelf", "pos": [1.8, 6.5], "rotation": EAST},
        {"kind": "shelf", "pos": [15.2, 6.5], "rotation": WEST},
        {"kind": "crateStack", "pos": [3.0, 11.4]},
        {"kind": "crateStack", "pos": [14.0, 11.4]},
    ],
}

NURSE_LOOK = {"skin": "#e8c19b", "hair": "#d8455f", "shirt": "#ffffff",
              "pants": "#f0e6d2", "accent": "#d8455f", "hat": "band"}
CLERK_LOOK = {"skin": "#d8b08a", "hair": "#4a3524", "shirt": "#3f7fbf",
              "pants": "#3a3a42", "accent": "#ffffff", "hat": "cap"}


def make_center(city_id, seed, city_spawn):
    """Heilstation eines Ortes."""
    area(
        id=f"center_{city_id}", name="Heilstation", kind="interior", biome="urban",
        size=[20, 15], seed=seed, indoor=True,
        terrain={"baseHeight": 0, "amplitude": 0, "frequency": 0.1, "flat": True},
        music="center", interiorStyle=dict(CENTER_STYLE),
        spawnPoints=[sp("default", 10, 3, 0), sp("entrance", 10, 2.4, 0)],
        connections=[conn(city_id, 8.5, 0, 3.0, 1.8, city_spawn)],
        npcs=[npc(f"nurse_{city_id}", 10, 9.8, SOUTH, name="Pflegerin",
                  dialogue="heilstation", role="heal", appearance=NURSE_LOOK)],
    )


def make_shop(city_id, seed, city_spawn, shop_id):
    """Warenlager eines Ortes."""
    area(
        id=f"shop_{city_id}", name="Warenlager", kind="interior", biome="urban",
        size=[17, 13], seed=seed, indoor=True,
        terrain={"baseHeight": 0, "amplitude": 0, "frequency": 0.1, "flat": True},
        music="shop", interiorStyle=dict(SHOP_STYLE),
        spawnPoints=[sp("default", 8.5, 3, 0), sp("entrance", 8.5, 2.4, 0)],
        connections=[conn(city_id, 7.1, 0, 2.8, 1.8, city_spawn)],
        npcs=[npc(f"haendler_{city_id}", 8.5, 8.0, SOUTH, name="Haendler",
                  dialogue="shop_haendler", role="shop", shop=shop_id,
                  appearance=CLERK_LOOK)],
    )


def make_gym(gym_id, name, city_id, seed, colors, floor, leader, minions,
             leader_look, minion_looks, size=(30, 44), entry_cutscene=None):
    """Arena-Innenraum mit Vorkaempfern und Leiter."""
    w, d = size
    area(
        id=gym_id, name=name, kind="stadium", biome="urban",
        size=[w, d], seed=seed, indoor=True,
        terrain={"baseHeight": 0, "amplitude": 0, "frequency": 0.1, "flat": True},
        music="gym",
        interiorStyle={
            "wallColor": colors["accent"], "floorColor": floor,
            "accentColor": colors["secondary"], "wallHeight": 7.0, "ceiling": True,
            "exits": [{"x": w / 2, "z": 0, "width": 4.0, "side": "south"}],
            "furniture": [
                {"kind": "podium", "pos": [w / 2, d - 8], "color": colors["secondary"]},
                {"kind": "plant", "pos": [3.0, 8.0], "scale": 1.4},
                {"kind": "plant", "pos": [w - 3.0, 8.0], "scale": 1.4},
                {"kind": "lamp", "pos": [6.0, d / 2]},
                {"kind": "lamp", "pos": [w - 6.0, d / 2]},
                {"kind": "crateStack", "pos": [4.0, d - 6]},
                {"kind": "crateStack", "pos": [w - 4.0, d - 6]},
            ],
        },
        spawnPoints=[
            sp("default", w / 2, 4, 0), sp("entrance", w / 2, 3.2, 0),
            sp("leader", w / 2, d - 14, 0),
        ],
        connections=[conn(city_id, w / 2 - 2, 0, 4.0, 2.0, f"from_gym")],
        npcs=[
            npc(f"{gym_id}_m1", w * 0.3, d * 0.32, EAST, name="Arena-Trainer",
                trainer=minions[0], appearance=minion_looks[0]),
            npc(f"{gym_id}_m2", w * 0.7, d * 0.5, WEST, name="Arena-Trainerin",
                trainer=minions[1], appearance=minion_looks[1]),
            npc(f"{gym_id}_leader", w / 2, d - 10, SOUTH, name="Arenaleitung",
                trainer=leader, role="gymLeader", appearance=leader_look),
        ],
        **({"triggers": [{"id": f"{gym_id}_einzug", "pos": [size[0] / 2, 7.0],
                          "radius": 3.0, "once": True,
                          "action": {"kind": "cutscene", "cutscene": entry_cutscene}}]}
           if entry_cutscene else {}),
        ambience={"fogNear": 40, "fogFar": 130},
    )


def arena_look(shirt, hair="#3a2a1c", skin="#d8b08a", hat="cap", height=1.0):
    return {"skin": skin, "hair": hair, "shirt": shirt, "pants": "#3a3a42",
            "accent": "#ffffff", "hat": hat, "height": height}


def make_city(city_id, name, biome, size, seed, map_pos, description,
              gym_id, gym_name, shop_id, connections, spawn_points,
              extra_buildings=(), extra_npcs=(), extra_props=(), items=(),
              weather=("clear", "cloudy", "rain"), music="town", triggers=()):
    """Stadt mit Heilstation, Laden und Arena samt Innenraeumen."""
    w, d = size
    buildings = [
        building("center", w * 0.26, d * 0.5, SOUTH, f"center_{city_id}",
                 "entrance", "Heilstation", [0, 4.6]),
        building("shop", w * 0.74, d * 0.5, SOUTH, f"shop_{city_id}",
                 "entrance", "Warenlager", [0, 3.8]),
        building("gym", w * 0.5, d * 0.76, SOUTH, gym_id,
                 "entrance", gym_name, [0, 6.4]),
    ] + list(extra_buildings)

    props = [
        prop("lamp", w * 0.4, d * 0.3, 0, 1.0, 0),
        prop("lamp", w * 0.6, d * 0.3, 0, 1.0, 1),
        prop("lamp", w * 0.4, d * 0.64, 0, 1.0, 2),
        prop("lamp", w * 0.6, d * 0.64, 0, 1.0, 3),
        prop("bench", w * 0.44, d * 0.52, EAST, 1.0, 0),
        prop("bench", w * 0.56, d * 0.52, WEST, 1.0, 1),
        prop("sign", w * 0.46, d * 0.12, 0, 1.0, 0),
        prop("well", w * 0.5, d * 0.46, 0, 1.1, 0),
    ] + list(extra_props)

    area(
        id=city_id, name=name, kind="city", biome=biome,
        size=[w, d], seed=seed, mapPos=list(map_pos),
        description=description, music=music, weather=list(weather),
        terrain={
            "baseHeight": 0, "amplitude": 1.8, "frequency": 0.04, "octaves": 3,
            "cliffBorder": True,
            "paths": [
                {"points": [[w * 0.5, 2], [w * 0.5, d - 4]], "width": 9},
                {"points": [[8, d * 0.5], [w - 8, d * 0.5]], "width": 7},
            ],
        },
        spawnPoints=list(spawn_points) + [
            sp("from_center", w * 0.26, d * 0.5 - 8, SOUTH),
            sp("from_shop", w * 0.74, d * 0.5 - 8, SOUTH),
            sp("from_gym", w * 0.5, d * 0.76 - 10, SOUTH),
        ],
        connections=list(connections),
        buildings=buildings,
        props=props,
        npcs=list(extra_npcs),
        items=list(items),
        triggers=list(triggers),
        ambience={"fogNear": 65, "fogFar": 340},
    )
    make_center(city_id, seed + 1, "from_center")
    make_shop(city_id, seed + 2, "from_shop", shop_id)


def make_route(route_id, name, num, biome, size, seed, map_pos, description,
               spawn_table, connections, spawn_points, grass_zones,
               props=(), npcs=(), items=(), weather=("clear", "cloudy", "rain"),
               music="route", amplitude=5.5, water_level=None, max_wild=14,
               path=None, ridged=False, cliff=True, triggers=()):
    """Route zwischen zwei Orten."""
    w, d = size
    terrain = {
        "baseHeight": 0, "amplitude": amplitude, "frequency": 0.028, "octaves": 4,
        "cliffBorder": cliff, "ridged": ridged,
        "paths": [{"points": path or [[w / 2, 2], [w / 2, d - 2]], "width": 7}],
    }
    if water_level is not None:
        terrain["waterLevel"] = water_level
    area(
        id=route_id, name=name, kind="route", biome=biome,
        size=[w, d], seed=seed, mapPos=list(map_pos),
        description=description, music=music, weather=list(weather),
        terrain=terrain,
        grassZones=list(grass_zones),
        spawnTable=list(spawn_table),
        maxWild=max_wild,
        spawnPoints=list(spawn_points),
        connections=list(connections),
        props=list(props),
        npcs=list(npcs),
        items=list(items),
        triggers=list(triggers),
        ambience={"fogNear": 55, "fogFar": 300},
    )


def spawn(species, lo, hi, weight, behaviour="wander", rare=False,
          time=None, weather=None, stage=None, size=None):
    e = {"species": species, "minLevel": lo, "maxLevel": hi,
         "weight": weight, "behaviour": behaviour}
    if rare: e["rare"] = True
    if time: e["timeOfDay"] = list(time)
    if weather: e["weather"] = list(weather)
    if stage is not None: e["minStoryStage"] = stage
    if size: e["sizeVariant"] = size
    return e


def trainer_npc(id, x, z, facing, name, trainer_id, shirt, **kw):
    return npc(id, x, z, facing, name=name, trainer=trainer_id,
               appearance=arena_look(shirt), **kw)

# ==========================================================================
# REGION AETHERIA - AUSBAU
# ==========================================================================

# ------------------------------------------------------------ ROUTE 2
make_route(
    "route_2", "Route 2", 2, "meadow", (70, 130), 1401, (40, 64),
    "Ein Weg durch bluehende Wiesen entlang eines Baches.",
    spawn_table=[
        spawn("federflaum", 10, 14, 22), spawn("knollknospe", 11, 14, 18, "static"),
        spawn("flatterling", 11, 15, 18), spawn("nagezahn", 10, 13, 16, "skittish"),
        spawn("schlammlurch", 12, 15, 14, "shy"),
        spawn("feenfunke", 12, 16, 8, "shy", rare=True),
        spawn("windfuchs", 13, 16, 10, "skittish", time=["dawn", "day"]),
        spawn("nachtschleier", 13, 16, 8, "aggressive", time=["dusk", "night"], rare=True),
    ],
    connections=[
        conn("quellheim", 27, 0, 16, 3, "from_route2"),
        conn("flusshafen", 27, 127, 16, 3, "from_route2"),
    ],
    spawn_points=[sp("from_quellheim", 35, 6, 0), sp("from_flusshafen", 35, 124, math.pi),
                  sp("default", 35, 6, 0)],
    grass_zones=[grass(16, 28, 20, 22, 2.0), grass(54, 40, 18, 20, 1.9),
                 grass(18, 74, 20, 22, 2.0), grass(52, 96, 18, 20, 1.8)],
    props=[prop("sign", 40, 10, SOUTH, 1.0, 0), prop("tree", 10, 24, 0.4, 1.3, 1),
           prop("tree", 60, 30, 1.2, 1.2, 2), prop("tree", 12, 66, 2.0, 1.35, 3),
           prop("tree", 58, 88, 0.6, 1.25, 4), prop("bush", 44, 52, 0, 1.1, 5),
           prop("flower", 26, 44, 0, 1.2, 6), prop("flower", 48, 68, 0, 1.1, 7),
           prop("reed", 22, 104, 0, 1.2, 8), prop("reed", 48, 112, 0, 1.1, 9)],
    npcs=[
        trainer_npc("r2_t1", 36, 46, SOUTH, "Kaefersammler Tom", "kaefersammler_tom", "#9bc44b"),
        trainer_npc("r2_t2", 32, 92, 0, "Wandererin Nele", "wandererin_nele", "#4b8f9b"),
        npc("r2_npc", 44, 118, WEST, name="Angler", dialogue="generic_npc"),
    ],
    items=[item("r2_ball", "superkugel", 20, 36, 2), item("r2_trank", "supertrank", 56, 82, 1)],
    water_level=-1.6,
)

# ------------------------------------------------------------ FLUSSHAFEN
make_city(
    "flusshafen", "Flusshafen", "coastal", (120, 104), 1501, (26, 58),
    "Eine Hafenstadt, in der Fluss und Meer aufeinandertreffen.",
    gym_id="gym_flusshafen", gym_name="Arena von Flusshafen", shop_id="shop_standard",
    connections=[
        conn("route_2", 52, 0, 16, 3, "from_flusshafen"),
        conn("route_3", 52, 101, 16, 3, "from_flusshafen"),
    ],
    spawn_points=[sp("default", 60, 10, 0), sp("from_route2", 60, 8, 0),
                  sp("from_route3", 60, 98, math.pi)],
    extra_buildings=[
        building("warehouse", 22, 84, EAST, None, None, "Lagerhalle", None, 0.9, 3),
        building("house", 100, 22, WEST, None, None, "Wohnhaus", None, 1.0, 5),
        building("station", 100, 84, WEST, None, None, "Bahnhof", None, 1.0, 2),
    ],
    extra_props=[prop("palm", 16, 34, 0.3, 1.2, 1), prop("palm", 104, 40, 1.1, 1.15, 2),
                 prop("barrel", 30, 78, 0, 1.0, 3), prop("crate", 34, 82, 0.4, 1.0, 4),
                 prop("lilypad", 92, 64, 0, 1.2, 5)],
    extra_npcs=[
        npc("fh_guide", 60, 24, SOUTH, name="Hafenmeister", dialogue="flusshafen_guide"),
        npc("fh_kind", 70, 58, WEST, name="Kind", dialogue="generic_npc", wander=5),
        trainer_npc("fh_t1", 92, 66, WEST, "Matrose Jens", "matrose_jens", "#3f7fbf"),
        npc("rivale_fh", 60, 32, SOUTH, name="Rivale Jorin", trainer="rivale_2",
            minStoryStage=5, maxStoryStage=6, appearance={"skin": "#d8b08a", "hair": "#c24b4b", "shirt": "#4b8f7a", "pants": "#3f3f4a", "accent": "#f0e0c4", "hat": "cap", "height": 1.01}),
    ],
    items=[item("fh_disk", "td03", 24, 26, 1)],
    weather=("clear", "cloudy", "rain", "heavyRain", "fog"),
)
make_gym(
    "gym_flusshafen", "Arena von Flusshafen", "flusshafen", 1520,
    {"primary": "#3f7fbf", "secondary": "#5fb0e0", "accent": "#cfe4f2"},
    floor="#4f8fb8", leader="arenaleiter_marek",
    minions=["arena2_tim", "arena2_saskia"],
    leader_look=arena_look("#3f7fbf", hair="#1f3f5f", hat="beanie", height=1.05),
    minion_looks=[arena_look("#5fb0e0"), arena_look("#5fb0e0", hair="#2b2b2b", hat="none", height=0.94)],
)

# ------------------------------------------------------------ ROUTE 3
make_route(
    "route_3", "Route 3", 3, "forest", (66, 140), 1601, (34, 50),
    "Ein schattiger Pfad am Rand des Dornwalds.",
    spawn_table=[
        spawn("kribbelkaefer", 14, 18, 18), spawn("flatterling", 15, 19, 16),
        spawn("giftkappe", 15, 19, 16, "static"), spawn("sprossling", 15, 18, 12, "shy"),
        spawn("schattenwolf", 16, 20, 12, "aggressive", time=["dusk", "night"]),
        spawn("waldschrat", 17, 21, 8, "static", rare=True),
        spawn("mondpanther", 18, 21, 5, "skittish", time=["night"], rare=True),
        spawn("klingenkaefer", 18, 21, 6, "aggressive", rare=True),
    ],
    connections=[
        conn("flusshafen", 25, 0, 16, 3, "from_route3"),
        conn("dornwald", 25, 137, 16, 3, "from_route3"),
    ],
    spawn_points=[sp("from_flusshafen", 33, 6, 0), sp("from_dornwald", 33, 134, math.pi),
                  sp("default", 33, 6, 0)],
    grass_zones=[grass(14, 30, 18, 22, 2.2), grass(50, 48, 18, 22, 2.1),
                 grass(16, 82, 20, 24, 2.2), grass(50, 108, 18, 22, 2.0)],
    props=[prop("tree", 10, 20, 0.4, 1.4, 1), prop("pine", 56, 28, 1.2, 1.3, 2),
           prop("tree", 12, 60, 2.0, 1.45, 3), prop("pine", 54, 72, 0.6, 1.35, 4),
           prop("mushroom", 30, 56, 0, 1.2, 5), prop("stump", 40, 96, 0, 1.0, 6),
           prop("tree", 10, 116, 1.5, 1.4, 7), prop("deadTree", 56, 124, 0.8, 1.1, 8)],
    npcs=[
        trainer_npc("r3_t1", 34, 52, SOUTH, "Kraeuterkundige Rina", "kraeuterkundige_rina", "#5f8f4b"),
        trainer_npc("r3_t2", 30, 100, 0, "Waldlaeufer Ove", "waldlaeufer_ove", "#6b5f3f"),
    ],
    items=[item("r3_stein", "blattstein", 18, 88, 1), item("r3_beere", "beere_gruen", 52, 60, 2)],
    music="forest", amplitude=6.5,
    weather=("clear", "cloudy", "rain", "fog"),
)

# ------------------------------------------------------------ DORNWALD
area(
    id="dornwald", name="Dornwald", kind="forest", biome="forest",
    size=[130, 120], seed=1701, mapPos=[44, 46],
    description="Ein dichter Urwald, in dem selbst mittags Daemmerung herrscht.",
    music="forest", weather=["clear", "cloudy", "rain", "fog"],
    terrain={"baseHeight": 0, "amplitude": 7.5, "frequency": 0.03, "octaves": 4,
             "cliffBorder": True,
             "paths": [{"points": [[65, 2], [50, 40], [78, 76], [65, 118]], "width": 6}]},
    grassZones=[grass(26, 30, 26, 26, 2.4), grass(100, 36, 24, 24, 2.3),
                grass(30, 84, 26, 26, 2.4), grass(98, 90, 24, 24, 2.2),
                grass(64, 60, 22, 22, 2.1)],
    spawnTable=[
        spawn("kribbelkaefer", 17, 21, 14), spawn("puppenpanzer", 18, 22, 10, "static"),
        spawn("giftkappe", 18, 22, 14, "static"), spawn("sporenherr", 22, 26, 8, "static", rare=True),
        spawn("flatterling", 18, 22, 12), spawn("falterglanz", 22, 26, 7, rare=True),
        spawn("waldschrat", 20, 25, 10, "static"),
        spawn("dornenranke", 20, 24, 10, "aggressive"),
        spawn("schattenwolf", 19, 23, 10, "aggressive", time=["dusk", "night"]),
        spawn("nachtschleier", 19, 23, 8, "shy", time=["night"], rare=True),
        spawn("klingenkaefer", 23, 27, 6, "aggressive", rare=True),
    ],
    maxWild=22,
    spawnPoints=[sp("from_route3", 65, 6, 0), sp("from_route4", 65, 114, math.pi),
                 sp("default", 65, 6, 0)],
    connections=[
        conn("route_3", 57, 0, 16, 3, "from_dornwald"),
        conn("route_4", 57, 117, 16, 3, "from_dornwald"),
    ],
    props=[prop("pine", 20, 18, 0.4, 1.5, 1), prop("tree", 110, 24, 1.2, 1.5, 2),
           prop("stump", 56, 48, 0, 1.1, 3), prop("mushroom", 74, 58, 0, 1.4, 4),
           prop("deadTree", 24, 70, 2.0, 1.2, 5), prop("tree", 108, 96, 0.7, 1.45, 6),
           prop("torch", 62, 30, 0, 1.0, 7), prop("torch", 68, 92, 0, 1.0, 8)],
    npcs=[
        trainer_npc("dw_t1", 56, 44, EAST, "Waldhueterin Anke", "waldhueterin_anke", "#4f8a42"),
        trainer_npc("dw_t2", 76, 80, WEST, "Pilzsammler Udo", "pilzsammler_udo", "#8f6bbf"),
        npc("dw_einsiedler", 100, 60, WEST, name="Einsiedler", dialogue="dornwald_einsiedler"),
    ],
    items=[item("dw_aether", "aether", 34, 52, 2), item("dw_perle", "perle", 106, 74, 1),
           item("dw_disk", "td05", 40, 100, 1)],
    ambience={"fogNear": 30, "fogFar": 150, "lightIntensity": 0.75},
)

# ------------------------------------------------------------ ROUTE 4
make_route(
    "route_4", "Route 4", 4, "rocky", (72, 126), 1801, (60, 50),
    "Ein steiniger Anstieg zur Industriestadt Hammerstadt.",
    spawn_table=[
        spawn("kieselkopf", 19, 23, 18, "static"), spawn("sandwuehler", 19, 23, 16),
        spawn("felsbrocken", 22, 26, 10, "static"), spawn("kampffaust", 21, 25, 12, "aggressive"),
        spawn("bergziege", 22, 26, 10), spawn("donnerhorn", 24, 28, 6, "aggressive", rare=True),
        spawn("ruestungsigel", 21, 25, 10, "shy"),
        spawn("nebelkraehe", 22, 26, 8, time=["dusk", "night"]),
    ],
    connections=[
        conn("dornwald", 28, 0, 16, 3, "from_route4"),
        conn("hammerstadt", 28, 123, 16, 3, "from_route4"),
        conn("schimmerhoehle", 0, 56, 3, 14, "from_route4",
             requires={"badge": 2},
             blocked="Der Hoehleneingang ist verschuettet - vielleicht spaeter."),
    ],
    spawn_points=[sp("from_dornwald", 36, 6, 0), sp("from_hammerstadt", 36, 120, math.pi),
                  sp("from_hoehle", 8, 63, EAST), sp("default", 36, 6, 0)],
    grass_zones=[grass(16, 26, 18, 20, 1.8), grass(56, 44, 16, 20, 1.7),
                 grass(18, 80, 18, 22, 1.9), grass(56, 102, 16, 18, 1.7)],
    props=[prop("boulder", 14, 34, 0.4, 1.3, 1), prop("rock", 58, 30, 1.2, 1.1, 2),
           prop("boulder", 16, 70, 2.0, 1.4, 3), prop("rock", 60, 88, 0.6, 1.2, 4),
           prop("deadTree", 24, 108, 1.5, 1.1, 5), prop("sign", 40, 10, SOUTH, 1.0, 6),
           prop("crystal", 10, 60, 0, 1.1, 7)],
    npcs=[
        trainer_npc("r4_t1", 38, 50, SOUTH, "Bergsteiger Falk", "bergsteiger_falk", "#9b7346"),
        trainer_npc("r4_t2", 34, 96, 0, "Faustkaempfer Ove", "faustkaempfer_ove", "#c96b4b"),
    ],
    items=[item("r4_hyper", "hyperkugel", 20, 58, 2), item("r4_nugget", "nugget", 62, 110, 1)],
    amplitude=9.5, ridged=True, music="route",
    weather=("clear", "cloudy", "rain", "sandstorm"),
)

# ------------------------------------------------------------ SCHIMMERHOEHLE
area(
    id="schimmerhoehle", name="Schimmerhoehle", kind="cave", biome="cave",
    size=[110, 96], seed=1901, mapPos=[70, 46], indoor=True,
    description="Eine Hoehle voller Kristalle, die von selbst zu leuchten scheinen.",
    music="cave", weather=[],
    terrain={"baseHeight": 0, "amplitude": 4.5, "frequency": 0.05, "octaves": 3,
             "cliffBorder": True,
             "paths": [{"points": [[8, 48], [50, 40], [100, 52]], "width": 7}]},
    grassZones=[],
    spawnTable=[
        spawn("kieselkopf", 22, 26, 16, "static"), spawn("felsbrocken", 24, 28, 12, "static"),
        spawn("nachtschleier", 23, 27, 14, "aggressive"),
        spawn("ruestungsigel", 23, 27, 12, "shy"),
        spawn("glutkohle", 23, 27, 10, "static"),
        spawn("goldpanzer", 26, 30, 6, "static", rare=True),
        spawn("klauenwelpe", 24, 28, 5, "shy", rare=True),
        spawn("kristallgeist", 26, 30, 5, "shy", rare=True),
        spawn("tiefseelicht", 26, 30, 4, "aggressive", rare=True),
    ],
    maxWild=18,
    spawnPoints=[sp("from_route4", 8, 52, EAST), sp("from_funkenau", 102, 52, WEST),
                 sp("default", 8, 52, EAST)],
    connections=[
        conn("route_4", 0, 45, 3, 14, "from_hoehle"),
        conn("funkenau", 107, 45, 3, 14, "from_hoehle"),
    ],
    props=[prop("crystal", 26, 30, 0.3, 1.4, 1), prop("crystal", 80, 34, 1.1, 1.3, 2),
           prop("stalagmite", 40, 62, 0, 1.5, 3), prop("stalagmite", 70, 70, 0, 1.4, 4),
           prop("crystal", 34, 78, 2.0, 1.5, 5), prop("boulder", 58, 24, 0.8, 1.2, 6),
           prop("torch", 20, 46, 0, 1.0, 7), prop("torch", 90, 50, 0, 1.0, 8),
           prop("mushroom", 48, 84, 0, 1.6, 9)],
    npcs=[
        trainer_npc("sh_t1", 44, 44, EAST, "Hoehlenforscher Bela", "hoehlenforscher_bela", "#6b5f4b"),
        trainer_npc("sh_t2", 76, 58, WEST, "Schatzsucherin Yara", "schatzsucherin_yara", "#c2a04b"),
    ],
    items=[item("sh_stern", "sternenstaub", 30, 66, 2), item("sh_stein", "donnerstein", 88, 76, 1),
           item("sh_gross", "grossperle", 64, 88, 1, hidden=True)],
    ambience={"fogNear": 16, "fogFar": 72, "lightIntensity": 0.55},
)

# ------------------------------------------------------------ HAMMERSTADT
make_city(
    "hammerstadt", "Hammerstadt", "industrial", (126, 108), 2001, (56, 42),
    "Eine Stadt aus Stahl und Dampf - hier wird die halbe Region beliefert.",
    gym_id="gym_hammerstadt", gym_name="Arena von Hammerstadt", shop_id="shop_standard",
    connections=[
        conn("route_4", 55, 0, 16, 3, "from_hammerstadt"),
        conn("route_5", 55, 105, 16, 3, "from_hammerstadt"),
    ],
    spawn_points=[sp("default", 63, 10, 0), sp("from_route4", 63, 8, 0),
                  sp("from_route5", 63, 102, math.pi)],
    extra_buildings=[
        building("warehouse", 24, 86, EAST, None, None, "Werkhalle", None, 1.0, 1),
        building("warehouse", 104, 86, WEST, None, None, "Werkhalle", None, 0.95, 4),
        building("tower", 104, 24, WEST, None, None, "Schornstein", None, 0.9, 2),
    ],
    extra_props=[prop("pipe", 30, 30, 0, 1.2, 1), prop("pipe", 96, 34, 0, 1.1, 2),
                 prop("container", 34, 74, 0.3, 1.0, 3), prop("container", 92, 78, 1.2, 1.0, 4),
                 prop("barrel", 44, 88, 0, 1.0, 5), prop("crate", 82, 90, 0.5, 1.0, 6)],
    extra_npcs=[
        npc("hs_guide", 63, 24, SOUTH, name="Werkmeister", dialogue="hammerstadt_guide"),
        trainer_npc("hs_t1", 96, 60, WEST, "Mechaniker Ruben", "mechaniker_ruben", "#8f8f8a"),
    ],
    items=[item("hs_disk", "td07", 28, 26, 1), item("hs_muskel", "muskelband", 100, 96, 1)],
    weather=("clear", "cloudy", "rain", "fog"),
    music="industrial",
)
make_gym(
    "gym_hammerstadt", "Arena von Hammerstadt", "hammerstadt", 2020,
    {"primary": "#c96b4b", "secondary": "#e08f5f", "accent": "#f0dcc9"},
    floor="#a8724f", leader="arenaleiterin_bora",
    minions=["arena3_ravi", "arena3_mila"],
    leader_look=arena_look("#c96b4b", hair="#2b2b2b", hat="band", height=1.08),
    minion_looks=[arena_look("#e08f5f", hat="helmet"),
                  arena_look("#e08f5f", hair="#8f5a2b", hat="none", height=0.96)],
    size=(32, 46),
)

# ------------------------------------------------------------ FUNKENAU
make_city(
    "funkenau", "Funkenau", "urban", (114, 100), 2101, (80, 36),
    "Eine helle Stadt, deren Lichter nie ausgehen.",
    gym_id="gym_funkenau", gym_name="Arena von Funkenau", shop_id="shop_standard",
    connections=[
        conn("schimmerhoehle", 0, 43, 3, 14, "from_funkenau"),
        conn("wildland", 49, 97, 16, 3, "from_funkenau"),
    ],
    spawn_points=[sp("default", 57, 50, 0), sp("from_hoehle", 8, 50, EAST),
                  sp("from_wildland", 57, 94, math.pi)],
    extra_buildings=[
        building("station", 22, 24, EAST, None, None, "Bahnhof", None, 1.0, 3),
        building("house", 94, 24, WEST, None, None, "Wohnhaus", None, 1.0, 7),
        building("tower", 94, 82, WEST, None, None, "Sendeturm", None, 0.85, 5),
    ],
    extra_props=[prop("lamp", 30, 60, 0, 1.2, 1), prop("lamp", 84, 60, 0, 1.2, 2),
                 prop("bench", 40, 74, EAST, 1.0, 3), prop("flower", 74, 74, 0, 1.2, 4)],
    extra_npcs=[
        npc("fa_guide", 57, 62, SOUTH, name="Stadtfuehrerin", dialogue="funkenau_guide"),
        trainer_npc("fa_t1", 86, 44, WEST, "Technikerin Ilva", "technikerin_ilva", "#e0cf4b"),
        npc("rivale_fa", 57, 70, 0, name="Rivale Jorin", trainer="rivale_3",
            minStoryStage=8, maxStoryStage=9, appearance={"skin": "#d8b08a", "hair": "#c24b4b", "shirt": "#4b8f7a", "pants": "#3f3f4a", "accent": "#f0e0c4", "hat": "cap", "height": 1.01}),
    ],
    items=[item("fa_disk", "td04", 26, 88, 1), item("fa_magnet", "magnetkern", 98, 60, 1)],
    weather=("clear", "cloudy", "rain", "thunderstorm"),
)
make_gym(
    "gym_funkenau", "Arena von Funkenau", "funkenau", 2120,
    {"primary": "#e0cf4b", "secondary": "#f0e07f", "accent": "#f7f0cf"},
    floor="#c9b83b", leader="arenaleiter_volt",
    minions=["arena4_nino", "arena4_tessa"],
    leader_look=arena_look("#e0cf4b", hair="#f0f0f0", hat="none", height=1.04),
    minion_looks=[arena_look("#f0e07f"),
                  arena_look("#f0e07f", hair="#c24b4b", hat="cap", height=0.95)],
)

# ------------------------------------------------------------ WILDLAND
area(
    id="wildland", name="Das Wildland", kind="wildarea", biome="grassland",
    size=[260, 240], seed=2201, mapPos=[50, 32],
    description="Ein riesiges, ungezaehmtes Gebiet mit eigenen Regeln - hier lebt alles.",
    music="wildarea",
    weather=["clear", "cloudy", "rain", "heavyRain", "thunderstorm",
             "fog", "harshSun", "snow", "sandstorm"],
    terrain={
        "baseHeight": 0, "amplitude": 16, "frequency": 0.014, "octaves": 5,
        "waterLevel": -3.2, "cliffBorder": True,
        "paths": [
            {"points": [[130, 4], [110, 60], [150, 130], [120, 236]], "width": 8},
            {"points": [[20, 120], [240, 120]], "width": 7},
        ],
    },
    grassZones=[
        grass(44, 44, 36, 34, 2.0), grass(200, 52, 34, 32, 2.0),
        grass(38, 140, 34, 34, 2.1), grass(206, 150, 34, 32, 2.0),
        grass(120, 90, 30, 28, 1.9), grass(140, 196, 32, 30, 2.0),
        grass(70, 208, 30, 28, 1.9), grass(196, 210, 28, 26, 1.8),
    ],
    waterZones=[{"x": 78, "z": 96, "width": 44, "depth": 38},
                {"x": 184, "z": 108, "width": 40, "depth": 34}],
    spawnTable=[
        # Grundbestand
        spawn("nagezahn", 20, 28, 12, "skittish"), spawn("federflaum", 20, 28, 12),
        spawn("windfuchs", 22, 30, 10, "skittish"), spawn("kribbelkaefer", 20, 26, 8),
        spawn("knollknospe", 22, 28, 8, "static"), spawn("flatterling", 22, 30, 8),
        spawn("kieselkopf", 22, 30, 8, "static"), spawn("sandwuehler", 22, 30, 8),
        spawn("schlammlurch", 24, 30, 8, "shy"),
        # Wetterabhaengig
        spawn("wellenotter", 26, 34, 14, "shy", weather=["rain", "heavyRain", "thunderstorm"]),
        spawn("blitzotter", 28, 36, 10, "aggressive", weather=["thunderstorm"], rare=True),
        spawn("quallenlicht", 28, 36, 9, weather=["rain", "heavyRain"], rare=True),
        spawn("frostwelpe", 26, 34, 12, "shy", weather=["snow"]),
        spawn("eiswolf", 30, 38, 8, "aggressive", weather=["snow"], rare=True),
        spawn("kristallmotte", 30, 38, 7, weather=["snow"], rare=True),
        spawn("wuestenskorpion", 28, 36, 10, "aggressive", weather=["sandstorm"]),
        spawn("sandnatter", 28, 36, 9, "aggressive", weather=["sandstorm"], rare=True),
        spawn("aschebrand", 28, 36, 9, "aggressive", weather=["harshSun"], rare=True),
        spawn("glutfalter", 28, 36, 8, weather=["harshSun"], rare=True),
        spawn("moorlicht", 26, 34, 9, "shy", weather=["fog"], rare=True),
        spawn("nebelkraehe", 26, 34, 10, weather=["fog"]),
        # Tageszeitabhaengig
        spawn("mondpanther", 30, 38, 7, "skittish", time=["night"], rare=True),
        spawn("geisterfuerst", 32, 40, 5, "aggressive", time=["night"], rare=True),
        spawn("schattenwolf", 26, 34, 10, "aggressive", time=["dusk", "night"]),
        spawn("traumkatze", 26, 34, 10, "shy", time=["dawn", "day"]),
        spawn("lichtfee", 30, 38, 5, "shy", time=["dawn"], rare=True),
        # Seltene Grosswild-Begegnungen
        spawn("bergkoloss", 34, 42, 4, "static", rare=True, size="large"),
        spawn("sturmaar", 34, 42, 4, "aggressive", rare=True),
        spawn("frostkoloss", 36, 44, 3, "aggressive", rare=True, size="large"),
        spawn("klauenwelpe", 28, 34, 5, "shy", rare=True),
        spawn("sichelklaue", 34, 42, 3, "aggressive", rare=True),
        spawn("titanklaue", 48, 56, 1, "aggressive", rare=True, size="large", stage=8),
        spawn("abgrundschrecken", 46, 54, 1, "aggressive", rare=True, stage=8),
    ],
    maxWild=34,
    spawnPoints=[
        sp("from_funkenau", 130, 8, 0), sp("from_route5", 254, 120, WEST),
        sp("from_route7", 6, 120, EAST), sp("from_lager", 130, 118, 0),
        sp("from_tiefenkammer", 130, 232, math.pi),
        sp("default", 130, 8, 0),
    ],
    connections=[
        conn("funkenau", 122, 0, 16, 3, "from_wildland"),
        conn("route_5", 257, 112, 3, 16, "from_wildland"),
        conn("route_7", 0, 112, 3, 16, "from_wildland"),
        conn("tiefenkammer", 122, 236, 16, 3, "from_wildland",
             requires={"flag": "tiefenschluessel"},
             blocked="Ein uraltes Siegel versperrt den Abstieg. Es fehlt der Tiefenschluessel."),
    ],
    props=[
        prop("tree", 60, 30, 0.4, 1.4, 1), prop("tree", 214, 40, 1.2, 1.3, 2),
        prop("pine", 40, 160, 2.0, 1.4, 3), prop("tree", 220, 170, 0.6, 1.35, 4),
        prop("boulder", 106, 64, 0.8, 1.5, 5), prop("boulder", 160, 176, 1.5, 1.4, 6),
        prop("well", 130, 118, 0, 1.2, 7), prop("torch", 122, 112, 0, 1.0, 8),
        prop("torch", 138, 112, 0, 1.0, 9), prop("bench", 130, 126, 0, 1.0, 10),
        prop("crystal", 190, 74, 0.3, 1.3, 11), prop("crystal", 66, 190, 1.1, 1.2, 12),
        prop("reed", 78, 96, 0, 1.3, 13), prop("reed", 184, 108, 0, 1.2, 14),
        prop("lilypad", 82, 100, 0, 1.4, 15), prop("lilypad", 188, 112, 0, 1.3, 16),
        prop("statue", 130, 212, SOUTH, 1.2, 17),
        prop("sign", 126, 14, SOUTH, 1.0, 18),
    ],
    buildings=[
        building("hut", 146, 118, WEST, None, None, "Wildlandlager", None, 1.0, 3),
    ],
    npcs=[
        npc("wl_lager", 136, 122, EAST, name="Lagerwart", dialogue="wildland_lager", role="heal"),
        npc("wl_forscher", 126, 130, 0, name="Feldforscher", dialogue="wildland_forscher"),
        trainer_npc("wl_t1", 70, 66, SOUTH, "Faehrtenleser Bo", "faehrtenleser_bo", "#6b8f4b"),
        trainer_npc("wl_t2", 200, 86, WEST, "Jaegerin Pax", "jaegerin_pax", "#8f6b4b"),
        trainer_npc("wl_t3", 88, 180, 0, "Wildhueter Sten", "wildhueter_sten", "#4b8f6b"),
        npc("rivale_wl", 130, 138, SOUTH, name="Rivale Jorin", trainer="rivale_4",
            minStoryStage=10, maxStoryStage=11, appearance={"skin": "#d8b08a", "hair": "#c24b4b", "shirt": "#4b8f7a", "pants": "#3f3f4a", "accent": "#f0e0c4", "hat": "cap", "height": 1.01}),
    ],
    items=[
        item("wl_hyper", "hyperkugel", 56, 52, 3),
        item("wl_nugget", "nugget", 212, 62, 1),
        item("wl_top", "top_trank", 48, 164, 1),
        item("wl_stein", "mondstein", 216, 182, 1),
        item("wl_gross", "grossperle", 132, 200, 1, hidden=True),
        item("wl_ticket", "flugticket", 130, 124, 1),
        item("wl_detektor", "energiedetektor", 140, 124, 1),
    ],
    raidDens=[
        {"id": "den_west", "pos": [58, 70], "tier": 1},
        {"id": "den_ost", "pos": [206, 92], "tier": 2},
        {"id": "den_sued", "pos": [96, 196], "tier": 3},
        {"id": "den_nord", "pos": [176, 40], "tier": 4},
        {"id": "den_mitte", "pos": [130, 150], "tier": 5},
    ],
    ambience={"fogNear": 80, "fogFar": 420},
)

# ------------------------------------------------------------ ROUTE 5
make_route(
    "route_5", "Route 5", 5, "volcanic", (78, 132), 2301, (66, 26),
    "Der Boden wird warm - der Aschenberg ist nicht mehr weit.",
    spawn_table=[
        spawn("glutkohle", 28, 34, 16, "static"), spawn("aschebrand", 30, 36, 12, "aggressive"),
        spawn("lavagnom", 29, 35, 14, "static"), spawn("kieselkopf", 28, 34, 10, "static"),
        spawn("glutfalter", 30, 36, 10), spawn("sandwuehler", 28, 34, 10),
        spawn("magmaherr", 34, 40, 5, "aggressive", rare=True),
        spawn("vulkanschlange", 34, 40, 4, "aggressive", rare=True),
    ],
    connections=[
        conn("hammerstadt", 31, 0, 16, 3, "from_route5"),
        conn("wildland", 0, 58, 3, 16, "from_route5"),
        conn("aschenberg", 31, 129, 16, 3, "from_route5"),
    ],
    spawn_points=[sp("from_hammerstadt", 39, 6, 0), sp("from_aschenberg", 39, 126, math.pi),
                  sp("from_wildland", 8, 66, EAST), sp("default", 39, 6, 0)],
    grass_zones=[grass(18, 30, 18, 20, 1.6), grass(62, 48, 16, 20, 1.5),
                 grass(20, 88, 18, 20, 1.7)],
    props=[prop("rock", 16, 26, 0.4, 1.3, 1), prop("boulder", 62, 34, 1.2, 1.4, 2),
           prop("deadTree", 22, 62, 2.0, 1.2, 3), prop("rock", 64, 78, 0.6, 1.25, 4),
           prop("crystal", 20, 110, 0.9, 1.2, 5), prop("boulder", 60, 116, 1.5, 1.3, 6),
           prop("torch", 44, 20, 0, 1.0, 7), prop("torch", 44, 110, 0, 1.0, 8)],
    npcs=[
        trainer_npc("r5_t1", 42, 52, SOUTH, "Glutlaeufer Nero", "glutlaeufer_nero", "#c95b2f"),
        trainer_npc("r5_t2", 36, 100, 0, "Aschewanderin Rea", "aschewanderin_rea", "#8f5f3f"),
    ],
    items=[item("r5_stein", "feuerstein", 24, 74, 1), item("r5_top", "top_trank", 66, 104, 1)],
    amplitude=11, ridged=True, music="volcanic",
    weather=("clear", "harshSun", "sandstorm"),
)

# ------------------------------------------------------------ ASCHENBERG
make_city(
    "aschenberg", "Aschenberg", "volcanic", (112, 100), 2401, (74, 20),
    "Eine Siedlung am Kraterrand, gebaut aus schwarzem Stein.",
    gym_id="gym_aschenberg", gym_name="Arena von Aschenberg", shop_id="shop_standard",
    connections=[
        conn("route_5", 48, 0, 16, 3, "from_aschenberg"),
        conn("route_6", 48, 97, 16, 3, "from_aschenberg"),
    ],
    spawn_points=[sp("default", 56, 10, 0), sp("from_route5", 56, 8, 0),
                  sp("from_route6", 56, 94, math.pi)],
    extra_buildings=[
        building("hut", 20, 24, EAST, None, None, "Steinhaus", None, 1.0, 2),
        building("hut", 92, 24, WEST, None, None, "Steinhaus", None, 1.0, 6),
        building("tower", 92, 82, WEST, None, None, "Aussichtsturm", None, 0.8, 4),
    ],
    extra_props=[prop("torch", 40, 30, 0, 1.2, 1), prop("torch", 72, 30, 0, 1.2, 2),
                 prop("boulder", 22, 66, 0.4, 1.3, 3), prop("rock", 90, 62, 1.2, 1.2, 4)],
    extra_npcs=[
        npc("ab_guide", 56, 24, SOUTH, name="Kraterwaechter", dialogue="aschenberg_guide"),
        trainer_npc("ab_t1", 84, 56, WEST, "Schmiedin Vera", "schmiedin_vera", "#c95b2f"),
    ],
    items=[item("ab_holz", "holzkohle", 24, 88, 1), item("ab_disk", "td02", 96, 40, 1)],
    weather=("clear", "harshSun", "cloudy"),
    music="volcanic",
)
make_gym(
    "gym_aschenberg", "Arena von Aschenberg", "aschenberg", 2420,
    {"primary": "#c95b2f", "secondary": "#f08a4b", "accent": "#f7d8c4"},
    floor="#8f3f24", leader="arenaleiterin_ember",
    minions=["arena5_kilian", "arena5_juna"],
    leader_look=arena_look("#c95b2f", hair="#c24b4b", hat="band", height=1.03),
    minion_looks=[arena_look("#f08a4b", hat="beanie"),
                  arena_look("#f08a4b", hair="#3a2a1c", hat="none", height=0.95)],
    size=(32, 46),
)

# ------------------------------------------------------------ ROUTE 6
make_route(
    "route_6", "Route 6", 6, "wetland", (74, 128), 2501, (56, 18),
    "Der Weg senkt sich ins Nebelmoor - der Boden wird weich.",
    spawn_table=[
        spawn("schlammlurch", 30, 36, 16, "shy"), spawn("sumpfhueter", 34, 40, 8, "aggressive"),
        spawn("giftkappe", 31, 37, 14, "static"), spawn("tintenschleim", 32, 38, 12, "static"),
        spawn("glockenblume", 32, 38, 10, "static"),
        spawn("moorlicht", 33, 39, 9, "shy", time=["dusk", "night"], rare=True),
        spawn("nebelkraehe", 32, 38, 10, weather=["fog"]),
        spawn("quallenlicht", 34, 40, 6, weather=["rain"], rare=True),
    ],
    connections=[
        conn("aschenberg", 29, 0, 16, 3, "from_route6"),
        conn("nebelmoor", 29, 125, 16, 3, "from_route6"),
    ],
    spawn_points=[sp("from_aschenberg", 37, 6, 0), sp("from_nebelmoor", 37, 122, math.pi),
                  sp("default", 37, 6, 0)],
    grass_zones=[grass(18, 32, 18, 22, 2.0), grass(58, 54, 16, 20, 1.9),
                 grass(20, 90, 18, 22, 2.0)],
    props=[prop("reed", 20, 40, 0, 1.3, 1), prop("reed", 60, 62, 0, 1.2, 2),
           prop("deadTree", 16, 72, 1.8, 1.2, 3), prop("lilypad", 56, 96, 0, 1.4, 4),
           prop("mushroom", 30, 110, 0, 1.3, 5), prop("torch", 40, 24, 0, 1.0, 6)],
    npcs=[
        trainer_npc("r6_t1", 40, 56, SOUTH, "Moorgaengerin Inka", "moorgaengerin_inka", "#5f8f6b"),
        trainer_npc("r6_t2", 34, 102, 0, "Sumpfkundler Jan", "sumpfkundler_jan", "#6b7a4b"),
    ],
    items=[item("r6_allheil", "allheilmittel", 22, 66, 1), item("r6_beere", "beere_blau", 62, 88, 2)],
    amplitude=4.5, water_level=-1.2, music="forest",
    weather=("cloudy", "rain", "heavyRain", "fog"),
)

# ------------------------------------------------------------ NEBELMOOR
area(
    id="nebelmoor", name="Nebelmoor", kind="lake", biome="wetland",
    size=[120, 110], seed=2601, mapPos=[44, 22],
    description="Ein Moor, in dem der Nebel selbst bei Sonne nicht weicht.",
    music="forest", weather=["fog", "rain", "heavyRain", "cloudy"],
    terrain={"baseHeight": 0, "amplitude": 3.5, "frequency": 0.04, "octaves": 3,
             "waterLevel": -0.8, "cliffBorder": True,
             "paths": [{"points": [[60, 2], [48, 50], [70, 106]], "width": 6}]},
    grassZones=[grass(24, 32, 24, 24, 2.2), grass(94, 40, 22, 22, 2.1),
                grass(26, 84, 24, 24, 2.2), grass(94, 88, 22, 22, 2.0)],
    waterZones=[{"x": 60, "z": 62, "width": 34, "depth": 30}],
    spawnTable=[
        spawn("schlammlurch", 32, 38, 14, "shy"), spawn("sumpfhueter", 36, 42, 10, "aggressive"),
        spawn("moorlicht", 34, 40, 12, "shy"), spawn("tintenschleim", 34, 40, 12, "static"),
        spawn("schlickmonarch", 38, 44, 6, "aggressive", rare=True),
        spawn("nachtschleier", 34, 40, 10, "aggressive", time=["dusk", "night"]),
        spawn("geisterfuerst", 38, 44, 5, "aggressive", time=["night"], rare=True),
        spawn("glockenblume", 34, 40, 10, "static"),
        spawn("kristallgeist", 36, 42, 5, "shy", weather=["fog"], rare=True),
    ],
    maxWild=20,
    spawnPoints=[sp("from_route6", 60, 6, 0), sp("from_geisterruine", 68, 104, math.pi),
                 sp("default", 60, 6, 0)],
    connections=[
        conn("route_6", 52, 0, 16, 3, "from_nebelmoor"),
        conn("geisterruine", 60, 107, 16, 3, "from_nebelmoor"),
    ],
    props=[prop("deadTree", 22, 24, 0.4, 1.3, 1), prop("reed", 96, 30, 0, 1.3, 2),
           prop("lilypad", 58, 60, 0, 1.5, 3), prop("lilypad", 66, 68, 0, 1.4, 4),
           prop("torch", 50, 46, 0, 1.0, 5), prop("mushroom", 30, 92, 0, 1.4, 6),
           prop("deadTree", 100, 94, 1.8, 1.25, 7), prop("pillar", 40, 76, 0, 1.0, 8)],
    npcs=[
        trainer_npc("nm_t1", 52, 44, EAST, "Irrlichtjaegerin Noor", "irrlichtjaegerin_noor", "#5f7a6b"),
        npc("nm_alt", 92, 66, WEST, name="Moorhueterin", dialogue="nebelmoor_hueterin"),
    ],
    items=[item("nm_stein", "finsterstein", 28, 66, 1), item("nm_top", "top_beleber", 100, 76, 1)],
    ambience={"fogNear": 18, "fogFar": 90, "lightIntensity": 0.7},
)

# ------------------------------------------------------------ GEISTERRUINE
make_city(
    "geisterruine", "Geisterruine", "ruins", (116, 104), 2701, (32, 18),
    "Eine halb versunkene Stadt, die nie ganz aufgegeben wurde.",
    gym_id="gym_geisterruine", gym_name="Arena der Ruine", shop_id="shop_standard",
    connections=[
        conn("nebelmoor", 50, 0, 16, 3, "from_geisterruine"),
        conn("route_7", 50, 101, 16, 3, "from_geisterruine"),
    ],
    spawn_points=[sp("default", 58, 10, 0), sp("from_nebelmoor", 58, 8, 0),
                  sp("from_route7", 58, 98, math.pi)],
    extra_buildings=[
        building("ruin", 22, 26, EAST, None, None, "Ruine", None, 1.0, 1),
        building("ruin", 94, 26, WEST, None, None, "Ruine", None, 0.9, 3),
        building("tower", 94, 84, WEST, None, None, "Glockenturm", None, 0.85, 2),
    ],
    extra_props=[prop("pillar", 34, 60, 0, 1.2, 1), prop("pillar", 82, 60, 0, 1.1, 2),
                 prop("statue", 58, 88, SOUTH, 1.0, 3), prop("torch", 46, 40, 0, 1.0, 4),
                 prop("torch", 70, 40, 0, 1.0, 5), prop("rock", 26, 76, 0.5, 1.2, 6)],
    extra_npcs=[
        npc("gr_guide", 58, 24, SOUTH, name="Chronistin", dialogue="geisterruine_guide"),
        trainer_npc("gr_t1", 88, 62, WEST, "Grabwaechter Idris", "grabwaechter_idris", "#6b4f8f"),
    ],
    items=[item("gr_nebel", "nebelkerze", 26, 90, 1), item("gr_disk", "td14", 98, 44, 1)],
    weather=("fog", "cloudy", "rain"),
    music="ruins",
)
make_gym(
    "gym_geisterruine", "Arena der Ruine", "geisterruine", 2720,
    {"primary": "#6b4f8f", "secondary": "#9b7fc4", "accent": "#d8cfe8"},
    floor="#4b3a6b", leader="arenaleiter_morven",
    minions=["arena6_nyx", "arena6_calla"],
    leader_look=arena_look("#6b4f8f", hair="#2b2b3b", hat="none", height=1.06),
    minion_looks=[arena_look("#9b7fc4", hat="beanie"),
                  arena_look("#9b7fc4", hair="#cfcfcf", hat="none", height=0.97)],
)

# ------------------------------------------------------------ ROUTE 7
make_route(
    "route_7", "Route 7", 7, "mountain", (80, 136), 2801, (28, 14),
    "Ein Aufstieg, bei dem die Luft mit jedem Schritt kaelter wird.",
    spawn_table=[
        spawn("bergziege", 34, 40, 16), spawn("kieselkopf", 33, 39, 12, "static"),
        spawn("felsbrocken", 35, 41, 10, "static"), spawn("frostwelpe", 35, 41, 12, "shy"),
        spawn("schneehase", 34, 40, 12, "skittish"),
        spawn("nebelkraehe", 35, 41, 10), spawn("donnerhorn", 37, 43, 6, "aggressive", rare=True),
        spawn("eiswolf", 38, 44, 6, "aggressive", weather=["snow"], rare=True),
        spawn("bergkoloss", 40, 46, 3, "static", rare=True, size="large"),
    ],
    connections=[
        conn("geisterruine", 32, 0, 16, 3, "from_route7"),
        conn("wildland", 77, 60, 3, 16, "from_route7"),
        conn("frostgipfel", 32, 133, 16, 3, "from_route7"),
    ],
    spawn_points=[sp("from_geisterruine", 40, 6, 0), sp("from_frostgipfel", 40, 130, math.pi),
                  sp("from_wildland", 72, 68, WEST), sp("default", 40, 6, 0)],
    grass_zones=[grass(18, 34, 18, 20, 1.6), grass(62, 56, 16, 20, 1.5),
                 grass(20, 96, 18, 22, 1.7)],
    props=[prop("pine", 16, 28, 0.4, 1.3, 1), prop("boulder", 64, 38, 1.2, 1.4, 2),
           prop("pine", 18, 70, 2.0, 1.35, 3), prop("rock", 66, 84, 0.6, 1.25, 4),
           prop("snowman", 40, 114, 0, 1.0, 5), prop("sign", 44, 12, SOUTH, 1.0, 6)],
    npcs=[
        trainer_npc("r7_t1", 42, 58, SOUTH, "Bergfuehrer Kell", "bergfuehrer_kell", "#7a8f9b"),
        trainer_npc("r7_t2", 38, 106, 0, "Kletterin Sona", "kletterin_sona", "#9bb0c4"),
    ],
    items=[item("r7_eis", "eisstein", 24, 84, 1), item("r7_top", "top_trank", 68, 118, 1)],
    amplitude=14, ridged=True,
    weather=("clear", "cloudy", "snow", "blizzard", "fog"),
)

# ------------------------------------------------------------ FROSTGIPFEL
make_city(
    "frostgipfel", "Frostgipfel", "snow", (110, 98), 2901, (38, 10),
    "Die hoechstgelegene Stadt der Region - hier faellt nie der Schnee aus.",
    gym_id="gym_frostgipfel", gym_name="Arena von Frostgipfel", shop_id="shop_standard",
    connections=[
        conn("route_7", 47, 0, 16, 3, "from_frostgipfel"),
        conn("route_8", 47, 95, 16, 3, "from_frostgipfel"),
    ],
    spawn_points=[sp("default", 55, 10, 0), sp("from_route7", 55, 8, 0),
                  sp("from_route8", 55, 92, math.pi)],
    extra_buildings=[
        building("hut", 20, 24, EAST, None, None, "Berghuette", None, 1.0, 4),
        building("hut", 90, 24, WEST, None, None, "Berghuette", None, 1.0, 8),
        building("station", 90, 80, WEST, None, None, "Seilbahn", None, 0.9, 1),
    ],
    extra_props=[prop("snowman", 42, 34, 0, 1.1, 1), prop("snowman", 68, 34, 0, 1.0, 2),
                 prop("pine", 22, 62, 0.4, 1.2, 3), prop("pine", 88, 62, 1.2, 1.15, 4)],
    extra_npcs=[
        npc("fg_guide", 55, 24, SOUTH, name="Bergwirtin", dialogue="frostgipfel_guide"),
        trainer_npc("fg_t1", 82, 58, WEST, "Schneelaeufer Nils", "schneelaeufer_nils", "#a0d8ef"),
    ],
    items=[item("fg_frost", "frostkristall", 24, 86, 1), item("fg_disk", "td06", 94, 44, 1)],
    weather=("snow", "blizzard", "cloudy", "clear"),
    music="snow",
)
make_gym(
    "gym_frostgipfel", "Arena von Frostgipfel", "frostgipfel", 2920,
    {"primary": "#7fc4e0", "secondary": "#a8e0f0", "accent": "#e8f7ff"},
    floor="#9bd0e8", leader="arenaleiterin_hela",
    minions=["arena7_bjorn", "arena7_maja"],
    leader_look=arena_look("#7fc4e0", hair="#e8e8f0", hat="beanie", height=1.04),
    minion_looks=[arena_look("#a8e0f0", hat="beanie"),
                  arena_look("#a8e0f0", hair="#4a3524", hat="none", height=0.96)],
)

# ------------------------------------------------------------ ROUTE 8
make_route(
    "route_8", "Route 8", 8, "mountain", (76, 130), 3001, (50, 12),
    "Ein schmaler Grat zwischen Frostgipfel und dem Drachenhorst.",
    spawn_table=[
        spawn("klauenwelpe", 38, 44, 10, "shy"),
        spawn("sichelklaue", 42, 48, 7, "aggressive", rare=True),
        spawn("bergziege", 38, 44, 14), spawn("himmelsritter", 42, 48, 6, "aggressive", rare=True),
        spawn("sturmaar", 41, 47, 8, "aggressive"),
        spawn("eiswolf", 40, 46, 10, "aggressive"),
        spawn("gletscherfang", 44, 50, 4, "aggressive", rare=True, size="large"),
        spawn("frostkoloss", 43, 49, 5, "aggressive", rare=True),
        spawn("panzerwacht", 40, 46, 8, "static"),
    ],
    connections=[
        conn("frostgipfel", 30, 0, 16, 3, "from_route8"),
        conn("drachenhorst", 30, 127, 16, 3, "from_route8"),
    ],
    spawn_points=[sp("from_frostgipfel", 38, 6, 0), sp("from_drachenhorst", 38, 124, math.pi),
                  sp("default", 38, 6, 0)],
    grass_zones=[grass(18, 36, 16, 20, 1.5), grass(58, 62, 16, 20, 1.5),
                 grass(20, 98, 16, 20, 1.6)],
    props=[prop("boulder", 16, 30, 0.4, 1.5, 1), prop("pine", 60, 44, 1.2, 1.2, 2),
           prop("boulder", 18, 78, 2.0, 1.45, 3), prop("crystal", 62, 92, 0.6, 1.3, 4),
           prop("torch", 38, 20, 0, 1.0, 5), prop("torch", 38, 110, 0, 1.0, 6)],
    npcs=[
        trainer_npc("r8_t1", 40, 60, SOUTH, "Gratlaeufer Ilan", "gratlaeufer_ilan", "#8f9bb0"),
        trainer_npc("r8_t2", 36, 104, 0, "Drachenschuelerin Vi", "drachenschuelerin_vi", "#5b6bc9"),
    ],
    items=[item("r8_zahn", "drachenzahn", 22, 70, 1), item("r8_top", "top_beleber", 64, 112, 1)],
    amplitude=16, ridged=True,
    weather=("clear", "cloudy", "snow", "blizzard", "thunderstorm"),
)

# ------------------------------------------------------------ DRACHENHORST
make_city(
    "drachenhorst", "Drachenhorst", "rocky", (114, 102), 3101, (62, 10),
    "Eine Festung im Fels, seit Generationen Sitz der Drachenhueter.",
    gym_id="gym_drachenhorst", gym_name="Arena des Horsts", shop_id="shop_standard",
    connections=[
        conn("route_8", 49, 0, 16, 3, "from_drachenhorst"),
        conn("route_9", 49, 99, 16, 3, "from_drachenhorst",
             requires={"badge": 8},
             blocked="Der Weg zur Liga oeffnet sich erst mit allen acht Orden."),
    ],
    spawn_points=[sp("default", 57, 10, 0), sp("from_route8", 57, 8, 0),
                  sp("from_route9", 57, 96, math.pi)],
    extra_buildings=[
        building("tower", 22, 26, EAST, None, None, "Wachturm", None, 0.9, 6),
        building("tower", 92, 26, WEST, None, None, "Wachturm", None, 0.9, 7),
        building("house", 92, 82, WEST, None, None, "Hueterhaus", None, 1.0, 2),
    ],
    extra_props=[prop("statue", 40, 62, 0, 1.2, 1), prop("statue", 74, 62, 0, 1.2, 2),
                 prop("pillar", 34, 38, 0, 1.3, 3), prop("pillar", 80, 38, 0, 1.3, 4),
                 prop("torch", 48, 48, 0, 1.1, 5), prop("torch", 66, 48, 0, 1.1, 6)],
    extra_npcs=[
        npc("dh_guide", 57, 24, SOUTH, name="Hueter", dialogue="drachenhorst_guide"),
        trainer_npc("dh_t1", 86, 60, WEST, "Schuppenwaechter Rurik", "schuppenwaechter_rurik", "#4b5fa8"),
    ],
    items=[item("dh_stein", "sonnenstein", 26, 88, 1), item("dh_disk", "td15", 96, 44, 1)],
    weather=("clear", "cloudy", "thunderstorm"),
)
make_gym(
    "gym_drachenhorst", "Arena des Horsts", "drachenhorst", 3120,
    {"primary": "#4b5fa8", "secondary": "#7f8fd8", "accent": "#d8dcf0"},
    floor="#3f4f8f", leader="arenaleiterin_saphira",
    minions=["arena8_torin", "arena8_elke"],
    leader_look=arena_look("#4b5fa8", hair="#2b3f6b", hat="crown", height=1.08),
    minion_looks=[arena_look("#7f8fd8", hat="helmet"),
                  arena_look("#7f8fd8", hair="#c24b4b", hat="none", height=0.98)],
    size=(34, 50),
)

# ------------------------------------------------------------ ROUTE 9
make_route(
    "route_9", "Der Ligaweg", 9, "mountain", (70, 120), 3201, (56, 6),
    "Der letzte Weg vor dem Ligastadion. Nur wer acht Orden traegt, darf ihn gehen.",
    spawn_table=[
        spawn("sturmaar", 46, 52, 10, "aggressive"), spawn("himmelsritter", 46, 52, 8, "aggressive"),
        spawn("sichelklaue", 46, 52, 8, "aggressive"),
        spawn("gletscherfang", 47, 53, 6, "aggressive"),
        spawn("panzerwacht", 46, 52, 8, "static"),
        spawn("steinwaechter", 46, 52, 8, "static"),
        spawn("rostritter", 46, 52, 7, "aggressive"),
        spawn("abgrundschrecken", 50, 56, 3, "aggressive", rare=True),
    ],
    connections=[
        conn("drachenhorst", 27, 0, 16, 3, "from_route9"),
        conn("ligastadion", 27, 117, 16, 3, "from_route9"),
    ],
    spawn_points=[sp("from_drachenhorst", 35, 6, 0), sp("from_liga", 35, 114, math.pi),
                  sp("default", 35, 6, 0)],
    grass_zones=[grass(16, 34, 16, 20, 1.5), grass(54, 60, 16, 20, 1.5),
                 grass(18, 90, 16, 20, 1.6)],
    props=[prop("pillar", 22, 26, 0, 1.4, 1), prop("pillar", 48, 26, 0, 1.4, 2),
           prop("statue", 35, 56, SOUTH, 1.2, 3), prop("torch", 26, 74, 0, 1.1, 4),
           prop("torch", 44, 74, 0, 1.1, 5), prop("boulder", 58, 100, 0.8, 1.4, 6)],
    npcs=[
        trainer_npc("r9_t1", 38, 46, SOUTH, "Ligaanwaerter Ken", "ligaanwaerter_ken", "#c9a04b"),
        trainer_npc("r9_t2", 32, 94, 0, "Ligaanwaerterin Thea", "ligaanwaerterin_thea", "#c9a04b"),
        npc("rivale_r9", 35, 110, SOUTH, name="Rivale Jorin", trainer="rivale_5",
            minStoryStage=12, appearance={"skin": "#d8b08a", "hair": "#c24b4b", "shirt": "#4b8f7a", "pants": "#3f3f4a", "accent": "#f0e0c4", "hat": "cap", "height": 1.01}),
    ],
    items=[item("r9_top", "top_trank", 20, 62, 2), item("r9_glueck", "gluecksei", 56, 108, 1)],
    amplitude=13, ridged=True, music="league",
    weather=("clear", "cloudy", "thunderstorm"),
)

# ------------------------------------------------------------ LIGASTADION
area(
    id="ligastadion", name="Ligastadion", kind="league", biome="urban",
    size=[120, 110], seed=3301, mapPos=[50, 3],
    description="Das groesste Stadion Aetherias - hier endet jede Reise oder beginnt neu.",
    music="league", weather=["clear", "cloudy"],
    terrain={"baseHeight": 0, "amplitude": 1.2, "frequency": 0.04, "octaves": 2,
             "cliffBorder": True,
             "paths": [{"points": [[60, 2], [60, 106]], "width": 12}]},
    spawnPoints=[sp("from_route9", 60, 8, 0), sp("default", 60, 8, 0),
                 sp("from_arena", 60, 54, math.pi),
                 sp("from_center", 22, 26, SOUTH), sp("from_shop", 98, 26, SOUTH)],
    connections=[conn("route_9", 52, 0, 16, 3, "from_liga")],
    buildings=[
        building("stadium", 60, 74, SOUTH, "liga_arena", "entrance", "Ligastadion", [0, 17.5],
                 requires={"badge": 8, "flag": "ligaPass"},
                 blocked_text="Die Ligawache haelt dich auf: Ohne acht Orden und Liga-Pass kommt hier niemand hinein."),
        building("center", 22, 34, EAST, "center_ligastadion", "entrance", "Heilstation", [0, 4.6]),
        building("shop", 98, 34, WEST, "shop_ligastadion", "entrance", "Warenlager", [0, 3.8]),
    ],
    props=[prop("statue", 34, 60, 0, 1.4, 1), prop("statue", 86, 60, 0, 1.4, 2),
           prop("lamp", 44, 24, 0, 1.2, 3), prop("lamp", 76, 24, 0, 1.2, 4),
           prop("bench", 48, 44, EAST, 1.0, 5), prop("bench", 72, 44, WEST, 1.0, 6),
           prop("flower", 40, 40, 0, 1.2, 7), prop("flower", 80, 40, 0, 1.2, 8)],
    npcs=[
        npc("liga_ansager", 60, 26, SOUTH, name="Ansager", dialogue="liga_ansager"),
        npc("liga_wache", 60, 56, SOUTH, name="Ligawache", dialogue="liga_wache"),
        npc("rivale_liga", 40, 26, EAST, name="Rivale Jorin", trainer="rivale_6",
            minStoryStage=13, appearance={"skin": "#d8b08a", "hair": "#c24b4b", "shirt": "#4b8f7a", "pants": "#3f3f4a", "accent": "#f0e0c4", "hat": "cap", "height": 1.01}),
    ],
    items=[],
    ambience={"fogNear": 70, "fogFar": 360},
)
make_center("ligastadion", 3302, "from_center")
make_shop("ligastadion", 3304, "from_shop", "shop_liga")

area(
    id="liga_arena", name="Ligaarena", kind="stadium", biome="urban",
    size=[38, 60], seed=3310, indoor=True,
    terrain={"baseHeight": 0, "amplitude": 0, "frequency": 0.1, "flat": True},
    music="league",
    interiorStyle={
        "wallColor": "#e8e0cf", "floorColor": "#c9a84b", "accentColor": "#ffd76b",
        "wallHeight": 9.0, "ceiling": True,
        "exits": [{"x": 19, "z": 0, "width": 5.0, "side": "south"}],
        "furniture": [
            {"kind": "podium", "pos": [19, 50], "color": "#ffd76b", "scale": 1.4},
            {"kind": "lamp", "pos": [6, 16]}, {"kind": "lamp", "pos": [32, 16]},
            {"kind": "lamp", "pos": [6, 40]}, {"kind": "lamp", "pos": [32, 40]},
            {"kind": "plant", "pos": [4, 8], "scale": 1.6},
            {"kind": "plant", "pos": [34, 8], "scale": 1.6},
        ],
    },
    spawnPoints=[sp("default", 19, 5, 0), sp("entrance", 19, 4, 0), sp("finale", 19, 40, 0)],
    connections=[conn("ligastadion", 16.5, 0, 5.0, 2.0, "from_arena")],
    npcs=[
        npc("liga_1", 11, 16, EAST, name="Spitzentrainer Aldo", trainer="liga_aldo",
            appearance=arena_look("#8f4b4b", hat="none", height=1.02)),
        npc("liga_2", 27, 24, WEST, name="Spitzentrainerin Yuki", trainer="liga_yuki",
            appearance=arena_look("#4b8f8f", hair="#2b2b2b", hat="none", height=0.98)),
        npc("liga_3", 11, 32, EAST, name="Spitzentrainer Dorn", trainer="liga_dorn",
            appearance=arena_look("#6b4b8f", hat="beanie", height=1.05)),
        npc("liga_4", 27, 40, WEST, name="Spitzentrainerin Sela", trainer="liga_sela",
            appearance=arena_look("#8f8f4b", hair="#c24b4b", hat="none", height=1.0)),
        npc("liga_champion", 19, 50, SOUTH, name="Champion Aurel", trainer="champion_aurel",
            role="gymLeader", appearance=arena_look("#ffd76b", hair="#f0e0b0", hat="crown", height=1.1)),
    ],
    ambience={"fogNear": 50, "fogFar": 160},
)

# ------------------------------------------------------------ TIEFENKAMMER
area(
    id="tiefenkammer", name="Tiefenkammer", kind="endgame", biome="cave",
    size=[130, 120], seed=3401, mapPos=[50, 40], indoor=True,
    description="Weit unter dem Wildland - der Ort, an dem Aetheria begonnen haben soll.",
    music="finalBattle", weather=[],
    terrain={"baseHeight": 0, "amplitude": 6, "frequency": 0.04, "octaves": 4,
             "cliffBorder": True,
             "paths": [{"points": [[65, 4], [65, 116]], "width": 9}]},
    spawnTable=[
        spawn("abgrundschrecken", 52, 60, 10, "aggressive"),
        spawn("geisterfuerst", 50, 58, 12, "aggressive"),
        spawn("titanklaue", 54, 62, 6, "aggressive", size="large"),
        spawn("rostritter", 50, 58, 12, "aggressive"),
        spawn("steinwaechter", 50, 58, 10, "static"),
        spawn("kristallgeist", 50, 58, 10, "shy"),
        spawn("tiefseelicht", 50, 58, 10, "aggressive"),
        spawn("moorlicht", 50, 58, 8, "shy"),
        spawn("noctaris", 62, 66, 1, "static", rare=True, stage=9),
    ],
    maxWild=16,
    spawnPoints=[sp("from_wildland", 65, 8, 0), sp("default", 65, 8, 0),
                 sp("altar", 65, 100, 0)],
    connections=[conn("wildland", 57, 0, 16, 3, "from_tiefenkammer")],
    props=[prop("crystal", 30, 30, 0.3, 1.6, 1), prop("crystal", 100, 36, 1.1, 1.5, 2),
           prop("pillar", 44, 60, 0, 1.5, 3), prop("pillar", 86, 60, 0, 1.5, 4),
           prop("statue", 65, 92, SOUTH, 1.6, 5), prop("torch", 56, 84, 0, 1.2, 6),
           prop("torch", 74, 84, 0, 1.2, 7), prop("stalagmite", 36, 96, 0, 1.6, 8),
           prop("stalagmite", 94, 100, 0, 1.5, 9), prop("crystal", 65, 48, 0.8, 1.8, 10)],
    npcs=[],
    items=[item("tk_meister", "meisterkugel", 65, 104, 1, stage=9),
           item("tk_stein", "feenstein", 38, 74, 1)],
    triggers=[
        {"id": "tiefenkammer_boss", "pos": [65, 98], "radius": 5, "once": True,
         "requires": {"badge": 8, "notFlag": "aetherionBesiegt"},
         "action": {"kind": "cutscene", "cutscene": "finale_aetherion"}},
    ],
    ambience={"fogNear": 20, "fogFar": 100, "lightIntensity": 0.5},
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
