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

test.describe('Wildland, Wetter und Raids', () => {
  test('zeigt Wetterpartikel und wechselndes Wetter', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForGame(page);

    await run(page, (c) => { c.game.enterArea('wildland', 'from_funkenau'); });
    await page.waitForTimeout(800);

    // Jede Wetterart muss Partikel oder eine bewusst leere Darstellung liefern.
    const perWeather = await run(page, (c) => {
      const out: Record<string, number> = {};
      for (const w of ['clear', 'rain', 'heavyRain', 'thunderstorm', 'snow', 'blizzard', 'sandstorm', 'fog', 'cloudy', 'harshSun']) {
        c.game.world.setWeather(w);
        out[w] = c.game.world.weatherSystem.activeParticles;
      }
      return out;
    });
    expect(perWeather.clear).toBe(0);
    expect(perWeather.rain).toBeGreaterThan(50);
    expect(perWeather.thunderstorm).toBeGreaterThan(50);
    expect(perWeather.snow).toBeGreaterThan(50);
    expect(perWeather.sandstorm).toBeGreaterThan(50);
    expect(perWeather.fog).toBeGreaterThan(20);

    // Die Partikel muessen sich tatsaechlich bewegen. In der Software-
    // Rasterisierung laeuft die Bildwiederholung langsam, deshalb wird auf
    // die Aenderung gewartet statt fest zu schlafen.
    await run(page, (c) => { c.game.world.setWeather('heavyRain'); });
    await page.waitForTimeout(300);
    const moved = await page.waitForFunction(() => {
      const c = (window as unknown as { __CONTROLLER__: any }).__CONTROLLER__;
      const ws = c.game.world.weatherSystem;
      const w = window as unknown as { __RAIN__?: number[] };
      const now = [ws.rainPositions[1], ws.rainPositions[7], ws.rainPositions[13]];
      if (!w.__RAIN__) { w.__RAIN__ = now; return false; }
      return now.some((v, i) => Math.abs(v - w.__RAIN__![i]!) > 0.001);
    }, undefined, { timeout: 15_000 }).catch(() => null);
    expect(moved, 'Regen bewegt sich nicht').not.toBeNull();

    // Innenraeume bleiben trocken.
    await run(page, (c) => { c.game.enterArea('home_bedroom', 'default'); });
    await page.waitForTimeout(500);
    const indoor = await run(page, (c) => c.game.world.weatherSystem.activeParticles);
    expect(indoor).toBe(0);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('baut Energiepunkte auf und spielt einen Raid durch', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForGame(page);

    await run(page, (c) => { c.game.enterArea('wildland', 'from_funkenau'); });
    await page.waitForTimeout(900);

    const dens = await run(page, (c) => ({
      total: c.raids.dens.length,
      active: c.raids.activeCount,
      area: c.game.world.areaId,
      tiers: c.raids.dens.map((d: any) => d.tier),
      bosses: c.raids.dens.map((d: any) => c.raids.bossFor(d)?.species ?? null),
    }));
    expect(dens.area).toBe('wildland');
    expect(dens.total, 'keine Energiepunkte aufgebaut').toBe(5);
    expect(dens.tiers.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(dens.bosses.every((b: string | null) => Boolean(b))).toBe(true);

    // Starkes Team, damit der Raid gewinnbar ist.
    await page.evaluate(() => {
      const c = (window as any).__CONTROLLER__;
      c.player.party.length = 0;
      for (const id of ['panzerwacht', 'forstwaechter', 'infernohorn']) {
        c.player.addCreature(c.game.creatures.create(id, { level: 85, perfectIvs: 6 }));
      }
      c.player.setFlag('giganticUnlocked', true);
    });

    // Ein aktives Nest der Stufe 1 auswaehlen und die Vorschau oeffnen.
    const opened = await run(page, (c) => {
      const den = c.raids.dens.find((d: any) => d.active && !d.cleared);
      if (!den) return null;
      c.player.moneyBefore = c.player.money;
      (window as any).__DEN__ = den.id;
      c.game.player.teleport(den.x, den.z, 0);
      c.runAction({ kind: 'startRaid', den: den.id });
      return { den: den.id, tier: den.tier };
    });
    expect(opened, 'kein aktives Nest gefunden').not.toBeNull();
    await page.waitForTimeout(500);
    expect(await run(page, (c) => c.ui.isOpen('raid'))).toBe(true);

    // Raid starten.
    await run(page, (c) => { (c.ui.get('raid') as any).handleAction('confirm'); });
    await page.waitForTimeout(1200);
    const inBattle = await run(page, (c) => ({
      mode: c.game.mode,
      isRaid: (c as any).battleEngineDebug ?? null,
      shields: c.ui.isOpen('battle'),
    }));
    expect(inBattle.mode, 'Raid-Kampf nicht gestartet').toBe('battle');

    // Kampf ausspielen: immer die erste Attacke.
    //
    // Zwischen zwei Eingaben muss die Kampfanzeige mindestens ein Bild
    // gezeichnet haben, sonst laufen die Eingaben ins Leere. Deshalb wird
    // auf den Bildzaehler gewartet statt auf eine feste Zeit - in der
    // Testumgebung liegen zwischen zwei Bildern mehrere hundert
    // Millisekunden.
    for (let i = 0; i < 320; i++) {
      const done = await run(page, (c) => {
        const screen: any = c.ui.get('battle');
        if (!screen || c.game.mode !== 'battle') return true;
        screen.handleAction('confirm');
        screen.handleAction('confirm');
        return false;
      });
      if (done) break;
      const before = await run(page, (c) => c.game.loop.frames);
      await page.waitForFunction(
        (f) => (window as any).__CONTROLLER__.game.loop.frames > (f as number) + 1,
        before, { timeout: 8000 },
      ).catch(() => undefined);
    }
    await page.waitForTimeout(1500);

    const after = await run(page, (c) => {
      const id = (window as any).__DEN__;
      const den = c.raids.denById(id);
      return {
        mode: c.game.mode,
        cleared: den?.cleared ?? null,
        items: c.player.allItems().length,
        seen: c.player.seenSpecies.size,
      };
    });
    expect(after.mode, 'Raid-Kampf hat nicht geendet').toBe('world');
    expect(after.seen).toBeGreaterThan(0);
    // Mit einem Team auf Stufe 85 muss der Raid gewonnen und das Nest
    // geleert werden; die Beute landet im Beutel.
    expect(after.cleared, 'Nest wurde nicht geleert').toBe(true);
    expect(after.items).toBeGreaterThan(0);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('Debug-Anzeige laesst sich mit F1 umschalten', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForGame(page);

    const overlay = page.locator('.debug-overlay');
    await expect(overlay).toBeHidden();
    await page.keyboard.press('F1');
    await page.waitForTimeout(400);
    await expect(overlay).toBeVisible();
    await expect(overlay).toContainText('FPS');
    await expect(overlay).toContainText('gebiet');
    await page.keyboard.press('F1');
    await page.waitForTimeout(300);
    await expect(overlay).toBeHidden();

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
