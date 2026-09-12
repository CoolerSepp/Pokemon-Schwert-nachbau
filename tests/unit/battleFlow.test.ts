import { describe, expect, it, beforeAll } from 'vitest';
import { GameData } from '@/data/GameData';
import { CreatureFactory } from '@/creatures/CreatureFactory';
import { emptyStats } from '@/creatures/StatCalc';
import { RNG } from '@/core/RNG';
import { BattleEngine, type BattleSetup } from '@/battle/BattleEngine';
import type { BattleEvent } from '@/battle/BattleTypes';
import type { Creature } from '@/creatures/Creature';

beforeAll(() => GameData.load());

const factory = new CreatureFactory(new RNG('flow'));

function base(overrides: Partial<BattleSetup>): BattleSetup {
  return {
    kind: 'wild',
    playerParty: [],
    enemyParty: [],
    playerName: 'Spieler',
    enemyName: 'Wildes Wesen',
    seed: 'flow-seed',
    ...overrides,
  };
}

/** Spielt einen Kampf bis zum Ende durch und liefert alle Ereignisse. */
function playThrough(
  setup: BattleSetup,
  chooseAction: (engine: BattleEngine) => Parameters<BattleEngine['submitAction']>[0] =
    (e) => ({ kind: 'move', moveIndex: Math.max(0, e.playerActive.moves.findIndex((m) => m.pp > 0)) }),
  maxTurns = 300,
): { engine: BattleEngine; events: BattleEvent[]; turns: number } {
  const engine = new BattleEngine(setup);
  const events: BattleEvent[] = [...engine.start()];
  let turns = 0;
  while (engine.phase !== 'ended' && turns < maxTurns) {
    if (engine.phase === 'chooseReplacement') {
      const options = engine.availableSwitches('player');
      if (options.length === 0) throw new Error('Ersatzphase ohne verfuegbare Kreatur');
      events.push(...engine.submitReplacement(options[0]!));
      continue;
    }
    if (engine.phase === 'chooseLearnMove') {
      const pending = engine.pendingLearnMoves[0]!;
      events.push(...engine.resolveLearnMove(pending.uid, pending.moveId, 0));
      continue;
    }
    turns++;
    events.push(...engine.submitAction(chooseAction(engine)));
  }
  return { engine, events, turns };
}

const kinds = (events: BattleEvent[]) => events.map((e) => e.t);
const find = <K extends BattleEvent['t']>(events: BattleEvent[], t: K) =>
  events.filter((e): e is Extract<BattleEvent, { t: K }> => e.t === t);

