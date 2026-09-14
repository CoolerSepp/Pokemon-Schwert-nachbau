import { test, expect, type ConsoleMessage } from '@playwright/test';

/**
 * Durchquerbarkeit aller Gebiete.
 *
 * Prueft mit einer Flutfuellung ueber das Belegungsgitter, ob man vom
 * Startpunkt eines Gebietes tatsaechlich zu jedem Ausgang und zu jeder
 * Haustuer laufen kann. Reine Sichtpruefung reicht dafuer nicht: eine
 * Heckenreihe ohne Durchlass oder ein zugestellter Pfad sieht auf einem
 * Bildschirmfoto unauffaellig aus und macht die Strecke trotzdem dicht.
 *
 * Die Fuellung beruecksichtigt den Spielerradius (0,38 m): eine Luecke von
 * einer Gitterzelle ist fuer die Figur keine Luecke.
 */
test('jedes Gebiet ist von Eingang zu Ausgang durchquerbar', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/');
  await page.waitForFunction(
    () => Boolean((window as any).__CONTROLLER__), undefined, { timeout: 45_000 },
  );
  await page.waitForTimeout(500);

  const ids: string[] = await page.evaluate(
    () => ((window as any).__CONTROLLER__.game.data.areas.all() as any[]).map((a) => a.id),
  );
  expect(ids.length).toBeGreaterThan(50);

  const problems: string[] = [];
  for (const id of ids) {
    const found: string[] = await page.evaluate(async (areaId: string) => {
      const c = (window as any).__CONTROLLER__;
      c.game.enterArea(areaId, 'default');
      await new Promise((r) => setTimeout(r, 40));
      const area = c.game.world.area;
      const grid = area.collision;
      const out: string[] = [];

      // Begehbarkeit mit Spielerradius: eine Zelle zaehlt nur als frei,
      // wenn auch ihre Nachbarn im Radius frei sind.
      const pad = Math.ceil(0.38 / grid.cellSize);
      const cols = grid.cols;
      const rows = grid.rows;
      const free = new Uint8Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        for (let cc = 0; cc < cols; cc++) {
          let ok = true;
          for (let dr = -pad; dr <= pad && ok; dr++) {
            for (let dc = -pad; dc <= pad && ok; dc++) {
              if (grid.isBlockedCell(cc + dc, r + dr)) ok = false;
            }
          }
          free[r * cols + cc] = ok ? 1 : 0;
        }
      }

      /** Naechstgelegene freie Zelle zu einem Weltpunkt. */
      const nearestFree = (x: number, z: number): number => {
        const c0 = grid.colOf(x);
        const r0 = grid.rowOf(z);
        for (let radius = 0; radius < 24; radius++) {
          for (let dr = -radius; dr <= radius; dr++) {
            for (let dc = -radius; dc <= radius; dc++) {
              if (Math.max(Math.abs(dr), Math.abs(dc)) !== radius) continue;
              const cc = c0 + dc;
              const rr = r0 + dr;
              if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue;
              if (free[rr * cols + cc] === 1) return rr * cols + cc;
            }
          }
        }
        return -1;
      };

      const spawn = area.getSpawnPoint('default');
      const startCell = nearestFree(spawn.x, spawn.z);
      if (startCell < 0) {
        out.push(`${areaId}: Startpunkt liegt vollstaendig zugebaut`);
        return out;
      }

      const seen = new Uint8Array(cols * rows);
      const queue = [startCell];
      seen[startCell] = 1;
      for (let head = 0; head < queue.length; head++) {
        const cell = queue[head]!;
        const r = Math.floor(cell / cols);
        const cc = cell - r * cols;
        const step = (nc: number, nr: number) => {
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) return;
          const idx = nr * cols + nc;
          if (seen[idx] || free[idx] === 0) return;
          seen[idx] = 1;
          queue.push(idx);
        };
        step(cc + 1, r); step(cc - 1, r); step(cc, r + 1); step(cc, r - 1);
      }

      const reachable = (x: number, z: number, what: string) => {
        const cell = nearestFree(x, z);
        if (cell < 0) { out.push(`${areaId}: ${what} vollstaendig zugebaut`); return; }
        if (!seen[cell]) out.push(`${areaId}: ${what} nicht vom Startpunkt aus erreichbar`);
      };

      for (const conn of area.data.connections) {
        const t = conn.trigger;
        reachable(t.x + t.width / 2, t.z + t.depth / 2, `Uebergang nach '${conn.to}'`);
      }
      for (const door of area.doors) {
        reachable(door.x, door.z, `Tuer '${door.label}'`);
      }
      return out;
    }, id);
    problems.push(...found);
  }

  expect(problems, problems.join('\n')).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});
