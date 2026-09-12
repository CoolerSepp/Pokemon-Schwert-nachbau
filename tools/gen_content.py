#!/usr/bin/env python3
"""Erzeugt Dialoge, Trainer, Arenen, Laeden, Auftraege und Story-Inhalte."""
import json, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent

DIALOGUES = []
TRAINERS = []
GYMS = []
SHOPS = []
QUESTS = []
STORY = []


# --------------------------------------------------------------------------
def tree(id, *nodes, entry=None):
    """Dialogbaum. Der erste Knoten ist Standard-Einstieg, sofern nicht anders gesetzt."""
    node_ids = [n["id"] for n in nodes]
    DIALOGUES.append({
        "id": id,
        "entry": entry if entry is not None else node_ids[:1] if len(node_ids) == 1 else node_ids,
        "nodes": list(nodes),
    })


def node(id, lines, speaker=None, next=None, choices=None, actions=None,
         requires=None, portrait=None):
    n = {"id": id, "lines": lines}
    if speaker: n["speaker"] = speaker
    if next: n["next"] = next
    if choices: n["choices"] = choices
    if actions: n["actions"] = actions
    if requires: n["requires"] = requires
    if portrait: n["portrait"] = portrait
    return n


def choice(text, next=None, actions=None):
    c = {"text": text}
    if next: c["next"] = next
    if actions: c["actions"] = actions
    return c


def trainer(id, name, cls, ai, team, reward, intro, defeat, victory,
            post=None, appearance=None, items=None, gigantic=False, rematch=None):
    t = {
        "id": id, "name": name, "trainerClass": cls, "ai": ai,
        "team": team, "rewardBase": reward,
        "dialogue": {"intro": intro, "defeat": defeat, "victory": victory},
    }
    if post: t["dialogue"]["postBattle"] = post
    if appearance: t["appearance"] = appearance
    if items: t["items"] = items
    if gigantic: t["canGigantic"] = True
    if rematch: t["rematchTeam"] = rematch
    TRAINERS.append(t)


def mon(species, level, moves=None, item=None, ability=None, gigantic=False):
    m = {"species": species, "level": level}
    if moves: m["moves"] = moves
    if item: m["item"] = item
    if ability: m["ability"] = ability
    if gigantic: m["gigantic"] = True
    return m


# ==========================================================================
# DIALOGE - HEIMATORT
# ==========================================================================
tree("mutter",
    node("start_stage1", [
        "Guten Morgen! Du hast ja lange geschlafen.",
        "Professorin Farnholz war schon zweimal hier - sie wartet in der Forschungsstation auf dich.",
        "Heute ist es also so weit. Deine Reise beginnt!",
    ], speaker="Mutter", requires={"maxStoryStage": 1}, next="start_stage1_b"),
    node("start_stage1_b", [
        "Pass auf dich auf. Und vergiss nicht: Wenn dein Team erschoepft ist, hilft dir jede Heilstation weiter.",
    ], speaker="Mutter", actions=[{"kind": "setFlag", "flag": "mutterGesprochen"}]),
    node("start_after", [
        "Wie laeuft deine Reise, {spieler}?",
        "Ich habe dir etwas eingepackt - nimm es mit.",
    ], speaker="Mutter", requires={"storyStage": 2, "notFlag": "mutterGeschenk"},
        actions=[
            {"kind": "giveItem", "item": "trank", "quantity": 3},
            {"kind": "setFlag", "flag": "mutterGeschenk"},
        ]),
    node("idle", [
        "Melde dich ruhig oefter. Und iss genug!",
    ], speaker="Mutter"),
    entry=["start_stage1", "start_after", "idle"],
)

