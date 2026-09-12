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
# WEITERE ORTSDIALOGE
# ==========================================================================
def guide(id, speaker, lines):
    tree(id, node("start", lines, speaker=speaker))

guide("flusshafen_guide", "Hafenmeister", [
    "Willkommen in Flusshafen! Hier treffen Fluss und Meer aufeinander.",
    "Arenaleiter Marek kaempft mit Wasser - nimm Pflanzen oder Elektro mit.",
    "Und pass auf: Bei Regen werden die wilden Wasser-Kreaturen deutlich zahlreicher.",
])
guide("hammerstadt_guide", "Werkmeister", [
    "Hammerstadt liefert Stahl in die halbe Region.",
    "Bora leitet die Arena. Sie kaempft mit Kampf-Kreaturen - und sie kaempft hart.",
    "Flug, Psycho oder Feen wirken gut dagegen.",
])
guide("funkenau_guide", "Stadtfuehrerin", [
    "In Funkenau gehen die Lichter nie aus.",
    "Volt fuehrt die Arena. Elektro - also lass Boden-Kreaturen antreten.",
    "Suedlich liegt das Wildland. Dort gilt: Wetter aendert alles.",
])
guide("aschenberg_guide", "Kraterwaechter", [
    "Der Krater raucht seit dreihundert Jahren. Gewoehnungssache.",
    "Ember hat die Arena von ihrer Mutter uebernommen. Feuer, was sonst.",
    "Wasser, Gestein oder Boden - such dir was aus.",
])
guide("geisterruine_guide", "Chronistin", [
    "Diese Stadt wurde nie ganz verlassen. Nur ... anders bewohnt.",
    "Morven fuehrt die Arena. Geist-Kreaturen sind gegen Normal immun - denk daran.",
    "Unlicht und Geist wirken zurueck.",
])
guide("frostgipfel_guide", "Bergwirtin", [
    "Setz dich erst mal, du bist ja halb erfroren.",
    "Hela ist oben in der Arena. Eis - klar bei dem Wetter.",
    "Feuer, Stahl, Kampf und Gestein helfen dagegen.",
])
guide("drachenhorst_guide", "Hueter", [
    "Der Horst steht seit sieben Generationen. Wir huetten die Drachen, nicht umgekehrt.",
    "Saphira ist die achte Hueterin. Wer sie schlaegt, darf zur Liga.",
    "Eis, Feen und Drachen selbst sind ihre Schwaechen.",
])
guide("dornwald_einsiedler", "Einsiedler", [
    "Leise. Der Wald hoert mit.",
    "Nachts kommen die Schatten heraus. Tagsueber schlafen sie.",
    "Wer hier etwas sucht, findet meist etwas anderes.",
])
guide("nebelmoor_hueterin", "Moorhueterin", [
    "Der Nebel liegt hier seit jeher. Er kommt nicht vom Wetter.",
    "Halt dich an den Weg. Wer abkommt, findet oft nicht zurueck.",
])
guide("wildland_forscher", "Feldforscher", [
    "Das Wildland folgt eigenen Regeln. Wetter, Tageszeit, Jahreszeit - alles wirkt.",
    "Bei Gewitter tauchen Kreaturen auf, die man sonst nie sieht.",
    "Und die Energiepunkte ... halt dich fern, wenn du nicht vorbereitet bist.",
])
guide("liga_ansager", "Ansager", [
    "Meine Damen und Herren, das Ligastadion ist eroeffnet!",
    "Vier Spitzentrainer und der Champion - in dieser Reihenfolge. Ohne Pause.",
    "Heil dein Team, bevor du hineingehst. Ein zweiter Versuch kostet Zeit.",
])

tree("wildland_lager",
    node("start", [
        "Willkommen im Wildlandlager. Soll ich dein Team versorgen?",
    ], speaker="Lagerwart", choices=[
        choice("Ja, bitte.", next="heilen"),
        choice("Nein, danke.", next="nein"),
    ]),
    node("heilen", ["Fertig. Und pass da draussen auf dich auf."],
         speaker="Lagerwart", actions=[{"kind": "healParty"}]),
    node("nein", ["Wie du meinst. Das Lager steht immer offen."], speaker="Lagerwart"),
    entry=["start"],
)

tree("liga_wache",
    node("blocked", [
        "Halt. Ohne acht Orden kommt hier niemand durch.",
    ], speaker="Ligawache", requires={"maxStoryStage": 11}),
    node("open", [
        "Acht Orden. Du hast es tatsaechlich geschafft.",
        "Dahinter warten vier Spitzentrainer und der Champion. Viel Glueck.",
    ], speaker="Ligawache"),
    entry=["blocked", "open"],
)

# ==========================================================================
# TRAINER-VORLAGEN
# ==========================================================================
CLASS_LINES = {
    "wanderer": (["Ein Kampf unterwegs haelt wach!"], ["Gut gemacht. Weiter so."],
                 ["Noch nicht genug Uebung."]),
    "kaefer": (["Meine Kaefer sind zaeher, als du denkst!"],
               ["Beeindruckend. Ich trainiere weiter."], ["Kaefer gewinnen!"]),
    "forscher": (["Ein Kampf ist die beste Messung!"],
                 ["Faszinierende Daten. Danke dir."], ["Meine Hypothese war richtig."]),
    "kaempfer": (["Zeig, was in dir steckt!"], ["Starker Kampf. Respekt."],
                 ["Zu wenig Kraft."]),
    "wache": (["Hier kommt niemand einfach so durch!"], ["Du darfst passieren."],
              ["Kehr um und trainiere."]),
    "sammler": (["Ich sammle Siege. Deiner waere der naechste!"],
                ["Der geht an dich."], ["Wieder einer fuer meine Sammlung."]),
}


def route_trainer(id, name, cls, ai, team, reward, shirt, style="wanderer",
                  hair="#3a2a1c", hat="cap", height=1.0, items=None, post=None):
    intro, defeat, victory = CLASS_LINES[style]
    trainer(
        id, name, cls, ai, team, reward,
        intro=[f"{intro[0]}"], defeat=list(defeat), victory=list(victory),
        post=post or ["Trainiere weiter - der Weg wird nicht leichter."],
        items=items,
        appearance={"skin": "#d8b08a", "hair": hair, "shirt": shirt,
                    "pants": "#3a3a42", "accent": "#ffffff", "hat": hat, "height": height},
    )


