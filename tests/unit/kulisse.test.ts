import { describe, expect, it } from 'vitest';
import {
  BIOME_PALETTES, backdropOuterRadius, buildBackdrop, buildGroundSkirt,
} from '@/world/TerrainMesh';

/** Groesste Hoehe und groesster Radius der Scheitel eines Meshes. */
function extent(mesh: { geometry: { attributes: { position: any } } }): {
  maxY: number; maxR: number; minY: number;
} {
  const p = mesh.geometry.attributes.position;
  let maxY = -Infinity;
  let minY = Infinity;
  let maxR = 0;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    maxY = Math.max(maxY, y);
    minY = Math.min(minY, y);
    maxR = Math.max(maxR, Math.hypot(p.getX(i), p.getZ(i)));
  }
  return { maxY, minY, maxR };
}

describe('Bergkulisse', () => {
  const palette = BIOME_PALETTES.grassland;

  it('baut drei gestaffelte Ketten', () => {
    const group = buildBackdrop(palette, 200, 1234);
    expect(group.children).toHaveLength(3);
    const layers = group.children.map((m) => extent(m as never));
    // Jede Kette liegt weiter aussen und hoeher als die vorige.
    for (let i = 1; i < layers.length; i++) {
      expect(layers[i]!.maxR).toBeGreaterThan(layers[i - 1]!.maxR);
      expect(layers[i]!.maxY).toBeGreaterThan(layers[i - 1]!.maxY);
    }
  });

  it('haelt sich innerhalb des gemeldeten Aussenradius', () => {
    // Der Himmel wird nach diesem Wert bemessen. Waere er zu klein, ragten
    // die Gipfel durch die Himmelskugel und es entstuende ein schwarzes Loch.
    for (const inner of [120, 200, 340]) {
      const group = buildBackdrop(palette, inner, 99);
      const outer = backdropOuterRadius(inner);
      for (const mesh of group.children) {
        expect(extent(mesh as never).maxR).toBeLessThanOrEqual(outer + 0.001);
      }
    }
  });

  it('skaliert die Hoehe mit dem Abstand', () => {
    // Nur so sieht die Kulisse aus jedem Gebiet gleich gross aus. Mit fester
    // Hoehe in Metern fuellte sie in kleinen Gebieten den halben Himmel.
    const nah = buildBackdrop(palette, 200, 7);
    const fern = buildBackdrop(palette, 400, 7);
    for (let i = 0; i < 3; i++) {
      const a = extent(nah.children[i] as never);
      const b = extent(fern.children[i] as never);
      const winkelA = a.maxY / a.maxR;
      const winkelB = b.maxY / b.maxR;
      expect(Math.abs(winkelA - winkelB)).toBeLessThan(0.05);
      expect(b.maxY).toBeGreaterThan(a.maxY * 1.3);
    }
  });

  it('legt die Landflaeche unter den angegebenen Punkt', () => {
    const skirt = buildGroundSkirt(palette, 500, -4.5);
    expect(skirt.position.y).toBeCloseTo(-4.5, 5);
    expect(extent(skirt as never).maxR).toBeLessThanOrEqual(500.001);
    // Sie liegt flach - sonst waere es keine Flaeche, sondern eine Wand.
    const e = extent(skirt as never);
    expect(e.maxY).toBeCloseTo(0, 5);
    expect(e.minY).toBeCloseTo(0, 5);
  });
});
