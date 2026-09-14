import * as THREE from 'three';
import type { InteriorStyle } from '@/data/schema';
import type { AssetManager } from '@/engine/AssetManager';
import type { TextureKind } from '@/engine/TextureFactory';
import type { CollisionGrid } from './CollisionGrid';

export interface InteriorResult {
  object: THREE.Group;
  /** Blockierende Elemente fuer das Kollisionsgitter. */
  blockers: { x: number; z: number; width: number; depth: number; rotation: number }[];
}

const WALL_THICKNESS = 0.5;

/**
 * Baut Innenraeume: Boden, Waende mit Durchgaengen, Decke und Moebel.
 *
 * Innenraeume sind normale Gebiete mit flachem Terrain; hier entsteht nur die
 * Architektur darueber. Dadurch funktionieren Kollision, Kamera und NPCs
 * unveraendert weiter.
 */
export class InteriorFactory {
  constructor(private readonly assets: AssetManager) {}

  build(style: InteriorStyle, width: number, depth: number): InteriorResult {
    const g = new THREE.Group();
    g.name = 'interior';
    const blockers: InteriorResult['blockers'] = [];
    const h = style.wallHeight;

    // Fliesenraster auf dem Boden: ein einfarbiger Innenraum wirkt wie eine
    // leere Box. Die Kachelzahl richtet sich nach der Raumgroesse.
    g.add(this.box(
      [width, 0.25, depth], style.floorColor, [width / 2, -0.12, depth / 2], true, 0,
      'tile', Math.max(2, Math.round(Math.max(width, depth) / 4)),
    ));

    if (style.ceiling !== false) {
      g.add(this.box([width, 0.3, depth], style.accentColor, [width / 2, h + 0.15, depth / 2]));
    }

    const exits = style.exits ?? [];
    const sides: {
      side: 'north' | 'south' | 'east' | 'west';
      horizontal: boolean; fixed: number; length: number;
    }[] = [
      { side: 'south', horizontal: true, fixed: WALL_THICKNESS / 2, length: width },
      { side: 'north', horizontal: true, fixed: depth - WALL_THICKNESS / 2, length: width },
      { side: 'west', horizontal: false, fixed: WALL_THICKNESS / 2, length: depth },
      { side: 'east', horizontal: false, fixed: width - WALL_THICKNESS / 2, length: depth },
    ];

    for (const def of sides) {
      // Oeffnungen dieser Wand einsammeln und die Wand in Segmente zerlegen.
      const openings = exits
        .filter((e) => e.side === def.side)
        .map((e) => {
          const center = def.horizontal ? e.x : e.z;
          return { start: center - e.width / 2, end: center + e.width / 2 };
        })
        .sort((a, b) => a.start - b.start);

      let cursor = 0;
      const segments: { start: number; end: number }[] = [];
      for (const open of openings) {
        if (open.start > cursor) segments.push({ start: cursor, end: Math.min(open.start, def.length) });
        cursor = Math.max(cursor, open.end);
      }
      if (cursor < def.length) segments.push({ start: cursor, end: def.length });

      for (const seg of segments) {
        const len = seg.end - seg.start;
        if (len <= 0.05) continue;
        const center = seg.start + len / 2;
        const x = def.horizontal ? center : def.fixed;
        const z = def.horizontal ? def.fixed : center;
        const w = def.horizontal ? len : WALL_THICKNESS;
        const d = def.horizontal ? WALL_THICKNESS : len;
        g.add(this.box([w, h, d], style.wallColor, [x, h / 2, z], false, 0, 'plaster', 2));
        // Zierleiste
        g.add(this.box([w * 1.01, 0.18, d * 1.01], style.accentColor, [x, 0.09, z]));
        blockers.push({ x, z, width: w, depth: d, rotation: 0 });
      }
    }

    for (const item of style.furniture ?? []) {
      const built = this.furniture(item, style);
      built.object.position.set(item.pos[0], 0, item.pos[1]);
      built.object.rotation.y = item.rotation ?? 0;
      g.add(built.object);
      if (built.blockWidth > 0) {
        blockers.push({
          x: item.pos[0], z: item.pos[1],
          width: built.blockWidth, depth: built.blockDepth,
          rotation: item.rotation ?? 0,
        });
      }
    }

    return { object: g, blockers };
  }