def gym_leader(id, name, cls, team, reward, shirt, hair, hat, intro, defeat, victory,
               post, items, rematch, height=1.04):
    trainer(
        id, name, cls, "expert", team, reward,
        intro=intro, defeat=defeat, victory=victory, post=post, items=items,
        gigantic=True, rematch=rematch,
        appearance={"skin": "#e0b894", "hair": hair, "shirt": shirt,
                    "pants": "#3a3a42", "accent": "#ffffff", "hat": hat, "height": height},
    )


# ------------------------------------------------------------ ROUTE-TRAINER
route_trainer("kaefersammler_tom", "Kaefersammler Tom", "Kaefersammler", "basic",
              [mon("kribbelkaefer", 12), mon("flatterling", 13)], 55, "#9bc44b", "kaefer")
route_trainer("wandererin_nele", "Wandererin Nele", "Wanderin", "basic",
              [mon("nagezahn", 13), mon("federflaum", 14)], 55, "#4b8f9b", "wanderer",
              hair="#8f5a2b", hat="beanie", height=0.95)
route_trainer("matrose_jens", "Matrose Jens", "Matrose", "smart",
              [mon("schlammlurch", 15), mon("wellenotter", 16)], 70, "#3f7fbf", "kaempfer",
              hat="beanie")
route_trainer("kraeuterkundige_rina", "Kraeuterkundige Rina", "Kraeuterkundige", "smart",
              [mon("knollknospe", 17), mon("giftkappe", 18)], 75, "#5f8f4b", "forscher",
              hair="#4f8a42", hat="none", height=0.96)
route_trainer("waldlaeufer_ove", "Waldlaeufer Ove", "Waldlaeufer", "smart",
              [mon("sprossling", 17), mon("schattenwolf", 18)], 75, "#6b5f3f", "wanderer")
route_trainer("waldhueterin_anke", "Waldhueterin Anke", "Waldhueterin", "smart",
              [mon("dornenranke", 20), mon("waldschrat", 21)], 85, "#4f8a42", "wache",
              hair="#2b2b2b", hat="band", height=0.98)
route_trainer("pilzsammler_udo", "Pilzsammler Udo", "Pilzsammler", "smart",
              [mon("giftkappe", 20), mon("sporenherr", 22)], 85, "#8f6bbf", "sammler",
              hat="beanie")
route_trainer("bergsteiger_falk", "Bergsteiger Falk", "Bergsteiger", "smart",
              [mon("kieselkopf", 22), mon("bergziege", 23)], 90, "#9b7346", "kaempfer",
              hat="helmet")
route_trainer("faustkaempfer_ove", "Faustkaempfer Ove", "Faustkaempfer", "smart",
              [mon("kampffaust", 23), mon("ringmeister", 24)], 95, "#c96b4b", "kaempfer",
              hat="band", items=["trank"])
route_trainer("hoehlenforscher_bela", "Hoehlenforscher Bela", "Hoehlenforscher", "smart",
              [mon("felsbrocken", 25), mon("nachtschleier", 26)], 100, "#6b5f4b", "forscher",
              hat="helmet")
route_trainer("schatzsucherin_yara", "Schatzsucherin Yara", "Schatzsucherin", "smart",
              [mon("goldpanzer", 26), mon("ruestungsigel", 26)], 100, "#c2a04b", "sammler",
              hair="#c24b4b", hat="none", height=0.97)
route_trainer("mechaniker_ruben", "Mechaniker Ruben", "Mechaniker", "smart",
              [mon("ruestungsigel", 26), mon("rostritter", 28)], 105, "#8f8f8a", "kaempfer",
              hat="helmet", items=["supertrank"])
route_trainer("technikerin_ilva", "Technikerin Ilva", "Technikerin", "smart",
              [mon("voltnager", 29), mon("blitzotter", 30)], 110, "#e0cf4b", "forscher",
              hair="#2b2b2b", hat="none", height=0.96)
route_trainer("faehrtenleser_bo", "Faehrtenleser Bo", "Faehrtenleser", "smart",
              [mon("windfuchs", 28), mon("nachtwolf", 30)], 110, "#6b8f4b", "wanderer")
route_trainer("jaegerin_pax", "Jaegerin Pax", "Jaegerin", "expert",
              [mon("sturmfuchs", 31), mon("mondpanther", 32)], 120, "#8f6b4b", "kaempfer",
              hair="#4a3524", hat="band", height=0.99, items=["supertrank"])
route_trainer("wildhueter_sten", "Wildhueter Sten", "Wildhueter", "expert",
              [mon("bergkoloss", 32), mon("donnerhorn", 32)], 120, "#4b8f6b", "wache",
              hat="beanie")
route_trainer("glutlaeufer_nero", "Glutlaeufer Nero", "Glutlaeufer", "smart",
              [mon("aschebrand", 32), mon("lavagnom", 33)], 120, "#c95b2f", "kaempfer")
route_trainer("aschewanderin_rea", "Aschewanderin Rea", "Aschewanderin", "smart",
              [mon("glutfalter", 33), mon("magmaherr", 35)], 125, "#8f5f3f", "wanderer",
              hair="#c24b4b", hat="none", height=0.97)
route_trainer("schmiedin_vera", "Schmiedin Vera", "Schmiedin", "expert",
              [mon("magmaherr", 34), mon("panzerwacht", 35)], 130, "#c95b2f", "kaempfer",
              hair="#2b2b2b", hat="helmet", height=1.0, items=["hypertrank"])
route_trainer("moorgaengerin_inka", "Moorgaengerin Inka", "Moorgaengerin", "smart",
              [mon("sumpfhueter", 36), mon("glockenblume", 36)], 130, "#5f8f6b", "wanderer",
              hair="#5f3a2b", hat="beanie", height=0.96)
route_trainer("sumpfkundler_jan", "Sumpfkundler Jan", "Sumpfkundler", "smart",
              [mon("tintenschleim", 36), mon("schlickmonarch", 38)], 135, "#6b7a4b", "forscher")
route_trainer("irrlichtjaegerin_noor", "Irrlichtjaegerin Noor", "Irrlichtjaegerin", "expert",
              [mon("moorlicht", 38), mon("geisterfuerst", 39)], 140, "#5f7a6b", "sammler",
              hair="#cfcfcf", hat="none", height=0.98)
