import { test, expect, type ConsoleMessage } from '@playwright/test';

/**
 * Prueft, dass Zaeune tatsaechlich sperren.
 *
 * Der Test laeuft nicht ueber die Tastatur, sondern setzt die Figur direkt
 * an jedes Zaunsegment und prueft das Belegungsgitter: so wird jede Luecke
 * gefunden, nicht nur die zufaellig getroffene.
 */
test('Zaeune sind keine Luecken', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/');
  await page.waitForFunction(
    () => Boolean((window as any).__CONTROLLER__), undefined, { timeout: 45_000 },
  );
  await page.waitForTimeout(500);

  for (const areaId of ['startdorf', 'quellheim']) {
    await page.evaluate((id) => {
      (window as any).__CONTROLLER__.game.enterArea(id, 'default');
    }, areaId);
    await page.waitForTimeout(700);

    const result = await page.evaluate(() => {
      const c = (window as any).__CONTROLLER__;
      const area = c.game.world.area;
      const radius = 0.38;
      const fences = (area.data.props ?? []).filter((p: any) => p.kind === 'fence');
      const through: number[][] = [];

      // Fuer jedes Zaunsegment und jede Luecke dazwischen: von einer Seite
      // gegen den Zaun laufen und pruefen, ob man auf der anderen Seite
      // herauskommt. Genau das war der Fehler - die Segmente standen zu
      // weit auseinander.
      // Geprueft werden die Segmentmitten und vor allem die Stossstellen
      // zwischen benachbarten Segmenten - dort klafften die Luecken. Die
      // offenen Enden einer Zaunreihe sind kein Fehler: dort geht man
      // absichtlich herum.
      const samples: [number, number, number][] = [];
      for (const f of fences) {
        samples.push([f.pos[0], f.pos[1], f.rotation ?? 0]);
        for (const g of fences) {
          if (g === f) continue;
          if (Math.abs((g.rotation ?? 0) - (f.rotation ?? 0)) > 0.01) continue;
          const d = Math.hypot(g.pos[0] - f.pos[0], g.pos[1] - f.pos[1]);
          if (d < 0.01 || d > 8.0) continue;
          samples.push([
            (f.pos[0] + g.pos[0]) / 2, (f.pos[1] + g.pos[1]) / 2, f.rotation ?? 0,
          ]);
        }
      }

      for (const [px, pz, rot] of samples) {
        // Normale des Zauns (senkrecht zur Laengsachse).
        const nx = Math.sin(rot);
        const nz = Math.cos(rot);
        let x = px + nx * 1.4;
        let z = pz + nz * 1.4;
        if (area.collision.isBlocked(x, z)) continue;   // Startpunkt selbst belegt
        for (let step = 0; step < 28; step++) {
          const [rx, rz] = area.collision.resolveCircle(x - nx * 0.1, z - nz * 0.1, radius);
          x = rx; z = rz;
        }
        // Auf welcher Seite des Zauns steht die Figur jetzt?
        const side = (x - px) * nx + (z - pz) * nz;
        if (side < -0.05) through.push([Math.round(px * 10) / 10, Math.round(pz * 10) / 10]);
      }
      return {
        area: area.data.id, fences: fences.length,
        total: through.length, holes: through.slice(0, 10),
      };
    });

    expect(result.fences, `${areaId}: keine Zaeune gefunden`).toBeGreaterThan(10);
    expect(result.total, `${areaId}: Luecken im Zaun bei ${JSON.stringify(result.holes)}`).toBe(0);
  }

  expect(errors, `Fehler in der Konsole: ${errors.join(' | ')}`).toEqual([]);
});