tree("professorin",
    node("prolog", [
        "Ah, {spieler}! Endlich.",
        "Ich forsche seit Jahren an den Kreaturen von Aetheria. Und heute brauche ich deine Hilfe.",
        "Die Region ist riesig - allein schaffe ich es nicht, sie zu erfassen.",
        "Was ich sagen will: Nimm einen Begleiter und einen Kreaturenindex mit.",
    ], speaker="Prof. Farnholz", requires={"maxStoryStage": 1}, next="prolog_frage"),
    node("prolog_frage", [
        "Moechtest du eine der drei Kreaturen hier waehlen?",
    ], speaker="Prof. Farnholz", choices=[
        choice("Ja, sehr gern!", actions=[{"kind": "chooseStarter"}]),
        choice("Ich ueberlege noch.", next="prolog_warten"),
    ]),
    node("prolog_warten", [
        "Kein Problem. Ich bin hier, wenn du so weit bist.",
    ], speaker="Prof. Farnholz"),
    node("nach_wahl", [
        "Eine ausgezeichnete Wahl! Passt zu dir.",
        "Hier - der Kreaturenindex. Er zeichnet jede Art auf, die du siehst oder faengst.",
        "Und nimm ein paar Fangkugeln mit. Ohne die kommst du nicht weit.",
    ], speaker="Prof. Farnholz", requires={"flag": "starterChosen", "notFlag": "indexErhalten"},
        actions=[
            {"kind": "giveItem", "item": "kreaturenindex"},
            {"kind": "giveItem", "item": "fangkugel", "quantity": 10},
            {"kind": "giveItem", "item": "laufschuhe"},
            {"kind": "setFlag", "flag": "indexErhalten"},
            {"kind": "storyStage", "stage": 3},
            {"kind": "startQuest", "quest": "hauptquest_erster_orden"},
        ], next="nach_wahl_b"),
    node("nach_wahl_b", [
        "Geh nach Norden ueber Route 1 bis nach Quellheim. Dort gibt es die erste Arena der Region.",
        "Acht Orden brauchst du, um zur Liga zugelassen zu werden. Acht!",
        "Aber eins nach dem anderen. Viel Erfolg, {spieler}.",
    ], speaker="Prof. Farnholz"),
    node("index_info", [
        "Dein Index zeigt bereits {orden} Orden an. Beeindruckend.",
        "Fang weiter alles, was dir begegnet - jede Art hilft meiner Forschung.",
    ], speaker="Prof. Farnholz", requires={"storyStage": 3}),
    node("idle", [
        "Die Kreaturen dieser Region haben mich mein Leben lang beschaeftigt. Und ich lerne noch immer dazu.",
    ], speaker="Prof. Farnholz"),
    entry=["prolog", "nach_wahl", "index_info", "idle"],
)

tree("lab_assistent",
    node("start", [
        "Die Professorin ist manchmal etwas zerstreut, aber sie ist die beste Forscherin der Region.",
        "Achte im Kampf auf die Typen! Feuer schmilzt Eis, Wasser loescht Feuer - das ist der halbe Sieg.",
    ], speaker="Assistent"),
)

tree("rivalen_mutter",
    node("start", [
        "Oh, {spieler}! Mein Kind ist schon vor einer Stunde losgezogen.",
        "Immer diese Eile. Aber so ist es nun mal.",
    ], speaker="Nachbarin"),
)

tree("startdorf_alt",
    node("start_early", [
        "Frueher bin ich selbst durch ganz Aetheria gereist.",
        "Heute reicht mir die Bank hier vor dem Haus.",
    ], speaker="Alter Nachbar", requires={"maxStoryStage": 2}),
    node("start_late", [
        "Du hast also schon {orden} Orden. In deinem Alter hatte ich noch keinen einzigen!",
        "Ein Rat: Ein ausgewogenes Team schlaegt ein starkes.",
    ], speaker="Alter Nachbar", requires={"storyStage": 3}),
    entry=["start_late", "start_early"],
)

tree("startdorf_kind",
    node("start", [
        "Ich will auch mal auf Reisen gehen!",
        "Aber erst muss ich noch gross werden. Und Hausaufgaben machen.",
    ], speaker="Kind"),
)