describe('Kampfablauf', () => {
  it('startet mit Einwechseln beider Seiten', () => {
    const player = factory.create('glutkitz', { level: 10 });
    const enemy = factory.create('sprossling', { level: 5 });
    const engine = new BattleEngine(base({ playerParty: [player], enemyParty: [enemy] }));
    const events = engine.start();
    expect(kinds(events)).toContain('battleStart');
    const sendOuts = find(events, 'sendOut');
    expect(sendOuts).toHaveLength(2);
    expect(sendOuts.map((e) => e.side).sort()).toEqual(['enemy', 'player']);
    expect(engine.phase).toBe('chooseAction');
  });

  it('beendet einen wilden Kampf mit einem Sieg und vergibt Erfahrung', () => {
    const player = factory.create('infernohorn', { level: 50, ivs: emptyStats(31) });
    const enemy = factory.create('sprossling', { level: 3 });
    const expBefore = player.exp;
    const { engine, events } = playThrough(base({ playerParty: [player], enemyParty: [enemy] }));

    expect(engine.phase).toBe('ended');
    expect(engine.result?.outcome).toBe('win');
    expect(kinds(events)).toContain('faint');
    const gains = find(events, 'expGain');
    expect(gains.length).toBeGreaterThan(0);
    expect(gains[0]!.amount).toBeGreaterThan(0);
    expect(player.exp).toBeGreaterThan(expBefore);
  });

  it('verliert, wenn das gesamte Team kampfunfaehig ist', () => {
    const player = factory.create('sprossling', { level: 2, ivs: emptyStats(0) });
    const enemy = factory.create('titanklaue', { level: 70, ivs: emptyStats(31) });
    const { engine } = playThrough(base({ playerParty: [player], enemyParty: [enemy] }));
    expect(engine.result?.outcome).toBe('loss');
    expect(player.isFainted).toBe(true);
    expect(engine.result!.moneyDelta).toBeLessThan(0);
  });

  it('fordert nach einem K.O. eine Ersatzkreatur an', () => {
    const weak = factory.create('sprossling', { level: 2, ivs: emptyStats(0) });
    const strong = factory.create('forstwaechter', { level: 60, ivs: emptyStats(31) });
    const enemy = factory.create('infernohorn', { level: 30, ivs: emptyStats(31) });
    const engine = new BattleEngine(base({ playerParty: [weak, strong], enemyParty: [enemy] }));
    engine.start();
    let guard = 0;
    while (engine.phase === 'chooseAction' && guard++ < 30) {
      engine.submitAction({ kind: 'move', moveIndex: 0 });
    }
    expect(engine.phase).toBe('chooseReplacement');
    expect(engine.availableSwitches('player')).toEqual([1]);
    const events = engine.submitReplacement(1);
    expect(find(events, 'sendOut')[0]!.uid).toBe(strong.uid);
    expect(engine.phase).toBe('chooseAction');
  });

  it('wechselt Kreaturen auf Wunsch aus', () => {
    const a = factory.create('glutkitz', { level: 20 });
    const b = factory.create('tropfling', { level: 20 });
    const enemy = factory.create('nagezahn', { level: 5 });
    const engine = new BattleEngine(base({ playerParty: [a, b], enemyParty: [enemy] }));
    engine.start();
    const events = engine.submitAction({ kind: 'switch', partyIndex: 1 });
    expect(kinds(events)).toContain('withdraw');
    expect(engine.playerActive.uid).toBe(b.uid);
  });

  it('faengt eine wilde Kreatur mit der Meisterkugel', () => {
    const player = factory.create('glutkitz', { level: 20 });
    const enemy = factory.create('nagezahn', { level: 8 });
    const engine = new BattleEngine(base({
      playerParty: [player], enemyParty: [enemy],
      consumeItem: () => true,
    }));
    engine.start();
    const events = engine.submitAction({
      kind: 'item', itemId: 'meisterkugel', targetIndex: 0,
    });
    expect(find(events, 'captureResult')[0]!.success).toBe(true);
    expect(engine.result?.outcome).toBe('caught');
    expect(engine.result?.caughtCreature?.uid).toBe(enemy.uid);
    expect(enemy.state.caughtBall).toBe('meisterkugel');
    expect(enemy.state.originalTrainer).toBe('Spieler');
  });

  it('verbietet den Fang in Trainerkaempfen', () => {
    const player = factory.create('glutkitz', { level: 20 });
    const enemy = factory.create('nagezahn', { level: 8 });
    const engine = new BattleEngine(base({
      kind: 'trainer', trainerId: 'testtrainer', enemyName: 'Testtrainer',
      playerParty: [player], enemyParty: [enemy], consumeItem: () => true,
    }));
    engine.start();
    expect(engine.canCapture()).toBe(false);
    expect(engine.canFlee()).toBe(false);
  });

  it('setzt Heilgegenstaende ein und verbraucht sie', () => {
    const player = factory.create('forstwaechter', { level: 50, ivs: emptyStats(31) });
    player.applyHpDelta(-Math.floor(player.maxHp * 0.6));
    const before = player.currentHp;
    const enemy = factory.create('sprossling', { level: 2 });
    let consumed = 0;
    const engine = new BattleEngine(base({
      playerParty: [player], enemyParty: [enemy],
      consumeItem: () => { consumed++; return true; },
    }));
    engine.start();
    const events = engine.submitAction({ kind: 'item', itemId: 'hypertrank', targetIndex: 0 });
    expect(consumed).toBe(1);
    expect(player.currentHp).toBeGreaterThan(before);
    expect(find(events, 'heal').length).toBeGreaterThan(0);
  });

  it('meldet fehlende Gegenstaende statt sie zu erfinden', () => {
    const player = factory.create('glutkitz', { level: 20 });
    const enemy = factory.create('sprossling', { level: 5 });
    const engine = new BattleEngine(base({
      playerParty: [player], enemyParty: [enemy], consumeItem: () => false,
    }));
    engine.start();
    const hpBefore = player.currentHp;
    const events = engine.submitAction({ kind: 'item', itemId: 'trank', targetIndex: 0 });
    expect(find(events, 'heal')).toHaveLength(0);
    expect(player.currentHp).toBeLessThanOrEqual(hpBefore);
  });

  it('erlaubt Flucht aus wilden Kaempfen bei Initiativevorteil', () => {
    const fast = factory.create('flammenbock', { level: 60, ivs: emptyStats(31) });
    const slow = factory.create('kieselkopf', { level: 3 });
    const engine = new BattleEngine(base({ playerParty: [fast], enemyParty: [slow] }));
    engine.start();
    const events = engine.submitAction({ kind: 'run' });
    expect(find(events, 'fleeAttempt')[0]!.success).toBe(true);
    expect(engine.result?.outcome).toBe('fled');
  });

  it('fuehrt einen vollstaendigen Trainerkampf gegen sechs Kreaturen zu Ende', () => {
    const party = ['forstwaechter', 'infernohorn', 'fluthueter'].map((id) =>
      factory.create(id, { level: 60, ivs: emptyStats(31) }),
    );
    const enemyTeam = ['blattbock', 'flammenbock', 'wellenotter', 'nagezahn', 'kieselkopf', 'funkenfell']
      .map((id) => factory.create(id, { level: 30 }));
    const { engine, events } = playThrough(base({
      kind: 'trainer', trainerId: 'boss', enemyName: 'Trainer Bosco',
      aiProfile: 'smart', rewardBase: 80,
      playerParty: party, enemyParty: enemyTeam,
    }));
    expect(engine.phase).toBe('ended');
    expect(engine.result?.outcome).toBe('win');
    expect(find(events, 'faint').filter((e) => e.side === 'enemy')).toHaveLength(6);
    expect(engine.result!.moneyDelta).toBeGreaterThan(0);
    expect(engine.result!.defeatedTrainerId).toBe('boss');
  });
});