route_trainer("grabwaechter_idris", "Grabwaechter Idris", "Grabwaechter", "expert",
              [mon("nachtschleier", 38), mon("kristallgeist", 39), mon("waldschrat", 39)],
              145, "#6b4f8f", "wache", hair="#2b2b3b", hat="none", items=["hypertrank"])
route_trainer("bergfuehrer_kell", "Bergfuehrer Kell", "Bergfuehrer", "smart",
              [mon("bergziege", 39), mon("frostwelpe", 40)], 140, "#7a8f9b", "wanderer",
              hat="beanie")
route_trainer("kletterin_sona", "Kletterin Sona", "Kletterin", "smart",
              [mon("schneehase", 40), mon("eiswolf", 41)], 145, "#9bb0c4", "kaempfer",
              hair="#8f5a2b", hat="none", height=0.97)
route_trainer("schneelaeufer_nils", "Schneelaeufer Nils", "Schneelaeufer", "expert",
              [mon("eiswolf", 42), mon("kristallmotte", 42), mon("eisbaerchen", 42)],
              150, "#a0d8ef", "kaempfer", hat="beanie", items=["hypertrank"])
route_trainer("gratlaeufer_ilan", "Gratlaeufer Ilan", "Gratlaeufer", "expert",
              [mon("himmelsritter", 44), mon("sturmaar", 44)], 155, "#8f9bb0", "wanderer")
route_trainer("drachenschuelerin_vi", "Drachenschuelerin Vi", "Drachenschuelerin", "expert",
              [mon("klauenwelpe", 44), mon("sichelklaue", 45)], 160, "#5b6bc9", "kaempfer",
              hair="#2b3f6b", hat="none", height=0.98)
route_trainer("schuppenwaechter_rurik", "Schuppenwaechter Rurik", "Schuppenwaechter", "expert",
              [mon("sichelklaue", 46), mon("vulkanschlange", 46)], 165, "#4b5fa8", "wache",
              hat="helmet", items=["hypertrank", "top_trank"])
route_trainer("ligaanwaerter_ken", "Ligaanwaerter Ken", "Ligaanwaerter", "expert",
              [mon("panzerwacht", 48), mon("nachtwolf", 48), mon("sturmaar", 49)],
              180, "#c9a04b", "kaempfer", items=["top_trank"])
route_trainer("ligaanwaerterin_thea", "Ligaanwaerterin Thea", "Ligaanwaerterin", "expert",
              [mon("fluthueter", 48), mon("lichtfee", 48), mon("mondpanther", 49)],
              180, "#c9a04b", "kaempfer", hair="#c24b4b", hat="none", height=0.98,
              items=["top_trank"])

# ------------------------------------------------------------ ARENA-TRAINER
ARENA_MINIONS = [
    ("arena2_tim", "Arena-Trainer Tim", [mon("schlammlurch", 17), mon("wellenotter", 18)], "#5fb0e0"),
    ("arena2_saskia", "Arena-Trainerin Saskia", [mon("perlenmuschel", 18), mon("wellenotter", 19)], "#5fb0e0"),
    ("arena3_ravi", "Arena-Trainer Ravi", [mon("kampffaust", 24), mon("ringmeister", 25)], "#e08f5f"),
    ("arena3_mila", "Arena-Trainerin Mila", [mon("ringmeister", 25), mon("bergziege", 26)], "#e08f5f"),
    ("arena4_nino", "Arena-Trainer Nino", [mon("funkenfell", 30), mon("voltnager", 31)], "#f0e07f"),
    ("arena4_tessa", "Arena-Trainerin Tessa", [mon("blitzotter", 31), mon("quallenlicht", 31)], "#f0e07f"),
    ("arena5_kilian", "Arena-Trainer Kilian", [mon("aschebrand", 35), mon("lavagnom", 36)], "#f08a4b"),
    ("arena5_juna", "Arena-Trainerin Juna", [mon("glutfalter", 36), mon("aschewolf", 36)], "#f08a4b"),
    ("arena6_nyx", "Arena-Trainerin Nyx", [mon("nachtschleier", 40), mon("moorlicht", 40)], "#9b7fc4"),
    ("arena6_calla", "Arena-Trainerin Calla", [mon("kristallgeist", 41), mon("geisterfuerst", 41)], "#9b7fc4"),
    ("arena7_bjorn", "Arena-Trainer Bjorn", [mon("eisbaerchen", 44), mon("eiswolf", 44)], "#a8e0f0"),
    ("arena7_maja", "Arena-Trainerin Maja", [mon("kristallmotte", 44), mon("frostkoloss", 45)], "#a8e0f0"),
    ("arena8_torin", "Arena-Trainer Torin", [mon("klauenwelpe", 48), mon("sichelklaue", 49)], "#7f8fd8"),
    ("arena8_elke", "Arena-Trainerin Elke", [mon("vulkanschlange", 49), mon("sichelklaue", 50)], "#7f8fd8"),
]
for tid, tname, team, shirt in ARENA_MINIONS:
    trainer(
        tid, tname, "Arena-Trainer", "smart", team,
        reward=int(team[-1]["level"] * 4),
        intro=["Die Leitung dieser Arena empfaengt nicht jeden.", "Zeig erst mir, was du kannst!"],
        defeat=["Du kommst weiter. Aber die Leitung ist eine andere Klasse."],
        victory=["Noch nicht so weit. Trainiere und komm wieder."],
        post=["Heil dein Team, bevor du weitergehst. Ernsthaft."],
        items=["trank"],
        appearance={"skin": "#d8b08a", "hair": "#3a2a1c", "shirt": shirt,
                    "pants": "#3a3a42", "accent": "#ffffff", "hat": "cap"},
    )

