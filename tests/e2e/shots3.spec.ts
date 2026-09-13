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

test('Bildschirmfotos von Wetter, Tageszeit und Raids', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await waitForGame(page);

  await run(page, (c) => {
    c.runAction({ kind: 'giveCreature', species: 'infernohorn', level: 60 });
    c.runAction({ kind: 'giveCreature', species: 'panzerwacht', level: 58 });
    c.player.setFlag('giganticUnlocked', true);
  });

  const shots: [string, (c: any) => unknown][] = [
    ['wetter-regen', (c) => { c.game.enterArea('route_2', 'default'); c.game.time.setHour(12); c.game.weather.force('heavyRain'); c.game.world.setWeather('heavyRain'); }],
    ['wetter-gewitter', (c) => { c.game.weather.force('thunderstorm'); c.game.world.setWeather('thunderstorm'); }],
    ['wetter-schnee', (c) => { c.game.enterArea('frostgipfel', 'default'); c.game.weather.force('blizzard'); c.game.world.setWeather('blizzard'); }],
    ['wetter-sandsturm', (c) => { c.game.enterArea('aschenberg', 'default'); c.game.weather.force('sandstorm'); c.game.world.setWeather('sandstorm'); }],
    ['wetter-nebel', (c) => { c.game.enterArea('nebelmoor', 'default'); c.game.weather.force('fog'); c.game.world.setWeather('fog'); }],
    ['tageszeit-morgen', (c) => { c.game.enterArea('route_1', 'default'); c.game.weather.force('clear'); c.game.world.setWeather('clear'); c.game.time.setHour(6.5); }],
    ['tageszeit-mittag', (c) => { c.game.time.setHour(13); }],
    ['tageszeit-abend', (c) => { c.game.time.setHour(19); }],
    ['tageszeit-nacht', (c) => { c.game.time.setHour(23); }],
  ];

  for (const [name, fn] of shots) {
    await run(page, fn);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `tests/e2e/shots/${name}.png` });
  }

  // Wildland mit Energiepunkten
  await run(page, (c) => {
    c.game.enterArea('wildland', 'from_funkenau');
    c.game.time.setHour(21);
    c.game.weather.force('clear');
    c.game.world.setWeather('clear');
  });
  await page.waitForTimeout(1500);
  await run(page, (c) => {
    const den = c.raids.dens.find((d: any) => d.active && !d.cleared) ?? c.raids.dens[0];
    if (den) {
      c.game.player.teleport(den.x, den.z + 19, Math.PI);
      c.game.camera.snapBehind(
        c.game.player.x, c.game.player.y, c.game.player.z, Math.PI,
      );
    }
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/e2e/shots/wildland-nest.png' });

  // Raid-Vorschau
  await run(page, (c) => {
    const den = c.raids.dens.find((d: any) => d.active && !d.cleared);
    if (den) c.runAction({ kind: 'startRaid', den: den.id });
  });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'tests/e2e/shots/raid-vorschau.png' });

  // Raid-Kampf mit Schilden
  await run(page, (c) => { (c.ui.get('raid') as any)?.handleAction('confirm'); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'tests/e2e/shots/raid-kampf.png' });

  // Debug-Anzeige
  await page.keyboard.press('F1');
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'tests/e2e/shots/debug-anzeige.png' });
});
