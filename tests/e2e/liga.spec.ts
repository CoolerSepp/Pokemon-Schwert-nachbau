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

/**
 * Spielt den laufenden Kampf bis zum Ende durch und waehlt dabei stets eine
 * Attacke mit AP - genau wie eine spielende Person es taete.
 */
async function finishBattle(page: Page, maxSteps = 1200): Promise<boolean> {
  for (let i = 0; i < maxSteps; i++) {
    const done = await run(page, (c) => {
      const screen: any = c.ui.get('battle');
      if (!screen || c.game.mode !== 'battle') return true;
      if (screen.panel === 'moves') {
        const moves = c.game.mode === 'battle' ? screen.ctx.engine.playerActive.moves : [];
        const index = moves.findIndex((m: any) => m.pp > 0);
        screen.selectedMove = index >= 0 ? index : 0;
      }
      screen.handleAction('confirm');
      return false;
    });
    if (done) return true;
    await page.waitForTimeout(60);
  }
  return false;
}

test.describe('Liga und Endspiel', () => {
  test('sperrt die Arena ohne acht Orden und oeffnet sie danach', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForGame(page);

    const gate = await run(page, (c) => {
      c.game.enterArea('ligastadion', 'default');
      const area = c.game.world.area;
      const door = area.doors.find((d: any) => d.area === 'liga_arena');
      if (!door) return null;
      c.game.player.teleport(door.x, door.z, 0);
      const blockedWithout = !c.game.transitionGate(door.requires);
      for (let i = 0; i < 8; i++) c.player.earnBadge(i, `Orden ${i + 1}`);
      // Acht Orden allein genuegen nicht - der Liga-Pass der Wache fehlt noch.
      const blockedWithoutPass = !c.game.transitionGate(door.requires);
      c.player.setFlag('ligaPass', true);
      const allowedWith = c.game.transitionGate(door.requires);
      return { blockedWithout, blockedWithoutPass, allowedWith, text: door.blockedText };
    });
    expect(gate, 'Kein Eingang zur Ligaarena gefunden').not.toBeNull();
    expect(gate!.blockedWithout, 'Arena war ohne Orden offen').toBe(true);
    expect(gate!.blockedWithoutPass, 'Arena war ohne Liga-Pass offen').toBe(true);
    expect(gate!.allowedWith, 'Arena blieb mit acht Orden zu').toBe(true);
    expect(gate!.text.length).toBeGreaterThan(10);

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('spielt vier Herausforderer und den Champion und traegt in die Ruhmeshalle ein', async ({ page }) => {
    test.setTimeout(600_000);
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForGame(page);

    // Vorbereitung: acht Orden, starkes Team, Heilgegenstaende.
    await run(page, (c) => {
      for (let i = 0; i < 8; i++) c.player.earnBadge(i, `Orden ${i + 1}`);
      c.player.setFlag('ligaPass', true);
      c.player.setStoryStage(13);
      c.player.party.length = 0;
      for (const id of ['aetherion', 'titanklaue', 'panzerwacht', 'infernohorn', 'fluthueter', 'sturmaar']) {
        c.player.addCreature(c.game.creatures.create(id, { level: 100, perfectIvs: 6 }));
      }
      c.player.addItem('top_trank', 30);
      c.player.addItem('top_beleber', 15);
      // Schnellste Kampfgeschwindigkeit, damit der Test nicht an der
      // Wiedergabedauer des Protokolls scheitert.
      c.settings.set('battleSpeed', 'instant');
    });

    await run(page, (c) => { c.game.enterArea('liga_arena', 'entrance'); });
    await page.waitForTimeout(900);

    const start = await run(page, (c) => ({
      area: c.game.world.areaId,
      running: c.league.isRunning,
      total: c.league.total,
      current: c.league.currentTrainerId,
    }));
    expect(start.area).toBe('liga_arena');
    expect(start.running, 'Ligalauf nicht gestartet').toBe(true);
    expect(start.total).toBe(5);

    // Der Champion darf nicht vorgezogen werden.
    const skipped = await run(page, (c) => {
      const league = c.game.data.leagues.all()[0];
      const npc = c.npcs.all.find((n: any) => n.placement.trainer === league.champion);
      if (!npc) return null;
      c.game.player.teleport(npc.x, npc.z - 1.2, 0);
      c.handleInteractForTest ? c.handleInteractForTest() : null;
      return { mode: c.game.mode, current: c.league.currentTrainerId };
    });
    expect(skipped?.current).toBe(start.current);

    // Fuenf Kaempfe in Folge.
    const names: string[] = [];
    for (let fight = 0; fight < 5; fight++) {
      const info = await run(page, (c) => {
        const id = c.league.currentTrainerId;
        if (!id) return null;
        c.startTrainerBattle(id);
        return { id };
      });
      expect(info, `Kampf ${fight + 1}: kein Gegner`).not.toBeNull();
      names.push(info!.id);
      await page.waitForTimeout(1200);
      expect(await run(page, (c) => c.game.mode), `Kampf ${fight + 1} nicht gestartet`).toBe('battle');

      const ended = await finishBattle(page);
      expect(ended, `Kampf ${fight + 1} endete nicht`).toBe(true);
      await page.waitForTimeout(1500);

      // Nachkampf-Textfenster wegklicken.
      for (let i = 0; i < 12; i++) {
        const open = await run(page, (c) => {
          const top: any = c.ui.topScreen;
          if (!top || !String(top.id).startsWith('message')) return false;
          top.handleAction('confirm');
          return true;
        });
        if (!open) break;
        await page.waitForTimeout(250);
      }
      await page.waitForTimeout(600);
      // Zwischen den Kaempfen wird nicht geheilt - also Gegenstaende
      // einsetzen, so wie eine spielende Person es tun muesste.
      await run(page, (c) => {
        for (const creature of c.player.party) {
          if (creature.isFainted && c.player.hasItem('top_beleber')) {
            c.useItemForTest('top_beleber', creature);
          }
          if (!creature.isFainted && creature.currentHp < creature.maxHp
            && c.player.hasItem('top_trank')) {
            c.useItemForTest('top_trank', creature);
          }
        }
      });
      await page.waitForTimeout(300);

      const after = await run(page, (c) => ({
        defeated: c.league.defeated,
        running: c.league.isRunning,
        area: c.game.world.areaId,
        hp: c.player.party.map((p: any) => `${p.currentHp}/${p.maxHp}`).join(' '),
      }));
      console.log(`Kampf ${fight + 1} (${info!.id}):`, JSON.stringify(after));
    }

    expect(new Set(names).size, 'Gegner wiederholten sich').toBe(5);

    // Die Siegsequenz und die Ruhmeshalle abwarten.
    for (let i = 0; i < 90; i++) {
      const state = await run(page, (c) => ({
        hall: c.ui.isOpen('hallOfFame'),
        cutscene: c.cutscenes.isActive,
        top: c.ui.topScreen?.id ?? null,
      }));
      if (state.hall) break;
      await run(page, (c) => {
        const top: any = c.ui.topScreen;
        if (top && String(top.id).startsWith('message')) top.handleAction('confirm');
      });
      await page.waitForTimeout(400);
    }

    const result = await run(page, (c) => ({
      hallOpen: c.ui.isOpen('hallOfFame'),
      entries: c.player.hallOfFame.length,
      team: c.player.hallOfFame[0]?.team.length ?? 0,
      flag: c.player.hasFlag('ligaGewonnen'),
      stage: c.player.storyStage,
      money: c.player.money,
      running: c.league.isRunning,
    }));
    expect(result.flag, 'Ligasieg wurde nicht festgehalten').toBe(true);
    expect(result.entries, 'Kein Eintrag in der Ruhmeshalle').toBe(1);
    expect(result.team).toBe(6);
    expect(result.stage).toBeGreaterThanOrEqual(14);
    expect(result.running).toBe(false);
    expect(result.hallOpen, 'Ruhmeshalle wurde nicht gezeigt').toBe(true);

    await page.screenshot({ path: 'tests/e2e/shots/ruhmeshalle.png' });

    expect(errors, errors.join('\n')).toEqual([]);
  });
  test('oeffnet die Tiefenkammer erst mit dem Schluessel und besiegt Aetherion', async ({ page }) => {
    test.setTimeout(300_000);
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForGame(page);

    // Ohne Schluessel bleibt der Abstieg zu.
    const gate = await run(page, (c) => {
      for (let i = 0; i < 8; i++) c.player.earnBadge(i, `Orden ${i + 1}`);
      c.game.enterArea('wildland', 'from_funkenau');
      const conn = c.game.world.area.data.connections
        .find((x: any) => x.to === 'tiefenkammer');
      return {
        requires: conn?.requires ?? null,
        blockedWithout: conn ? !c.game.transitionGate(conn.requires) : null,
        text: conn?.blockedText ?? '',
      };
    });
    expect(gate.requires?.flag).toBe('tiefenschluessel');
    expect(gate.blockedWithout, 'Tiefenkammer war ohne Schluessel offen').toBe(true);
    expect(gate.text).toContain('Tiefenschluessel');

    // Mit Schluessel und starkem Team das Finale bestreiten.
    await run(page, (c) => {
      c.player.setFlag('tiefenschluessel', true);
      c.player.setStoryStage(14);
      c.player.party.length = 0;
      for (const id of ['titanklaue', 'panzerwacht', 'infernohorn']) {
        c.player.addCreature(c.game.creatures.create(id, { level: 100, perfectIvs: 6 }));
      }
      c.settings.set('battleSpeed', 'instant');
      c.game.enterArea('tiefenkammer', 'from_wildland');
    });
    await page.waitForTimeout(1000);

    // Auf den Ausloeser laufen.
    await run(page, (c) => {
      const trigger = c.game.world.area.data.triggers?.[0];
      if (trigger) c.game.player.teleport(trigger.pos[0], trigger.pos[1], 0);
    });

    // Zwischensequenz abarbeiten, bis der Kampf laeuft.
    let battleStarted = false;
    for (let i = 0; i < 60; i++) {
      const state = await run(page, (c) => {
        const top: any = c.ui.topScreen;
        if (top && String(top.id).startsWith('message')) top.handleAction('confirm');
        return { mode: c.game.mode, cutscene: c.cutscenes.isActive };
      });
      if (state.mode === 'battle') { battleStarted = true; break; }
      await page.waitForTimeout(400);
    }
    expect(battleStarted, 'Finalkampf startete nicht').toBe(true);

    expect(await finishBattle(page), 'Finalkampf endete nicht').toBe(true);
    await page.waitForTimeout(1200);

    // Restliche Sequenz beenden.
    for (let i = 0; i < 40; i++) {
      const done = await run(page, (c) => {
        const top: any = c.ui.topScreen;
        if (top && String(top.id).startsWith('message')) {
          top.handleAction('confirm');
          return false;
        }
        return !c.cutscenes.isActive;
      });
      if (done) break;
      await page.waitForTimeout(350);
    }

    const result = await run(page, (c) => ({
      flag: c.player.hasFlag('aetherionBesiegt'),
      seen: c.player.seenSpecies.has('aetherion'),
      mode: c.game.mode,
    }));
    expect(result.seen, 'Aetherion wurde nicht gesehen').toBe(true);
    expect(result.flag, 'Finale wurde nicht abgeschlossen').toBe(true);
    expect(result.mode).toBe('world');

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('Lager veraendert Zuneigung und KP tatsaechlich', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/');
    await waitForGame(page);

    const before = await run(page, (c) => {
      c.player.party.length = 0;
      const creature = c.game.creatures.create('sprossling', { level: 20 });
      creature.applyHpDelta(-Math.floor(creature.maxHp * 0.5));
      c.player.addCreature(creature);
      c.player.addItem('campkoffer', 1);
      c.runAction({ kind: 'openCamp' });
      return {
        friendship: c.player.party[0].friendship,
        hp: c.player.party[0].currentHp,
      };
    });
    // Der Lagerbildschirm wird bei Bedarf nachgeladen.
    await page.waitForFunction(
      () => (window as unknown as { __CONTROLLER__: any }).__CONTROLLER__.ui.isOpen('camp'),
      undefined, { timeout: 10_000 },
    );

    // "Spielen" steigert die Zuneigung, "Ausruhen" heilt.
    await run(page, (c) => {
      const screen: any = c.ui.get('camp');
      screen.handleAction('right');
      screen.selectedActivity = 0;
      screen.handleAction('confirm');
    });
    await page.waitForTimeout(300);
    await run(page, (c) => {
      const screen: any = c.ui.get('camp');
      screen.selectedActivity = 2;
      screen.handleAction('confirm');
    });
    await page.waitForTimeout(300);

    const after = await run(page, (c) => ({
      friendship: c.player.party[0].friendship,
      hp: c.player.party[0].currentHp,
    }));
    expect(after.friendship, 'Zuneigung stieg nicht').toBeGreaterThan(before.friendship);
    expect(after.hp, 'KP wurden nicht aufgefuellt').toBeGreaterThan(before.hp);

    expect(errors, errors.join('\n')).toEqual([]);
  });
});
