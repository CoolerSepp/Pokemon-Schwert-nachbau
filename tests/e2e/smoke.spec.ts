import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

/** Konsolenfehler einsammeln - eine leere Liste ist Teil der Erfolgsbedingung. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  return errors;
}

/** Wartet, bis die Spielinstanz bereitsteht. */
async function waitForGame(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __GAME__?: unknown }).__GAME__),
    undefined,
    { timeout: 45_000 },
  );
}

test.describe('Start und Weltdarstellung', () => {
  test('startet ohne Konsolenfehler und rendert die Welt', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForGame(page);

    // Ladebildschirm muss verschwinden.
    await expect(page.locator('#boot-screen')).toHaveClass(/hidden/, { timeout: 20_000 });

    const state = await page.evaluate(() => {
      const game = (window as unknown as { __GAME__: any }).__GAME__;
      return {
        mode: game.mode,
        running: game.isRunning,
        areaId: game.world.areaId,
        speciesCount: game.creatures ? 1 : 0,
        objectCount: game.world.area?.objectCount ?? 0,
        sceneChildren: game.world.scene.children.length,
      };
    });

    expect(state.mode).toBe('world');
    expect(state.running).toBe(true);
    expect(state.areaId).toBe('home_bedroom');
    expect(state.sceneChildren).toBeGreaterThan(3);

    // Einige Bilder laufen lassen und Renderstatistik pruefen.
    await page.waitForTimeout(1500);
    const stats = await page.evaluate(() => {
      const game = (window as unknown as { __GAME__: any }).__GAME__;
      return {
        frames: game.loop.frames,
        drawCalls: game.renderer.stats.drawCalls,
        triangles: game.renderer.stats.triangles,
        fps: game.renderer.stats.fps,
      };
    });
    expect(stats.frames).toBeGreaterThan(10);
    expect(stats.drawCalls).toBeGreaterThan(0);
    expect(stats.triangles).toBeGreaterThan(100);

    expect(errors, `Konsolenfehler:\n${errors.join('\n')}`).toEqual([]);
  });

  test('bewegt den Spieler mit WASD und respektiert Waende', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForGame(page);
    await page.waitForTimeout(600);

    const before = await page.evaluate(() => {
      const g = (window as unknown as { __GAME__: any }).__GAME__;
      return { x: g.player.x, z: g.player.z };
    });

    await page.locator('#game-canvas').click({ position: { x: 400, y: 300 } });
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(900);
    await page.keyboard.up('KeyW');
    await page.waitForTimeout(200);

    const after = await page.evaluate(() => {
      const g = (window as unknown as { __GAME__: any }).__GAME__;
      return {
        x: g.player.x, z: g.player.z,
        area: g.world.areaId,
        width: g.world.area.data.size[0],
        depth: g.world.area.data.size[1],
        blocked: g.world.area.collision.isBlocked(g.player.x, g.player.z),
      };
    });

    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    expect(moved, 'Spieler hat sich nicht bewegt').toBeGreaterThan(0.5);
    // Nie in einer Wand landen und nie das Gebiet verlassen.
    expect(after.blocked).toBe(false);
    expect(after.x).toBeGreaterThan(0);
    expect(after.z).toBeGreaterThan(0);
    expect(after.x).toBeLessThan(after.width);
    expect(after.z).toBeLessThan(after.depth);

    expect(errors, `Konsolenfehler:\n${errors.join('\n')}`).toEqual([]);
  });

  test('laedt jedes Gebiet fehlerfrei', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForGame(page);

    const result = await page.evaluate(() => {
      const game = (window as unknown as { __GAME__: any }).__GAME__;
      const ids: string[] = game.data.areas.ids();
      const loaded: { id: string; objects: number; blocked: number; error: string | null }[] = [];
      for (const id of ids) {
        try {
          game.enterArea(id, 'default');
          const area = game.world.area;
          loaded.push({
            id,
            objects: area.objectCount,
            blocked: area.collision.blockedRatio,
            error: null,
          });
        } catch (err) {
          loaded.push({ id, objects: 0, blocked: 0, error: String(err) });
        }
      }
      return loaded;
    });

    const failed = result.filter((r) => r.error !== null);
    expect(failed, `Fehlgeschlagene Gebiete: ${JSON.stringify(failed, null, 2)}`).toEqual([]);
    expect(result.length).toBeGreaterThanOrEqual(10);

    // Kein Gebiet darf komplett zugestellt sein - das waere nicht begehbar.
    const impassable = result.filter((r) => r.blocked > 0.55);
    expect(impassable, `Zu stark blockierte Gebiete: ${JSON.stringify(impassable)}`).toEqual([]);
    expect(errors, `Konsolenfehler:\n${errors.join('\n')}`).toEqual([]);
  });
});