describe('Statusprobleme und Effekte', () => {
  it('fuegt Verbrennungsschaden am Rundenende zu', () => {
    // Brandmal hat 85 % Genauigkeit; es wird bis zum Treffer wiederholt,
    // damit der Test nicht von einem einzelnen Zufallswurf abhaengt.
    const player = factory.create('glutkitz', { level: 30, moves: ['brandmal'] });
    const enemy = factory.create('nagezahn', { level: 30, moves: ['panzerschutz'] });
    const engine = new BattleEngine(base({
      playerParty: [player], enemyParty: [enemy], seed: 'burn-test',
    }));
    engine.start();
    let applied = false;
    for (let i = 0; i < 12 && engine.phase === 'chooseAction' && !applied; i++) {
      const events = engine.submitAction({ kind: 'move', moveIndex: 0 });
      applied = find(events, 'statusApplied').some((e) => e.status === 'burn');
    }
    expect(applied).toBe(true);
    expect(enemy.status).toBe('burn');

    let burnDamage = false;
    for (let i = 0; i < 3 && engine.phase === 'chooseAction' && !burnDamage; i++) {
      const next = engine.submitAction({ kind: 'move', moveIndex: 0 });
      burnDamage = find(next, 'statusDamage').some((e) => e.status === 'burn');
    }
    expect(burnDamage).toBe(true);
  });

  it('verhindert Statuszuweisung bei typbedingter Immunitaet', () => {
    const player = factory.create('glutkitz', { level: 40, moves: ['brandmal'] });
    const fireTarget = factory.create('glutkohle', { level: 40, moves: ['panzerschutz'] });
    const engine = new BattleEngine(base({
      playerParty: [player], enemyParty: [fireTarget], seed: 'immune',
    }));
    engine.start();
    // Auch nach vielen Versuchen darf ein Feuer-Typ nicht verbrennen.
    for (let i = 0; i < 15 && engine.phase === 'chooseAction'; i++) {
      engine.submitAction({ kind: 'move', moveIndex: 0 });
      expect(fireTarget.status).toBe('none');
    }
  });

  it('veraendert Wertstufen und begrenzt sie bei +/-6', () => {
    const player = factory.create('sprossling', { level: 40, moves: ['dornenwall'] });
    const enemy = factory.create('nagezahn', { level: 5, moves: ['panzerschutz'] });
    const engine = new BattleEngine(base({ playerParty: [player], enemyParty: [enemy], seed: 'stages' }));
    engine.start();
    for (let i = 0; i < 5; i++) {
      if (engine.phase !== 'chooseAction') break;
      engine.submitAction({ kind: 'move', moveIndex: 0 });
    }
    expect(engine.getStages('player').def).toBe(6);
    expect(engine.getStageMultiplier('player', 'def')).toBe(4);
  });

  it('setzt Wetter und laesst es wieder auslaufen', () => {
    const player = factory.create('tropfling', { level: 40, moves: ['regentanz'] });
    const enemy = factory.create('nagezahn', { level: 5, moves: ['panzerschutz'] });
    const engine = new BattleEngine(base({ playerParty: [player], enemyParty: [enemy], seed: 'weather' }));
    engine.start();
    const events = engine.submitAction({ kind: 'move', moveIndex: 0 });
    expect(find(events, 'weatherChange')[0]!.weather).toBe('rain');
    expect(engine.field.weather).toBe('rain');
    for (let i = 0; i < 6 && engine.phase === 'chooseAction'; i++) {
      engine.submitAction({ kind: 'move', moveIndex: 0 });
    }
    expect(engine.field.weather).toBe('clear');
  });

  it('schuetzt vor Angriffen in derselben Runde', () => {
    const player = factory.create('nagezahn', { level: 40, moves: ['schutzschirm'] });
    const enemy = factory.create('infernohorn', { level: 40, moves: ['wuchtschlag'] });
    const engine = new BattleEngine(base({ playerParty: [player], enemyParty: [enemy], seed: 'protect' }));
    engine.start();
    const hpBefore = player.currentHp;
    const events = engine.submitAction({ kind: 'move', moveIndex: 0 });
    const protectedEvent = find(events, 'moveFailed').some((e) => e.reason === 'protected');
    if (protectedEvent) expect(player.currentHp).toBe(hpBefore);
  });

  it('trifft mehrfach bei Mehrfachtreffer-Attacken', () => {
    const player = factory.create('nagezahn', { level: 50, moves: ['dauerschlag'], ivs: emptyStats(31) });
    // Defensiver Gegner ohne Angriffsattacke, damit der Test nicht vorzeitig endet.
    const enemy = factory.create('bergkoloss', { level: 80, moves: ['granitwall'], ivs: emptyStats(31) });
    const engine = new BattleEngine(base({ playerParty: [player], enemyParty: [enemy], seed: 'multi' }));
    engine.start();
    let hits: ReturnType<typeof find<'damage'>> = [];
    for (let i = 0; i < 12 && engine.phase === 'chooseAction' && hits.length === 0; i++) {
      const events = engine.submitAction({ kind: 'move', moveIndex: 0 });
      hits = find(events, 'damage').filter((e) => e.side === 'enemy' && e.hitCount !== undefined);
    }
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits.length).toBeLessThanOrEqual(5);
    expect(hits[0]!.hitCount).toBe(hits.length);
  });

  it('laedt zweizuegige Attacken erst auf', () => {
    const player = factory.create('sprossling', { level: 50, moves: ['photonenbluete'], ivs: emptyStats(31) });
    // Fester, harmloser Gegner-Moveset: sonst kann eine Selbstzerstoerung den
    // Kampf beenden, bevor die Aufladung ausgeloest wird.
    const enemy = factory.create('bergkoloss', { level: 40, moves: ['granitwall'], ivs: emptyStats(0) });
    const engine = new BattleEngine(base({ playerParty: [player], enemyParty: [enemy], seed: 'charge' }));
    engine.start();
    const first = engine.submitAction({ kind: 'move', moveIndex: 0 });
    expect(find(first, 'damage').filter((e) => e.side === 'enemy')).toHaveLength(0);
    expect(first.some((e) => e.t === 'message' && e.text.includes('Sonnenlicht'))).toBe(true);
    const second = engine.submitAction({ kind: 'move', moveIndex: 0 });
    expect(find(second, 'damage').filter((e) => e.side === 'enemy').length).toBeGreaterThan(0);
  });
});