tree("startdorf_wache",
    node("blocked", [
        "Halt! Route 1 ist kein Spielplatz.",
        "Ohne eigene Kreatur laesse ich dich da nicht durch. Geh erst zur Professorin.",
    ], speaker="Wegweiser", requires={"notFlag": "starterChosen"}),
    node("open", [
        "Du hast eine Kreatur dabei? Dann viel Glueck auf Route 1!",
        "Im hohen Gras lauern wilde Kreaturen. Halt die Augen offen.",
    ], speaker="Wegweiser"),
    entry=["blocked", "open"],
)

tree("dorf_sammler",
    node("start", [
        "Ich sammle alles, was glaenzt. Perlen, Nuggets, Sternenstaub.",
        "Hier, nimm das - ich habe reichlich davon.",
    ], speaker="Sammler", requires={"notFlag": "sammlerGeschenk"},
        actions=[
            {"kind": "giveItem", "item": "beere_rot", "quantity": 3},
            {"kind": "setFlag", "flag": "sammlerGeschenk"},
        ]),
    node("idle", [
        "Beeren kann man im Lager verfuettern. Deine Kreaturen moegen das.",
    ], speaker="Sammler"),
    entry=["start", "idle"],
)

tree("dorf_heilerin",
    node("start", [
        "Soll ich dein Team versorgen? Das kostet dich nichts.",
    ], speaker="Heilkundige", choices=[
        choice("Ja, bitte.", next="heilen"),
        choice("Nein, danke.", next="abgelehnt"),
    ]),
    node("heilen", [
        "So. Alle wieder wohlauf.",
    ], speaker="Heilkundige", actions=[{"kind": "healParty"}]),
    node("abgelehnt", [
        "Wie du meinst. Ich bin da, wenn du mich brauchst.",
    ], speaker="Heilkundige"),
    entry=["start"],
)

# ==========================================================================
# DIALOGE - ROUTE 1 UND QUELLHEIM
# ==========================================================================
tree("route1_spaziergaengerin",
    node("start", [
        "Im hohen Gras rascheln staendig Kreaturen.",
        "Wenn du eine fangen willst: Schwaech sie erst im Kampf. Ein Ball allein reicht selten.",
    ], speaker="Spaziergaengerin"),
)

tree("quellheim_fuehrer",
    node("start", [
        "Willkommen in Quellheim! Die Quelle im Zentrum ist aelter als die Stadt selbst.",
        "Die Arena liegt im Sueden - Arenaleiterin Thalia setzt auf Pflanzen-Kreaturen.",
        "Die Heilstation im Westen versorgt dein Team kostenlos. Der Laden im Osten hat alles Noetige.",
    ], speaker="Stadtfuehrer"),
)

tree("quellheim_kind",
    node("start", [
        "Thalia hat noch nie verloren! Naja... fast nie.",
        "Feuer soll gut gegen Pflanzen sein, sagt mein Vater.",
    ], speaker="Kind"),
)

tree("quellheim_forscher",
    node("start", [
        "Kreaturen entwickeln sich, wenn sie stark genug werden.",
        "Manche brauchen aber auch besondere Steine - oder die richtige Tageszeit.",
    ], speaker="Naturkundler"),
)

tree("quellheim_tipp",
    node("start", [
        "Ein Tipp von einer alten Trainerin: Wertveraenderungen im Kampf sind maechtiger, als die meisten denken.",
        "Zwei Runden Aufbau, und der Rest geht von allein.",
    ], speaker="Alte Trainerin", requires={"notFlag": "tippGeschenk"},
        actions=[
            {"kind": "giveItem", "item": "supertrank", "quantity": 2},
            {"kind": "setFlag", "flag": "tippGeschenk"},
        ]),
    node("idle", [
        "Setz die Supertraenke klug ein. Im richtigen Moment entscheiden sie den Kampf.",
    ], speaker="Alte Trainerin"),
    entry=["start", "idle"],
)

