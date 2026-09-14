import { test, expect, type Page } from '@playwright/test';

async function waitForGame(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __CONTROLLER__?: unknown }).__CONTROLLER__),
    undefined, { timeout: 45_000 },
  );
  await page.waitForTimeout(600);
}

interface Stats {
  area: string;
  calls: number;
  triangles: number;
  geometries: number;
}

async function statsFor(page: Page, areaId: string): Promise<Stats> {
  await page.evaluate((id) => {
    (window as unknown as { __CONTROLLER__: any }).__CONTROLLER__.game.enterArea(id, 'default');
  }, areaId);
  await page.waitForTimeout(2200);
  return page.evaluate(() => {
    const c = (window as unknown as { __CONTROLLER__: any }).__CONTROLLER__;
    const s = c.game.renderer.stats;
    return {
      area: c.game.world.areaId as string,
      calls: s.drawCalls as number,
      triangles: s.triangles as number,
      geometries: s.geometries as number,
    };
  });
}

test.describe('Darstellungsaufwand', () => {
  test('haelt die Zeichenaufrufe in grossen Gebieten im Rahmen', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await waitForGame(page);

    // Obergrenzen mit Reserve: ohne das Zusammenfassen der Requisiten lagen
    // Route 1 bei ~1800 und das Wildland bei ~2700 Zeichenaufrufen.
    // Zusaetzlich eine Schranke fuer die Dreiecke - sie bestimmt auf
    // schwacher Hardware die Bildrate staerker als die Zeichenaufrufe.
    const budgets: Record<string, { calls: number; triangles: number }> = {
      startdorf: { calls: 750, triangles: 320_000 },
      route_1: { calls: 1100, triangles: 700_000 },
      quellheim: { calls: 800, triangles: 460_000 },
      wildland: { calls: 1400, triangles: 950_000 },
      hammerstadt: { calls: 800, triangles: 340_000 },
    };

    for (const [areaId, budget] of Object.entries(budgets)) {
      const stats = await statsFor(page, areaId);
      expect(stats.area).toBe(areaId);
      expect(stats.calls, `${areaId}: ${stats.calls} Zeichenaufrufe`)
        .toBeLessThan(budget.calls);
      expect(stats.triangles, `${areaId}: ${stats.triangles} Dreiecke`)
        .toBeLessThan(budget.triangles);
      expect(stats.triangles, `${areaId}: Geometrie fehlt`).toBeGreaterThan(1000);
    }
  });

  test('gibt Gebietsspeicher beim Wechseln wieder frei', async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto('/');
    await waitForGame(page);

    const areas = ['startdorf', 'route_1', 'quellheim', 'route_2', 'flusshafen'];
    for (const areaId of areas) await statsFor(page, areaId);
    const first = await statsFor(page, 'startdorf');

    // Zweiter Durchlauf: der Gebiets-Cache haelt nur wenige Gebiete,
    // die Zahl der Geometrien darf daher nicht weiter wachsen.
    for (const areaId of areas) await statsFor(page, areaId);
    const second = await statsFor(page, 'startdorf');

    expect(second.geometries).toBeLessThanOrEqual(first.geometries + 40);
  });
});