  applyBlockers(grid: CollisionGrid, blockers: InteriorResult['blockers']): void {
    for (const b of blockers) {
      grid.addBox({ x: b.x, z: b.z, width: b.width, depth: b.depth, rotation: b.rotation });
    }
  }

  private box(
    size: [number, number, number], color: string, pos: [number, number, number],
    receive = false, emissive = 0,
    texture?: TextureKind, repeat?: number,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      this.assets.getShape('box', 1),
      this.assets.getMaterial({
        color, flatShading: true, emissive, texture, textureRepeat: repeat,
      }),
    );
    mesh.scale.set(size[0] / 2, size[1] / 2, size[2] / 2);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = !receive;
    mesh.receiveShadow = true;
    return mesh;
  }

  private cyl(
    r: number, h: number, color: string, pos: [number, number, number],
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      this.assets.getShape('cylinder', 2),
      this.assets.getMaterial({ color, flatShading: true }),
    );
    mesh.scale.set(r, h / 2, r);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.castShadow = true;
    return mesh;
  }

  private furniture(
    item: NonNullable<InteriorStyle['furniture']>[number], style: InteriorStyle,
  ): { object: THREE.Group; blockWidth: number; blockDepth: number } {
    const g = new THREE.Group();
    const s = item.scale ?? 1;
    const color = item.color ?? style.accentColor;

    switch (item.kind) {
      case 'bed':
        g.add(this.box([1.2 * s, 0.42 * s, 2.1 * s], '#8a6b45', [0, 0.21 * s, 0]));
        g.add(this.box([1.15 * s, 0.2 * s, 1.9 * s], color, [0, 0.5 * s, 0]));
        g.add(this.box([0.9 * s, 0.16 * s, 0.42 * s], '#ffffff', [0, 0.62 * s, -0.72 * s]));
        return { object: g, blockWidth: 1.3 * s, blockDepth: 2.2 * s };
      case 'table':
        g.add(this.box([1.4 * s, 0.1 * s, 0.9 * s], '#a3763f', [0, 0.78 * s, 0]));
        for (const [dx, dz] of [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]]) {
          g.add(this.box([0.1 * s, 0.76 * s, 0.1 * s], '#7a5a30', [dx * s, 0.38 * s, dz * s]));
        }
        return { object: g, blockWidth: 1.5 * s, blockDepth: 1.0 * s };
      case 'chair':
        g.add(this.box([0.5 * s, 0.08 * s, 0.5 * s], '#8a6b45', [0, 0.45 * s, 0]));
        g.add(this.box([0.5 * s, 0.6 * s, 0.08 * s], '#8a6b45', [0, 0.75 * s, -0.2 * s]));
        for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
          g.add(this.box([0.07 * s, 0.44 * s, 0.07 * s], '#7a5a30', [dx * s, 0.22 * s, dz * s]));
        }
        return { object: g, blockWidth: 0.55 * s, blockDepth: 0.55 * s };
      case 'shelf':
        g.add(this.box([1.4 * s, 2.0 * s, 0.4 * s], '#8a6b45', [0, 1.0 * s, 0]));
        for (let i = 0; i < 3; i++) {
          g.add(this.box([1.25 * s, 0.06 * s, 0.36 * s], '#6b4f33', [0, (0.5 + i * 0.55) * s, 0.02]));
          for (let b = 0; b < 4; b++) {
            g.add(this.box([0.12 * s, 0.32 * s, 0.2 * s],
              ['#c25b4b', '#4b7ac2', '#4bc27a', '#c2a04b'][b % 4]!,
              [(-0.45 + b * 0.3) * s, (0.69 + i * 0.55) * s, 0.05]));
          }
        }
        return { object: g, blockWidth: 1.5 * s, blockDepth: 0.5 * s };
      case 'counter':
        g.add(this.box([3.4 * s, 1.05 * s, 0.9 * s], color, [0, 0.52 * s, 0]));
        g.add(this.box([3.6 * s, 0.12 * s, 1.05 * s], '#f2ece0', [0, 1.1 * s, 0]));
        return { object: g, blockWidth: 3.6 * s, blockDepth: 1.1 * s };
      case 'tv':
        g.add(this.box([1.1 * s, 0.7 * s, 0.12 * s], '#2b2f36', [0, 1.0 * s, 0]));
        g.add(this.box([1.0 * s, 0.6 * s, 0.04 * s], '#5fb0d8', [0, 1.0 * s, 0.08 * s]));
        g.add(this.box([0.9 * s, 0.55 * s, 0.5 * s], '#7a5a30', [0, 0.3 * s, 0]));
        return { object: g, blockWidth: 1.0 * s, blockDepth: 0.6 * s };
      case 'plant':
        g.add(this.cyl(0.24 * s, 0.4 * s, '#b5603f', [0, 0.2 * s, 0]));
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          g.add(this.box([0.14 * s, 0.7 * s, 0.14 * s], '#4f8a42',
            [Math.cos(a) * 0.1 * s, 0.7 * s, Math.sin(a) * 0.1 * s]));
        }
        return { object: g, blockWidth: 0.5 * s, blockDepth: 0.5 * s };
      case 'rug':
        g.add(this.box([2.2 * s, 0.04, 1.6 * s], color, [0, 0.02, 0]));
        return { object: g, blockWidth: 0, blockDepth: 0 };
      case 'stairs': {
        for (let i = 0; i < 6; i++) {
          g.add(this.box([1.4 * s, 0.24 * s, 0.4 * s], '#8a6b45',
            [0, (0.12 + i * 0.24) * s, (-i * 0.4) * s]));
        }
        // Treppen sind Uebergaenge, keine Hindernisse: mit Kollision kaeme
        // man nie auf den Ausloeser und damit nie ins obere Stockwerk.
        return { object: g, blockWidth: 0, blockDepth: 0 };
      }
      case 'machine':
        g.add(this.box([1.2 * s, 1.6 * s, 0.8 * s], color, [0, 0.8 * s, 0]));
        g.add(this.box([0.9 * s, 0.5 * s, 0.1 * s], '#7fe0ff', [0, 1.15 * s, 0.42 * s]));
        for (let i = 0; i < 3; i++) {
          g.add(this.cyl(0.11 * s, 0.1 * s, '#ffffff', [(-0.3 + i * 0.3) * s, 1.7 * s, 0]));
        }
        return { object: g, blockWidth: 1.3 * s, blockDepth: 0.9 * s };
      case 'computer':
        g.add(this.box([1.1 * s, 0.7 * s, 0.6 * s], '#9aa4b0', [0, 0.35 * s, 0]));
        g.add(this.box([0.9 * s, 0.55 * s, 0.08 * s], '#2b3440', [0, 0.95 * s, -0.1 * s]));
        g.add(this.box([0.8 * s, 0.45 * s, 0.03 * s], '#7fe0ff', [0, 0.95 * s, -0.04 * s]));
        return { object: g, blockWidth: 1.2 * s, blockDepth: 0.7 * s };
      case 'sofa':
        g.add(this.box([2.0 * s, 0.45 * s, 0.9 * s], color, [0, 0.28 * s, 0]));
        g.add(this.box([2.0 * s, 0.6 * s, 0.2 * s], color, [0, 0.6 * s, -0.35 * s]));
        for (const dx of [-0.95, 0.95]) {
          g.add(this.box([0.18 * s, 0.5 * s, 0.9 * s], color, [dx * s, 0.5 * s, 0]));
        }
        return { object: g, blockWidth: 2.1 * s, blockDepth: 1.0 * s };
      case 'lamp':
        g.add(this.cyl(0.07 * s, 1.5 * s, '#5a5f66', [0, 0.75 * s, 0]));
        g.add(this.box([0.45 * s, 0.35 * s, 0.45 * s], '#ffeab0', [0, 1.6 * s, 0], false, 0.7));
        return { object: g, blockWidth: 0.3 * s, blockDepth: 0.3 * s };
      case 'crateStack':
        g.add(this.box([0.8 * s, 0.8 * s, 0.8 * s], '#a8804f', [0, 0.4 * s, 0]));
        g.add(this.box([0.7 * s, 0.7 * s, 0.7 * s], '#9b7346', [0.1 * s, 1.15 * s, 0.05 * s]));
        return { object: g, blockWidth: 0.9 * s, blockDepth: 0.9 * s };
      case 'podium':
        g.add(this.cyl(1.6 * s, 0.4 * s, color, [0, 0.2 * s, 0]));
        g.add(this.cyl(1.4 * s, 0.12 * s, '#f2ece0', [0, 0.44 * s, 0]));
        return { object: g, blockWidth: 0, blockDepth: 0 };
    }
  }
}