# ------------------------------------------------------------ ARENALEITUNGEN
gym_leader(
    "arenaleiter_marek", "Arenaleiter Marek", "Arenaleiter",
    [mon("perlenmuschel", 19), mon("schlammlurch", 20),
     mon("wellenotter", 22, moves=["druckwelle", "aquaklinge", "nebelsog", "sturzbach"],
         item="meerwassertropfen", gigantic=True)],
    reward=140, shirt="#3f7fbf", hair="#1f3f5f", hat="beanie",
    intro=["Flusshafen lebt vom Wasser. Ich auch.",
           "Der Flutorden geht nur an jemanden, der eine Stroemung lesen kann.",
           "Zeig mir, dass du das kannst."],
    defeat=["Du hast die Stroemung gelesen. Sauber gemacht.",
            "Der Flutorden gehoert dir."],
    victory=["Gegen die Stroemung gewinnt man nicht. Versuch es noch einmal."],
    post=["Mit dem Flutorden gehorchen dir Kreaturen bis Level 28."],
    items=["supertrank", "supertrank"],
    rematch=[mon("quallenlicht", 40), mon("himmelsrochen", 41),
             mon("blitzotter", 42), mon("fluthueter", 44, gigantic=True)],
)

gym_leader(
    "arenaleiterin_bora", "Arenaleiterin Bora", "Arenaleiterin",
    [mon("kampffaust", 26), mon("bergziege", 27),
     mon("ringmeister", 29, moves=["kraftstoss", "konterhieb", "kampfschrei", "durchbruch"],
         item="kampfguertel", gigantic=True)],
    reward=160, shirt="#c96b4b", hair="#2b2b2b", hat="band", height=1.08,
    intro=["In Hammerstadt zaehlt, was haelt. Stahl, Maschinen, Menschen.",
           "Der Faustorden ist kein Geschenk. Er wird erarbeitet.",
           "Also arbeite."],
    defeat=["Du haeltst. Gut.", "Der Faustorden ist deiner."],
    victory=["Noch nicht hart genug. Komm wieder."],
    post=["Mit dem Faustorden gehorchen dir Kreaturen bis Level 36."],
    items=["hypertrank", "hypertrank"],
    rematch=[mon("frostkoloss", 44), mon("forstwaechter", 45),
             mon("bergkoloss", 46), mon("ringmeister", 48, gigantic=True)],
)

gym_leader(
    "arenaleiter_volt", "Arenaleiter Volt", "Arenaleiter",
    [mon("funkenfell", 32), mon("quallenlicht", 33),
     mon("voltnager", 35, moves=["blitzschlag", "volttempo", "entladung", "funkenkralle"],
         item="magnetkern", gigantic=True)],
    reward=180, shirt="#e0cf4b", hair="#f0f0f0", hat="none",
    intro=["Funkenau laeuft rund um die Uhr. Ich auch.",
           "Der Funkenorden geht an jemanden mit schnellen Entscheidungen.",
           "Also entscheide dich - jetzt."],
    defeat=["Schnell und richtig. Selten.", "Der Funkenorden gehoert dir."],
    victory=["Zu langsam. Ueberleg dir was."],
    post=["Mit dem Funkenorden gehorchen dir Kreaturen bis Level 44."],
    items=["hypertrank", "hypertrank"],
    rematch=[mon("blitzotter", 48), mon("donnerhorn", 49),
             mon("himmelsritter", 50), mon("voltnager", 52, gigantic=True)],
)

gym_leader(
    "arenaleiterin_ember", "Arenaleiterin Ember", "Arenaleiterin",
    [mon("lavagnom", 37), mon("glutfalter", 38),
     mon("magmaherr", 40, moves=["infernosalve", "gesteinslawine", "hitzeschild", "feuerklaue"],
         item="holzkohle", gigantic=True)],
    reward=200, shirt="#c95b2f", hair="#c24b4b", hat="band",
    intro=["Der Krater raucht seit dreihundert Jahren. Ich huete ihn seit zwanzig.",
           "Der Glutorden verlangt Ausdauer - meine Kreaturen geben nicht auf.",
           "Du hoffentlich auch nicht."],
    defeat=["Ausdauernd. Wirklich.", "Der Glutorden gehoert dir."],
    victory=["Ausgebrannt. Heil dein Team und komm wieder."],
    post=["Mit dem Glutorden gehorchen dir Kreaturen bis Level 52."],
    items=["hypertrank", "top_trank"],
    rematch=[mon("aschewolf", 52), mon("vulkanschlange", 53),
             mon("glutfalter", 53), mon("infernohorn", 55, gigantic=True)],
)

gym_leader(
    "arenaleiter_morven", "Arenaleiter Morven", "Arenaleiter",
    [mon("nachtschleier", 42), mon("moorlicht", 43),
     mon("geisterfuerst", 45, moves=["seelenfeuer", "phantomschlag", "entsetzen", "nachtklaue"],
         item="nebelkerze", gigantic=True)],
    reward=220, shirt="#6b4f8f", hair="#2b2b3b", hat="none", height=1.06,
    intro=["Diese Stadt wurde nie verlassen. Nur anders bewohnt.",
           "Der Schleierorden geht an jemanden, der nicht wegsieht.",
           "Also sieh hin."],
    defeat=["Du hast nicht weggesehen. Gut.", "Der Schleierorden gehoert dir."],
    victory=["Weggesehen. Die meisten tun das."],
    post=["Mit dem Schleierorden gehorchen dir Kreaturen bis Level 62."],
    items=["top_trank", "hypertrank"],
    rematch=[mon("kristallgeist", 56), mon("schlickmonarch", 57),
             mon("noctaris", 58), mon("geisterfuerst", 60, gigantic=True)],
)

gym_leader(
    "arenaleiterin_hela", "Arenaleiterin Hela", "Arenaleiterin",
    [mon("eisbaerchen", 46), mon("kristallmotte", 47),
     mon("gletscherfang", 49, moves=["blizzardbrise", "frostbiss", "frostpanzer", "eislanze"],
         item="frostkristall", gigantic=True)],
    reward=240, shirt="#7fc4e0", hair="#e8e8f0", hat="beanie",
    intro=["Hier oben zaehlt nur, wer Geduld hat.",
           "Der Frostorden geht an jemanden, der nicht hastig wird.",
           "Nimm dir Zeit. Aber nicht zu viel."],
    defeat=["Geduldig und genau. Selten in deinem Alter.",
            "Der Frostorden gehoert dir."],
    victory=["Zu hastig. Der Berg verzeiht das nicht."],
    post=["Mit dem Frostorden gehorchen dir Kreaturen bis Level 72."],
    items=["top_trank", "top_trank"],
    rematch=[mon("frostkoloss", 60), mon("kristallgeist", 61),
             mon("pelagos", 62), mon("gletscherfang", 64, gigantic=True)],
)

