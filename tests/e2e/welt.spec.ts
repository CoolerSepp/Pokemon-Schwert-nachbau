import { test, expect, type ConsoleMessage } from '@playwright/test';

/**
 * Weltpruefung ueber alle Gebiete.
 *
 * Baut jedes Gebiet wirklich auf und prueft, ob man sich darin bewegen kann:
 * Startpunkte frei, Uebergaenge erreichbar, Figuren und Gegenstaende nicht in
 * Hindernissen, Boden nicht unter Wasser.
 */
test('jedes Gebiet ist begehbar und in sich stimmig', async ({ page }) => {
  test.setTimeout(420_000);
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/');
  await page.waitForFunction(
    () => Boolean((window as any).__CONTROLLER__), undefined, { timeout: 45_000 },
  );
  await page.waitForTimeout(500);

  const ids = await page.evaluate(
    () => ((window as any).__CONTROLLER__.game.data.areas.all() as any[]).map((a) => a.id),
  );
  expect(ids.length).toBeGreaterThan(50);

  const problems: string[] = [];
  for (const id of ids) {
    const found = await page.evaluate(async (areaId: string) => {
      const c = (window as any).__CONTROLLER__;
      c.game.enterArea(areaId, 'default');
      await new Promise((r) => setTimeout(r, 60));
      const a = c.game.world.area;
      const out: string[] = [];
      const free = (x: number, z: number) => !a.collision.isBlocked(x, z);
      /**
       * Liefert, wie weit man von einem Punkt weg muss, um frei zu stehen.
       * Unendlich, wenn die Umgebung vollstaendig zugebaut ist - dann gibt
       * findFreeNear den Ausgangspunkt unveraendert zurueck.
       */
      const escape = (x: number, z: number): number => {
        const [fx, fz] = a.collision.findFreeNear(x, z, 0.38);
        if (a.collision.isBlocked(fx, fz)) return Infinity;
        return Math.hypot(fx - x, fz - z);
      };

      for (const sp of a.data.spawnPoints ?? []) {
        const [x, z] = sp.pos;
        if (x < 0 || z < 0 || x > a.data.size[0] || z > a.data.size[1]) {
          out.push(`Startpunkt ${sp.id} liegt ausserhalb des Gebiets`);
          continue;
        }
        // Direkt belegt ist zulaessig, solange in der Naehe Platz ist -
        // genau das macht das Spiel beim Betreten auch.
        const dist = escape(x, z);
        if (dist > 3.5) out.push(`Startpunkt ${sp.id} steckt fest`);
        const [fx, fz] = a.collision.findFreeNear(x, z, 0.38);
        if (!a.data.indoor && a.field.isUnderWater(fx, fz)) {
          out.push(`Startpunkt ${sp.id} liegt im Wasser`);
        }
      }

      for (const conn of a.data.connections ?? []) {
        const t = conn.trigger;
        const cx = t.x + t.width / 2;
        const cz = t.z + t.depth / 2;
        if (!free(cx, cz)) out.push(`Uebergang nach ${conn.to} ist zugebaut`);
        if (!c.game.data.areas.tryGet(conn.to)) out.push(`Uebergang nach ${conn.to} fuehrt ins Leere`);
      }

      for (const n of a.data.npcs ?? []) {
        if (escape(n.pos[0], n.pos[1]) > 3.5) {
          out.push(`Figur ${n.id} steckt in einem Hindernis`);
        }
      }

      for (const it of a.data.items ?? []) {
        if (escape(it.pos[0], it.pos[1]) > 3.5) {
          out.push(`Gegenstand ${it.id} ist unerreichbar`);
        }
      }
      return out;
    }, id);
    for (const p of found) problems.push(`${id}: ${p}`);
  }

  expect(problems, problems.join('\n')).toEqual([]);
  expect(errors, `Fehler in der Konsole: ${errors.join(' | ')}`).toEqual([]);
});