tree("heilstation",
    node("start", [
        "Willkommen in der Heilstation. Soll ich dein Team versorgen?",
    ], speaker="Pflegerin", choices=[
        choice("Ja, bitte.", next="heilen"),
        choice("Spaeter.", next="abgelehnt"),
    ]),
    node("heilen", [
        "Einen Moment ... so! Deine Kreaturen sind wieder vollstaendig erholt.",
        "Wir freuen uns auf deinen naechsten Besuch.",
    ], speaker="Pflegerin", actions=[{"kind": "healParty"}]),
    node("abgelehnt", [
        "Kein Problem. Wir haben rund um die Uhr geoeffnet.",
    ], speaker="Pflegerin"),
    entry=["start"],
)

tree("center_gast",
    node("start", [
        "Ich reise seit Monaten durch Aetheria.",
        "Die Heilstationen retten einem wirklich den Tag.",
    ], speaker="Reisender"),
)

tree("shop_haendler",
    node("start", [
        "Willkommen! Was darf es sein?",
    ], speaker="Haendler", actions=[{"kind": "openShop", "shop": "shop_quellheim"}]),
)

tree("generic_npc",
    node("start", [
        "Schoenes Wetter heute, nicht wahr?",
    ]),
)

# ==========================================================================
# TRAINER
# ==========================================================================
trainer(
    "wanderer_kai", "Wanderer Kai", "Wanderer", "basic",
    [mon("nagezahn", 6), mon("federflaum", 7)],
    reward=45,
    intro=[
        "He, du da! Du siehst aus, als haettest du gerade erst angefangen.",
        "Zeig mir, was du kannst!",
    ],
    defeat=[
        "Nicht schlecht! Du lernst schnell.",
        "Nimm das hier - auf Route 1 wirst du es brauchen.",
    ],
    victory=["Uebung macht den Meister. Versuch es noch einmal!"],
    post=["Nach Norden geht es weiter nach Quellheim. Dort steht die erste Arena."],
    appearance={"skin": "#d8b08a", "hair": "#3a2a1c", "shirt": "#4b8f5f",
                "pants": "#5f4a33", "accent": "#c4b08a", "hat": "cap"},
)

trainer(
    "kaeferfreundin_ida", "Kaeferfreundin Ida", "Kaeferfreundin", "basic",
    [mon("kribbelkaefer", 8), mon("kribbelkaefer", 8), mon("puppenpanzer", 9)],
    reward=50,
    intro=[
        "Kaefer sind die unterschaetztesten Kreaturen ueberhaupt!",
        "Ich beweise es dir.",
    ],
    defeat=["Gut gekaempft. Meine Kaefer und ich trainieren weiter!"],
    victory=["Siehst du? Kaefer sind stark!"],
    post=["Im hohen Gras findest du auch seltene Kaefer. Guck genau hin."],
    appearance={"skin": "#f0cfa8", "hair": "#8f5f2b", "shirt": "#9bc44b",
                "pants": "#4a5f33", "accent": "#e0e8a0", "hat": "beanie", "height": 0.9},
)

trainer(
    "schuelerin_mira", "Schuelerin Mira", "Schuelerin", "smart",
    [mon("knollknospe", 11), mon("funkenfell", 12)],
    reward=60,
    intro=[
        "Ich trainiere fuer die Arena. Du auch?",
        "Dann lass uns vorher gegeneinander antreten!",
    ],
    defeat=["Du bist wirklich gut. Thalia wird dich ernst nehmen muessen."],
    victory=["Noch nicht bereit fuer die Arena, wuerde ich sagen."],
    post=["Thalia setzt auf Pflanzen. Feuer, Flug und Eis wirken gut dagegen."],
    items=["trank"],
    appearance={"skin": "#e8c19b", "hair": "#2b2b2b", "shirt": "#8f4bbf",
                "pants": "#3f3f4a", "accent": "#ffffff", "hat": "none", "height": 0.94},
)

