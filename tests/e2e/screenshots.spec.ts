import { test, type Page } from '@playwright/test';

/**
 * Erzeugt Bildschirmfotos aus mehreren Gebieten.
 * Dient der visuellen Kontrolle waehrend der Entwicklung - kein Assert.
 */
const SHOTS: { area: string; spawn: string; hour: number; name: string }[] = [
  { area: 'home_bedroom', spawn: 'default', hour: 8, name: '01-schlafzimmer' },
  { area: 'home_ground', spawn: 'default', hour: 8, name: '02-zuhause' },
  { area: 'startdorf', spawn: 'default', hour: 10, name: '03-startdorf' },
  { area: 'startdorf', spawn: 'from_route1', hour: 19, name: '04-startdorf-abend' },
  { area: 'route_1', spawn: 'from_startdorf', hour: 12, name: '05-route1' },
  { area: 'route_1', spawn: 'from_quellheim', hour: 22, name: '06-route1-nacht' },
  { area: 'quellheim', spawn: 'from_route1', hour: 11, name: '07-quellheim' },
  { area: 'center_quellheim', spawn: 'default', hour: 11, name: '08-heilstation' },
  { area: 'gym_quellheim', spawn: 'default', hour: 11, name: '09-arena' },
  { area: 'lab_interior', spawn: 'default', hour: 9, name: '10-labor' },
];

async function waitForGame(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __GAME__?: unknown }).__GAME__),
    undefined, { timeout: 45_000 },
  );
}

test('erzeugt Bildschirmfotos aller Gebiete', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/');
  await waitForGame(page);
  await page.waitForTimeout(500);

  for (const shot of SHOTS) {
    await page.evaluate(({ area, spawn, hour }) => {
      const game = (window as unknown as { __GAME__: any }).__GAME__;
      game.time.setHour(hour);
      game.enterArea(area, spawn);
    }, shot);
    // Ein paar Bilder fuer Kamera-Nachfuehrung und Licht.
    await page.waitForTimeout(900);
    await page.screenshot({ path: `tests/e2e/shots/${shot.name}.png` });
  }
});