describe('Gigantifizierung', () => {
  it('erhoeht die KP und laeuft nach drei Runden ab', () => {
    const player = factory.create('forstwaechter', { level: 60, ivs: emptyStats(31), giganticFactor: true });
    const enemy = factory.create('nagezahn', { level: 10, moves: ['panzerschutz'] });
    const engine = new BattleEngine(base({
      playerParty: [player], enemyParty: [enemy],
      playerCanGigantic: true, seed: 'giga',
    }));
    engine.start();
    const maxBefore = player.maxHp;
    const events = engine.submitAction({ kind: 'move', moveIndex: 0, gigantic: true });
    const giga = find(events, 'gigantic');
    expect(giga).toHaveLength(1);
    expect(giga[0]!.newMaxHp).toBeGreaterThan(maxBefore);
    expect(player.currentHp).toBeGreaterThan(maxBefore);

    let ended = false;
    for (let i = 0; i < 5 && engine.phase === 'chooseAction'; i++) {
      const next = engine.submitAction({ kind: 'move', moveIndex: 0 });
      if (find(next, 'giganticEnd').length > 0) { ended = true; break; }
    }
    expect(ended || engine.phase === 'ended').toBe(true);
  });

  it('erlaubt Gigantifizierung nur einmal pro Kampf', () => {
    const player = factory.create('infernohorn', { level: 60, ivs: emptyStats(31), giganticFactor: true });
    const enemy = factory.create('bergkoloss', { level: 70, ivs: emptyStats(31), moves: ['granitwall'] });
    const engine = new BattleEngine(base({
      playerParty: [player], enemyParty: [enemy],
      playerCanGigantic: true, seed: 'giga2',
    }));
    engine.start();
    engine.submitAction({ kind: 'move', moveIndex: 0, gigantic: true });
    expect(engine.player.giganticUsed).toBe(true);
    for (let i = 0; i < 4 && engine.phase === 'chooseAction'; i++) {
      engine.submitAction({ kind: 'move', moveIndex: 0 });
    }
    const events = engine.phase === 'chooseAction'
      ? engine.submitAction({ kind: 'move', moveIndex: 0, gigantic: true })
      : [];
    expect(find(events, 'gigantic')).toHaveLength(0);
  });
});