trainer(
    "arena1_ben", "Arena-Trainer Ben", "Arena-Trainer", "smart",
    [mon("sprossling", 12), mon("knollknospe", 13)],
    reward=70,
    intro=[
        "Die Arena von Quellheim laesst nicht jeden zur Leiterin durch.",
        "Erst musst du an mir vorbei!",
    ],
    defeat=["Du kommst weiter. Aber Thalia ist eine andere Klasse."],
    victory=["Trainiere noch etwas und komm wieder."],
    post=["Lin wartet weiter hinten. Danach erst Thalia."],
    appearance={"skin": "#d8b08a", "hair": "#4a3524", "shirt": "#7fc44b",
                "pants": "#3f5f33", "accent": "#ffffff", "hat": "cap"},
)

trainer(
    "arena1_lin", "Arena-Trainerin Lin", "Arena-Trainerin", "smart",
    [mon("knollknospe", 13), mon("dornenranke", 14, moves=["rankenhieb", "dornenwall", "blattschnitt", "knurren"])],
    reward=75,
    intro=[
        "Pflanzen wirken sanft. Das ist ein Irrtum.",
        "Meine Ranken halten dich fest, bis du aufgibst!",
    ],
    defeat=["Beeindruckend. Geh weiter - Thalia erwartet dich."],
    victory=["Die Wurzeln waren staerker."],
    post=["Thalia hat noch nie leichtfertig einen Orden vergeben."],
    items=["supertrank"],
    appearance={"skin": "#f0cfa8", "hair": "#2b2b2b", "shirt": "#7fc44b",
                "pants": "#3f5f33", "accent": "#ffffff", "hat": "none", "height": 0.93},
)

trainer(
    "arenaleiterin_thalia", "Arenaleiterin Thalia", "Arenaleiterin", "expert",
    [
        mon("bluetenherz", 14, moves=["rankenhieb", "feenstaub", "wachstum", "schutzschirm"]),
        mon("dornenranke", 15, moves=["rankenhieb", "dornenwall", "energieentzug", "blattschnitt"]),
        mon("blattbock", 17,
            moves=["blattschnitt", "wuchtschlag", "wachstum", "energieentzug"],
            item="ueberreste", gigantic=True),
    ],
    reward=110,
    intro=[
        "Willkommen in meiner Arena, {spieler}.",
        "Ich bin Thalia. Ich huete die Quelle und alles, was aus ihr waechst.",
        "Wer den Wurzelorden will, muss zeigen, dass er mehr kann als zuschlagen.",
        "Zeig mir dein Koennen!",
    ],
    defeat=[
        "Wunderbar. Wirklich wunderbar.",
        "Du kaempfst nicht nur mit Kraft, sondern mit Verstand. Das sieht man selten.",
        "Der Wurzelorden gehoert dir - du hast ihn dir verdient.",
    ],
    victory=[
        "Noch nicht. Aber du warst nahe dran.",
        "Heile dein Team und komm wieder. Ich warte hier."
    ],
    post=[
        "Mit dem Wurzelorden gehorchen dir Kreaturen bis Level 20.",
        "Der Weg nach Norden steht dir offen. Viel Glueck, {spieler}.",
    ],
    items=["supertrank", "supertrank"],
    gigantic=True,
    appearance={"skin": "#e0b894", "hair": "#4f8a42", "shirt": "#d8e8cf",
                "pants": "#5f7a4f", "accent": "#7fc44b", "hat": "band", "height": 1.02},
    rematch=[
        mon("bluetenherz", 34), mon("dornenranke", 35),
        mon("waldschrat", 36), mon("forstwaechter", 38, gigantic=True),
    ],
)

# ==========================================================================
# ARENA
# ==========================================================================
GYMS.append({
    "id": "gym_quellheim", "name": "Arena von Quellheim", "city": "quellheim",
    "type": "grass", "badgeIndex": 0, "badgeName": "Wurzelorden",
    "leader": "arenaleiterin_thalia",
    "minions": ["arena1_ben", "arena1_lin"],
    "puzzle": "none",
    "introText": [
        "Das Innere der Arena ist von echtem Gruen ueberwuchert.",
        "Ranken bilden Wege, Blaetter filtern das Licht.",
    ],
    "victoryText": [
        "Die Ranken oeffnen sich und geben den Weg nach draussen frei.",
    ],
    "rewardItems": ["td19", "hypertrank"],
    "obedienceLevel": 20,
    "area": "gym_quellheim",
    "colors": {"primary": "#6b9b4f", "secondary": "#7fc44b", "accent": "#d8e8cf"},
})

