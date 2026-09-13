import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

async function waitForGame(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __CONTROLLER__?: unknown }).__CONTROLLER__),
    undefined, { timeout: 45_000 },
  );
  await page.waitForTimeout(400);
}

/** Fuehrt eine Funktion im Spielkontext aus. */
async function run<T>(page: Page, fn: (c: any) => T): Promise<T> {
  return page.evaluate(
    (src) => {
      const controller = (window as unknown as { __CONTROLLER__: any }).__CONTROLLER__;
      // eslint-disable-next-line no-new-func
      return new Function('c', `return (${src})(c);`)(controller);
    },
    fn.toString(),
  ) as Promise<T>;
}

test.describe('Vertical Slice', () => {
  test('spielt Prolog, Starterwahl, Route, Kampf und Arena durch', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForGame(page);

    // --- Start: Schlafzimmer, Story-Stufe 1 ------------------------------
    const start = await run(page, (c) => ({
      area: c.game.world.areaId,
      stage: c.player.storyStage,
      party: c.player.party.length,
      mode: c.game.mode,
    }));
    expect(start.area).toBe('home_bedroom');
    expect(start.stage).toBe(1);
    expect(start.party).toBe(0);
    expect(start.mode).toBe('world');

    // --- Ins Labor und Starter waehlen -----------------------------------
    await run(page, (c) => { c.game.enterArea('lab_interior', 'entrance'); });
    await page.waitForTimeout(300);
    await run(page, (c) => { c.runAction({ kind: 'chooseStarter' }); });
    await page.waitForTimeout(600);
    await run(page, (c) => {
      const screen = c.ui.get('starter');
      // Direkt bestaetigen: einmal auswaehlen, einmal bestaetigen.
      screen.handleAction('confirm');
      screen.handleAction('confirm');
    });
    await page.waitForTimeout(500);

    const afterStarter = await run(page, (c) => ({
      party: c.player.party.length,
      species: c.player.party[0]?.speciesId ?? null,
      level: c.player.party[0]?.level ?? 0,
      flag: c.player.hasFlag('starterChosen'),
      caught: c.player.caughtSpecies.size,
    }));
    expect(afterStarter.party).toBe(1);
    expect(afterStarter.species).toBeTruthy();
    expect(afterStarter.level).toBe(5);
    expect(afterStarter.flag).toBe(true);
    expect(afterStarter.caught).toBe(1);

    // --- Route 1: wilde Kreaturen erscheinen -----------------------------
    await run(page, (c) => { c.game.enterArea('route_1', 'from_startdorf'); });
    await page.waitForTimeout(900);
    const route = await run(page, (c) => ({
      area: c.game.world.areaId,
      wild: c.wild.count,
      npcs: c.npcs.all.length,
      items: c.debugInfo,
    }));
    expect(route.area).toBe('route_1');
    expect(route.wild, 'Keine wilden Kreaturen gespawnt').toBeGreaterThan(3);
    expect(route.npcs).toBeGreaterThanOrEqual(2);

    // --- Wilder Kampf: Engine direkt durchspielen ------------------------
    await run(page, (c) => {
      c.startWildBattleDirect('nagezahn', 3, false);
    });
    await page.waitForTimeout(900);
    const inBattle = await run(page, (c) => ({
      mode: c.game.mode,
      phase: c.game.mode === 'battle' ? 'battle' : 'none',
      enemy: c.debugInfo,
    }));
    expect(inBattle.mode).toBe('battle');

    // Kampf zu Ende spielen: immer die erste Attacke.
    await page.waitForTimeout(1200);
    for (let i = 0; i < 150; i++) {
      const done = await run(page, (c) => {
        const screen = c.ui.get('battle');
        if (!screen) return true;
        if (c.game.mode !== 'battle') return true;
        screen.handleAction('confirm');
        screen.handleAction('confirm');
        return false;
      });
      if (done) break;
      await page.waitForTimeout(260);
    }
    await page.waitForTimeout(1500);

    const afterBattle = await run(page, (c) => ({
      mode: c.game.mode,
      exp: c.player.party[0]?.exp ?? 0,
      level: c.player.party[0]?.level ?? 0,
      seen: c.player.seenSpecies.size,
    }));
    expect(afterBattle.mode, 'Kampf hat nicht geendet').toBe('world');
    expect(afterBattle.seen).toBeGreaterThanOrEqual(2);

    // --- Quellheim: Heilstation und Laden --------------------------------
    await run(page, (c) => { c.game.enterArea('quellheim', 'from_route1'); });
    await page.waitForTimeout(600);
    const town = await run(page, (c) => ({
      area: c.game.world.areaId,
      visited: c.player.visitedAreas.size,
      npcs: c.npcs.all.length,
    }));
    expect(town.area).toBe('quellheim');
    expect(town.npcs).toBeGreaterThanOrEqual(2);

    // Heilung pruefen
    await run(page, (c) => {
      c.player.party[0].applyHpDelta(-1000);
      c.runAction({ kind: 'healParty' });
    });
    const healed = await run(page, (c) => c.player.party[0].currentHp === c.player.party[0].maxHp);
    expect(healed).toBe(true);

    // Laden: kaufen
    await run(page, (c) => {
      c.player.addMoney(5000);
      c.runAction({ kind: 'openShop', shop: 'shop_quellheim' });
    });
    await page.waitForTimeout(600);
    const shopOpen = await run(page, (c) => Boolean(c.ui.isOpen('shop')));
    expect(shopOpen).toBe(true);
    const beforeBuy = await run(page, (c) => ({
      money: c.player.money, balls: c.player.itemCount('fangkugel'),
    }));
    await run(page, (c) => {
      const screen = c.ui.get('shop');
      screen.handleAction('confirm');
      screen.handleAction('cancel');
    });
    const afterBuy = await run(page, (c) => ({
      money: c.player.money, balls: c.player.itemCount('fangkugel'),
    }));
    expect(afterBuy.balls).toBeGreaterThan(beforeBuy.balls);
    expect(afterBuy.money).toBeLessThan(beforeBuy.money);

    // --- Arena: Leiterin besiegen (Team hochziehen, damit es machbar ist) --
    await run(page, (c) => {
      c.game.enterArea('gym_quellheim', 'entrance');
      // Team auf ein faires Niveau bringen - der Test prueft den Ablauf,
      // nicht die Schwierigkeit.
      for (const creature of c.player.party) {
        creature.addExp(200000);
      }
    });
    await page.waitForTimeout(600);
    await run(page, (c) => { c.startTrainerBattle('arenaleiterin_thalia'); });
    await page.waitForTimeout(900);

    for (let i = 0; i < 120; i++) {
      const done = await run(page, (c) => {
        if (c.game.mode !== 'battle') return true;
        const screen = c.ui.get('battle');
        if (!screen) return true;
        screen.handleAction('confirm');
        return false;
      });
      if (done) break;
      await page.waitForTimeout(220);
    }
    await page.waitForTimeout(2500);
    // Nachkampf-Text wegklicken
    for (let i = 0; i < 10; i++) {
      await run(page, (c) => {
        const top = c.ui.topScreen;
        if (top && top.id.startsWith('message')) top.handleAction('confirm');
      });
      await page.waitForTimeout(260);
    }

    // Nach dem Kampf koennen Entwicklungen anlaufen (der Test zieht das Team
    // stark hoch); sie laufen selbstaendig ab - hier wird darauf gewartet.
    for (let i = 0; i < 60; i++) {
      const mode = await run(page, (c) => {
        const top = c.ui.topScreen;
        if (top && top.id.startsWith('message')) top.handleAction('confirm');
        return c.game.mode as string;
      });
      if (mode === 'world') break;
      await page.waitForTimeout(400);
    }

    const afterGym = await run(page, (c) => ({
      badges: c.player.badgeCount,
      stage: c.player.storyStage,
      defeated: c.player.hasFlag('trainer:arenaleiterin_thalia'),
      mode: c.game.mode,
    }));
    expect(afterGym.defeated, 'Arenaleiterin nicht besiegt').toBe(true);
    expect(afterGym.badges, 'Kein Orden erhalten').toBe(1);
    expect(afterGym.mode).toBe('world');

    expect(errors, `Konsolenfehler:\n${errors.join('\n')}`).toEqual([]);
  });

  test('speichert und laedt den Fortschritt', async ({ page }) => {
    test.setTimeout(120_000);
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForGame(page);

    await run(page, (c) => {
      c.runAction({ kind: 'giveCreature', species: 'glutkitz', level: 12 });
      c.player.addMoney(4321);
      c.player.setFlag('testFlag', true);
      c.player.setStoryStage(3);
      c.game.enterArea('quellheim', 'from_route1');
    });
    await page.waitForTimeout(500);

    const saved = await run(page, async (c) => c.saveGame('slot2'));
    expect(saved).toBe(true);

    // Zustand veraendern
    await run(page, (c) => {
      c.player.addMoney(-4000);
      c.game.enterArea('startdorf', 'default');
    });
    await page.waitForTimeout(400);

    const loaded = await run(page, async (c) => c.loadGame('slot2'));
    expect(loaded).toBe(true);
    await page.waitForTimeout(600);

    const state = await run(page, (c) => ({
      money: c.player.money,
      area: c.game.world.areaId,
      party: c.player.party.length,
      species: c.player.party[0]?.speciesId,
      level: c.player.party[0]?.level,
      flag: c.player.hasFlag('testFlag'),
      stage: c.player.storyStage,
    }));
    expect(state.money).toBe(4321 + 3000);
    expect(state.area).toBe('quellheim');
    expect(state.party).toBe(1);
    expect(state.species).toBe('glutkitz');
    expect(state.level).toBe(12);
    expect(state.flag).toBe(true);
    expect(state.stage).toBe(3);

    expect(errors, `Konsolenfehler:\n${errors.join('\n')}`).toEqual([]);
  });
});