gym_leader(
    "arenaleiterin_saphira", "Arenaleiterin Saphira", "Arenaleiterin",
    [mon("klauenwelpe", 50), mon("vulkanschlange", 51), mon("sichelklaue", 52),
     mon("titanklaue", 54, moves=["drachenklaue", "erdbeben", "drachentanz", "gebirgsschlag"],
         item="drachenzahn", gigantic=True)],
    reward=280, shirt="#4b5fa8", hair="#2b3f6b", hat="crown", height=1.08,
    intro=["Der Horst steht seit sieben Generationen. Ich bin die achte Hueterin.",
           "Wer den Schuppenorden traegt, darf zur Liga.",
           "Bisher haben es drei geschafft. Zeig mir, ob du die vierte wirst."],
    defeat=["Die vierte also.", "Der Schuppenorden gehoert dir. Der Ligaweg steht dir offen.",
            "Geh ihn. Und komm als Champion zurueck."],
    victory=["Noch nicht. Aber du warst naeher dran als die meisten."],
    post=["Acht Orden. Der Ligaweg im Sueden ist jetzt offen."],
    items=["top_trank", "top_trank", "top_beleber"],
    rematch=[mon("abgrundschrecken", 66), mon("aetherion", 68),
             mon("vulkanschlange", 67), mon("titanklaue", 70, gigantic=True)],
)

# ------------------------------------------------------------ LIGA
LIGA = [
    ("liga_aldo", "Spitzentrainer Aldo", "#8f4b4b",
     [mon("bergkoloss", 54), mon("panzerwacht", 55), mon("goldpanzer", 55),
      mon("steinwaechter", 56), mon("rostritter", 57, gigantic=True)],
     ["Fels bricht nicht. Fels wird gebrochen - von wem?", "Zeig es mir."],
     ["Gebrochen. Von dir."]),
    ("liga_yuki", "Spitzentrainerin Yuki", "#4b8f8f",
     [mon("himmelsrochen", 55), mon("quallenlicht", 56), mon("blitzotter", 56),
      mon("pelagos", 57), mon("fluthueter", 58, gigantic=True)],
     ["Wasser findet immer einen Weg.", "Mal sehen, ob du einen findest."],
     ["Du hast einen Weg gefunden. Respekt."]),
    ("liga_dorn", "Spitzentrainer Dorn", "#6b4b8f",
     [mon("schlickmonarch", 56), mon("kristallgeist", 57), mon("moorlicht", 57),
      mon("noctaris", 58), mon("geisterfuerst", 59, gigantic=True)],
     ["Die meisten fuerchten das Dunkel. Ich wohne darin.", "Komm herein."],
     ["Du hast im Dunkeln gesehen. Beeindruckend."]),
    ("liga_sela", "Spitzentrainerin Sela", "#8f8f4b",
     [mon("lichtfee", 57), mon("wasserharfe", 58), mon("wolkenlamm", 58),
      mon("solaria", 59), mon("bluetenherz", 60, gigantic=True)],
     ["Sanftheit ist keine Schwaeche. Das verwechseln viele.", "Du auch?"],
     ["Nein. Du verwechselst es nicht."]),
]
for tid, tname, shirt, team, intro, defeat in LIGA:
    trainer(
        tid, tname, "Spitzentrainer", "expert", team, reward=320,
        intro=intro, defeat=defeat + ["Geh weiter. Der Naechste wartet."],
        victory=["Noch nicht. Die Liga ist kein Spaziergang."],
        post=["Der Naechste wartet. Heilen kannst du hier drin nicht."],
        items=["top_trank", "top_trank", "top_beleber"],
        gigantic=True,
        appearance={"skin": "#e0b894", "hair": "#2b2b2b", "shirt": shirt,
                    "pants": "#3a3a42", "accent": "#ffffff", "hat": "none", "height": 1.02},
    )

trainer(
    "champion_aurel", "Champion Aurel", "Champion", "boss",
    [mon("sturmaar", 60), mon("mondpanther", 61), mon("magmaherr", 61),
     mon("gletscherfang", 62), mon("zephyros", 63),
     mon("titanklaue", 65, moves=["drachenklaue", "erdbeben", "drachentanz", "gebirgsschlag"],
         item="drachenzahn", gigantic=True)],
    reward=600,
    intro=[
        "Da bist du also.",
        "Ich habe deinen Weg verfolgt, {spieler}. Acht Orden, vier Spitzentrainer.",
        "Weisst du, was mich interessiert? Nicht ob du gewinnst.",
        "Sondern ob du weisst, warum du hier stehst.",
        "Zeig es mir.",
    ],
    defeat=[
        "...",
        "Du weisst es. Man sieht es an jedem Zug.",
        "Aetheria hat eine neue Champion. Und ich - endlich eine Pause.",
    ],
    victory=[
        "Noch nicht. Aber du warst naeher dran als jeder vor dir.",
        "Heil dein Team. Ich bin hier.",
    ],
    post=["Die Liga steht dir jederzeit offen. Komm wieder, wenn du staerker bist."],
    items=["top_trank", "top_trank", "top_beleber", "top_beleber"],
    gigantic=True,
    appearance={"skin": "#e0b894", "hair": "#f0e0b0", "shirt": "#ffd76b",
                "pants": "#3a3a42", "accent": "#ffffff", "hat": "crown", "height": 1.1},
    rematch=[mon("sturmaar", 72), mon("mondpanther", 73), mon("magmaherr", 73),
             mon("gletscherfang", 74), mon("zephyros", 75),
             mon("aetherion", 78, gigantic=True)],
)

