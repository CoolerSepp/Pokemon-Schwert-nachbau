import * as THREE from 'three';
import type { AssetManager } from '@/engine/AssetManager';
import { RNG } from '@/core/RNG';
import type { BiomePalette } from './TerrainMesh';

export interface PropResult {
  object: THREE.Object3D;
  /** Kollisionsradius in Metern; 0 = begehbar. */
  collisionRadius: number;
  /** Hoehe fuer Culling-Entscheidungen. */
  height: number;
}

export const PROP_KINDS = [
  'tree', 'pine', 'palm', 'deadTree', 'bush', 'flower', 'rock', 'boulder',
  'crystal', 'stump', 'fence', 'sign', 'lamp', 'barrel', 'crate', 'cart',
  'well', 'bench', 'mailbox', 'pillar', 'statue', 'stalagmite', 'mushroom',
  'cactus', 'snowman', 'pipe', 'container', 'lilypad', 'reed', 'torch',
] as const;
export type PropKind = (typeof PROP_KINDS)[number];

const TRUNK_BROWN = '#6b4f33';
const DARK_WOOD = '#4a3524';

/**
 * Baut prozedurale Weltobjekte aus Grundformen.
 *
 * Alle Objekte teilen sich Geometrien und Materialien ueber den AssetManager;
 * ein Wald aus 400 Baeumen erzeugt daher nur eine Handvoll GPU-Ressourcen.
 */
export class PropFactory {
  constructor(private readonly assets: AssetManager) {}

  create(
    kind: PropKind, variant: number, palette: BiomePalette, scale = 1,
  ): PropResult {
    const rng = new RNG(`${kind}-${variant}`);
    switch (kind) {
      case 'tree': return this.tree(rng, palette, scale, 'round');
      case 'pine': return this.tree(rng, palette, scale, 'pine');
      case 'palm': return this.tree(rng, palette, scale, 'palm');
      case 'deadTree': return this.deadTree(rng, scale);
      case 'bush': return this.bush(rng, palette, scale);
      case 'flower': return this.flower(rng, scale);
      case 'rock': return this.rock(rng, palette, scale, 0.55);
      case 'boulder': return this.rock(rng, palette, scale, 1.5);
      case 'crystal': return this.crystal(rng, scale);
      case 'stump': return this.stump(scale);
      case 'fence': return this.fence(scale);
      case 'sign': return this.sign(scale);
      case 'lamp': return this.lamp(scale);
      case 'barrel': return this.barrel(scale);
      case 'crate': return this.crate(scale);
      case 'cart': return this.cart(scale);
      case 'well': return this.well(scale);
      case 'bench': return this.bench(scale);
      case 'mailbox': return this.mailbox(scale);
      case 'pillar': return this.pillar(rng, scale);
      case 'statue': return this.statue(scale);
      case 'stalagmite': return this.stalagmite(rng, scale);
      case 'mushroom': return this.mushroom(rng, scale);
      case 'cactus': return this.cactus(rng, scale);
      case 'snowman': return this.snowman(scale);
      case 'pipe': return this.pipe(scale);
      case 'container': return this.container(rng, scale);
      case 'lilypad': return this.lilypad(scale);
      case 'reed': return this.reed(rng, scale);
      case 'torch': return this.torch(scale);
    }
  }

