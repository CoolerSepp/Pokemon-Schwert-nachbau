import { test, expect, type ConsoleMessage } from '@playwright/test';

/**
 * Bewegungsrichtungen.
 *
 * Geprueft wird kamerarelativ: W laeuft von der Kamera weg, S auf sie zu,
 * D nach rechts im Bild, A nach links. Ein Vorzeichenfehler vertauschte
 * frueher A und D.
 */
test('WASD bewegt in die angezeigte Richtung', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/');
  await page.waitForFunction(
    () => Boolean((window as any).__CONTROLLER__), undefined, { timeout: 45_000 },
  );
  await page.waitForTimeout(600);

  // Mehrere Kamerawinkel, damit nicht zufaellig ein Sonderfall stimmt.
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2, 0.7]) {
    for (const [key, axis] of [
      ['KeyW', 'vorwaerts'], ['KeyS', 'rueckwaerts'],
      ['KeyD', 'rechts'], ['KeyA', 'links'],
    ] as const) {
      const before = await page.evaluate((y: number) => {
        const c = (window as any).__CONTROLLER__;
        c.game.enterArea('wildland', 'default');
        const p = c.game.player;
        // Freie Flaeche in der Mitte, damit nichts den Weg versperrt.
        p.teleport(c.game.world.area.data.size[0] / 2, c.game.world.area.data.size[1] / 2, 0);
        c.game.camera.snapBehind(p.x, p.y, p.z, y);
        return { x: p.x, z: p.z };
      }, yaw);
      await page.waitForTimeout(260);

      await page.keyboard.down(key);
      await page.waitForTimeout(1600);
      await page.keyboard.up(key);
      await page.waitForTimeout(120);

      const after = await page.evaluate(() => {
        const p = (window as any).__CONTROLLER__.game.player;
        return { x: p.x, z: p.z };
      });

      const dx = after.x - before.x;
      const dz = after.z - before.z;
      const moved = Math.hypot(dx, dz);
      // Wenig, weil die Testumgebung nur wenige Bilder pro Sekunde
      // schafft. Entscheidend ist hier die Richtung, nicht die Strecke.
      expect(moved, `${axis}: keine Bewegung bei Kamerawinkel ${yaw.toFixed(2)}`)
        .toBeGreaterThan(0.08);

      // Sollrichtungen aus dem Kamerawinkel.
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const rx = -fz;
      const rz = fx;
      const want = {
        vorwaerts: [fx, fz], rueckwaerts: [-fx, -fz],
        rechts: [rx, rz], links: [-rx, -rz],
      }[axis]!;

      // Skalarprodukt der normierten Richtungen: 1 = exakt richtig.
      const dot = (dx / moved) * want[0]! + (dz / moved) * want[1]!;
      expect(dot, `${axis} bei Kamerawinkel ${yaw.toFixed(2)}: Bewegung (${dx.toFixed(2)}, ${dz.toFixed(2)}), erwartet Richtung (${want[0]!.toFixed(2)}, ${want[1]!.toFixed(2)})`)
        .toBeGreaterThan(0.85);
    }
  }

  expect(errors, `Fehler in der Konsole: ${errors.join(' | ')}`).toEqual([]);
});