# ------------------------------------------------------------ RIVALE
RIVAL_STAGES = [
    ("rivale_1", 1, [mon("nagezahn", 6)], 60,
     ["{spieler}! Ich wusste, dass du hier auftauchst.",
      "Ich habe meinen Begleiter schon. Zeit, ihn auszuprobieren!"],
     ["Hm. Nicht schlecht. Aber das war erst der Anfang."],
     ["Siehst du? Ich war zuerst da - und ich bleibe vorn."]),
    ("rivale_2", 3, [mon("nagezahn", 14), mon("federflaum", 15)], 80,
     ["Schon in Flusshafen? Du bist schneller geworden.",
      "Aber nicht schnell genug."],
     ["Verdammt. Du wirst wirklich besser."],
     ["Immer noch vorn. Trainier mehr."]),
    ("rivale_3", 5, [mon("bissnager", 24), mon("windschwinge", 25), mon("kampffaust", 26)], 110,
     ["Drei Orden? Ich habe vier.",
      "Naja - beweisen wir es lieber."],
     ["Vier zu drei. Aber das fuehlt sich nicht mehr nach Vorsprung an."],
     ["Noch vier zu drei. Hol auf."]),
    ("rivale_4", 7, [mon("bissnager", 36), mon("sturmaar", 37), mon("ringmeister", 37),
                     mon("nachtwolf", 38)], 150,
     ["Das Wildland veraendert einen, oder?",
      "Mich auch. Los."],
     ["Du hast mich. Schon wieder.",
      "Weisst du was? Das ist in Ordnung."],
     ["Noch bin ich vorn. Noch."]),
    ("rivale_5", 9, [mon("sturmaar", 48), mon("nachtwolf", 49), mon("frostkoloss", 49),
                     mon("magmaherr", 50), mon("sichelklaue", 51)], 200,
     ["Letzte Chance vor der Liga.",
      "Wenn ich dich hier nicht schlage, schaffe ich es nie."],
     ["...dann schaffe ich es wohl nie.",
      "Geh zur Liga, {spieler}. Und gewinn. Fuer uns beide."],
     ["Doch noch. Trainier weiter - ich warte hier."]),
    ("rivale_6", 12, [mon("sturmaar", 66), mon("nachtwolf", 67), mon("frostkoloss", 67),
                      mon("magmaherr", 68), mon("titanklaue", 69),
                      mon("sichelklaue", 70, gigantic=True)], 320,
     ["Champion also. Herzlichen Glueckwunsch - ehrlich.",
      "Und jetzt: noch einmal. Ohne Ausreden."],
     ["Gut. Sehr gut.", "Bis zum naechsten Mal, Champion."],
     ["Endlich! Einmal wenigstens."]),
]
for tid, stage, team, reward, intro, defeat, victory in RIVAL_STAGES:
    trainer(
        tid, "Rivale Jorin", "Rivale", "expert" if stage >= 5 else "smart",
        team, reward,
        intro=intro, defeat=defeat, victory=victory,
        post=["Wir sehen uns. Frueher als dir lieb ist."],
        items=["supertrank"] if stage >= 3 else None,
        gigantic=stage >= 9,
        appearance={"skin": "#d8b08a", "hair": "#c24b4b", "shirt": "#4b8f7a",
                    "pants": "#3f3f4a", "accent": "#f0e0c4", "hat": "cap", "height": 1.01},
    )

# ==========================================================================
# WEITERE ARENEN
# ==========================================================================
GYM_DEFS = [
    ("gym_flusshafen", "Arena von Flusshafen", "flusshafen", "water", 1, "Flutorden",
     "arenaleiter_marek", ["arena2_tim", "arena2_saskia"], 28,
     {"primary": "#3f7fbf", "secondary": "#5fb0e0", "accent": "#cfe4f2"},
     ["td03", "hypertrank"], "platforms"),
    ("gym_hammerstadt", "Arena von Hammerstadt", "hammerstadt", "fighting", 2, "Faustorden",
     "arenaleiterin_bora", ["arena3_ravi", "arena3_mila"], 36,
     {"primary": "#c96b4b", "secondary": "#e08f5f", "accent": "#f0dcc9"},
     ["td07", "hypertrank"], "switches"),
    ("gym_funkenau", "Arena von Funkenau", "funkenau", "electric", 3, "Funkenorden",
     "arenaleiter_volt", ["arena4_nino", "arena4_tessa"], 44,
     {"primary": "#e0cf4b", "secondary": "#f0e07f", "accent": "#f7f0cf"},
     ["td04", "hypertrank"], "lights"),
    ("gym_aschenberg", "Arena von Aschenberg", "aschenberg", "fire", 4, "Glutorden",
     "arenaleiterin_ember", ["arena5_kilian", "arena5_juna"], 52,
     {"primary": "#c95b2f", "secondary": "#f08a4b", "accent": "#f7d8c4"},
     ["td02", "top_trank"], "platforms"),
    ("gym_geisterruine", "Arena der Ruine", "geisterruine", "ghost", 5, "Schleierorden",
     "arenaleiter_morven", ["arena6_nyx", "arena6_calla"], 62,
     {"primary": "#6b4f8f", "secondary": "#9b7fc4", "accent": "#d8cfe8"},
     ["td14", "top_trank"], "maze"),
    ("gym_frostgipfel", "Arena von Frostgipfel", "frostgipfel", "ice", 6, "Frostorden",
     "arenaleiterin_hela", ["arena7_bjorn", "arena7_maja"], 72,
     {"primary": "#7fc4e0", "secondary": "#a8e0f0", "accent": "#e8f7ff"},
     ["td06", "top_trank"], "platforms"),
    ("gym_drachenhorst", "Arena des Horsts", "drachenhorst", "dragon", 7, "Schuppenorden",
     "arenaleiterin_saphira", ["arena8_torin", "arena8_elke"], 85,
     {"primary": "#4b5fa8", "secondary": "#7f8fd8", "accent": "#d8dcf0"},
     ["td15", "top_beleber", "meisterkugel"], "quiz"),
]
for (gid, gname, city, gtype, badge, badge_name, leader, minions,
     obedience, colors, rewards, puzzle) in GYM_DEFS:
    GYMS.append({
        "id": gid, "name": gname, "city": city, "type": gtype,
        "badgeIndex": badge, "badgeName": badge_name,
        "leader": leader, "minions": list(minions), "puzzle": puzzle,
        "introText": [f"{gname} - hier wird es ernst."],
        "victoryText": ["Der Weg nach draussen ist frei."],
        "rewardItems": list(rewards),
        "obedienceLevel": obedience,
        "area": gid,
        "colors": colors,
    })

