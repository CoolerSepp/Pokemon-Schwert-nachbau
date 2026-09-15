import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * Was eine Niederlage kostet.
 *
 * Frueher wurde das Team nach einer Niederlage kostenlos geheilt und der
 * Spieler sofort zur letzten Heilstation versetzt - die Niederlage kostete
 * nichts ausser ein paar Sekunden. Der Test haelt das neue Verhalten fest:
 * kein Teleport, keine Heilung, Bergungskosten, und der Rueckweg zu Fuss,
 * auf dem einen niemand angreift.
 */

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

async function run<T>(page: Page, fn: (c: any) => T): Promise<T> {
  return page.evaluate(
    (src) => new Function('c', `return (${src})(c);`)(
      (window as unknown as { __CONTROLLER__: any }).__CONTROLLER__,
    ),
    fn.toString(),
  ) as Promise<T>;
}

/** Wartet auf den naechsten Bildlauf - feste Zeiten sind hier unbrauchbar. */
async function nextFrames(page: Page, count = 2): Promise<void> {
  const before = await run(page, (c) => c.game.loop.frames);
  await page.waitForFunction(
    ([f, n]) => (window as any).__CONTROLLER__.game.loop.frames > (f as number) + (n as number),
    [before, count], { timeout: 10_000 },
  ).catch(() => undefined);
}

test('eine Niederlage kostet Geld und den Rueckweg', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = collectErrors(page);
  await page.goto('/');
  await page.waitForFunction(
    () => Boolean((window as any).__CONTROLLER__), undefined, { timeout: 45_000 },
  );
  await page.waitForTimeout(400);

  // Ein schwaches Team auf Route 1, weit weg von jeder Heilstation.
  await run(page, (c) => {
    c.runAction({ kind: 'giveCreature', species: 'nagezahn', level: 3 });
    c.player.setFlag('starterChosen', true);
    c.settings.set('battleSpeed', 'instant');
    c.game.enterArea('route_1', 'from_startdorf');
  });
  await page.waitForTimeout(800);
  await run(page, (c) => { c.game.player.teleport(60, 40, 0); });
  await page.waitForTimeout(400);

  const vorher = await run(page, (c) => ({
    area: c.game.world.areaId,
    x: Math.round(c.game.player.x), z: Math.round(c.game.player.z),
    money: c.player.money,
    hp: c.player.party.map((m: any) => m.currentHp),
  }));
  expect(vorher.area).toBe('route_1');
  expect(vorher.hp[0]).toBeGreaterThan(0);

  // Ein aussichtsloser Kampf.
  await run(page, (c) => { c.startWildBattleDirect('panzerwacht', 60, false); });
  await page.waitForTimeout(800);
  expect(await run(page, (c) => c.game.mode)).toBe('battle');

  for (let i = 0; i < 300; i++) {
    const done = await run(page, (c) => {
      const screen: any = c.ui.get('battle');
      if (!screen || c.game.mode !== 'battle') return true;
      if (screen.panel === 'moves') {
        const moves = screen.ctx.engine.playerActive.moves;
        const index = moves.findIndex((m: any) => m.pp > 0);
        screen.selectedMove = index >= 0 ? index : 0;
      }
      screen.handleAction('confirm');
      return false;
    });
    if (done) break;
    await nextFrames(page, 1);
  }

  // Die Meldung nach der Schwarzblende wegklicken. Sie erscheint erst nach
  // der Blende, deshalb nicht sofort abbrechen, wenn noch keine da ist -
  // sonst prueft der Test den Zustand mitten in der Blende.
  for (let i = 0; i < 120; i++) {
    const zustand = await run(page, (c) => {
      const top: any = c.ui.topScreen;
      if (top && String(top.id).startsWith('message')) {
        top.handleAction('confirm');
        return 'meldung';
      }
      return c.game.player.isControlEnabled ? 'frei' : 'wartet';
    });
    if (zustand === 'frei') break;
    await nextFrames(page, 1);
  }
  await page.waitForTimeout(800);

  const nachher = await run(page, (c) => ({
    mode: c.game.mode,
    area: c.game.world.areaId,
    x: Math.round(c.game.player.x), z: Math.round(c.game.player.z),
    money: c.player.money,
    hp: c.player.party.map((m: any) => m.currentHp),
    einsatzbereit: c.player.hasUsableCreature,
    steuerung: c.game.player.isControlEnabled,
  }));

  expect(nachher.mode, 'Kampf endete nicht').toBe('world');
  // Kein Teleport: gleiches Gebiet, gleiche Stelle.
  expect(nachher.area, 'Der Spieler wurde weggebeamt').toBe(vorher.area);
  expect(Math.hypot(nachher.x - vorher.x, nachher.z - vorher.z),
    'Der Spieler steht nicht mehr dort, wo er verloren hat').toBeLessThan(4);
  // Keine Gratisheilung.
  expect(nachher.hp[0], 'Das Team wurde kostenlos geheilt').toBe(0);
  expect(nachher.einsatzbereit).toBe(false);
  // Bergungskosten.
  expect(nachher.money, 'Die Niederlage hat nichts gekostet')
    .toBeLessThan(vorher.money);
  // Der Spieler kann weiterlaufen.
  expect(nachher.steuerung, 'Die Steuerung blieb gesperrt').toBe(true);

  // Mit kampfunfaehigem Team startet kein wilder Kampf mehr: sonst waere
  // der Rueckweg unpassierbar.
  await run(page, (c) => {
    c.game.player.teleport(22, 26, 0);
    c.wild.setPaused(false);
  });
  for (let i = 0; i < 40; i++) await nextFrames(page, 2);
  expect(await run(page, (c) => c.game.mode),
    'Trotz kampfunfaehigem Team begann ein Kampf').toBe('world');

  // An der Heilstation ist das Team wieder da.
  await run(page, (c) => { c.healParty(); });
  await page.waitForTimeout(400);
  const geheilt = await run(page, (c) => ({
    hp: c.player.party.map((m: any) => m.currentHp),
    einsatzbereit: c.player.hasUsableCreature,
  }));
  expect(geheilt.hp[0]).toBeGreaterThan(0);
  expect(geheilt.einsatzbereit).toBe(true);

  expect(errors, errors.join('\n')).toEqual([]);
});