# ==========================================================================
# LAEDEN
# ==========================================================================
SHOPS.append({
    "id": "shop_quellheim", "name": "Warenlager Quellheim",
    "greeting": "Willkommen! Frisch eingetroffen, alles auf Lager.",
    "buysItems": True,
    "stock": [
        {"item": "fangkugel"},
        {"item": "trank"},
        {"item": "gegengift"},
        {"item": "brandsalbe"},
        {"item": "nervenstaerker"},
        {"item": "wachmacher"},
        {"item": "auftaumittel"},
        {"item": "fluchtseil"},
        {"item": "schutzspray"},
        {"item": "superkugel", "minBadges": 1},
        {"item": "supertrank", "minBadges": 1},
        {"item": "beleber", "minBadges": 2},
        {"item": "hyperkugel", "minBadges": 3},
        {"item": "hypertrank", "minBadges": 3},
        {"item": "allheilmittel", "minBadges": 4},
    ],
})

# ==========================================================================
# AUFTRAEGE
# ==========================================================================
QUESTS.append({
    "id": "hauptquest_erster_orden", "name": "Der erste Orden", "kind": "main",
    "description": "Reise nach Quellheim und gewinne den Wurzelorden.",
    "autoStartStage": 3,
    "giver": "Prof. Farnholz",
    "area": "quellheim",
    "steps": [
        {"id": "route1", "description": "Folge Route 1 nach Norden.",
         "completion": {"kind": "visitArea", "area": "route_1"}},
        {"id": "quellheim", "description": "Erreiche Quellheim.",
         "completion": {"kind": "visitArea", "area": "quellheim"}},
        {"id": "arena", "description": "Betritt die Arena von Quellheim.",
         "completion": {"kind": "visitArea", "area": "gym_quellheim"}},
        {"id": "leiterin", "description": "Besiege Arenaleiterin Thalia.",
         "completion": {"kind": "defeatTrainer", "trainer": "arenaleiterin_thalia"}},
    ],
    "rewards": {"money": 1500, "items": [{"item": "superkugel", "quantity": 5}]},
})

QUESTS.append({
    "id": "nebenquest_erste_faenge", "name": "Feldforschung", "kind": "side",
    "description": "Prof. Farnholz bittet dich, erste Arten zu erfassen.",
    "autoStartStage": 3,
    "giver": "Prof. Farnholz",
    "steps": [
        {"id": "fang3", "description": "Fange drei verschiedene Arten.",
         "completion": {"kind": "catchCount", "count": 3}},
        {"id": "fang6", "description": "Fange sechs verschiedene Arten.",
         "completion": {"kind": "catchCount", "count": 6}},
    ],
    "rewards": {"money": 800, "items": [{"item": "hyperkugel", "quantity": 3}]},
})

QUESTS.append({
    "id": "nebenquest_wanderer", "name": "Kais Herausforderung", "kind": "side",
    "description": "Besiege die Trainer auf Route 1.",
    "autoStartStage": 3,
    "steps": [
        {"id": "kai", "description": "Besiege Wanderer Kai.",
         "completion": {"kind": "defeatTrainer", "trainer": "wanderer_kai"}},
        {"id": "ida", "description": "Besiege Kaeferfreundin Ida.",
         "completion": {"kind": "defeatTrainer", "trainer": "kaeferfreundin_ida"}},
    ],
    "rewards": {"money": 600, "items": [{"item": "aether", "quantity": 2}]},
})