# ==========================================================================
# WEITERE LAEDEN
# ==========================================================================
SHOPS.append({
    "id": "shop_standard", "name": "Warenlager",
    "greeting": "Willkommen! Was brauchst du?",
    "buysItems": True,
    "stock": [
        {"item": "fangkugel"}, {"item": "superkugel"}, {"item": "trank"},
        {"item": "supertrank"}, {"item": "gegengift"}, {"item": "brandsalbe"},
        {"item": "nervenstaerker"}, {"item": "wachmacher"}, {"item": "auftaumittel"},
        {"item": "fluchtseil"}, {"item": "schutzspray"},
        {"item": "hyperkugel", "minBadges": 2},
        {"item": "hypertrank", "minBadges": 2},
        {"item": "beleber", "minBadges": 2},
        {"item": "allheilmittel", "minBadges": 3},
        {"item": "nachtkugel", "minBadges": 3},
        {"item": "netzkugel", "minBadges": 3},
        {"item": "flinkkugel", "minBadges": 4},
        {"item": "zeitkugel", "minBadges": 4},
        {"item": "top_trank", "minBadges": 5},
        {"item": "aether", "minBadges": 5},
        {"item": "top_beleber", "minBadges": 6},
        {"item": "top_aether", "minBadges": 7},
    ],
})

SHOPS.append({
    "id": "shop_liga", "name": "Ligaversorgung",
    "greeting": "Letzte Gelegenheit vor dem Turnier. Nimm genug mit.",
    "buysItems": True,
    "stock": [
        {"item": "top_trank"}, {"item": "hypertrank"}, {"item": "top_beleber"},
        {"item": "beleber"}, {"item": "allheilmittel"}, {"item": "top_aether"},
        {"item": "hyperkugel"}, {"item": "angriffsplus"}, {"item": "abwehrplus"},
        {"item": "spezialplus"}, {"item": "tempoplus"},
        {"item": "ueberreste"}, {"item": "schutzamulett"}, {"item": "schaerfling"},
    ],
})

# ==========================================================================
# WEITERE AUFTRAEGE
# ==========================================================================
BADGE_QUESTS = [
    ("hauptquest_flutorden", "Der Flutorden", 5, "flusshafen", "arenaleiter_marek",
     "Reise nach Flusshafen und gewinne den Flutorden.",
     [("route2", "Folge Route 2 nach Norden.", "route_2"),
      ("stadt", "Erreiche Flusshafen.", "flusshafen")]),
    ("hauptquest_faustorden", "Der Faustorden", 6, "hammerstadt", "arenaleiterin_bora",
     "Durchquere Dornwald und gewinne den Faustorden in Hammerstadt.",
     [("wald", "Durchquere den Dornwald.", "dornwald"),
      ("stadt", "Erreiche Hammerstadt.", "hammerstadt")]),
    ("hauptquest_funkenorden", "Der Funkenorden", 7, "funkenau", "arenaleiter_volt",
     "Finde den Weg durch die Schimmerhoehle nach Funkenau.",
     [("hoehle", "Durchquere die Schimmerhoehle.", "schimmerhoehle"),
      ("stadt", "Erreiche Funkenau.", "funkenau")]),
    ("hauptquest_glutorden", "Der Glutorden", 8, "aschenberg", "arenaleiterin_ember",
     "Steig zum Aschenberg auf und gewinne den Glutorden.",
     [("stadt", "Erreiche Aschenberg.", "aschenberg")]),
    ("hauptquest_schleierorden", "Der Schleierorden", 9, "geisterruine", "arenaleiter_morven",
     "Durchquere das Nebelmoor und erreiche die Geisterruine.",
     [("moor", "Durchquere das Nebelmoor.", "nebelmoor"),
      ("stadt", "Erreiche die Geisterruine.", "geisterruine")]),
    ("hauptquest_frostorden", "Der Frostorden", 10, "frostgipfel", "arenaleiterin_hela",
     "Steig zum Frostgipfel auf und gewinne den Frostorden.",
     [("stadt", "Erreiche Frostgipfel.", "frostgipfel")]),
    ("hauptquest_schuppenorden", "Der Schuppenorden", 11, "drachenhorst", "arenaleiterin_saphira",
     "Erreiche den Drachenhorst und gewinne den achten Orden.",
     [("stadt", "Erreiche den Drachenhorst.", "drachenhorst")]),
]
for qid, qname, stage, city, leader, desc, steps in BADGE_QUESTS:
    quest_steps = [
        {"id": sid, "description": sdesc, "completion": {"kind": "visitArea", "area": sarea}}
        for sid, sdesc, sarea in steps
    ]
    quest_steps.append({
        "id": "arena", "description": f"Besiege die Arenaleitung in {city.capitalize()}.",
        "completion": {"kind": "defeatTrainer", "trainer": leader},
    })
    QUESTS.append({
        "id": qid, "name": qname, "kind": "main", "description": desc,
        "autoStartStage": stage, "area": city, "steps": quest_steps,
        "rewards": {"money": 1200 + stage * 300,
                    "items": [{"item": "hyperkugel", "quantity": 5}]},
    })

QUESTS.append({
    "id": "hauptquest_liga", "name": "Das Ligaturnier", "kind": "main",
    "description": "Acht Orden. Jetzt zaehlt nur noch das Turnier.",
    "autoStartStage": 12, "area": "ligastadion",
    "steps": [
        {"id": "weg", "description": "Folge dem Ligaweg nach Sueden.",
         "completion": {"kind": "visitArea", "area": "route_9"}},
        {"id": "stadion", "description": "Erreiche das Ligastadion.",
         "completion": {"kind": "visitArea", "area": "ligastadion"}},
        {"id": "aldo", "description": "Besiege Spitzentrainer Aldo.",
         "completion": {"kind": "defeatTrainer", "trainer": "liga_aldo"}},
        {"id": "yuki", "description": "Besiege Spitzentrainerin Yuki.",
         "completion": {"kind": "defeatTrainer", "trainer": "liga_yuki"}},
        {"id": "dorn", "description": "Besiege Spitzentrainer Dorn.",
         "completion": {"kind": "defeatTrainer", "trainer": "liga_dorn"}},
        {"id": "sela", "description": "Besiege Spitzentrainerin Sela.",
         "completion": {"kind": "defeatTrainer", "trainer": "liga_sela"}},
        {"id": "champion", "description": "Besiege Champion Aurel.",
         "completion": {"kind": "defeatTrainer", "trainer": "champion_aurel"}},
    ],
    "rewards": {"money": 20000, "items": [{"item": "meisterkugel", "quantity": 1}]},
})