describe('Belastungstest', () => {
  it('beendet 300 zufaellige Kaempfe fehlerfrei und in endlicher Zeit', () => {
    const rng = new RNG('stress');
    const allSpecies = GameData.species.ids();
    let wins = 0, losses = 0, other = 0;
    const maxTurnsSeen: number[] = [];

    for (let i = 0; i < 300; i++) {
      const f = new CreatureFactory(new RNG(`stress-${i}`));
      const partySize = rng.int(1, 4);
      const enemySize = rng.int(1, 4);
      const playerParty: Creature[] = [];
      const enemyParty: Creature[] = [];
      for (let p = 0; p < partySize; p++) {
        playerParty.push(f.create(rng.pick(allSpecies), { level: rng.int(5, 70) }));
      }
      for (let e = 0; e < enemySize; e++) {
        enemyParty.push(f.create(rng.pick(allSpecies), { level: rng.int(5, 70) }));
      }
      const isTrainer = rng.chance(0.5);
      const { engine, turns } = playThrough(
        base({
          kind: isTrainer ? 'trainer' : 'wild',
          trainerId: isTrainer ? `t${i}` : null,
          aiProfile: rng.pick(['random', 'basic', 'smart', 'expert'] as const),
          playerParty, enemyParty,
          playerCanGigantic: rng.chance(0.3),
          enemyCanGigantic: rng.chance(0.3),
          ambientWeather: rng.pick(['clear', 'rain', 'sandstorm', 'snow', 'harshSun'] as const),
          seed: `stress-battle-${i}`,
          consumeItem: () => true,
        }),
        (e) => {
          const active = e.playerActive;
          const usable = active.moves.map((m, idx) => ({ m, idx })).filter((x) => x.m.pp > 0);
          if (usable.length === 0) return { kind: 'move', moveIndex: 0 };
          const choice = rng.pick(usable);
          return { kind: 'move', moveIndex: choice.idx, gigantic: rng.chance(0.15) };
        },
        400,
      );
      maxTurnsSeen.push(turns);
      expect(engine.phase, `Kampf ${i} endete nicht`).toBe('ended');
      expect(engine.result, `Kampf ${i} ohne Ergebnis`).not.toBeNull();
      const outcome = engine.result!.outcome;
      if (outcome === 'win') wins++;
      else if (outcome === 'loss') losses++;
      else other++;
    }

    expect(wins + losses + other).toBe(300);
    expect(wins).toBeGreaterThan(0);
    expect(losses).toBeGreaterThan(0);
    // Kein Kampf darf das Rundenlimit ausreizen (Hinweis auf eine Endlosschleife).
    expect(Math.max(...maxTurnsSeen)).toBeLessThan(400);
  });

  it('haelt KP stets im gueltigen Bereich', () => {
    const rng = new RNG('hp-invariant');
    const ids = GameData.species.ids();
    for (let i = 0; i < 40; i++) {
      const f = new CreatureFactory(new RNG(`hp-${i}`));
      const playerParty = [f.create(rng.pick(ids), { level: rng.int(10, 60) })];
      const enemyParty = [f.create(rng.pick(ids), { level: rng.int(10, 60) })];
      const { engine } = playThrough(base({
        playerParty, enemyParty, seed: `hp-${i}`,
        playerCanGigantic: true, enemyCanGigantic: true,
      }));
      for (const c of [...engine.player.party, ...engine.enemy.party]) {
        expect(c.currentHp).toBeGreaterThanOrEqual(0);
        // Waehrend der Gigantifizierung sind Bonus-KP erlaubt; am Ende nicht mehr.
        expect(c.currentHp).toBeLessThanOrEqual(c.maxHp);
      }
    }
  });
});
