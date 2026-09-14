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

test.describe('Regionskarte', () => {
  test('braucht die Regionskarte und zeigt dann die gezeichnete Karte', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForGame(page);

    // Ohne den Gegenstand bleibt die Karte zu.
    await run(page, (c) => { c.player.removeItem('regionskarte', 9); });
    await page.keyboard.press('KeyN');
    await page.waitForTimeout(500);
    expect(await run(page, (c) => c.ui.isOpen('map')), 'Karte ohne Gegenstand offen').toBe(false);

    // Mit Regionskarte, besuchten Orten und Flugticket.
    await run(page, (c) => {
      c.player.addItem('regionskarte', 1);
      c.player.addItem('flugticket', 1);
      for (const id of ['startdorf', 'route_1', 'quellheim', 'route_2', 'flusshafen']) {
        c.player.visitArea(id);
      }
      c.game.enterArea('quellheim', 'default');
    });
    await page.waitForTimeout(600);
    await page.keyboard.press('KeyN');
    await page.waitForTimeout(700);
    expect(await run(page, (c) => c.ui.isOpen('map'))).toBe(true);

    // Die Karte muss tatsaechlich gezeichnet sein: Pixel pruefen.
    const drawn = await page.evaluate(() => {
      const canvas = document.querySelector('.menu-panel canvas') as HTMLCanvasElement | null;
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set<string>();
      let opaque = 0;
      for (let i = 0; i < data.length; i += 4 * 97) {
        if (data[i + 3]! > 0) opaque++;
        colors.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
      }
      return { width: canvas.width, height: canvas.height, opaque, colors: colors.size };
    });
    expect(drawn, 'Kein Karten-Canvas gefunden').not.toBeNull();
    expect(drawn!.width).toBeGreaterThan(200);
    expect(drawn!.opaque, 'Karte ist leer').toBeGreaterThan(100);
    expect(drawn!.colors, 'Karte zeigt nur eine Farbe').toBeGreaterThan(40);

    // Auswahl wechseln und per Schnellreise umziehen.
    const first = await run(page, (c) => (c.ui.get('map') as any).known[(c.ui.get('map') as any).selected].id);
    await page.keyboard.press('KeyS');
    await page.waitForTimeout(300);
    const second = await run(page, (c) => (c.ui.get('map') as any).known[(c.ui.get('map') as any).selected].id);
    expect(second).not.toBe(first);

    await run(page, (c) => {
      const screen: any = c.ui.get('map');
      const index = screen.known.findIndex((a: any) => a.id === 'flusshafen');
      screen.selected = index;
      screen.handleAction('confirm');
    });
    await page.waitForTimeout(900);
    expect(await run(page, (c) => c.game.world.areaId), 'Schnellreise fehlgeschlagen').toBe('flusshafen');

    await page.screenshot({ path: 'tests/e2e/shots/karte.png' });
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