QUESTS.append({
    "id": "postgame_tiefenkammer", "name": "Der Ursprung", "kind": "main",
    "description": "Unter dem Wildland liegt etwas, das aelter ist als die Region.",
    "autoStartStage": 13, "area": "tiefenkammer",
    "steps": [
        {"id": "abstieg", "description": "Finde den Abstieg im Sueden des Wildlands.",
         "completion": {"kind": "visitArea", "area": "tiefenkammer"}},
        {"id": "aetherion", "description": "Stelle dich Aetherion.",
         "completion": {"kind": "flag", "flag": "aetherionBesiegt"}},
    ],
    "rewards": {"money": 30000, "items": [{"item": "meisterkugel", "quantity": 2}]},
})

QUESTS.append({
    "id": "nebenquest_index", "name": "Vollstaendige Erfassung", "kind": "side",
    "description": "Prof. Farnholz moechte moeglichst viele Arten erfasst wissen.",
    "autoStartStage": 5,
    "steps": [
        {"id": "zehn", "description": "Fange zehn verschiedene Arten.",
         "completion": {"kind": "catchCount", "count": 10}},
        {"id": "zwanzig", "description": "Fange zwanzig verschiedene Arten.",
         "completion": {"kind": "catchCount", "count": 20}},
        {"id": "vierzig", "description": "Fange vierzig verschiedene Arten.",
         "completion": {"kind": "catchCount", "count": 40}},
    ],
    "rewards": {"money": 12000, "items": [{"item": "meisterkugel", "quantity": 1},
                                          {"item": "gluecksei", "quantity": 1}]},
})

QUESTS.append({
    "id": "nebenquest_rivale", "name": "Jorin", "kind": "side",
    "description": "Dein Rivale laesst nicht locker.",
    "autoStartStage": 3,
    "steps": [
        {"id": "r1", "description": "Besiege Jorin auf Route 1.",
         "completion": {"kind": "defeatTrainer", "trainer": "rivale_1"}},
        {"id": "r2", "description": "Besiege Jorin in Flusshafen.",
         "completion": {"kind": "defeatTrainer", "trainer": "rivale_2"}},
        {"id": "r3", "description": "Besiege Jorin in Funkenau.",
         "completion": {"kind": "defeatTrainer", "trainer": "rivale_3"}},
        {"id": "r4", "description": "Besiege Jorin im Wildland.",
         "completion": {"kind": "defeatTrainer", "trainer": "rivale_4"}},
        {"id": "r5", "description": "Besiege Jorin auf dem Ligaweg.",
         "completion": {"kind": "defeatTrainer", "trainer": "rivale_5"}},
    ],
    "rewards": {"money": 8000, "items": [{"item": "top_trank", "quantity": 5}]},
})

# ==========================================================================
# WEITERE STORY-STUFEN
# ==========================================================================
for stage, sid, name, objective in [
    (6, "flutorden", "Der Flutorden", "Gewinne den zweiten Orden in Flusshafen."),
    (7, "faustorden", "Der Faustorden", "Gewinne den dritten Orden in Hammerstadt."),
    (8, "funkenorden", "Der Funkenorden", "Gewinne den vierten Orden in Funkenau."),
    (9, "glutorden", "Der Glutorden", "Gewinne den fuenften Orden in Aschenberg."),
    (10, "schleierorden", "Der Schleierorden", "Gewinne den sechsten Orden in der Geisterruine."),
    (11, "frostorden", "Der Frostorden", "Gewinne den siebten Orden in Frostgipfel."),
    (12, "schuppenorden", "Der Schuppenorden", "Gewinne den achten Orden im Drachenhorst."),
    (13, "liga", "Das Turnier", "Gewinne das Ligaturnier."),
    (14, "postgame", "Nach dem Turnier", "Erkunde, was die Region noch verbirgt."),
]:
    STORY.append({"stage": stage, "id": sid, "name": name, "objective": objective})

# ==========================================================================
# WEITERE CUTSCENES
# ==========================================================================
STORY.append({
    "id": "finale_aetherion",
    "lockPlayer": True,
    "music": "finalBattle",
    "steps": [
        {"kind": "fade", "to": "black", "seconds": 0.6},
        {"kind": "wait", "seconds": 0.4},
        {"kind": "fade", "to": "clear", "seconds": 0.8},
        {"kind": "cameraShake", "intensity": 0.8, "seconds": 1.2},
        {"kind": "message", "lines": [
            "Der Boden der Kammer beginnt zu leuchten.",
            "Etwas bewegt sich in der Tiefe - etwas, das lange geschlafen hat.",
        ]},
        {"kind": "effect", "effect": "gigantic", "seconds": 1.2},
        {"kind": "cameraShake", "intensity": 1.4, "seconds": 1.6},
        {"kind": "message", "speaker": "???", "lines": [
            "Wer weckt mich.",
            "Aetheria ... du traegst acht Orden. Dann bist du wuerdig, es zu versuchen.",
        ]},
        {"kind": "wildBattle", "species": "aetherion", "level": 70, "legendary": True},
        {"kind": "action", "actions": [
            {"kind": "setFlag", "flag": "aetherionBesiegt"},
            {"kind": "storyStage", "stage": 14},
        ]},
        {"kind": "message", "lines": [
            "Die Kammer wird still.",
            "Was auch immer hier begonnen hat - es ist noch nicht zu Ende.",
        ]},
    ],
})

STORY.append({
    "id": "liga_sieg",
    "lockPlayer": True,
    "music": "victory",
    "steps": [
        {"kind": "fade", "to": "white", "seconds": 0.8},
        {"kind": "wait", "seconds": 0.5},
        {"kind": "fade", "to": "clear", "seconds": 1.0},
        {"kind": "effect", "effect": "flash", "seconds": 0.6},
        {"kind": "message", "lines": [
            "Das Stadion tobt.",
            "Acht Orden, fuenf Kaempfe, ein Titel.",
            "Aetheria hat eine neue Champion.",
        ]},
        {"kind": "action", "actions": [
            {"kind": "setFlag", "flag": "ligaGewonnen"},
            {"kind": "storyStage", "stage": 13},
            {"kind": "giveItem", "item": "meisterkugel", "quantity": 1},
        ]},
        {"kind": "message", "speaker": "Prof. Farnholz", "lines": [
            "Ich habe jeden deiner Schritte verfolgt, {spieler}.",
            "Und jetzt kommt der interessante Teil: Die Region ist immer noch nicht vollstaendig erfasst.",
            "Im Wildland soll es einen Abstieg geben. Sieh nach.",
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
