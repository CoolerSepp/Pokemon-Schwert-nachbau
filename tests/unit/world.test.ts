import { describe, expect, it } from 'vitest';
import { TerrainField, distanceToSegment } from '@/world/TerrainField';
import { CollisionGrid } from '@/world/CollisionGrid';

function makeTerrain(overrides: Partial<ConstructorParameters<typeof TerrainField>[0]> = {}) {
  return new TerrainField({
    width: 80, depth: 120, seed: 42,
    baseHeight: 0, amplitude: 6, frequency: 0.02, octaves: 4,
    waterLevel: null, cliffBorder: false, flat: false, ridged: false,
    paths: [], flattenZones: [], resolution: 2,
    ...overrides,
  });
}

describe('Hoehenfeld', () => {
  it('erzeugt reproduzierbares Terrain fuer denselben Seed', () => {
    const a = makeTerrain();
    const b = makeTerrain();
    for (const [x, z] of [[0, 0], [40, 60], [79, 119], [13.7, 88.2]] as const) {
      expect(a.heightAt(x, z)).toBe(b.heightAt(x, z));
    }
    const other = makeTerrain({ seed: 43 });
    expect(other.heightAt(40, 60)).not.toBe(a.heightAt(40, 60));
  });

  it('liefert endliche Hoehen innerhalb der Amplitude', () => {
    const t = makeTerrain();
    for (let x = 0; x <= 80; x += 4) {
      for (let z = 0; z <= 120; z += 6) {
        const h = t.heightAt(x, z);
        expect(Number.isFinite(h)).toBe(true);
        expect(Math.abs(h)).toBeLessThan(20);
      }
    }
    expect(t.maxHeight).toBeGreaterThan(t.minHeight);
  });

  it('erzeugt eine flache Ebene, wenn flat gesetzt ist', () => {
    const t = makeTerrain({ flat: true, amplitude: 0, baseHeight: 3 });
    for (let x = 0; x <= 80; x += 10) {
      for (let z = 0; z <= 120; z += 10) {
        expect(t.heightAt(x, z)).toBeCloseTo(3, 5);
      }
    }
    expect(t.slopeAt(40, 60)).toBeCloseTo(0, 5);
  });

  it('interpoliert zwischen Gitterpunkten stetig', () => {
    const t = makeTerrain();
    let maxJump = 0;
    let prev = t.heightAt(0, 50);
    for (let x = 0.25; x <= 80; x += 0.25) {
      const h = t.heightAt(x, 50);
      maxJump = Math.max(maxJump, Math.abs(h - prev));
      prev = h;
    }
    // Kein Sprung groesser als die halbe Amplitude auf einem Viertelmeter.
    expect(maxJump).toBeLessThan(1);
  });

  it('hebt Raender an, wenn cliffBorder gesetzt ist', () => {
    const t = makeTerrain({ cliffBorder: true });
    expect(t.heightAt(0.5, 60)).toBeGreaterThan(t.heightAt(40, 60) + 3);
    expect(t.heightAt(79.5, 60)).toBeGreaterThan(t.heightAt(40, 60) + 3);
  });

  it('legt Wege quer eben an, laesst sie aber dem Gelaende folgen', () => {
    const t = makeTerrain({
      baseHeight: 1, amplitude: 10,
      paths: [{ points: [[20, 10], [20, 110]], width: 6 }],
    });

    // Quer zur Laufrichtung eben: links, Mitte und rechts auf gleicher Hoehe.
    for (let z = 20; z <= 100; z += 10) {
      const mid = t.heightAt(20, z);
      expect(Math.abs(t.heightAt(18, z) - mid)).toBeLessThan(0.3);
      expect(Math.abs(t.heightAt(22, z) - mid)).toBeLessThan(0.3);
    }

    // Laengs weich: keine Stufen zwischen benachbarten Punkten.
    for (let z = 20; z < 100; z += 2) {
      expect(Math.abs(t.heightAt(20, z + 2) - t.heightAt(20, z))).toBeLessThan(1.2);
    }

    // Aber nicht flach: der Weg gewinnt und verliert Hoehe. Wurde er wie
    // frueher auf die Grundhoehe gezogen, war jede Route eine Rinne durch
    // die Huegel und jeder "Anstieg" gewann null Meter.
    let lo = Infinity;
    let hi = -Infinity;
    for (let z = 12; z <= 108; z += 2) {
      const h = t.heightAt(20, z);
      lo = Math.min(lo, h);
      hi = Math.max(hi, h);
    }
    expect(hi - lo).toBeGreaterThan(1.5);
  });

  it('erkennt Wasserflaechen', () => {
    const t = makeTerrain({ waterLevel: 1000 });
    expect(t.isUnderWater(40, 60)).toBe(true);
    const dry = makeTerrain({ waterLevel: -1000 });
    expect(dry.isUnderWater(40, 60)).toBe(false);
  });

  it('berechnet normalisierte Normalen', () => {
    const t = makeTerrain();
    for (const [x, z] of [[10, 10], [40, 60], [70, 100]] as const) {
      const n = t.normalAt(x, z);
      expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 5);
      expect(n[1]).toBeGreaterThan(0);
    }
  });

  it('begrenzt Positionen auf das Gebiet', () => {
    const t = makeTerrain();
    expect(t.clampToBounds(-50, 500, 2)).toEqual([2, 118]);
    expect(t.contains(-1, 5)).toBe(false);
    expect(t.contains(5, 5)).toBe(true);
  });
});

