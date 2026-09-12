/**
 * Datenschema fuer saemtliche JSON-Inhalte.
 *
 * Alles Inhaltliche (Kreaturen, Attacken, Trainer, Quests, Gebiete) wird aus
 * `/data/**\/*.json` geladen und gegen diese Typen validiert. Neue Inhalte
 * benoetigen ausschliesslich eine neue JSON-Datei (Anforderung 51).
 */

export const ELEMENT_TYPES = [
  'normal', 'fire', 'water', 'electric', 'grass', 'ice',
  'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug',
  'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const STAT_KEYS = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
/** Stat-Stufen betreffen zusaetzlich Genauigkeit und Fluchtwert. */
export type BattleStatKey = Exclude<StatKey, 'hp'> | 'accuracy' | 'evasion';

export type StatBlock = Record<StatKey, number>;

export const STATUS_CONDITIONS = [
  'none', 'burn', 'freeze', 'paralysis', 'poison', 'toxic', 'sleep',
] as const;
export type StatusCondition = (typeof STATUS_CONDITIONS)[number];

export const MOVE_CATEGORIES = ['physical', 'special', 'status'] as const;
export type MoveCategory = (typeof MOVE_CATEGORIES)[number];

export const WEATHER_KINDS = [
  'clear', 'cloudy', 'rain', 'heavyRain', 'thunderstorm',
  'snow', 'blizzard', 'fog', 'sandstorm', 'harshSun',
] as const;
export type WeatherKind = (typeof WEATHER_KINDS)[number];

export const GROWTH_RATES = [
  'erratic', 'fast', 'mediumFast', 'mediumSlow', 'slow', 'fluctuating',
] as const;
export type GrowthRate = (typeof GROWTH_RATES)[number];

export const TIME_OF_DAY = ['dawn', 'day', 'dusk', 'night'] as const;
export type TimeOfDay = (typeof TIME_OF_DAY)[number];

// ---------------------------------------------------------------------------
// Prozedurale Modelle
// ---------------------------------------------------------------------------

export const RIG_KINDS = [
  'quadruped', 'biped', 'serpentine', 'flyer', 'blob', 'floater', 'insectoid', 'aquatic',
] as const;
export type RigKind = (typeof RIG_KINDS)[number];

export const PART_SHAPES = [
  'sphere', 'box', 'capsule', 'cone', 'cylinder', 'torus', 'tetra', 'octa', 'dodeca', 'plane',
] as const;
export type PartShape = (typeof PART_SHAPES)[number];

/** Logische Rolle eines Koerperteils - steuert die prozedurale Animation. */
export const PART_ROLES = [
  'body', 'head', 'snout', 'ear', 'eye', 'pupil', 'horn', 'crest', 'jaw',
  'legFrontLeft', 'legFrontRight', 'legBackLeft', 'legBackRight',
  'armLeft', 'armRight', 'wingLeft', 'wingRight',
  'tail', 'tailTip', 'fin', 'shell', 'flame', 'orb', 'spike', 'decor',
] as const;
export type PartRole = (typeof PART_ROLES)[number];

export interface ModelPart {
  role: PartRole;
  shape: PartShape;
  /** Position relativ zum Elternteil bzw. Modellursprung (Meter, Y = oben). */
  pos: [number, number, number];
  /** Groesse: Radius/Halbmasse je nach Shape. */
  size: [number, number, number];
  rot?: [number, number, number];
  /** Farbschluessel aus der Palette oder direkter Hex-Wert. */
  color: string;
  /**
   * Verschiebung des Mesh-Mittelpunkts gegenueber dem Drehpunkt.
   * Beine/Fluegel/Schweife setzen ihren Drehpunkt an den Ansatz, damit die
   * prozedurale Animation korrekt schwingt statt um die Mitte zu rotieren.
   */
  anchor?: [number, number, number];
  /** Optionales Elternteil fuer hierarchische Animation (erste Instanz der Rolle). */
  parent?: PartRole;
  /** 0..1 - wie stark das Teil metallisch wirkt. */
  metal?: number;
  /** 0..1 - Eigenleuchten (Flammen, Kristalle). */
  emissive?: number;
  /** Weniger Segmente = guenstiger; Standard je Shape. */
  detail?: number;
  flatShading?: boolean;
  opacity?: number;
}

export interface ModelBlueprint {
  rig: RigKind;
  /** Benannte Farben, referenzierbar aus `ModelPart.color`. */
  palette: Record<string, string>;
  /** Globale Skalierung des Bauplans. */
  scale?: number;
  parts: ModelPart[];
  /** Schwebehoehe ueber Grund (fuer Flieger/Geister). */
  hover?: number;
  /** Geschwindigkeit der Idle-Animation. */
  idleSpeed?: number;
}

// ---------------------------------------------------------------------------
// Kreaturen
// ---------------------------------------------------------------------------

export type EvolutionMethod =
  | { kind: 'level'; level: number }
  | { kind: 'levelDay'; level: number }
  | { kind: 'levelNight'; level: number }
  | { kind: 'item'; item: string }
  | { kind: 'friendship'; min: number }
  | { kind: 'friendshipDay'; min: number }
  | { kind: 'friendshipNight'; min: number }
  | { kind: 'area'; level: number; area: string }
  | { kind: 'knowsMove'; move: string }
  | { kind: 'stat'; level: number; compare: 'atkGtDef' | 'defGtAtk' | 'atkEqDef' }
  | { kind: 'trade' }
  | { kind: 'gigantic'; level: number };

export interface EvolutionEntry {
  to: string;
  method: EvolutionMethod;
}

export interface LearnsetEntry {
  level: number;
  move: string;
}

export interface SpeciesData {
  id: string;
  dex: number;
  name: string;
  /** Wissenschaftlich klingender Beiname fuer den Index. */
  category: string;
  types: [ElementType] | [ElementType, ElementType];
  baseStats: StatBlock;
  abilities: string[];
  hiddenAbility?: string;
  captureRate: number;
  baseExp: number;
  growthRate: GrowthRate;
  /** Anteil maennlicher Exemplare (0..1) oder null fuer geschlechtslos. */
  genderRatio: number | null;
  heightM: number;
  weightKg: number;
  /** EV-Ertrag beim Besiegen. */
  evYield: Partial<StatBlock>;
  baseFriendship: number;
  learnset: LearnsetEntry[];
  /** Attacken, die per Attacken-Disk erlernbar sind. */
  tmMoves?: string[];
  eggMoves?: string[];
  evolutions: EvolutionEntry[];
  /** Vorgaenger-ID, automatisch abgeleitet wenn nicht gesetzt. */
  prevo?: string;
  dexEntry: string;
  /** Kann die Kreatur gigantifizieren? */
  canGigantic: boolean;
  /** Exklusive Gigantifizierungs-Attacke (optional). */
  giganticMove?: string;
  /** Bevorzugte Biome (nur informativ fuer den Index). */
  habitat: string[];
  model: ModelBlueprint;
  /** Relative Groesse im Feld (1 = Standard). */
  fieldScale?: number;
  /** Schreiton: Grundfrequenz in Hz fuer die prozedurale Stimme. */
  cry?: { baseHz: number; kind: 'chirp' | 'growl' | 'roar' | 'trill' | 'hum' | 'screech' };
}

// ---------------------------------------------------------------------------
// Attacken
// ---------------------------------------------------------------------------

export type MoveTarget = 'opponent' | 'self' | 'allOpponents' | 'field' | 'ally';

export interface MoveEffectData {
  /** Statusaenderung am Ziel. */
  status?: StatusCondition;
  statusChance?: number;
  /** Stat-Stufen: positiv = Erhoehung. */
  statChanges?: { target: 'self' | 'opponent'; stat: BattleStatKey; stages: number }[];
  statChangeChance?: number;
  /** Anteil des angerichteten Schadens als Rueckstoss. */
  recoil?: number;
  /** Anteil des angerichteten Schadens als Heilung. */
  drain?: number;
  /** Direkte Heilung als Anteil der max. KP. */
  heal?: number;
  /** Mehrfachtreffer: [min, max]. */
  multiHit?: [number, number];
  /** Erhoehte Volltrefferchance (Stufen). */
  critStages?: number;
  /** Setzt das Wetter. */
  weather?: WeatherKind;
  weatherTurns?: number;
  /** Schuetzt vor Angriffen in dieser Runde. */
  protect?: boolean;
  /** Fixer Schaden unabhaengig von Werten. */
  fixedDamage?: number;
  /** Schaden = Level des Anwenders. */
  levelDamage?: boolean;
  /** Setzt die KP des Ziels auf einen Anteil. */
  ohko?: boolean;
  /** Verwirrt das Ziel. */
  confuse?: boolean;
  confuseChance?: boolean | number;
  /** Zwingt zum Wechsel / beendet den Kampf. */
  forceSwitch?: boolean;
  /** Der Anwender wechselt nach dem Angriff. */
  selfSwitch?: boolean;
  /** Ignoriert Typ-Immunitaeten (z.B. Geist gegen Normal). */
  ignoreImmunity?: ElementType[];
  /** Verdoppelt die Staerke wenn das Ziel einen Status hat. */
  doublePowerIfStatus?: StatusCondition[];
  /** Verdoppelt die Staerke bei bestimmtem Wetter. */
  doublePowerIfWeather?: WeatherKind[];
  /** Laesst den Anwender eine Runde aufladen. */
  chargeTurn?: boolean;
  chargeMessage?: string;
  /** Anwender muss nach dem Einsatz eine Runde ruhen. */
  rechargeTurn?: boolean;
  /** Nutzt den Verteidigungswert des Ziels statt Spezialverteidigung. */
  usesPhysicalDefense?: boolean;
  /** Schaden skaliert mit verbleibenden KP des Anwenders. */
  powerFromHp?: boolean;
  /** Schaden skaliert mit Freundschaft. */
  powerFromFriendship?: boolean;
  /** Verhindert Flucht des Ziels. */
  trap?: boolean;
  trapDamage?: number;
  /** Chance, das Ziel zurueckschrecken zu lassen. */
  flinchChance?: number;
  /** Setzt einen Teamschutz (Reflektor-artig) fuer N Runden. */
  screen?: 'physical' | 'special';
  screenTurns?: number;
  /** Heilt Statusprobleme des gesamten Teams. */
  healPartyStatus?: boolean;
}

export interface MoveData {
  id: string;
  name: string;
  type: ElementType;
  category: MoveCategory;
  power: number;
  /** 0 = kann nicht danebengehen. */
  accuracy: number;
  pp: number;
  priority: number;
  target: MoveTarget;
  description: string;
  /** Trifft der Angriff physisch (fuer Animationen/Faehigkeiten relevant)? */
  contact: boolean;
  effect?: MoveEffectData;
  /** Animationsschluessel fuer die Kampfdarstellung. */
  animation: string;
  /** Schluessel fuer den prozeduralen Soundeffekt. */
  sound: string;
  /** Nur ueber Gigantifizierung nutzbar. */
  giganticOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Faehigkeiten
// ---------------------------------------------------------------------------

export interface AbilityData {
  id: string;
  name: string;
  description: string;
  /** Deklarative Effekte - werden von der Kampf-Engine ausgewertet. */
  effects: AbilityEffect[];
}

export type AbilityEffect =
  | { kind: 'typeBoostLowHp'; type: ElementType; threshold: number; multiplier: number }
  | { kind: 'weatherOnEntry'; weather: WeatherKind; turns: number }
  | { kind: 'immuneToType'; type: ElementType; heal?: number; boostStat?: BattleStatKey }
  | { kind: 'statusImmunity'; status: StatusCondition[] }
  | { kind: 'contactStatus'; status: StatusCondition; chance: number }
  | { kind: 'statOnEntry'; stat: BattleStatKey; stages: number }
  | { kind: 'statOnKo'; stat: BattleStatKey; stages: number }
  | { kind: 'speedInWeather'; weather: WeatherKind[]; multiplier: number }
  | { kind: 'damageReduction'; multiplier: number; condition: 'superEffective' | 'always' }
  | { kind: 'critImmunity' }
  | { kind: 'ignoreStatChanges' }
  | { kind: 'intimidate'; stages: number }
  | { kind: 'healInWeather'; weather: WeatherKind[]; fraction: number }
  | { kind: 'noWeatherDamage' }
  | { kind: 'powerPunch'; multiplier: number }
  | { kind: 'accuracyBoost'; multiplier: number }
  | { kind: 'preventEscape' }
  | { kind: 'encounterLure'; typeBias: ElementType };

// ---------------------------------------------------------------------------
// Gegenstaende
// ---------------------------------------------------------------------------

export const ITEM_CATEGORIES = [
  'heal', 'ball', 'battle', 'evolution', 'held', 'key', 'disk', 'treasure', 'ingredient',
] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export interface ItemData {
  id: string;
  name: string;
  category: ItemCategory;
  description: string;
  price: number;
  /** Verkaufspreis; Standard = price/2. */
  sellPrice?: number;
  /** Im Kampf nutzbar? */
  usableInBattle: boolean;
  usableInField: boolean;
  consumable: boolean;
  effect?: ItemEffect;
  /** Fuer Attacken-Disks: welche Attacke wird gelehrt. */
  teachesMove?: string;
  /** Farbe fuer die prozedurale Darstellung in der Welt. */
  color?: string;
  sortOrder?: number;
}

export type ItemEffect =
  | { kind: 'healHp'; amount: number | 'full' | 'half' | 'quarter' }
  | { kind: 'healStatus'; status: StatusCondition[] | 'all' }
  | { kind: 'revive'; fraction: number }
  | { kind: 'restorePp'; amount: number | 'full'; allMoves?: boolean }
  | { kind: 'catch'; rate: number; special?: 'net' | 'dive' | 'dusk' | 'quick' | 'timer' | 'heavy' | 'master' }
  | { kind: 'statBoost'; stat: BattleStatKey; stages: number }
  | { kind: 'evBoost'; stat: StatKey; amount: number }
  | { kind: 'levelUp' }
  | { kind: 'evolve'; species?: string[] }
  | { kind: 'friendship'; amount: number }
  | { kind: 'repel'; steps: number }
  | { kind: 'escape' }
  | { kind: 'heldTypeBoost'; type: ElementType; multiplier: number }
  | { kind: 'heldStatBoost'; stat: BattleStatKey; multiplier: number }
  | { kind: 'heldHealEachTurn'; fraction: number }
  | { kind: 'heldPinch'; fraction: number; threshold: number }
  | { kind: 'heldCritBoost'; stages: number }
  | { kind: 'heldStatusGuard'; status: StatusCondition[] | 'all' }
  | { kind: 'heldExpBoost'; multiplier: number };

// ---------------------------------------------------------------------------
// Trainer
// ---------------------------------------------------------------------------

export const AI_PROFILES = ['random', 'basic', 'smart', 'expert', 'boss'] as const;
export type AiProfile = (typeof AI_PROFILES)[number];

export interface TrainerMemberData {
  species: string;
  level: number;
  moves?: string[];
  ability?: string;
  item?: string;
  nature?: string;
  ivs?: Partial<StatBlock>;
  evs?: Partial<StatBlock>;
  /** Kann dieses Teammitglied gigantifizieren? */
  gigantic?: boolean;
}

export interface TrainerData {
  id: string;
  name: string;
  /** Klasse, z.B. "Wanderer", "Arenaleiterin". */
  trainerClass: string;
  ai: AiProfile;
  team: TrainerMemberData[];
  /** Basis-Preisgeld pro Level der staerksten Kreatur. */
  rewardBase: number;
  items?: string[];
  dialogue: {
    intro: string[];
    defeat: string[];
    victory: string[];
    /** Zeile, wenn der Spieler noch einmal angesprochen wird. */
    postBattle?: string[];
    /** Optionale Zeile, wenn nur noch eine Kreatur uebrig ist. */
    lastCreature?: string[];
  };
  /** Erscheinungsbild fuer das prozedurale NPC-Modell. */
  appearance?: NpcAppearance;
  /** Darf gigantifizieren. */
  canGigantic?: boolean;
  /** Wiederkampf nach dem Hauptspiel moeglich. */
  rematchTeam?: TrainerMemberData[];
}

export interface NpcAppearance {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
  accent: string;
  /** Kopfbedeckung / Auffaelligkeit. */
  hat?: 'none' | 'cap' | 'beanie' | 'helmet' | 'crown' | 'band';
  height?: number;
  build?: 'slim' | 'normal' | 'broad';
}

// ---------------------------------------------------------------------------
// Welt
// ---------------------------------------------------------------------------

export const AREA_KINDS = [
  'home', 'town', 'city', 'route', 'cave', 'forest', 'lake', 'mountain',
  'snow', 'industrial', 'ruins', 'lab', 'stadium', 'wildarea', 'interior', 'league', 'endgame',
] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

export const BIOMES = [
  'grassland', 'meadow', 'forest', 'rocky', 'mountain', 'snow', 'desert',
  'wetland', 'coastal', 'cave', 'volcanic', 'urban', 'industrial', 'ruins',
] as const;
export type Biome = (typeof BIOMES)[number];

export interface SpawnEntry {
  species: string;
  minLevel: number;
  maxLevel: number;
  weight: number;
  /** Nur zu diesen Tageszeiten. */
  timeOfDay?: TimeOfDay[];
  /** Nur bei diesem Wetter. */
  weather?: WeatherKind[];
  /** Nur ab diesem Story-Fortschritt. */
  minStoryStage?: number;
  /** Markiert seltene Begegnungen (eigene Partikel/Klang). */
  rare?: boolean;
  /** Verhaltensmuster in der Welt. */
  behaviour?: 'wander' | 'aggressive' | 'shy' | 'skittish' | 'static' | 'patrol';
  /** Groessenvariante. */
  sizeVariant?: 'normal' | 'large' | 'small';
}

export interface AreaConnection {
  /** Ziel-Gebiet. */
  to: string;
  /** Rechteck im Quellgebiet, das den Wechsel ausloest. */
  trigger: { x: number; z: number; width: number; depth: number };
  /** Spawnpunkt-ID im Zielgebiet. */
  spawnPoint: string;
  /** Voraussetzung: Story-Stufe / Orden / Flag. */
  requires?: { storyStage?: number; badge?: number; flag?: string };
  /** Text, wenn die Voraussetzung fehlt. */
  blockedText?: string;
  label?: string;
}

export interface SpawnPointData {
  id: string;
  pos: [number, number];
  facing?: number;
}

export interface PropPlacement {
  kind: string;
  pos: [number, number];
  rotation?: number;
  scale?: number;
  /** Variation fuer prozedurale Props. */
  variant?: number;
}

export interface AreaNpcPlacement {
  id: string;
  pos: [number, number];
  facing?: number;
  /** Verweist auf eine Trainer-Definition (loest Kampf aus). */
  trainer?: string;
  /** Verweist auf einen Dialogbaum. */
  dialogue?: string;
  name?: string;
  appearance?: NpcAppearance;
  /** Tagesablauf: Zeit -> Zielposition. */
  schedule?: { hour: number; pos: [number, number]; activity?: string }[];
  /** Nur sichtbar ab/bis Story-Stufe. */
  minStoryStage?: number;
  maxStoryStage?: number;
  /** Wandert der NPC frei umher? */
  wander?: number;
  /** Rolle: Haendler, Heiler, etc. */
  role?: 'none' | 'shop' | 'heal' | 'guide' | 'guard' | 'professor' | 'rival' | 'gymLeader' | 'nurse' | 'clerk';
  shop?: string;
}

export interface AreaItemPlacement {
  id: string;
  item: string;
  pos: [number, number];
  quantity?: number;
  hidden?: boolean;
  minStoryStage?: number;
}

export interface BuildingPlacement {
  kind: 'house' | 'shop' | 'center' | 'gym' | 'lab' | 'station' | 'tower' | 'hut' | 'stadium' | 'warehouse' | 'ruin';
  pos: [number, number];
  rotation?: number;
  scale?: number;
  /** Farbvariante. */
  variant?: number;
  /** Interior-Gebiet, das ueber die Tuer betreten wird. */
  interior?: string;
  spawnPoint?: string;
  label?: string;
  /** Tuerposition relativ zum Gebaeude. */
  doorOffset?: [number, number];
}

export interface AreaData {
  id: string;
  name: string;
  kind: AreaKind;
  biome: Biome;
  /** Groesse in Metern [Breite (X), Tiefe (Z)]. */
  size: [number, number];
  /** Seed fuer die prozedurale Terrain-Generierung. */
  seed: number;
  /** Terrain-Parameter. */
  terrain: {
    baseHeight: number;
    amplitude: number;
    frequency: number;
    octaves?: number;
    /** Fluss-/Seeflaechen unterhalb dieser Hoehe. */
    waterLevel?: number;
    /** Erzeugt Klippen an den Raendern. */
    cliffBorder?: boolean;
    /** Ebene Flaeche fuer Innenraeume/Staedte. */
    flat?: boolean;
    ridged?: boolean;
    /** Wege, die durch das Gebiet fuehren (geglaettetes Terrain). */
    paths?: { points: [number, number][]; width: number }[];
  };
  music: string;
  /** Innenraeume haben kein Wetter. */
  indoor?: boolean;
  /** Gestaltung eines Innenraums (Waende, Boden, Moebel). */
  interiorStyle?: InteriorStyle;
  /** Erlaubte Wetterarten in diesem Gebiet. */
  weather?: WeatherKind[];
  /** Gras-Zonen fuer Begegnungen. */
  grassZones?: { x: number; z: number; width: number; depth: number; density?: number }[];
  /** Wasserzonen. */
  waterZones?: { x: number; z: number; width: number; depth: number }[];
  spawnTable?: SpawnEntry[];
  /** Maximale gleichzeitige wilde Kreaturen. */
  maxWild?: number;
  spawnPoints: SpawnPointData[];
  connections: AreaConnection[];
  props?: PropPlacement[];
  buildings?: BuildingPlacement[];
  npcs?: AreaNpcPlacement[];
  items?: AreaItemPlacement[];
  /** Raid-Punkte (Energiepunkte). */
  raidDens?: { id: string; pos: [number, number]; tier: number }[];
  /** Freischalt-Bedingung fuer die Karte. */
  mapPos?: [number, number];
  /** Umgebungslicht-Tuning. */
  ambience?: { fogColor?: string; fogNear?: number; fogFar?: number; skyTop?: string; skyBottom?: string; lightIntensity?: number };
  /** Story-Trigger im Gebiet. */
  triggers?: AreaTrigger[];
  description?: string;
}

export interface InteriorStyle {
  wallColor: string;
  floorColor: string;
  accentColor: string;
  wallHeight: number;
  /** Deckenflaeche zeichnen (bei Innenraeumen sinnvoll). */
  ceiling?: boolean;
  /** Tuer-Oeffnungen in der Aussenwand. */
  exits?: { x: number; z: number; width: number; side: 'north' | 'south' | 'east' | 'west' }[];
  /** Moebel und Einrichtung. */
  furniture?: {
    kind: 'bed' | 'table' | 'chair' | 'shelf' | 'counter' | 'tv' | 'plant' | 'rug'
      | 'stairs' | 'machine' | 'computer' | 'sofa' | 'lamp' | 'crateStack' | 'podium';
    pos: [number, number];
    rotation?: number;
    scale?: number;
    color?: string;
  }[];
}

export interface AreaTrigger {
  id: string;
  pos: [number, number];
  radius: number;
  /** Einmalig oder wiederholbar. */
  once?: boolean;
  requires?: { storyStage?: number; flag?: string; notFlag?: string };
  action:
    | { kind: 'cutscene'; cutscene: string }
    | { kind: 'dialogue'; dialogue: string }
    | { kind: 'battle'; trainer: string }
    | { kind: 'setFlag'; flag: string }
    | { kind: 'storyStage'; stage: number }
    | { kind: 'message'; text: string };
}

// ---------------------------------------------------------------------------
// Dialoge / Quests / Story
// ---------------------------------------------------------------------------

export interface DialogueChoice {
  text: string;
  /** Zielknoten. */
  next?: string;
  actions?: DialogueAction[];
}

export type DialogueAction =
  | { kind: 'setFlag'; flag: string; value?: boolean }
  | { kind: 'storyStage'; stage: number }
  | { kind: 'giveItem'; item: string; quantity?: number }
  | { kind: 'takeItem'; item: string; quantity?: number }
  | { kind: 'giveMoney'; amount: number }
  | { kind: 'giveCreature'; species: string; level: number }
  | { kind: 'startBattle'; trainer: string }
  | { kind: 'healParty' }
  | { kind: 'openShop'; shop: string }
  | { kind: 'startQuest'; quest: string }
  | { kind: 'advanceQuest'; quest: string; step?: number }
  | { kind: 'completeQuest'; quest: string }
  | { kind: 'cutscene'; cutscene: string }
  | { kind: 'chooseStarter' }
  | { kind: 'openBox' }
  | { kind: 'fastTravel' }
  | { kind: 'openCamp' }
  | { kind: 'startRaid'; den: string }
  | { kind: 'teleport'; area: string; spawnPoint: string };

export interface DialogueNode {
  id: string;
  speaker?: string;
  lines: string[];
  choices?: DialogueChoice[];
  actions?: DialogueAction[];
  next?: string;
  /** Bedingungen; der erste passende Knoten gewinnt. */
  requires?: { storyStage?: number; maxStoryStage?: number; flag?: string; notFlag?: string; badge?: number; hasItem?: string };
  /** Portraet-Farbe fuer die Dialogbox. */
  portrait?: string;
}

export interface DialogueTreeData {
  id: string;
  /** Startknoten werden der Reihe nach geprueft - erster passender gewinnt. */
  entry: string[];
  nodes: DialogueNode[];
}

export interface QuestStepData {
  id: string;
  description: string;
  /** Automatische Erfuellung. */
  completion?:
    | { kind: 'flag'; flag: string }
    | { kind: 'storyStage'; stage: number }
    | { kind: 'item'; item: string; quantity: number }
    | { kind: 'defeatTrainer'; trainer: string }
    | { kind: 'catchSpecies'; species: string }
    | { kind: 'catchCount'; count: number }
    | { kind: 'badge'; badge: number }
    | { kind: 'visitArea'; area: string }
    | { kind: 'manual' };
}

export interface QuestData {
  id: string;
  name: string;
  kind: 'main' | 'side';
  description: string;
  steps: QuestStepData[];
  rewards?: { money?: number; items?: { item: string; quantity: number }[]; exp?: number };
  /** Automatisch starten ab Story-Stufe. */
  autoStartStage?: number;
  requires?: { storyStage?: number; flag?: string; quest?: string };
  giver?: string;
  area?: string;
}

export interface ShopData {
  id: string;
  name: string;
  greeting: string;
  /** Waren; `minBadges` blendet Artikel erst spaeter frei. */
  stock: { item: string; minBadges?: number; priceOverride?: number }[];
  buysItems: boolean;
}

export interface GymData {
  id: string;
  name: string;
  city: string;
  type: ElementType;
  badgeIndex: number;
  badgeName: string;
  leader: string;
  /** Trainer im Vorfeld. */
  minions: string[];
  /** Puzzle-Variante. */
  puzzle: 'switches' | 'platforms' | 'maze' | 'quiz' | 'lights' | 'none';
  puzzleConfig?: Record<string, unknown>;
  introText: string[];
  victoryText: string[];
  rewardItems?: string[];
  /** Level-Obergrenze fuer gehorchende Kreaturen. */
  obedienceLevel: number;
  area: string;
  /** Farbschema des Stadions. */
  colors: { primary: string; secondary: string; accent: string };
}

export interface StoryStageData {
  stage: number;
  id: string;
  name: string;
  objective: string;
  /** Beim Erreichen ausgeloeste Aktionen. */
  onEnter?: DialogueAction[];
}

export interface CutsceneData {
  id: string;
  steps: CutsceneStep[];
  /** Blockiert Spielereingaben. */
  lockPlayer?: boolean;
  music?: string;
}

export type CutsceneStep =
  | { kind: 'wait'; seconds: number }
  | { kind: 'fade'; to: 'black' | 'white' | 'clear'; seconds: number }
  | { kind: 'camera'; pos?: [number, number, number]; target?: [number, number, number]; seconds: number; ease?: boolean }
  | { kind: 'cameraFollow'; actor: string; distance?: number; height?: number; seconds?: number }
  | { kind: 'cameraShake'; intensity: number; seconds: number }
  | { kind: 'dialogue'; dialogue: string }
  | { kind: 'message'; speaker?: string; lines: string[] }
  | { kind: 'moveActor'; actor: string; to: [number, number]; speed?: number; run?: boolean }
  | { kind: 'faceActor'; actor: string; target: string | [number, number] }
  | { kind: 'spawnActor'; actor: string; npc?: string; pos: [number, number]; facing?: number }
  | { kind: 'despawnActor'; actor: string }
  | { kind: 'animate'; actor: string; animation: string; seconds?: number }
  | { kind: 'music'; track: string | null; fade?: number }
  | { kind: 'sfx'; sound: string }
  | { kind: 'effect'; effect: string; pos?: [number, number, number]; seconds?: number }
  | { kind: 'weather'; weather: WeatherKind }
  | { kind: 'timeOfDay'; hour: number }
  | { kind: 'action'; actions: DialogueAction[] }
  | { kind: 'battle'; trainer: string; gigantic?: boolean }
  | { kind: 'wildBattle'; species: string; level: number; legendary?: boolean }
  | { kind: 'teleport'; area: string; spawnPoint: string };

export interface RaidData {
  id: string;
  tier: number;
  /** Moegliche Boss-Arten. */
  bosses: { species: string; level: number; weight: number; gigantic?: boolean }[];
  /** Verbuendete NPC-Trainer. */
  allies: string[];
  shieldThresholds: number[];
  rewardItems: { item: string; quantity: number; weight: number }[];
  turnLimit: number;
}

export interface NatureData {
  id: string;
  name: string;
  up: Exclude<StatKey, 'hp'> | null;
  down: Exclude<StatKey, 'hp'> | null;
}

export interface TypeChartData {
  /** attacker -> defender -> multiplier */
  chart: Record<string, Record<string, number>>;
}
