import { test, type Page } from '@playwright/test';

async function waitForGame(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __CONTROLLER__?: unknown }).__CONTROLLER__),
    undefined, { timeout: 45_000 },
  );
  await page.waitForTimeout(500);
}

/** Bildschirmfotos zur Beurteilung der Darstellung. */
test('Ansichten', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await waitForGame(page);

  const views: [string, string, number, string][] = [
    // Name, Gebiet, Uhrzeit, Wetter
    ['a-startdorf', 'startdorf', 10, 'clear'],
    ['b-route1', 'route_1', 12, 'clear'],
    ['c-quellheim', 'quellheim', 15, 'cloudy'],
    ['d-startdorf-abend', 'startdorf', 19.5, 'clear'],
    ['e-startdorf-nacht', 'startdorf', 23, 'clear'],
    ['f-wildland', 'wildland', 11, 'clear'],
  ];

  // Nahaufnahme der Spielfigur.
  await page.evaluate(() => {
    const c = (window as any).__CONTROLLER__;
    c.game.enterArea('startdorf', 'default');
    c.game.time.setHour(11);
    c.game.weather.force('clear');
    c.game.world.setWeather('clear');
    // Kamera dicht heran und von vorn auf die Figur.
    const px = c.game.player.x;
    const pz = c.game.player.z;
    c.game.player.teleport(px, pz, 0);
    c.game.camera.snapBehind(px, c.game.player.y, pz, Math.PI);
    // Kameraabstand verringern; die Kamera wird jede Bildwiederholung neu
    // gesetzt, deshalb ueber ihren Zielabstand statt ueber die Position.
    (c.game.camera as any).targetDistance = 2.6;
    (c.game.camera as any).distance = 2.6;
    (c.game.camera as any).pitch = -0.05;
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'tests/e2e/shots/look-i-figur.png' });

  // Kameraabstand wieder auf den Normalwert, sonst bleiben alle weiteren
  // Ansichten herangezoomt.
  await page.evaluate(() => {
    const c = (window as any).__CONTROLLER__;
    (c.game.camera as any).targetDistance = 7.2;
    (c.game.camera as any).distance = 7.2;
    (c.game.camera as any).pitch = 0.2;
  });

  // Nahaufnahme eines Hauses zur Beurteilung der Gebaeudedetails.
  for (const [name, hour] of [['g-haus-tag', 11], ['h-haus-nacht', 22]] as const) {
    await page.evaluate((h) => {
      const c = (window as any).__CONTROLLER__;
      c.game.enterArea('startdorf', 'default');
      c.game.time.setHour(h);
      c.game.weather.force('clear');
      c.game.world.setWeather('clear');
      // Vor der Tuer stehen und das Haus ansehen: Richtung aus Gebaeude-
      // mittelpunkt und Tuerposition ableiten.
      const door = c.game.world.area.doors[0];
      const building = c.game.world.area.data.buildings[0];
      const bx = building.pos[0];
      const bz = building.pos[1];
      const len = Math.hypot(door.x - bx, door.z - bz) || 1;
      const nx = (door.x - bx) / len;
      const nz = (door.z - bz) / len;
      const px = door.x + nx * 8.5;
      const pz = door.z + nz * 8.5;
      const facing = Math.atan2(door.x - px, door.z - pz);
      c.game.player.teleport(px, pz, facing);
      c.game.camera.snapBehind(c.game.player.x, c.game.player.y, c.game.player.z, facing);
    }, hour);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `tests/e2e/shots/look-${name}.png` });
  }

  for (const [name, area, hour, weather] of views) {
    await page.evaluate(([a, h, w]) => {
      const c = (window as any).__CONTROLLER__;
      c.game.enterArea(a as string, 'default');
      c.game.time.setHour(h as number);
      c.game.weather.force(w as string);
      c.game.world.setWeather(w as string);
      // Vom Spawnpunkt aus in die Gebietsmitte blicken.
      const size = c.game.world.area.data.size;
      const px = c.game.player.x;
      const pz = c.game.player.z;
      const facing = Math.atan2(size[0] / 2 - px, size[1] / 2 - pz);
      c.game.player.teleport(px, pz, facing);
      c.game.camera.snapBehind(c.game.player.x, c.game.player.y, c.game.player.z, facing);
    }, [area, hour, weather] as const);
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `tests/e2e/shots/look-${name}.png` });
  }
});