describe('Abstand Punkt zu Strecke', () => {
  it('berechnet korrekte Abstaende', () => {
    expect(distanceToSegment(0, 0, -5, 0, 5, 0)).toBe(0);
    expect(distanceToSegment(0, 3, -5, 0, 5, 0)).toBe(3);
    expect(distanceToSegment(10, 0, -5, 0, 5, 0)).toBe(5);
    expect(distanceToSegment(1, 1, 0, 0, 0, 0)).toBeCloseTo(Math.SQRT2);
  });
});

describe('Kollisionsgitter', () => {
  it('blockiert Kreise und Rechtecke', () => {
    const grid = new CollisionGrid(40, 40, 0.5);
    expect(grid.isBlocked(20, 20)).toBe(false);
    grid.addCircle({ x: 20, z: 20, radius: 2 });
    expect(grid.isBlocked(20, 20)).toBe(true);
    expect(grid.isBlocked(20, 23.5)).toBe(false);

    grid.addBox({ x: 10, z: 10, width: 4, depth: 6 });
    expect(grid.isBlocked(10, 10)).toBe(true);
    expect(grid.isBlocked(10, 12.5)).toBe(true);
    expect(grid.isBlocked(10, 14)).toBe(false);
  });

  it('behandelt Gebietsgrenzen als blockiert', () => {
    const grid = new CollisionGrid(20, 20, 0.5);
    expect(grid.isBlocked(-1, 10)).toBe(true);
    expect(grid.isBlocked(21, 10)).toBe(true);
    expect(grid.isBlocked(10, -0.1)).toBe(true);
  });

  it('schiebt einen Kreis aus einem Hindernis heraus', () => {
    const grid = new CollisionGrid(40, 40, 0.5);
    grid.addCircle({ x: 20, z: 20, radius: 3 });
    const [x, z] = grid.resolveCircle(20.2, 20.1, 0.4, 6);
    const dist = Math.hypot(x - 20, z - 20);
    expect(dist).toBeGreaterThan(1);
    expect(grid.isBlocked(x, z)).toBe(false);
  });

  it('laesst freie Positionen unveraendert', () => {
    const grid = new CollisionGrid(40, 40, 0.5);
    grid.addCircle({ x: 5, z: 5, radius: 2 });
    const [x, z] = grid.resolveCircle(30, 30, 0.4);
    expect(x).toBeCloseTo(30, 5);
    expect(z).toBeCloseTo(30, 5);
  });

  it('haelt korrigierte Positionen stets innerhalb des Gebiets', () => {
    const grid = new CollisionGrid(30, 30, 0.5);
    for (const [sx, sz] of [[-10, 15], [40, 15], [15, -5], [15, 99]] as const) {
      const [x, z] = grid.resolveCircle(sx, sz, 0.5);
      expect(x).toBeGreaterThanOrEqual(0.5);
      expect(x).toBeLessThanOrEqual(29.5);
      expect(z).toBeGreaterThanOrEqual(0.5);
      expect(z).toBeLessThanOrEqual(29.5);
    }
  });

  it('loest auch Ecken zwischen zwei Waenden auf', () => {
    const grid = new CollisionGrid(40, 40, 0.5);
    grid.addBox({ x: 18, z: 20, width: 4, depth: 20 });
    grid.addBox({ x: 20, z: 12, width: 20, depth: 4 });
    const [x, z] = grid.resolveCircle(20.4, 14.4, 0.45, 8);
    expect(grid.isBlocked(x, z)).toBe(false);
  });

  it('gibt Tuerdurchgaenge wieder frei', () => {
    const grid = new CollisionGrid(40, 40, 0.5);
    grid.addBox({ x: 20, z: 20, width: 8, depth: 8 });
    // Zellmittelpunkte entscheiden: z = 23.5 liegt sicher innerhalb.
    expect(grid.isBlocked(20, 23.5)).toBe(true);
    grid.clearBox({ x: 20, z: 23.5, width: 2, depth: 2 });
    expect(grid.isBlocked(20, 23.5)).toBe(false);
  });

  it('prueft Sichtlinien', () => {
    const grid = new CollisionGrid(40, 40, 0.5);
    expect(grid.lineOfSight(5, 5, 35, 5)).toBe(true);
    grid.addBox({ x: 20, z: 5, width: 2, depth: 2 });
    expect(grid.lineOfSight(5, 5, 35, 5)).toBe(false);
    expect(grid.lineOfSight(5, 15, 35, 15)).toBe(true);
  });

  it('findet freie Positionen in der Naehe', () => {
    const grid = new CollisionGrid(40, 40, 0.5);
    grid.addCircle({ x: 20, z: 20, radius: 3 });
    const [x, z] = grid.findFreeNear(20, 20, 0.4);
    expect(grid.isBlocked(x, z)).toBe(false);
  });

  it('meldet einen plausiblen Belegungsanteil', () => {
    const grid = new CollisionGrid(40, 40, 0.5);
    expect(grid.blockedRatio).toBe(0);
    grid.addBox({ x: 20, z: 20, width: 40, depth: 40 });
    expect(grid.blockedRatio).toBeGreaterThan(0.9);
  });

  it('rotiert Rechteck-Hindernisse korrekt', () => {
    const grid = new CollisionGrid(40, 40, 0.5);
    grid.addBox({ x: 20, z: 20, width: 12, depth: 2, rotation: Math.PI / 2 });
    // Nach 90-Grad-Drehung liegt die lange Seite entlang Z.
    expect(grid.isBlocked(20, 25)).toBe(true);
    expect(grid.isBlocked(25, 20)).toBe(false);
  });
});