  private mesh(
    shape: Parameters<AssetManager['getShape']>[0], size: [number, number, number],
    color: string, pos: [number, number, number],
    opts: { rot?: [number, number, number]; emissive?: number; metal?: number; detail?: number; opacity?: number } = {},
  ): THREE.Mesh {
    const geo = this.assets.getShape(shape, opts.detail ?? 1);
    const mat = this.assets.getMaterial({
      color, flatShading: true,
      emissive: opts.emissive ?? 0, metalness: opts.metal ?? 0,
      opacity: opts.opacity ?? 1,
      doubleSided: shape === 'plane',
    });
    const m = new THREE.Mesh(geo, mat);
    const fix = shape === 'box' || shape === 'plane' ? 0.5
      : shape === 'cone' || shape === 'cylinder' ? 1 : 1;
    m.scale.set(
      size[0] * (shape === 'box' || shape === 'plane' ? fix : 1),
      size[1] * (shape === 'box' || shape === 'plane' || shape === 'cone' || shape === 'cylinder' ? 0.5 : 1),
      size[2] * (shape === 'box' || shape === 'plane' ? fix : 1),
    );
    m.position.set(pos[0], pos[1], pos[2]);
    if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  private tree(rng: RNG, palette: BiomePalette, scale: number, style: 'round' | 'pine' | 'palm'): PropResult {
    const g = new THREE.Group();
    const h = rng.float(2.6, 4.4) * scale;
    const trunkR = h * 0.055;
    g.add(this.mesh('cylinder', [trunkR, h * 0.62, trunkR], TRUNK_BROWN, [0, h * 0.31, 0]));

    const leafBase = new THREE.Color(palette.grass);
    const leaf = `#${leafBase.clone().offsetHSL(rng.float(-0.03, 0.03), 0.05, rng.float(-0.06, 0.04)).getHexString()}`;

    if (style === 'pine') {
      for (let i = 0; i < 3; i++) {
        const t = i / 3;
        const r = h * (0.42 - t * 0.12);
        g.add(this.mesh('cone', [r, h * 0.42, r], leaf, [0, h * (0.52 + t * 0.24), 0], { detail: 2 }));
      }
    } else if (style === 'palm') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const frond = this.mesh('box', [h * 0.06, h * 0.03, h * 0.5], leaf,
          [Math.cos(a) * h * 0.24, h * 0.66, Math.sin(a) * h * 0.24],
          { rot: [0.4, -a, 0] });
        g.add(frond);
      }
      g.add(this.mesh('sphere', [h * 0.09, h * 0.09, h * 0.09], leaf, [0, h * 0.64, 0]));
    } else {
      const crownR = h * rng.float(0.33, 0.44);
      g.add(this.mesh('sphere', [crownR, crownR * 0.9, crownR], leaf, [0, h * 0.76, 0], { detail: 2 }));
      g.add(this.mesh('sphere', [crownR * 0.7, crownR * 0.62, crownR * 0.7], leaf,
        [crownR * 0.5, h * 0.62, crownR * 0.2], { detail: 1 }));
      g.add(this.mesh('sphere', [crownR * 0.62, crownR * 0.55, crownR * 0.62], leaf,
        [-crownR * 0.45, h * 0.66, -crownR * 0.3], { detail: 1 }));
    }
    return { object: g, collisionRadius: trunkR * 3.4, height: h };
  }

  private deadTree(rng: RNG, scale: number): PropResult {
    const g = new THREE.Group();
    const h = rng.float(2.4, 3.6) * scale;
    g.add(this.mesh('cylinder', [h * 0.05, h * 0.9, h * 0.05], DARK_WOOD, [0, h * 0.45, 0]));
    for (let i = 0; i < 3; i++) {
      const a = rng.float(0, Math.PI * 2);
      g.add(this.mesh('cylinder', [h * 0.022, h * 0.34, h * 0.022], DARK_WOOD,
        [Math.cos(a) * h * 0.14, h * (0.6 + i * 0.11), Math.sin(a) * h * 0.14],
        { rot: [rng.float(-0.9, -0.4), a, rng.float(-0.4, 0.4)] }));
    }
    return { object: g, collisionRadius: h * 0.16, height: h };
  }

  private bush(rng: RNG, palette: BiomePalette, scale: number): PropResult {
    const g = new THREE.Group();
    const r = rng.float(0.42, 0.78) * scale;
    const color = palette.grassAlt;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + rng.float(-0.4, 0.4);
      const rr = r * rng.float(0.6, 1);
      g.add(this.mesh('sphere', [rr, rr * 0.82, rr], color,
        [Math.cos(a) * r * 0.42, rr * 0.72, Math.sin(a) * r * 0.42], { detail: 1 }));
    }
    return { object: g, collisionRadius: r * 0.65, height: r * 1.5 };
  }

  private flower(rng: RNG, scale: number): PropResult {
    const g = new THREE.Group();
    const colors = ['#e8617f', '#f0c24b', '#c96be0', '#ffffff', '#ff8f4b'];
    const c = rng.pick(colors);
    const h = 0.3 * scale;
    g.add(this.mesh('cylinder', [0.016, h, 0.016], '#4f8a3f', [0, h * 0.5, 0]));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(this.mesh('sphere', [0.055, 0.02, 0.055], c,
        [Math.cos(a) * 0.055, h, Math.sin(a) * 0.055], { detail: 0 }));
    }
    g.add(this.mesh('sphere', [0.03, 0.025, 0.03], '#ffe066', [0, h + 0.01, 0], { detail: 0 }));
    return { object: g, collisionRadius: 0, height: h };
  }

  private rock(rng: RNG, palette: BiomePalette, scale: number, sizeFactor: number): PropResult {
    const g = new THREE.Group();
    const r = rng.float(0.4, 0.8) * scale * sizeFactor;
    const color = palette.slope;
    g.add(this.mesh('dodeca', [r, r * rng.float(0.6, 0.95), r * rng.float(0.8, 1.15)], color,
      [0, r * 0.55, 0], { rot: [rng.float(0, 1), rng.float(0, 6.28), rng.float(0, 1)], detail: 0 }));
    if (sizeFactor > 1) {
      g.add(this.mesh('dodeca', [r * 0.5, r * 0.4, r * 0.5], color,
        [r * 0.7, r * 0.3, r * 0.3], { rot: [0.4, 1.2, 0.3], detail: 0 }));
    }
    return { object: g, collisionRadius: r * 0.85, height: r * 1.4 };
  }

  private crystal(rng: RNG, scale: number): PropResult {
    const g = new THREE.Group();
    const colors = ['#7fd8ff', '#c48fff', '#8fffc4', '#ffd88f'];
    const c = rng.pick(colors);
    const h = rng.float(0.9, 2.0) * scale;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const hh = h * rng.float(0.5, 1);
      g.add(this.mesh('octa', [hh * 0.2, hh * 0.55, hh * 0.2], c,
        [Math.cos(a) * h * 0.16, hh * 0.5, Math.sin(a) * h * 0.16],
        { rot: [rng.float(-0.2, 0.2), a, rng.float(-0.2, 0.2)], emissive: 0.45, detail: 0 }));
    }
    return { object: g, collisionRadius: h * 0.28, height: h };
  }

  private stump(scale: number): PropResult {
    const g = new THREE.Group();
    const r = 0.36 * scale;
    g.add(this.mesh('cylinder', [r, 0.46 * scale, r], TRUNK_BROWN, [0, 0.23 * scale, 0]));
    g.add(this.mesh('cylinder', [r * 0.92, 0.05 * scale, r * 0.92], '#8a6b45', [0, 0.47 * scale, 0]));
    return { object: g, collisionRadius: r, height: 0.5 * scale };
  }

  private fence(scale: number): PropResult {
    const g = new THREE.Group();
    const w = 2.2 * scale;
    for (const x of [-w / 2, w / 2]) {
      g.add(this.mesh('box', [0.09, 1.05 * scale, 0.09], DARK_WOOD, [x, 0.52 * scale, 0]));
    }
    for (const y of [0.4, 0.76]) {
      g.add(this.mesh('box', [w, 0.08, 0.06], TRUNK_BROWN, [0, y * scale, 0]));
    }
    return { object: g, collisionRadius: 0, height: 1.05 * scale };
  }

  private sign(scale: number): PropResult {
    const g = new THREE.Group();
    g.add(this.mesh('cylinder', [0.05, 1.2 * scale, 0.05], DARK_WOOD, [0, 0.6 * scale, 0]));
    g.add(this.mesh('box', [0.9 * scale, 0.55 * scale, 0.08], '#c9a06b', [0, 1.15 * scale, 0]));
    g.add(this.mesh('box', [0.78 * scale, 0.42 * scale, 0.04], '#efe0c4', [0, 1.15 * scale, 0.055]));
    return { object: g, collisionRadius: 0.22, height: 1.45 * scale };
  }

  private lamp(scale: number): PropResult {
    const g = new THREE.Group();
    const h = 3.1 * scale;
    g.add(this.mesh('cylinder', [0.09, h, 0.09], '#3a3f47', [0, h * 0.5, 0]));
    g.add(this.mesh('cylinder', [0.26, 0.1, 0.26], '#2b3036', [0, h, 0]));
    g.add(this.mesh('sphere', [0.22, 0.26, 0.22], '#ffeab0', [0, h - 0.16, 0], { emissive: 0.9 }));
    return { object: g, collisionRadius: 0.22, height: h };
  }

  private barrel(scale: number): PropResult {
    const g = new THREE.Group();
    const r = 0.34 * scale;
    g.add(this.mesh('cylinder', [r, 0.9 * scale, r], '#7a5433', [0, 0.45 * scale, 0]));
    for (const y of [0.24, 0.66]) {
      g.add(this.mesh('cylinder', [r * 1.06, 0.07, r * 1.06], '#4a4a4f', [0, y * scale, 0], { metal: 0.7 }));
    }
    return { object: g, collisionRadius: r * 1.1, height: 0.9 * scale };
  }

  private crate(scale: number): PropResult {
    const g = new THREE.Group();
    const s = 0.7 * scale;
    g.add(this.mesh('box', [s, s, s], '#a8804f', [0, s * 0.5, 0]));
    g.add(this.mesh('box', [s * 1.02, s * 0.1, s * 0.1], DARK_WOOD, [0, s * 0.5, s * 0.5]));
    return { object: g, collisionRadius: s * 0.62, height: s };
  }

  private cart(scale: number): PropResult {
    const g = new THREE.Group();
    g.add(this.mesh('box', [1.5 * scale, 0.5 * scale, 0.95 * scale], '#9b7346', [0, 0.62 * scale, 0]));
    for (const x of [-0.55, 0.55]) {
      for (const z of [-0.5, 0.5]) {
        g.add(this.mesh('torus', [0.34 * scale, 0.34 * scale, 0.34 * scale], DARK_WOOD,
          [x * scale, 0.34 * scale, z * scale], { rot: [0, Math.PI / 2, 0], detail: 1 }));
      }
    }
    return { object: g, collisionRadius: 0.9 * scale, height: 0.95 * scale };
  }

  private well(scale: number): PropResult {
    const g = new THREE.Group();
    const r = 0.8 * scale;
    g.add(this.mesh('cylinder', [r, 0.85 * scale, r], '#8f8778', [0, 0.42 * scale, 0], { detail: 2 }));
    g.add(this.mesh('cylinder', [r * 0.82, 0.1, r * 0.82], '#2a3f4f', [0, 0.8 * scale, 0]));
    for (const x of [-r * 0.8, r * 0.8]) {
      g.add(this.mesh('box', [0.1, 1.5 * scale, 0.1], DARK_WOOD, [x, 1.5 * scale, 0]));
    }
    g.add(this.mesh('box', [r * 2.2, 0.12, r * 1.1], '#6b4f33', [0, 2.25 * scale, 0], { rot: [0.25, 0, 0] }));
    return { object: g, collisionRadius: r * 1.05, height: 2.4 * scale };
  }

  private bench(scale: number): PropResult {
    const g = new THREE.Group();
    g.add(this.mesh('box', [1.6 * scale, 0.1, 0.5 * scale], '#8a6b45', [0, 0.45 * scale, 0]));
    g.add(this.mesh('box', [1.6 * scale, 0.5 * scale, 0.09], '#8a6b45', [0, 0.7 * scale, -0.22 * scale]));
    for (const x of [-0.65, 0.65]) {
      g.add(this.mesh('box', [0.1, 0.45 * scale, 0.45 * scale], '#4a4a4f', [x * scale, 0.22 * scale, 0]));
    }
    return { object: g, collisionRadius: 0.55 * scale, height: 0.95 * scale };
  }

  private mailbox(scale: number): PropResult {
    const g = new THREE.Group();
    g.add(this.mesh('cylinder', [0.06, 1.0 * scale, 0.06], '#5a5f66', [0, 0.5 * scale, 0]));
    g.add(this.mesh('box', [0.34 * scale, 0.3 * scale, 0.5 * scale], '#c24b4b', [0, 1.1 * scale, 0]));
    return { object: g, collisionRadius: 0.2, height: 1.25 * scale };
  }

  private pillar(rng: RNG, scale: number): PropResult {
    const g = new THREE.Group();
    const h = rng.float(2.2, 3.8) * scale;
    const broken = rng.chance(0.4);
    const actual = broken ? h * rng.float(0.35, 0.7) : h;
    g.add(this.mesh('cylinder', [0.38 * scale, actual, 0.38 * scale], '#b5ab95', [0, actual * 0.5, 0], { detail: 2 }));
    g.add(this.mesh('box', [1.0 * scale, 0.18 * scale, 1.0 * scale], '#a89f88', [0, 0.09 * scale, 0]));
    if (!broken) {
      g.add(this.mesh('box', [1.0 * scale, 0.18 * scale, 1.0 * scale], '#a89f88', [0, actual, 0]));
    }
    return { object: g, collisionRadius: 0.52 * scale, height: actual };
  }

  private statue(scale: number): PropResult {
    const g = new THREE.Group();
    g.add(this.mesh('box', [1.3 * scale, 0.4 * scale, 1.3 * scale], '#9b9384', [0, 0.2 * scale, 0]));
    g.add(this.mesh('box', [0.9 * scale, 0.3 * scale, 0.9 * scale], '#a8a092', [0, 0.55 * scale, 0]));
    g.add(this.mesh('capsule', [0.32 * scale, 0.55 * scale, 0.32 * scale], '#b5ada0', [0, 1.35 * scale, 0]));
    g.add(this.mesh('sphere', [0.3 * scale, 0.3 * scale, 0.3 * scale], '#b5ada0', [0, 2.1 * scale, 0]));
    g.add(this.mesh('cone', [0.12 * scale, 0.45 * scale, 0.12 * scale], '#c9c0ae', [0, 2.45 * scale, 0]));
    return { object: g, collisionRadius: 0.8 * scale, height: 2.6 * scale };
  }

  private stalagmite(rng: RNG, scale: number): PropResult {
    const g = new THREE.Group();
    const h = rng.float(0.8, 2.6) * scale;
    g.add(this.mesh('cone', [h * 0.2, h, h * 0.2], '#5f574a', [0, h * 0.5, 0], { detail: 1 }));
    return { object: g, collisionRadius: h * 0.2, height: h };
  }

  private mushroom(rng: RNG, scale: number): PropResult {
    const g = new THREE.Group();
    const h = rng.float(0.3, 0.9) * scale;
    const cap = rng.pick(['#c9506b', '#e0a04b', '#8f6bc9', '#efefef']);
    g.add(this.mesh('cylinder', [h * 0.12, h * 0.7, h * 0.12], '#e6dcc4', [0, h * 0.35, 0]));
    g.add(this.mesh('sphere', [h * 0.42, h * 0.3, h * 0.42], cap, [0, h * 0.72, 0], { detail: 1 }));
    return { object: g, collisionRadius: 0, height: h };
  }

  private cactus(rng: RNG, scale: number): PropResult {
    const g = new THREE.Group();
    const h = rng.float(1.2, 2.6) * scale;
    g.add(this.mesh('capsule', [h * 0.16, h * 0.5, h * 0.16], '#4f8a52', [0, h * 0.5, 0]));
    if (rng.chance(0.7)) {
      g.add(this.mesh('capsule', [h * 0.09, h * 0.22, h * 0.09], '#4f8a52',
        [h * 0.25, h * 0.62, 0], { rot: [0, 0, -0.5] }));
    }
    return { object: g, collisionRadius: h * 0.2, height: h };
  }

  private snowman(scale: number): PropResult {
    const g = new THREE.Group();
    g.add(this.mesh('sphere', [0.5 * scale, 0.46 * scale, 0.5 * scale], '#f4f9ff', [0, 0.46 * scale, 0]));
    g.add(this.mesh('sphere', [0.36 * scale, 0.34 * scale, 0.36 * scale], '#f4f9ff', [0, 1.1 * scale, 0]));
    g.add(this.mesh('sphere', [0.26 * scale, 0.25 * scale, 0.26 * scale], '#f4f9ff', [0, 1.62 * scale, 0]));
    g.add(this.mesh('cone', [0.06 * scale, 0.24 * scale, 0.06 * scale], '#e07a2b',
      [0, 1.62 * scale, 0.26 * scale], { rot: [Math.PI / 2, 0, 0] }));
    return { object: g, collisionRadius: 0.5 * scale, height: 1.9 * scale };
  }

  private pipe(scale: number): PropResult {
    const g = new THREE.Group();
    g.add(this.mesh('cylinder', [0.3 * scale, 3.0 * scale, 0.3 * scale], '#7a8089',
      [0, 1.5 * scale, 0], { metal: 0.75 }));
    g.add(this.mesh('cylinder', [0.38 * scale, 0.2 * scale, 0.38 * scale], '#5f656d',
      [0, 2.9 * scale, 0], { metal: 0.8 }));
    return { object: g, collisionRadius: 0.36 * scale, height: 3.1 * scale };
  }

  private container(rng: RNG, scale: number): PropResult {
    const g = new THREE.Group();
    const c = rng.pick(['#c2543b', '#3b74c2', '#43a05b', '#c2a13b']);
    g.add(this.mesh('box', [2.4 * scale, 1.3 * scale, 1.2 * scale], c, [0, 0.65 * scale, 0], { metal: 0.35 }));
    for (let i = -2; i <= 2; i++) {
      g.add(this.mesh('box', [0.06, 1.3 * scale, 1.22 * scale], '#00000022',
        [i * 0.45 * scale, 0.65 * scale, 0], { metal: 0.4 }));
    }
    return { object: g, collisionRadius: 1.3 * scale, height: 1.3 * scale };
  }

  private lilypad(scale: number): PropResult {
    const g = new THREE.Group();
    g.add(this.mesh('cylinder', [0.5 * scale, 0.05, 0.5 * scale], '#4f8a52', [0, 0.02, 0], { detail: 1 }));
    return { object: g, collisionRadius: 0, height: 0.05 };
  }

  private reed(rng: RNG, scale: number): PropResult {
    const g = new THREE.Group();
    const n = rng.int(3, 6);
    for (let i = 0; i < n; i++) {
      const h = rng.float(0.8, 1.6) * scale;
      const a = rng.float(0, Math.PI * 2);
      const r = rng.float(0, 0.25) * scale;
      g.add(this.mesh('cylinder', [0.025, h, 0.025], '#7f9b4f',
        [Math.cos(a) * r, h * 0.5, Math.sin(a) * r],
        { rot: [rng.float(-0.15, 0.15), 0, rng.float(-0.15, 0.15)] }));
    }
    return { object: g, collisionRadius: 0, height: 1.6 * scale };
  }

  private torch(scale: number): PropResult {
    const g = new THREE.Group();
    g.add(this.mesh('cylinder', [0.07, 1.6 * scale, 0.07], DARK_WOOD, [0, 0.8 * scale, 0]));
    g.add(this.mesh('sphere', [0.18, 0.26, 0.18], '#ff9b3b', [0, 1.72 * scale, 0], { emissive: 1 }));
    return { object: g, collisionRadius: 0.16, height: 1.9 * scale };
  }

  /**
   * Erzeugt hohes Gras als InstancedMesh.
   * Ein einziger Draw Call fuer tausende Bueschel.
   */
  createGrassInstances(
    positions: { x: number; y: number; z: number; scale: number }[],
    palette: BiomePalette,
  ): THREE.InstancedMesh {
    const geometry = this.assets.getGeometry('grassTuft') ?? this.buildGrassTuftGeometry();
    const material = this.assets.getMaterial({
      color: palette.grass, flatShading: true, doubleSided: true,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, positions.length));
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    const baseA = new THREE.Color(palette.grass);
    const baseB = new THREE.Color(palette.grassAlt);

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]!;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, (i * 2.399963) % (Math.PI * 2), 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.copy(baseA).lerp(baseB, (Math.sin(i * 12.9898) * 43758.5453) % 1);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.name = 'tallGrass';
    mesh.count = positions.length;
    return mesh;
  }

  private buildGrassTuftGeometry(): THREE.BufferGeometry {
    // Drei gekreuzte Quads ergeben aus jeder Richtung ein volles Bueschel.
    const geometries: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const plane = new THREE.PlaneGeometry(0.85, 0.95, 1, 2);
      plane.translate(0, 0.475, 0);
      plane.rotateY((i / 3) * Math.PI);
      geometries.push(plane);
    }
    const merged = mergeGeometries(geometries);
    return this.assets.registerGeometry('grassTuft', merged);
  }
}

