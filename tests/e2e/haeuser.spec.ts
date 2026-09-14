import { test, expect, type ConsoleMessage } from '@playwright/test';

/**
 * Jedes sichtbare Gebaeude muss betretbar sein.
 *
 * Geprueft wird nicht nur, dass ein Innenraum eingetragen ist, sondern dass
 * die Tuer im Spiel erreichbar ist, der Raum laedt und der Rueckweg an der
 * richtigen Stelle ankommt.
 */
test('alle Gebaeude lassen sich betreten und wieder verlassen', async ({ page }) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  page.on('console', (m: ConsoleMessage) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto('/');
  await page.waitForFunction(
    () => Boolean((window as any).__CONTROLLER__), undefined, { timeout: 45_000 },
  );
  await page.waitForTimeout(500);

  // Alle Aussengebiete und ihre Gebaeude einsammeln.
  const outdoor = await page.evaluate(() => {
    const data = (window as any).__CONTROLLER__.constructor;
    const areas = (window as any).__GAMEDATA_AREAS__ as unknown;
    void data; void areas;
    const all = (window as any).__CONTROLLER__.game.data.areas.all() as any[];
    return all.filter((a) => !a.indoor && (a.buildings ?? []).length > 0)
      .map((a) => ({ id: a.id, buildings: (a.buildings ?? []).length }));
  });
  expect(outdoor.length, 'Keine Aussengebiete gefunden').toBeGreaterThan(10);

  const failures: string[] = [];
  for (const area of outdoor) {
    const result = await page.evaluate(async (areaId: string) => {
      const c = (window as any).__CONTROLLER__;
      c.game.enterArea(areaId, 'default');
      await new Promise((r) => setTimeout(r, 120));
      const runtime = c.game.world.area;
      const out: { label: string; problem: string }[] = [];
      const doors = runtime.doors as any[];
      const buildings = runtime.data.buildings ?? [];
      if (doors.length < buildings.length) {
        out.push({ label: areaId, problem: `nur ${doors.length} von ${buildings.length} Tueren` });
      }
      for (const door of doors) {
        // Tuer muss begehbar sein - sonst kommt man nie hin.
        if (runtime.collision.isBlocked(door.x, door.z)) {
          out.push({ label: door.label, problem: 'Tuerfeld ist blockiert' });
          continue;
        }
        const target = c.game.data.areas.tryGet(door.area);
        if (!target) {
          out.push({ label: door.label, problem: `Innenraum ${door.area} fehlt` });
          continue;
        }
        const back = (target.connections ?? []).find((x: any) => x.to === areaId);
        if (!back) {
          out.push({ label: door.label, problem: `${door.area} hat keinen Rueckweg` });
          continue;
        }
        const spawn = (runtime.data.spawnPoints ?? [])
          .find((s: any) => s.id === back.spawnPoint);
        if (!spawn) {
          out.push({ label: door.label, problem: `Rueckkehrpunkt ${back.spawnPoint} fehlt` });
          continue;
        }
        const dist = Math.hypot(spawn.pos[0] - door.x, spawn.pos[1] - door.z);
        if (dist > 12) {
          out.push({ label: door.label, problem: `Rueckkehrpunkt ${dist.toFixed(1)} m von der Tuer` });
        }
      }
      return out;
    }, area.id);
    for (const r of result) failures.push(`${area.id} / ${r.label}: ${r.problem}`);
  }
  expect(failures, failures.join('\n')).toEqual([]);

  // Stichprobe: wirklich hinein- und wieder herausgehen.
  const round = await page.evaluate(async () => {
    const c = (window as any).__CONTROLLER__;
    const log: string[] = [];
    for (const areaId of ['startdorf', 'quellheim', 'flusshafen', 'frostgipfel', 'wildland']) {
      c.game.enterArea(areaId, 'default');
      await new Promise((r) => setTimeout(r, 150));
      for (const door of c.game.world.area.doors as any[]) {
        if (door.requires) continue;
        c.game.enterArea(door.area, door.spawnPoint);
        await new Promise((r) => setTimeout(r, 90));
        const inside = c.game.world.areaId;
        const back = (c.game.world.area.data.connections ?? [])[0];
        c.game.enterArea(back.to, back.spawnPoint);
        await new Promise((r) => setTimeout(r, 90));
        if (inside !== door.area) log.push(`${door.label}: Innenraum nicht geladen`);
        if (c.game.world.areaId !== areaId) log.push(`${door.label}: Rueckweg fuehrt nach ${c.game.world.areaId}`);
      }
    }
    return log;
  });
  expect(round, round.join('\n')).toEqual([]);

  expect(errors, `Fehler in der Konsole: ${errors.join(' | ')}`).toEqual([]);
});
