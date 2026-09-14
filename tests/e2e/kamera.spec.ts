import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';

/**
 * Prueft die freie 360-Grad-Kamera: Ziehen mit der Maus, Tastensteuerung,
 * Neigung nach oben und unten sowie das Zuruecksetzen hinter die Figur.
 */
async function waitForGame(page: Page): Promise<void> {
  await page.waitForFunction(
    () => Boolean((window as unknown as { __CONTROLLER__?: unknown }).__CONTROLLER__),
    undefined, { timeout: 45_000 },
  );
  await page.waitForTimeout(600);
}

async function run<T>(page: Page, fn: (c: any) => T): Promise<T> {
  return page.evaluate((src) => {
    const c = (window as any).__CONTROLLER__;
    // eslint-disable-next-line no-new-func
    return new Function('c', `return (${src})(c);`)(c);
  }, fn.toString()) as Promise<T>;
}

test('Kamera laesst sich frei um 360 Grad drehen', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/');
  await waitForGame(page);
  await run(page, (c) => { c.game.enterArea('startdorf', 'default'); });
  await page.waitForTimeout(800);

  const startYaw = await run(page, (c) => c.game.camera.yawAngle);

  // Ziehen mit der linken Maustaste dreht die Kamera.
  const box = await page.locator('#game-canvas').boundingBox();
  expect(box).not.toBeNull();
  const cx = box!.x + box!.width / 2;
  const cy = box!.y + box!.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) await page.mouse.move(cx + i * 30, cy);
  await page.mouse.up();
  await page.waitForTimeout(300);

  const draggedYaw = await run(page, (c) => c.game.camera.yawAngle);
  expect(Math.abs(draggedYaw - startYaw), 'Ziehen hat die Kamera nicht gedreht')
    .toBeGreaterThan(0.3);

  // Volle Umdrehung: der Blickwinkel muss jede Richtung erreichen koennen.
  // Gemessen wird die aufsummierte Drehung, damit der Test nicht von der
  // Bildrate abhaengt (die Maus liefert Pixel, keine Sekunden).
  let total = 0;
  let last = await run(page, (c) => c.game.camera.yawAngle);
  const quarters = new Set<string>();
  for (let stroke = 0; stroke < 6; stroke++) {
    await page.mouse.move(cx - 400, cy);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(cx - 400 + i * 100, cy);
    await page.mouse.up();
    await page.waitForTimeout(120);
    const yaw = await run(page, (c) => c.game.camera.yawAngle);
    // Auf kuerzestem Weg aufsummieren, sonst springt der Wert bei +/-PI.
    total += Math.abs(Math.atan2(Math.sin(yaw - last), Math.cos(yaw - last)));
    last = yaw;
    quarters.add(String(Math.floor(((yaw + Math.PI * 3) % (Math.PI * 2)) / (Math.PI / 2))));
  }
  expect(total, 'Kamera schafft keine volle Umdrehung').toBeGreaterThan(Math.PI * 2);
  expect(quarters.size, 'Kamera erreicht nicht alle Blickrichtungen').toBe(4);

  // Neigung: nach oben und nach unten, jeweils begrenzt.
  await page.keyboard.down('PageUp');
  await page.waitForTimeout(900);
  await page.keyboard.up('PageUp');
  const pitchUp = await run(page, (c) => c.game.camera.pitchAngle);
  await page.keyboard.down('PageDown');
  await page.waitForTimeout(1400);
  await page.keyboard.up('PageDown');
  const pitchDown = await run(page, (c) => c.game.camera.pitchAngle);
  expect(pitchDown, 'Neigung reagiert nicht').toBeGreaterThan(pitchUp);
  expect(pitchUp).toBeGreaterThanOrEqual(-0.6);
  expect(pitchDown).toBeLessThanOrEqual(1.3);

  // Zuruecksetzen richtet die Kamera hinter die Figur aus.
  await run(page, (c) => { c.game.player.teleport(c.game.player.x, c.game.player.z, 1.2); });
  await page.keyboard.press('KeyR');
  // Auf das Ende der Ausrichtung warten statt auf eine feste Zeit: das
  // Zuruecksetzen ist gedaempft und braucht ein paar Bilder. Dieser Rechner
  // rendert je nach Gebiet nur wenige Bilder je Sekunde - mit fester
  // Wartezeit meldete der Test eine halb fertige Drehung als Fehler.
  await page.waitForFunction(() => {
    const c = (window as any).__CONTROLLER__;
    const diff = c.game.camera.yawAngle - c.game.player.yaw;
    return Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff))) < 0.05;
  }, undefined, { timeout: 20_000 }).catch(() => undefined);
  const after = await run(page, (c) => ({
    yaw: c.game.camera.yawAngle, facing: c.game.player.yaw,
  }));
  const delta = Math.abs(Math.atan2(
    Math.sin(after.yaw - after.facing), Math.cos(after.yaw - after.facing),
  ));
  expect(delta, 'Kamera wurde nicht hinter die Figur gesetzt').toBeLessThan(0.1);

  expect(errors, `Fehler in der Konsole: ${errors.join(' | ')}`).toEqual([]);
});