/** Verschmilzt mehrere Geometrien zu einer (nur Position/Normal/UV). */
export function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  let vertexCount = 0;
  let indexCount = 0;
  for (const g of list) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indexCount);

  let vOffset = 0;
  let iOffset = 0;
  for (const g of list) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nrm = g.attributes.normal as THREE.BufferAttribute | undefined;
    const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
    for (let i = 0; i < pos.count; i++) {
      positions[(vOffset + i) * 3] = pos.getX(i);
      positions[(vOffset + i) * 3 + 1] = pos.getY(i);
      positions[(vOffset + i) * 3 + 2] = pos.getZ(i);
      if (nrm) {
        normals[(vOffset + i) * 3] = nrm.getX(i);
        normals[(vOffset + i) * 3 + 1] = nrm.getY(i);
        normals[(vOffset + i) * 3 + 2] = nrm.getZ(i);
      }
      if (uv) {
        uvs[(vOffset + i) * 2] = uv.getX(i);
        uvs[(vOffset + i) * 2 + 1] = uv.getY(i);
      }
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) indices[iOffset + i] = g.index.getX(i) + vOffset;
      iOffset += g.index.count;
    } else {
      for (let i = 0; i < pos.count; i++) indices[iOffset + i] = i + vOffset;
      iOffset += pos.count;
    }
    vOffset += pos.count;
    g.dispose();
  }

  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeBoundingSphere();
  return out;
}
