import { test, type Page } from '@playwright/test';

async function waitForGame(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __CONTROLLER__?: unknown }).__CONTROLLER__),
    undefined, { timeout: 45_000 },
  );
  await page.waitForTimeout(500);
}

async function run(page: Page, fn: (c: any) => unknown): Promise<unknown> {
  return page.evaluate((src) => {
    const c = (window as unknown as { __CONTROLLER__: any }).__CONTROLLER__;
    return new Function('c', `return (${src})(c);`)(c);
  }, fn.toString());
}

test('Bildschirmfotos der Spielsysteme', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await waitForGame(page);

  // Ausgangslage: Team und Gegenstaende
  await run(page, (c) => {
    c.runAction({ kind: 'giveCreature', species: 'flammenbock', level: 24 });
    c.runAction({ kind: 'giveCreature', species: 'wellenotter', level: 22 });
    c.runAction({ kind: 'giveCreature', species: 'blattbock', level: 23 });
    c.player.addItem('superkugel', 12);
    c.player.addItem('supertrank', 6);
    c.player.addItem('hyperkugel', 3);
    c.player.addMoney(12000);
    c.player.setStoryStage(4);
    c.player.earnBadge(0, 'Wurzelorden');
    for (const s of ['nagezahn', 'federflaum', 'kribbelkaefer', 'funkenfell']) {
      c.player.registerCaught(s);
    }
    c.player.visitArea('startdorf');
    c.player.visitArea('route_1');
    c.player.visitArea('quellheim');
  });

  // HUD in der Welt
  await run(page, (c) => { c.game.enterArea('quellheim', 'from_route1'); c.game.time.setHour(11); });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'tests/e2e/shots/11-hud.png' });

  // Dialog
  await run(page, (c) => { c.startDialogue('quellheim_fuehrer'); });
  await page.waitForTimeout(1400);
  await page.screenshot({ path: 'tests/e2e/shots/12-dialog.png' });
  await run(page, (c) => { c.ui.popAll(); c.ui.push('hud'); c.game.setMode('world'); });

  // Hauptmenue
  await run(page, (c) => { c.ui.push('mainMenu'); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/e2e/shots/13-menue.png' });

  // Team
  await run(page, (c) => { c.ui.push('team'); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/e2e/shots/14-team.png' });
  await run(page, (c) => { c.ui.pop('team'); });

  // Kreaturenbuch
  await run(page, (c) => { c.ui.push('index'); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/e2e/shots/15-index.png' });
  await run(page, (c) => { c.ui.pop('index'); });

  // Karte
  await run(page, (c) => { c.ui.push('map'); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/e2e/shots/16-karte.png' });
  await run(page, (c) => { c.ui.popAll(); c.ui.push('hud'); });

  // Kampf gegen die Arenaleiterin
  await run(page, (c) => { c.startTrainerBattle('arenaleiterin_thalia'); });
  await page.waitForTimeout(4200);
  await page.screenshot({ path: 'tests/e2e/shots/17-kampf.png' });

  // Attackenauswahl
  for (let i = 0; i < 14; i++) {
    const ready = await run(page, (c) => {
      const s = c.ui.get('battle');
      return Boolean(s && (s as any).awaitingInput);
    });
    if (ready) break;
    await page.waitForTimeout(400);
  }
  await run(page, (c) => { const s = c.ui.get('battle'); s?.handleAction('confirm'); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/e2e/shots/18-attacken.png' });

  // Ein paar Runden fuer einen Treffereffekt
  await run(page, (c) => { const s = c.ui.get('battle'); s?.handleAction('confirm'); });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'tests/e2e/shots/19-kampf-aktion.png' });
});