# ==========================================================================
# STORY-STUFEN
# ==========================================================================
for stage, sid, name, objective in [
    (0, "prolog", "Prolog", "Wach auf und verlasse dein Zimmer."),
    (1, "aufbruch", "Aufbruch", "Sprich mit Prof. Farnholz in der Forschungsstation."),
    (2, "begleiter", "Erster Begleiter", "Waehle deinen ersten Begleiter."),
    (3, "erste_reise", "Die erste Reise", "Reise ueber Route 1 nach Quellheim."),
    (4, "erster_orden", "Der Wurzelorden", "Besiege Arenaleiterin Thalia."),
    (5, "weiter_nach_norden", "Weiter nach Norden", "Setze deine Reise fort."),
]:
    STORY.append({"stage": stage, "id": sid, "name": name, "objective": objective})

# ==========================================================================
# CUTSCENES
# ==========================================================================
STORY.append({
    "id": "prolog_labor",
    "lockPlayer": True,
    "steps": [
        {"kind": "message", "speaker": "Prof. Farnholz",
         "lines": ["{spieler}! Da bist du ja endlich. Komm herein!"]},
        {"kind": "action", "actions": [{"kind": "storyStage", "stage": 1}]},
    ],
})

STORY.append({
    "id": "starterwahl",
    "lockPlayer": True,
    "music": "lab",
    "steps": [
        {"kind": "cameraShake", "intensity": 0.2, "seconds": 0.3},
        {"kind": "message", "speaker": "Prof. Farnholz", "lines": [
            "Hier sind sie - drei junge Kreaturen, die auf einen Trainer warten.",
            "Sieh sie dir in Ruhe an. Die Entscheidung ist endgueltig.",
        ]},
        {"kind": "action", "actions": [{"kind": "chooseStarter"}]},
    ],
})

STORY.append({
    "id": "arena_einzug",
    "lockPlayer": True,
    "music": "gym",
    "steps": [
        {"kind": "fade", "to": "black", "seconds": 0.4},
        {"kind": "wait", "seconds": 0.3},
        {"kind": "fade", "to": "clear", "seconds": 0.5},
        {"kind": "message", "lines": [
            "Das Innere der Arena ist von echtem Gruen ueberwuchert.",
            "Ranken bilden Wege, Blaetter filtern das Licht.",
        ]},
    ],
})

# ==========================================================================
# AUSGABE
# ==========================================================================
def write(folder, items, key="id"):
    out = ROOT / "data" / folder
    out.mkdir(parents=True, exist_ok=True)
    for f in out.glob("*.json"):
        f.unlink()
    for item in items:
        (out / f"{item[key]}.json").write_text(
            json.dumps(item, indent=1, ensure_ascii=False) + "\n")


