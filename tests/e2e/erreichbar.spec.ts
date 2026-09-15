import { test, expect, type ConsoleMessage } from '@playwright/test';

/**
 * Durchquerbarkeit der ganzen Region.
 *
 * Prueft mit einer Flutfuellung ueber das Belegungsgitter, ob man vom
 * Startpunkt des Spiels aus wirklich in jedes Gebiet laufen kann. Reine
 * Sichtpruefung reicht dafuer nicht: eine Heckenreihe ohne Durchlass, ein
 * zugestellter Stollen oder eine Sperre ohne Umweg sehen auf einem
 * Bildschirmfoto unauffaellig aus und machen die Strecke trotzdem dicht.
 *
 * Der Test bildet das Spiel nach: ein Knoten ist ein Paar aus Gebiet und
 * Ankunftspunkt. Von dort wird geflutet, und jeder erreichbare Uebergang
 * und jede erreichbare Tuer fuehrt zu einem neuen Knoten. Eine Sperre wie
 * die auf Route 1 ist damit erlaubt - solange ein Umweg existiert.
 *
 * Die Fuellung beruecksichtigt den Spielerradius (0,38 m): eine Luecke von
 * einer Gitterzelle ist fuer die Figur keine Luecke.
 */

interface AreaLinks {
  /** Je Spawnpunkt die von dort erreichbaren Ziele. */
  reachable: Record<string, { to: string; spawn: string; label: string }[]>;
  /** Ziele, die von keinem einzigen Spawnpunkt aus erreichbar sind. */
  unreachable: string[];
}

test('die ganze Region ist vom Spielstart aus begehbar', async ({ page }) => {
  test.setTimeout(480_000);
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

  const graph: Record<string, AreaLinks> = {};
  for (const id of ids) {
    graph[id] = await page.evaluate(async (areaId: string) => {
      const c = (window as any).__CONTROLLER__;
      c.game.enterArea(areaId, 'default');
      await new Promise((r) => setTimeout(r, 40));
      const area = c.game.world.area;
      const grid = area.collision;
      const cols = grid.cols;
      const rows = grid.rows;

      // Begehbarkeit mit Spielerradius: eine Zelle zaehlt nur als frei,
      // wenn auch ihre Nachbarn im Radius frei sind.
      const pad = Math.ceil(0.38 / grid.cellSize);
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

      /** Naechstgelegene freie Zelle zu einem Weltpunkt, sonst -1. */
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

      const fill = (start: number): Uint8Array => {
        const seen = new Uint8Array(cols * rows);
        if (start < 0) return seen;
        const queue = [start];
        seen[start] = 1;
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
        return seen;
      };

      // Alle Ziele des Gebietes: Uebergaenge und Haustueren.
      const targets: { to: string; spawn: string; label: string; x: number; z: number }[] = [];
      for (const conn of area.data.connections) {
        const t = conn.trigger;
        targets.push({
          to: conn.to, spawn: conn.spawnPoint,
          label: `Uebergang nach '${conn.to}'`,
          x: t.x + t.width / 2, z: t.z + t.depth / 2,
        });
      }
      for (const door of area.doors) {
        targets.push({
          to: door.area, spawn: door.spawnPoint,
          label: `Tuer '${door.label}'`, x: door.x, z: door.z,
        });
      }

      const reachable: Record<string, { to: string; spawn: string; label: string }[]> = {};
      const hit = new Set<number>();
      for (const point of area.data.spawnPoints) {
        const seen = fill(nearestFree(point.pos[0], point.pos[1]));
        const list: { to: string; spawn: string; label: string }[] = [];
        targets.forEach((target, index) => {
          const cell = nearestFree(target.x, target.z);
          if (cell >= 0 && seen[cell]) {
            list.push({ to: target.to, spawn: target.spawn, label: target.label });
            hit.add(index);
          }
        });
        reachable[point.id] = list;
      }

      const unreachable = targets
        .map((t, i) => (hit.has(i) ? null : `${areaId}: ${t.label} von keinem Ankunftspunkt aus erreichbar`))
        .filter((x): x is string => x !== null);
      return { reachable, unreachable };
    }, id);
  }

  // 1. Jeder Uebergang und jede Tuer muss von irgendeinem Ankunftspunkt
  //    des eigenen Gebietes aus erreichbar sein.
  const zugebaut = Object.values(graph).flatMap((g) => g.unreachable);
  expect(zugebaut, zugebaut.join('\n')).toEqual([]);

  // 2. Vom Spielstart aus muss man in jedes Gebiet kommen. Das faengt
  //    Sperren ohne Umweg ab - sie sind erlaubt, Sackgassen nicht.
  const besucht = new Set<string>();
  const queue: [string, string][] = [['startdorf', 'default']];
  const gesehen = new Set<string>(['startdorf|default']);
  while (queue.length > 0) {
    const [areaId, spawnId] = queue.shift()!;
    besucht.add(areaId);
    const links = graph[areaId];
    if (!links) continue;
    // Unbekannter Ankunftspunkt: das Gebiet meldet ihn nicht, also von
    // 'default' ausgehen - so verhaelt sich auch das Spiel.
    const list = links.reachable[spawnId] ?? links.reachable.default ?? [];
    for (const target of list) {
      const key = `${target.to}|${target.spawn}`;
      if (gesehen.has(key)) continue;
      gesehen.add(key);
      queue.push([target.to, target.spawn]);
    }
  }

  const fehlend = ids.filter((id) => !besucht.has(id));
  expect(fehlend, `Vom Start aus nicht erreichbar: ${fehlend.join(', ')}`).toEqual([]);

  // 3. Die Sperre auf Route 1 muss auch wirklich sperren. Ohne diese
  //    Pruefung wuerde eine Luecke im Zaun unbemerkt bleiben: der Weg
  //    waere weiterhin begehbar und die Grube nur noch Zierde.
  const vonStartdorf = graph.route_1!.reachable.from_startdorf ?? [];
  const ziele = vonStartdorf.map((t) => t.to);
  expect(ziele, 'Der Stollenmund ist von Sueden nicht erreichbar')
    .toContain('alte_mine');
  expect(ziele, 'Die Sperre auf Route 1 laesst sich umgehen')
    .not.toContain('quellheim');
  expect(errors, errors.join('\n')).toEqual([]);
});
