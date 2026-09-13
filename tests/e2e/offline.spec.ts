import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Prueft die Offline-Fassung so, wie sie ausgeliefert wird: als einzelne
 * HTML-Datei, geoeffnet ueber "file://" - ohne Server, ohne Netzwerk.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const releaseDir = path.resolve(here, '../../release');
const htmlPath = path.join(releaseDir, 'Aetheria.html');
const zipPath = path.join(releaseDir, 'Aetheria-Offline.zip');
const fileUrl = pathToFileURL(htmlPath).href;

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => {
    errors.push(`Fehlgeschlagene Anfrage: ${req.url()} (${req.failure()?.errorText})`);
  });
  return errors;
}

async function waitForGame(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __CONTROLLER__?: unknown }).__CONTROLLER__),
    undefined, { timeout: 60_000 },
  );
  await page.waitForTimeout(500);
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

test.describe('Offline-Fassung', () => {
  test.skip(
    !fs.existsSync(htmlPath),
    'release/Aetheria.html fehlt - "npm run build:offline" ausfuehren',
  );

  test('das ZIP-Archiv laesst sich entpacken und die entpackte Datei spielen', async ({ page }) => {
    test.setTimeout(180_000);
    expect(fs.existsSync(zipPath), 'Aetheria-Offline.zip fehlt').toBe(true);

    // Genau der Weg der spielenden Person: Archiv entpacken, Datei oeffnen.
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'aetheria-zip-'));
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', target]);
    const entries = fs.readdirSync(target).sort();
    expect(entries).toEqual(['Aetheria.html', 'LIESMICH.txt']);

    const extracted = path.join(target, 'Aetheria.html');
    expect(fs.readFileSync(extracted).equals(fs.readFileSync(htmlPath))).toBe(true);

    const errors = collectErrors(page);
    await page.goto(pathToFileURL(extracted).href);
    await waitForGame(page);
    await expect(page.locator('#boot-screen')).toHaveClass(/hidden/, { timeout: 30_000 });

    const state = await run(page, (c) => ({
      area: c.game.world.areaId,
      running: c.game.isRunning,
      arten: c.game.data.species.size,
    }));
    expect(state.area).toBe('home_bedroom');
    expect(state.running).toBe(true);
    expect(state.arten).toBe(97);

    fs.rmSync(target, { recursive: true, force: true });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('weist von den Einstiegsdateien im Projekt auf die Spielfassung hin', async ({ page }) => {
    test.setTimeout(120_000);
    const projectRoot = path.resolve(here, '../..');

    // index.html ist die Entwicklerdatei: ueber file:// laedt sie keine
    // Module und muss deshalb den Weg zur spielbaren Datei zeigen.
    await page.goto(pathToFileURL(path.join(projectRoot, 'index.html')).href);
    await page.waitForTimeout(1200);
    await expect(page.locator('#boot-screen')).toContainText('release/Aetheria.html');
    const link = page.locator('#boot-screen a');
    await expect(link).toHaveAttribute('href', 'release/Aetheria.html');

    // SPIELEN.html leitet direkt weiter.
    await page.goto(pathToFileURL(path.join(projectRoot, 'SPIELEN.html')).href);
    await waitForGame(page);
    expect(await run(page, (c) => c.game.world.areaId)).toBe('home_bedroom');
  });

  test('enthaelt alles in einer einzigen Datei', () => {
    const html = fs.readFileSync(htmlPath, 'utf8');
    expect(html).not.toContain('type="module"');
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).not.toMatch(/<link[^>]+rel="stylesheet"/);
    expect(html).not.toMatch(/<link[^>]+rel="modulepreload"/);
    // Das Spiel steckt vollstaendig im Dokument.
    expect(html.length).toBeGreaterThan(500_000);
  });

  test('startet per Doppelklick aus dem Dateisystem', async ({ page }) => {
    test.setTimeout(180_000);
    const errors = collectErrors(page);
    await page.goto(fileUrl);
    await waitForGame(page);

    await expect(page.locator('#boot-screen')).toHaveClass(/hidden/, { timeout: 30_000 });

    const state = await run(page, (c) => ({
      protokoll: window.location.protocol,
      area: c.game.world.areaId,
      mode: c.game.mode,
      running: c.game.isRunning,
      arten: c.game.data.species.size,
      gebiete: c.game.data.areas.size,
      fehler: (window as any).__CONTROLLER__ ? 0 : 1,
    }));
    expect(state.protokoll).toBe('file:');
    expect(state.area).toBe('home_bedroom');
    expect(state.mode).toBe('world');
    expect(state.running).toBe(true);
    expect(state.arten).toBe(97);
    expect(state.gebiete).toBe(59);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('laesst sich ohne Server spielen und speichern', async ({ page }) => {
    test.setTimeout(240_000);
    const errors = collectErrors(page);
    await page.goto(fileUrl);
    await waitForGame(page);

    // Starter waehlen.
    await run(page, (c) => { c.game.enterArea('lab_interior', 'entrance'); });
    await page.waitForTimeout(400);
    await run(page, (c) => { c.runAction({ kind: 'chooseStarter' }); });
    await page.waitForTimeout(700);
    await run(page, (c) => {
      const screen: any = c.ui.get('starter');
      screen.handleAction('confirm');
      screen.handleAction('confirm');
    });
    await page.waitForTimeout(600);
    expect(await run(page, (c) => c.player.party.length)).toBe(1);

    // Route mit wilden Kreaturen und ein vollstaendiger Kampf.
    await run(page, (c) => {
      c.game.enterArea('route_1', 'from_startdorf');
      c.settings.set('battleSpeed', 'instant');
    });
    await page.waitForTimeout(1000);
    expect(await run(page, (c) => c.wild.count)).toBeGreaterThan(3);

    await run(page, (c) => { c.startWildBattleDirect('nagezahn', 3, false); });
    await page.waitForTimeout(1000);
    expect(await run(page, (c) => c.game.mode)).toBe('battle');

    for (let i = 0; i < 400; i++) {
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
      await page.waitForTimeout(70);
    }
    await page.waitForTimeout(1200);
    expect(await run(page, (c) => c.game.mode), 'Kampf endete nicht').toBe('world');

    // Speichern - auf file:// uebernimmt der localStorage-Pfad.
    await run(page, (c) => {
      c.player.addMoney(4321);
      c.player.setFlag('offlineTest', true);
    });
    const saved = await page.evaluate(async () => {
      const c = (window as any).__CONTROLLER__;
      return c.saveGame('slot1');
    });
    expect(saved, 'Speichern fehlgeschlagen').toBe(true);

    const before = await run(page, (c) => ({
      money: c.player.money,
      party: c.player.party.length,
    }));

    // Seite neu laden und den Stand zurueckholen.
    await page.reload();
    await waitForGame(page);
    const loaded = await page.evaluate(async () => {
      const c = (window as any).__CONTROLLER__;
      return c.loadGame('slot1');
    });
    expect(loaded, 'Laden fehlgeschlagen').toBe(true);
    await page.waitForTimeout(800);

    const after = await run(page, (c) => ({
      money: c.player.money,
      party: c.player.party.length,
      flag: c.player.hasFlag('offlineTest'),
      area: c.game.world.areaId,
    }));
    expect(after.money).toBe(before.money);
    expect(after.party).toBe(before.party);
    expect(after.flag).toBe(true);
    expect(after.area).toBeTruthy();

    await page.screenshot({ path: 'tests/e2e/shots/offline.png' });
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