def main():
    # Referenzpruefung gegen die bereits erzeugten Daten
    species = set()
    for f in (ROOT / "data/creatures").glob("*.json"):
        for s in json.loads(f.read_text()):
            species.add(s["id"])
    moves = set()
    for f in (ROOT / "data/moves").glob("*.json"):
        for m in json.loads(f.read_text()):
            moves.add(m["id"])
    items = set()
    for f in (ROOT / "data/items").glob("*.json"):
        for i in json.loads(f.read_text()):
            items.add(i["id"])

    problems = []
    trainer_ids = {t["id"] for t in TRAINERS}
    dialogue_ids = {d["id"] for d in DIALOGUES}
    shop_ids = {s["id"] for s in SHOPS}
    quest_ids = {q["id"] for q in QUESTS}
    cutscene_ids = {s["id"] for s in STORY if "steps" in s}

    for t in TRAINERS:
        for m in t["team"] + t.get("rematchTeam", []):
            if m["species"] not in species:
                problems.append(f"{t['id']}: unbekannte Art '{m['species']}'")
            for mv in m.get("moves", []):
                if mv not in moves:
                    problems.append(f"{t['id']}: unbekannte Attacke '{mv}'")
            if m.get("item") and m["item"] not in items:
                problems.append(f"{t['id']}: unbekannter Gegenstand '{m['item']}'")
        for i in t.get("items", []):
            if i not in items:
                problems.append(f"{t['id']}: unbekannter Kampfgegenstand '{i}'")

    for g in GYMS:
        if g["leader"] not in trainer_ids:
            problems.append(f"{g['id']}: unbekannter Arenaleiter '{g['leader']}'")
        for m in g["minions"]:
            if m not in trainer_ids:
                problems.append(f"{g['id']}: unbekannter Trainer '{m}'")
        for i in g.get("rewardItems", []):
            if i not in items:
                problems.append(f"{g['id']}: unbekannte Belohnung '{i}'")

    for s in SHOPS:
        for entry in s["stock"]:
            if entry["item"] not in items:
                problems.append(f"{s['id']}: unbekannter Artikel '{entry['item']}'")

    for q in QUESTS:
        for r in q.get("rewards", {}).get("items", []):
            if r["item"] not in items:
                problems.append(f"{q['id']}: unbekannte Belohnung '{r['item']}'")
        for step in q["steps"]:
            c = step.get("completion", {})
            if c.get("kind") == "defeatTrainer" and c["trainer"] not in trainer_ids:
                problems.append(f"{q['id']}: unbekannter Trainer '{c['trainer']}'")
            if c.get("kind") == "catchSpecies" and c["species"] not in species:
                problems.append(f"{q['id']}: unbekannte Art '{c['species']}'")

    # Dialogaktionen pruefen
    def check_actions(source, actions):
        for a in actions or []:
            k = a.get("kind")
            if k == "giveItem" and a["item"] not in items:
                problems.append(f"{source}: unbekannter Gegenstand '{a['item']}'")
            if k == "takeItem" and a["item"] not in items:
                problems.append(f"{source}: unbekannter Gegenstand '{a['item']}'")
            if k == "giveCreature" and a["species"] not in species:
                problems.append(f"{source}: unbekannte Art '{a['species']}'")
            if k == "startBattle" and a["trainer"] not in trainer_ids:
                problems.append(f"{source}: unbekannter Trainer '{a['trainer']}'")
            if k == "openShop" and a["shop"] not in shop_ids:
                problems.append(f"{source}: unbekannter Laden '{a['shop']}'")
            if k in ("startQuest", "advanceQuest", "completeQuest") and a["quest"] not in quest_ids:
                problems.append(f"{source}: unbekannter Auftrag '{a['quest']}'")
            if k == "cutscene" and a["cutscene"] not in cutscene_ids:
                problems.append(f"{source}: unbekannte Cutscene '{a['cutscene']}'")

    for d in DIALOGUES:
        node_ids = {n["id"] for n in d["nodes"]}
        for e in d["entry"]:
            if e not in node_ids:
                problems.append(f"{d['id']}: Einstiegsknoten '{e}' fehlt")
        for n in d["nodes"]:
            check_actions(f"{d['id']}/{n['id']}", n.get("actions"))
            if n.get("next") and n["next"] not in node_ids:
                problems.append(f"{d['id']}/{n['id']}: Folgeknoten '{n['next']}' fehlt")
            for c in n.get("choices", []):
                check_actions(f"{d['id']}/{n['id']}/Auswahl", c.get("actions"))
                if c.get("next") and c["next"] not in node_ids:
                    problems.append(f"{d['id']}/{n['id']}: Auswahlziel '{c['next']}' fehlt")

    for s in STORY:
        for step in s.get("steps", []):
            if step["kind"] == "action":
                check_actions(f"{s['id']}", step["actions"])
            if step["kind"] == "battle" and step["trainer"] not in trainer_ids:
                problems.append(f"{s['id']}: unbekannter Trainer '{step['trainer']}'")

    if problems:
        print("FEHLER in den Inhalten:")
        for p in problems:
            print("  -", p)
        raise SystemExit(1)

    write("dialogue", DIALOGUES)
    write("trainers", TRAINERS)
    write("gyms", GYMS)
    write("shops", SHOPS)
    write("quests", QUESTS)
    write("story", STORY)
    print(f"{len(DIALOGUES)} Dialoge, {len(TRAINERS)} Trainer, {len(GYMS)} Arenen, "
          f"{len(SHOPS)} Laeden, {len(QUESTS)} Auftraege, {len(STORY)} Story-Eintraege")


if __name__ == "__main__":
    main()
