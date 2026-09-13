/**
 * Zentrale Spielkonfiguration (Anforderung 61: keine verstreuten Magic Numbers).
 *
 * Werte, die das Spielgefuehl bestimmen, stehen ausschliesslich hier, damit
 * Balancing ohne Eingriff in Systemcode moeglich ist.
 */
export const GameConfig = {
  version: '0.1.0',
  saveVersion: 4,
  buildName: 'Aetheria',

  loop: {
    /** Maximaler Simulationsschritt - verhindert Tunneling nach Tab-Wechsel. */
    maxDeltaSeconds: 0.1,
    fixedStep: 1 / 60,
    maxFixedStepsPerFrame: 5,
  },

  player: {
    walkSpeed: 4.2,
    runSpeed: 8.4,
    acceleration: 34,
    deceleration: 26,
    turnSpeed: 11,
    radius: 0.38,
    height: 1.7,
    eyeHeight: 1.5,
    stepHeight: 0.55,
    gravity: -24,
    maxFallSpeed: -30,
    jumpVelocity: 6.4,
    /** Maximale Hangneigung (cos) die begehbar ist. */
    maxSlopeCos: Math.cos((52 * Math.PI) / 180),
    interactRange: 2.6,
    interactAngleCos: Math.cos((75 * Math.PI) / 180),
  },

  camera: {
    fov: 58,
    near: 0.15,
    far: 900,
    distance: 7.2,
    minDistance: 2.6,
    maxDistance: 14,
    height: 1.55,
    pitchMin: (-28 * Math.PI) / 180,
    pitchMax: (62 * Math.PI) / 180,
    defaultPitch: (14 * Math.PI) / 180,
    positionHalfLife: 0.07,
    rotationHalfLife: 0.05,
    mouseSensitivity: 0.0026,
    padSensitivity: 2.6,
    zoomSpeed: 0.0055,
    collisionRadius: 0.34,
    collisionPadding: 0.25,
  },

  world: {
    /** Kantenlaenge einer Kollisionszelle in Weltmetern. */
    collisionCellSize: 0.5,
    /** Sichtweite fuer Gras-/Prop-Instanzen. */
    propCullDistance: 130,
    creatureCullDistance: 150,
    /** Aktualisierungsradius fuer wandernde Kreaturen. */
    creatureSimRadius: 90,
    tallGrassRustleRange: 1.1,
    maxActiveWildCreatures: 34,
    respawnDelaySeconds: 26,
    /** Reichweite, in der ein Energiepunkt betreten werden kann. */
    raidDenRange: 3.4,
    /** Kantenlaenge der Kacheln, in denen Requisiten zusammengefasst werden. */
    propBatchTileSize: 48,
  },

  time: {
    /** Wie viele Ingame-Minuten pro realer Sekunde vergehen. */
    minutesPerRealSecond: 1.5,
    startHour: 8,
    dawnHour: 5.5,
    dayHour: 8,
    duskHour: 18.5,
    nightHour: 20.5,
  },

  battle: {
    /** Basisdauer einer Animationsphase, durch Battle-Speed skaliert. */
    baseStepSeconds: 0.55,
    messageSeconds: 1.05,
    hpDrainSecondsPerFull: 1.4,
    critChanceStages: [1 / 24, 1 / 8, 1 / 2, 1, 1],
    critMultiplier: 1.5,
    stabMultiplier: 1.5,
    randomDamageMin: 0.85,
    randomDamageMax: 1.0,
    burnAttackMultiplier: 0.5,
    maxStatStage: 6,
    minStatStage: -6,
    confusionSelfHitPower: 40,
    fleeBaseOdds: 128,
    expShareMultiplier: 0.5,
    /** Gigantifizierung: HP-Multiplikator und Dauer in Runden. */
    giganticHpMultiplier: 1.8,
    giganticTurns: 3,
    /** Ab wie vielen Orden der Spieler gigantifizieren darf. */
    giganticBadgeRequirement: 3,
  },

  creature: {
    maxLevel: 100,
    maxPartySize: 6,
    boxCount: 24,
    boxSize: 30,
    maxFriendship: 255,
    friendshipOnLevelUp: 3,
    friendshipOnFaint: -5,
    friendshipOnCamp: 6,
    ivMax: 31,
    evMaxPerStat: 252,
    evMaxTotal: 510,
  },

  encounter: {
    /** Sichtradius, ab dem eine wilde Kreatur den Spieler wahrnimmt. */
    aggroRadius: 7.5,
    fleeRadius: 9.5,
    contactRadius: 1.15,
    /** Cooldown nach einem Kampf, bevor neue Begegnungen starten. */
    cooldownSeconds: 2.4,
    trainerSightRange: 9.0,
    trainerSightAngleCos: Math.cos((22 * Math.PI) / 180),
  },

  ui: {
    textSpeedChars: { slow: 26, normal: 52, fast: 96, instant: 100000 },
    transitionSeconds: 0.42,
  },

  audio: {
    masterVolume: 0.7,
    musicVolume: 0.5,
    sfxVolume: 0.75,
    musicFadeSeconds: 1.1,
  },

  save: {
    dbName: 'aetheria-save',
    storeName: 'slots',
    slotCount: 3,
    autosaveSlot: 'auto',
    autosaveIntervalSeconds: 180,
  },
} as const;

export type GameConfigType = typeof GameConfig;
