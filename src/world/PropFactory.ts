import * as THREE from 'three';
import type { AssetManager } from '@/engine/AssetManager';
import type { TextureKind } from '@/engine/TextureFactory';
import { RNG } from '@/core/RNG';
import type { CropKind } from '@/data/schema';
import type { BiomePalette } from './TerrainMesh';

export interface PropResult {
  object: THREE.Object3D;
  /** Kollisionsradius in Metern; 0 = begehbar. */
  collisionRadius: number;
  /**
   * Rechteckige Kollision in lokalen Massen (Breite in X, Tiefe in Z).
   *
   * Laengliche Objekte wie Zaeune lassen sich mit einem Kreis nicht
   * abbilden: ein Kreis um die Mitte laesst die Enden frei, ein Kreis ueber
   * die ganze Laenge sperrt viel zu viel. Deshalb hier ein gedrehtes
   * Rechteck. Wenn gesetzt, hat es Vorrang vor dem Radius.
   */
  collisionBox?: { width: number; depth: number };
  /** Hoehe fuer Culling-Entscheidungen. */
  height: number;
}

export const PROP_KINDS = [
  'tree', 'pine', 'palm', 'deadTree', 'bush', 'flower', 'rock', 'boulder',
  'crystal', 'stump', 'fence', 'sign', 'lamp', 'barrel', 'crate', 'cart',
  'well', 'bench', 'mailbox', 'pillar', 'statue', 'stalagmite', 'mushroom',
  'cactus', 'snowman', 'pipe', 'container', 'lilypad', 'reed', 'torch',
  // Laendliches Inventar: Hoefe, Felder und Marktplaetze.
  'haystack', 'scarecrow', 'woodpile', 'stall', 'laundry', 'planter',
  'hedge', 'windmill', 'trough', 'beehive', 'sack', 'ladder',
] as const;
export type PropKind = (typeof PROP_KINDS)[number];

/**
 * Masse und Farben je Feldfrucht.
 *
 * "ear" ist die Aehre oben auf dem Halm; bei Gemuese entfaellt sie, dort
 * traegt die Pflanze ihre Farbe im Blattwerk.
 */
const CROP_SPECS: Record<CropKind, {
  base: string; tip: string; height: number; width: number;
  blades: number; ear: number;
}> = {
  wheat: { base: '#c9a94b', tip: '#e6d07a', height: 1.15, width: 0.42, blades: 3, ear: 0.3 },
  corn: { base: '#5f8f3f', tip: '#8fbf5a', height: 1.9, width: 0.55, blades: 3, ear: 0.34 },
  vegetable: { base: '#4f8a42', tip: '#7fb84b', height: 0.5, width: 0.5, blades: 2, ear: 0 },
  lavender: { base: '#7f7fb8', tip: '#b8a8e0', height: 0.7, width: 0.3, blades: 3, ear: 0.22 },
};

/** Anzahl fester Blattfarbtoene je Biom. */
const LEAF_VARIANTS = 4;

const TRUNK_BROWN = '#6b4f33';
const DARK_WOOD = '#4a3524';

/**
 * Baut prozedurale Weltobjekte aus Grundformen.
 *
 * Alle Objekte teilen sich Geometrien und Materialien ueber den AssetManager;
 * ein Wald aus 400 Baeumen erzeugt daher nur eine Handvoll GPU-Ressourcen.
 */
export class PropFactory {
  /** Leuchtmaterialien nach Farbe - gemeinsam fuer das Nachtlicht. */
  private readonly glowMaterials = new Map<string, THREE.MeshLambertMaterial>();

  constructor(private readonly assets: AssetManager) {}

  /** Zugriff auf die prozeduralen Texturen (fuer Terrain und Gebaeude). */
  get textures() { return this.assets.textures; }

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
      case 'haystack': return this.haystack(rng, scale);
      case 'scarecrow': return this.scarecrow(scale);
      case 'woodpile': return this.woodpile(rng, scale);
      case 'stall': return this.stall(rng, scale);
      case 'laundry': return this.laundry(rng, scale);
      case 'planter': return this.planter(rng, palette, scale);
      case 'hedge': return this.hedge(rng, palette, scale);
      case 'windmill': return this.windmill(scale);
      case 'trough': return this.trough(scale);
      case 'beehive': return this.beehive(scale);
      case 'sack': return this.sack(rng, scale);
      case 'ladder': return this.ladder(scale);
    }
  }

  private mesh(
    shape: Parameters<AssetManager['getShape']>[0], size: [number, number, number],
    color: string, pos: [number, number, number],
    opts: {
      rot?: [number, number, number]; emissive?: number; metal?: number;
      detail?: number; opacity?: number; texture?: TextureKind; repeat?: number;
    } = {},
  ): THREE.Mesh {
    const geo = this.assets.getShape(shape, opts.detail ?? 1);
    const mat = this.assets.getMaterial({
      color, flatShading: true,
      emissive: opts.emissive ?? 0, metalness: opts.metal ?? 0,
      opacity: opts.opacity ?? 1,
      doubleSided: shape === 'plane',
      texture: opts.texture, textureRepeat: opts.repeat,
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
    g.add(this.mesh('cylinder', [trunkR, h * 0.62, trunkR], TRUNK_BROWN, [0, h * 0.31, 0],
      { texture: 'bark', repeat: 2 }));

    // Blattfarben aus einer festen kleinen Auswahl statt frei gewuerfelt:
    // gleiche Farbe heisst gleiches Material, und nur dann lassen sich die
    // Baeume zu wenigen Zeichenaufrufen zusammenfassen.
    const leafBase = new THREE.Color(palette.grass);
    const variant = rng.int(0, LEAF_VARIANTS - 1);
    const step = variant - (LEAF_VARIANTS - 1) / 2;
    const leaf = `#${leafBase.clone()
      .offsetHSL(step * 0.012, 0.05, step * 0.028).getHexString()}`;

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
      // Krone aus mehreren, unterschiedlich hellen Ballen: eine einzelne
      // Kugel wirkt aus jeder Entfernung wie ein gruener Klecks.
      const crownR = h * rng.float(0.33, 0.44);
      const shade = (amount: number) =>
        `#${new THREE.Color(leaf).offsetHSL(0, 0.02, amount).getHexString()}`;
      const light = shade(0.06);
      const dark = shade(-0.07);

      g.add(this.mesh('sphere', [crownR, crownR * 0.88, crownR], leaf,
        [0, h * 0.74, 0], { detail: 2 }));
      g.add(this.mesh('sphere', [crownR * 0.74, crownR * 0.66, crownR * 0.74], light,
        [crownR * 0.42, h * 0.88, crownR * 0.18], { detail: 1 }));
      g.add(this.mesh('sphere', [crownR * 0.66, crownR * 0.58, crownR * 0.66], dark,
        [-crownR * 0.5, h * 0.64, -crownR * 0.32], { detail: 1 }));
      g.add(this.mesh('sphere', [crownR * 0.58, crownR * 0.52, crownR * 0.58], dark,
        [crownR * 0.36, h * 0.6, -crownR * 0.42], { detail: 1 }));
      g.add(this.mesh('sphere', [crownR * 0.5, crownR * 0.46, crownR * 0.5], light,
        [-crownR * 0.3, h * 0.9, crownR * 0.3], { detail: 1 }));

      // Zwei Aeste vom Stamm in die Krone.
      for (const side of [-1, 1]) {
        g.add(this.mesh('cylinder',
          [trunkR * 0.45, h * 0.26, trunkR * 0.45], TRUNK_BROWN,
          [side * crownR * 0.26, h * 0.56, 0], { rot: [0, 0, side * 0.55] }));
      }
      // Wurzelanlauf verbreitert den Stammfuss.
      g.add(this.mesh('cylinder', [trunkR * 1.5, h * 0.07, trunkR * 1.5], TRUNK_BROWN,
        [0, h * 0.035, 0]));
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
      [0, r * 0.55, 0],
      { rot: [rng.float(0, 1), rng.float(0, 6.28), rng.float(0, 1)], detail: 0, texture: 'rock' }));
    if (sizeFactor > 1) {
      g.add(this.mesh('dodeca', [r * 0.5, r * 0.4, r * 0.5], color,
        [r * 0.7, r * 0.3, r * 0.3], { rot: [0.4, 1.2, 0.3], detail: 0, texture: 'rock' }));
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
      g.add(this.mesh('box', [0.09, 1.05 * scale, 0.09], DARK_WOOD, [x, 0.52 * scale, 0],
        { texture: 'plank' }));
    }
    for (const y of [0.4, 0.76]) {
      g.add(this.mesh('box', [w, 0.08, 0.06], TRUNK_BROWN, [0, y * scale, 0],
        { texture: 'plank', repeat: 3 }));
    }
    // Zaeune sind Sperren, keine Deko: ohne Kollisionskoerper laeuft man
    // einfach hindurch. Der Kasten deckt die ganze Laenge ab.
    return {
      object: g, collisionRadius: 0, height: 1.05 * scale,
      // Die Tiefe ist bewusst groesser als das sichtbare Holz: das
      // Belegungsgitter hat 0,5 m Zellen, ein duenneres Band liesse bei
      // schraeg stehenden Zaeunen einzelne Zellen frei.
      collisionBox: { width: w + 0.25, depth: 0.8 },
    };
  }

  private sign(scale: number): PropResult {
    const g = new THREE.Group();
    g.add(this.mesh('cylinder', [0.05, 1.2 * scale, 0.05], DARK_WOOD, [0, 0.6 * scale, 0]));
    g.add(this.mesh('box', [0.9 * scale, 0.55 * scale, 0.08], '#c9a06b', [0, 1.15 * scale, 0],
      { texture: 'plank' }));
    g.add(this.mesh('box', [0.78 * scale, 0.42 * scale, 0.04], '#efe0c4', [0, 1.15 * scale, 0.055]));
    return { object: g, collisionRadius: 0.22, height: 1.45 * scale };
  }

  private lamp(scale: number): PropResult {
    const g = new THREE.Group();
    const h = 3.1 * scale;
    g.add(this.mesh('cylinder', [0.09, h, 0.09], '#3a3f47', [0, h * 0.5, 0]));
    g.add(this.mesh('cylinder', [0.26, 0.1, 0.26], '#2b3036', [0, h, 0]));
    // Ausleger und Laterne mit gemeinsamem Leuchtmaterial: tagsueber matt,
    // nachts hell - Strassenlaternen, die immer gleich aussehen, wirken tot.
    const head = this.mesh('sphere', [0.22, 0.26, 0.22], '#ffeab0', [0, h - 0.16, 0]);
    head.material = this.glowMaterial('#ffeab0');
    g.add(head);
    g.add(this.mesh('box', [0.5, 0.06, 0.06], '#2b3036', [0, h + 0.05, 0]));
    return { object: g, collisionRadius: 0.22, height: h };
  }

  /** Gemeinsames Leuchtmaterial fuer Laternen und Fackeln. */
  private glowMaterial(color: string): THREE.MeshLambertMaterial {
    const existing = this.glowMaterials.get(color);
    if (existing) return existing;
    const material = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      emissive: new THREE.Color(color),
      emissiveIntensity: 0.25,
      flatShading: true,
    });
    this.glowMaterials.set(color, material);
    return material;
  }

  /** Setzt die Leuchtstaerke der Lampen (0 = Tag, 1 = Nacht). */
  setNightGlow(amount: number): void {
    const value = 0.2 + Math.max(0, Math.min(1, amount)) * 1.5;
    for (const material of this.glowMaterials.values()) {
      material.emissiveIntensity = value;
    }
  }

  private barrel(scale: number): PropResult {
    const g = new THREE.Group();
    const r = 0.34 * scale;
    g.add(this.mesh('cylinder', [r, 0.9 * scale, r], '#7a5433', [0, 0.45 * scale, 0],
      { texture: 'plank', repeat: 2 }));
    for (const y of [0.24, 0.66]) {
      g.add(this.mesh('cylinder', [r * 1.06, 0.07, r * 1.06], '#4a4a4f', [0, y * scale, 0], { metal: 0.7 }));
    }
    return { object: g, collisionRadius: r * 1.1, height: 0.9 * scale };
  }

  private crate(scale: number): PropResult {
    const g = new THREE.Group();
    const s = 0.7 * scale;
    g.add(this.mesh('box', [s, s, s], '#a8804f', [0, s * 0.5, 0], { texture: 'plank' }));
    g.add(this.mesh('box', [s * 1.02, s * 0.1, s * 0.1], DARK_WOOD, [0, s * 0.5, s * 0.5]));
    return {
      object: g, collisionRadius: 0, height: s,
      collisionBox: { width: s * 1.05, depth: s * 1.05 },
    };
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
    return {
      object: g, collisionRadius: 0, height: 0.95 * scale,
      collisionBox: { width: 1.6 * scale, depth: 1.1 * scale },
    };
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
    g.add(this.mesh('box', [1.6 * scale, 0.1, 0.5 * scale], '#8a6b45', [0, 0.45 * scale, 0],
      { texture: 'plank', repeat: 2 }));
    g.add(this.mesh('box', [1.6 * scale, 0.5 * scale, 0.09], '#8a6b45',
      [0, 0.7 * scale, -0.22 * scale], { texture: 'plank', repeat: 2 }));
    for (const x of [-0.65, 0.65]) {
      g.add(this.mesh('box', [0.1, 0.45 * scale, 0.45 * scale], '#4a4a4f', [x * scale, 0.22 * scale, 0]));
    }
    return {
      object: g, collisionRadius: 0, height: 0.95 * scale,
      collisionBox: { width: 1.7 * scale, depth: 0.6 * scale },
    };
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
    return {
      object: g, collisionRadius: 0, height: 1.3 * scale,
      collisionBox: { width: 2.5 * scale, depth: 1.3 * scale },
    };
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
  // ------------------------------------------------------- Hof und Feld

  private haystack(rng: RNG, scale: number): PropResult {
    const g = new THREE.Group();
    const r = rng.float(0.8, 1.0) * scale;
    const h = r * 1.5;
    // Rundballen: liegender Zylinder mit Bindegurten.
    g.add(this.mesh('cylinder', [r, h, r], '#d8b866', [0, r, 0],
      { rot: [0, 0, Math.PI / 2], detail: 2, texture: 'sand', repeat: 2 }));
    for (const x of [-h * 0.22, h * 0.22]) {
      g.add(this.mesh('cylinder', [r * 1.02, 0.06, r * 1.02], '#a88a4a', [x, r, 0],
        { rot: [0, 0, Math.PI / 2], detail: 2 }));
    }
    return {
      object: g, collisionRadius: 0, height: r * 2,
      collisionBox: { width: h * 1.05, depth: r * 2.1 },
    };
  }

  private scarecrow(scale: number): PropResult {
    const g = new THREE.Group();
    const h = 2.1 * scale;
    g.add(this.mesh('box', [0.1, h, 0.1], DARK_WOOD, [0, h * 0.5, 0], { texture: 'plank' }));
    g.add(this.mesh('box', [1.3 * scale, 0.09, 0.09], DARK_WOOD, [0, h * 0.72, 0]));
    // Hemd, Kopf und Hut - der Kopf ist ein Strohsack, kein Kuerbis.
    g.add(this.mesh('box', [0.62 * scale, 0.7 * scale, 0.3 * scale], '#a8483f',
      [0, h * 0.62, 0]));
    g.add(this.mesh('sphere', [0.24 * scale, 0.26 * scale, 0.24 * scale], '#d8bd7a',
      [0, h * 0.95, 0], { detail: 1 }));
    g.add(this.mesh('cone', [0.42 * scale, 0.3 * scale, 0.42 * scale], '#8a6b3f',
      [0, h * 1.1, 0], { detail: 1 }));
    return { object: g, collisionRadius: 0.4 * scale, height: h * 1.2 };
  }

  private woodpile(rng: RNG, scale: number): PropResult {
    const g = new THREE.Group();
    const w = 1.8 * scale;
    const logR = 0.14 * scale;
    // Drei Lagen gestapelter Scheite, jede leicht versetzt.
    for (let row = 0; row < 3; row++) {
      const count = 5 - row;
      for (let i = 0; i < count; i++) {
        const x = (i - (count - 1) / 2) * logR * 2.1;
        g.add(this.mesh('cylinder', [logR, w, logR],
          row % 2 === 0 ? TRUNK_BROWN : '#7a5a3a',
          [x, logR + row * logR * 1.9, 0],
          { rot: [Math.PI / 2, 0, rng.float(-0.04, 0.04)], detail: 1, texture: 'bark' }));
      }
    }
    return {
      object: g, collisionRadius: 0, height: logR * 6,
      collisionBox: { width: 1.6 * scale, depth: w * 1.05 },
    };
  }

  private stall(rng: RNG, scale: number): PropResult {
    const g = new THREE.Group();
    const w = 2.4 * scale;
    const d = 1.4 * scale;
    const h = 2.2 * scale;
    for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) {
      for (const z of [-d / 2 + 0.1, d / 2 - 0.1]) {
        g.add(this.mesh('box', [0.09, h, 0.09], DARK_WOOD, [x, h * 0.5, z]));
      }
    }
    // Ladentisch mit Waren und ein gestreiftes Dach.
    g.add(this.mesh('box', [w, 0.1, d], '#a8804f', [0, 0.95 * scale, 0],
      { texture: 'plank', repeat: 2 }));
    const cloth = ['#c4563f', '#3f7fbf', '#4b8f5f'][rng.int(0, 2)]!;
    g.add(this.mesh('box', [w * 1.12, 0.09, d * 1.25], cloth, [0, h, 0], { rot: [0.12, 0, 0] }));
    for (let i = 0; i < 3; i++) {
      g.add(this.mesh('sphere', [0.16 * scale, 0.16 * scale, 0.16 * scale],
        ['#d8553f', '#e0a83f', '#7fb84b'][i]!,
        [(i - 1) * 0.5 * scale, 1.06 * scale, 0], { detail: 1 }));
    }
    return {
      object: g, collisionRadius: 0, height: h,
      collisionBox: { width: w, depth: d },
    };
  }

  private laundry(rng: RNG, scale: number): PropResult {
    const g = new THREE.Group();
    const w = 3.2 * scale;
    const h = 1.9 * scale;
    for (const x of [-w / 2, w / 2]) {
      g.add(this.mesh('box', [0.08, h, 0.08], DARK_WOOD, [x, h * 0.5, 0]));
      g.add(this.mesh('box', [0.5 * scale, 0.07, 0.07], DARK_WOOD, [x, h * 0.92, 0]));
    }
    g.add(this.mesh('box', [w, 0.03, 0.03], '#d8d2c4', [0, h * 0.9, 0]));
    // Vier Waeschestuecke haengen leicht unterschiedlich tief.
    const colors = ['#e8e4d8', '#7fb0d8', '#d88fa8', '#bfd88f'];
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * w * 0.22;
      const drop = rng.float(0.42, 0.62) * scale;
      g.add(this.mesh('plane', [0.5 * scale, drop, 0.02], colors[i]!,
        [x, h * 0.9 - drop / 2, 0]));
    }
    return { object: g, collisionRadius: 0, height: h };
  }

  private planter(rng: RNG, palette: BiomePalette, scale: number): PropResult {
    const g = new THREE.Group();
    const w = 1.8 * scale;
    const d = 1.0 * scale;
    g.add(this.mesh('box', [w, 0.42 * scale, d], '#8a6b45', [0, 0.21 * scale, 0],
      { texture: 'plank', repeat: 2 }));
    g.add(this.mesh('box', [w * 0.92, 0.08, d * 0.86], '#4a3a2a', [0, 0.42 * scale, 0]));
    // Gemuesereihen: kleine Buschel in zwei Reihen.
    for (let i = 0; i < 6; i++) {
      const x = ((i % 3) - 1) * w * 0.3;
      const z = (Math.floor(i / 3) - 0.5) * d * 0.45;
      g.add(this.mesh('sphere', [0.19 * scale, 0.17 * scale, 0.19 * scale],
        palette.grass, [x, 0.5 * scale, z], { detail: 1 }));
      if (rng.chance(0.4)) {
        g.add(this.mesh('sphere', [0.07 * scale, 0.07 * scale, 0.07 * scale],
          '#d8553f', [x, 0.62 * scale, z], { detail: 0 }));
      }
    }
    return {
      object: g, collisionRadius: 0, height: 0.7 * scale,
      collisionBox: { width: w, depth: d },
    };
  }

  private hedge(rng: RNG, palette: BiomePalette, scale: number): PropResult {
    const g = new THREE.Group();
    const w = 2.4 * scale;
    // Hoeher als Augenhoehe: eine 1,35 m hohe Hecke sieht von der
    // Schulterkamera aus wie ein Busch, und ein Labyrinth aus Buescheln
    // liest sich nicht als Labyrinth.
    const h = 1.95 * scale;
    const d = 0.95 * scale;
    // Nur leicht dunkler als das Gras: mit -0.16 Helligkeit lagen die
    // sonnenabgewandten Seiten unter reinem Umgebungslicht fast bei
    // Schwarz - eine Heckenreihe sah dann aus wie eine Mauer aus Teer.
    const leaf = new THREE.Color(palette.grass).offsetHSL(-0.02, 0.08, -0.07);
    const body = `#${leaf.getHexString()}`;
    g.add(this.mesh('box', [w, h, d], body, [0, h * 0.5, 0]));
    // Heller Schnitt oben und dunkler Sockel: das gibt der Hecke Volumen.
    g.add(this.mesh('box', [w * 1.03, 0.12 * scale, d * 1.04],
      `#${leaf.clone().offsetHSL(0, 0, 0.08).getHexString()}`, [0, h, 0]));
    g.add(this.mesh('box', [w * 1.01, 0.22 * scale, d * 1.02],
      `#${leaf.clone().offsetHSL(0, 0, -0.06).getHexString()}`, [0, 0.11 * scale, 0]));
    // Aufgesetzte Ballen brechen die Quaderform auf. Die Helligkeit kommt
    // aus drei festen Stufen, nicht frei gewuerfelt: jede neue Farbe ist ein
    // eigenes Material, und Materialien, die sich nur um ein Prozent
    // unterscheiden, sprengen das Zusammenfassen der Requisiten.
    const step = rng.int(0, 2);
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * w * 0.32;
      const shade = ((i + step) % 3) * 0.035 - 0.02;
      g.add(this.mesh('sphere', [w * 0.22, h * 0.22, d * 0.62],
        `#${leaf.clone().offsetHSL(0, 0, shade).getHexString()}`,
        [x, h * 1.01, 0], { detail: 1 }));
    }
    return {
      object: g, collisionRadius: 0, height: h * 1.2,
      // Wie beim Zaun grosszuegig: das Belegungsgitter hat 0,5-m-Zellen.
      collisionBox: { width: w + 0.2, depth: d + 0.25 },
    };
  }

  private windmill(scale: number): PropResult {
    const g = new THREE.Group();
    const h = 7.5 * scale;
    const r = 1.5 * scale;
    g.add(this.mesh('cylinder', [r, h, r * 0.72], '#d8d0bd', [0, h * 0.5, 0],
      { detail: 2, texture: 'stone', repeat: 3 }));
    g.add(this.mesh('cone', [r * 0.95, 1.4 * scale, r * 0.95], '#7a4f3f',
      [0, h + 0.7 * scale, 0], { detail: 2, texture: 'shingle' }));
    // Fluegelkreuz an der Vorderseite (lokal -Z).
    const hub = new THREE.Group();
    hub.position.set(0, h * 0.82, -r * 0.8);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i / 4) * Math.PI * 2;
      arm.add(this.mesh('box', [0.16 * scale, 3.4 * scale, 0.12 * scale], '#8a6b45',
        [0, 1.7 * scale, 0], { texture: 'plank', repeat: 3 }));
      arm.add(this.mesh('box', [0.62 * scale, 2.4 * scale, 0.05 * scale], '#e8e0cc',
        [0.3 * scale, 1.9 * scale, 0.08 * scale]));
      hub.add(arm);
    }
    hub.add(this.mesh('cylinder', [0.24 * scale, 0.4 * scale, 0.24 * scale], '#5a4a3a',
      [0, 0, 0], { rot: [Math.PI / 2, 0, 0], detail: 1 }));
    g.add(hub);
    g.add(this.mesh('box', [1.1 * scale, 1.9 * scale, 0.14 * scale], DARK_WOOD,
      [0, 0.95 * scale, -r * 0.72], { texture: 'plank' }));
    return { object: g, collisionRadius: r * 1.1, height: h + 2 * scale };
  }

  private trough(scale: number): PropResult {
    const g = new THREE.Group();
    const w = 1.9 * scale;
    const d = 0.7 * scale;
    g.add(this.mesh('box', [w, 0.5 * scale, d], '#7a5f45', [0, 0.25 * scale, 0],
      { texture: 'plank', repeat: 2 }));
    g.add(this.mesh('box', [w * 0.9, 0.06, d * 0.78], '#3f6f8f', [0, 0.46 * scale, 0]));
    return {
      object: g, collisionRadius: 0, height: 0.55 * scale,
      collisionBox: { width: w, depth: d },
    };
  }

  private beehive(scale: number): PropResult {
    const g = new THREE.Group();
    const r = 0.44 * scale;
    for (let i = 0; i < 4; i++) {
      g.add(this.mesh('box', [r * 2, 0.22 * scale, r * 1.7], i % 2 === 0 ? '#e0d2a8' : '#d0c090',
        [0, 0.12 * scale + i * 0.22 * scale, 0]));
    }
    g.add(this.mesh('box', [r * 2.3, 0.1 * scale, r * 2], '#8a6b45', [0, 1.02 * scale, 0]));
    return { object: g, collisionRadius: r * 1.2, height: 1.1 * scale };
  }

  private sack(rng: RNG, scale: number): PropResult {
    const g = new THREE.Group();
    const r = rng.float(0.3, 0.38) * scale;
    g.add(this.mesh('capsule', [r, r * 1.1, r], '#c9b088', [0, r * 1.1, 0], { detail: 1 }));
    g.add(this.mesh('cylinder', [r * 0.4, 0.14 * scale, r * 0.4], '#a8926b',
      [0, r * 2.15, 0], { detail: 1 }));
    return { object: g, collisionRadius: r * 1.15, height: r * 2.4 };
  }

  private ladder(scale: number): PropResult {
    const g = new THREE.Group();
    const h = 2.8 * scale;
    for (const x of [-0.26 * scale, 0.26 * scale]) {
      g.add(this.mesh('box', [0.08, h, 0.08], '#a8804f', [x, h * 0.5, 0], { texture: 'plank' }));
    }
    for (let i = 1; i < 7; i++) {
      g.add(this.mesh('box', [0.6 * scale, 0.06, 0.06], '#8a6b45', [0, (i / 7) * h, 0]));
    }
    g.rotation.x = -0.14;
    return { object: g, collisionRadius: 0.4 * scale, height: h };
  }

  /**
   * Getreide-, Mais- und Gemuesefelder als Instanzen.
   *
   * Ein Feld besteht aus mehreren tausend Halmen. Als Einzelobjekte waere
   * das unbezahlbar; als Instanz-Zeichnung kostet ein ganzes Feld einen
   * Zeichenaufruf - dieselbe Technik wie beim hohen Gras.
   */
  createCropInstances(
    crop: CropKind,
    positions: { x: number; y: number; z: number; scale: number }[],
  ): THREE.InstancedMesh {
    const spec = CROP_SPECS[crop];
    const geometry = this.assets.getGeometry(`crop:${crop}`)
      ?? this.buildCropGeometry(crop);
    const material = this.assets.getMaterial({
      color: spec.base, flatShading: true, doubleSided: true, vertexColors: true,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, positions.length));
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]!;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, (i * 2.399963) % (Math.PI * 2), 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // Nur Helligkeitsstreuung: den Farbverlauf traegt die Geometrie.
      const shade = 0.88 + Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1) * 0.24;
      color.setRGB(shade, shade, shade);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.name = `crop:${crop}`;
    mesh.count = positions.length;
    return mesh;
  }

  private buildCropGeometry(crop: CropKind): THREE.BufferGeometry {
    const spec = CROP_SPECS[crop];
    const parts: { geometry: THREE.BufferGeometry; low: number; high: number }[] = [];

    /**
     * Ein einzelner Halm: unten breit, oben spitz und leicht geneigt.
     * Ein Rechteck sah aus wie ein Brett im Boden, nicht wie Getreide.
     */
    const blade = (width: number, height: number, lean: number): THREE.BufferGeometry => {
      const plane = new THREE.PlaneGeometry(width, height, 1, 1);
      const pos = plane.attributes.position as THREE.BufferAttribute;
      // Scheitel 0 und 1 liegen oben: dort auf einen Punkt zusammenziehen
      // und seitlich versetzen, das gibt den Bogen des Halms.
      for (const i of [0, 1]) {
        pos.setX(i, pos.getX(i) * 0.12 + lean);
      }
      pos.needsUpdate = true;
      plane.translate(0, height / 2, 0);
      return plane;
    };

    for (let i = 0; i < spec.blades; i++) {
      const t = i / spec.blades;
      const height = spec.height * (0.82 + 0.3 * ((i * 0.37) % 1));
      const g = blade(spec.width * 0.34, height, spec.width * (0.18 - 0.36 * t));
      g.rotateY(t * Math.PI + 0.4);
      g.translate(Math.cos(t * 7.1) * spec.width * 0.2, 0, Math.sin(t * 7.1) * spec.width * 0.2);
      parts.push({ geometry: g, low: 0.62, high: 1.0 });
    }

    if (spec.ear > 0) {
      // Aehre bzw. Kolben: zwei gekreuzte Flaechen ganz oben, heller als
      // der Halm - sie traegt die Farbe, an der man die Frucht erkennt.
      for (const angle of [0, Math.PI / 2]) {
        const ear = new THREE.PlaneGeometry(spec.width * 0.46, spec.ear, 1, 1);
        ear.translate(0, spec.height + spec.ear * 0.35, 0);
        ear.rotateY(angle);
        parts.push({ geometry: ear, low: 1.0, high: 1.0 });
      }
    }

    // Scheitelfarben: dunkel am Boden, hell an der Spitze. Ohne sie waere
    // ein Feld eine einzige flache Farbflaeche.
    const tip = new THREE.Color(spec.tip);
    const base = new THREE.Color(spec.base);
    const ratio = (a: number, b: number): number => (b > 0.02 ? Math.min(2.5, a / b) : 1);
    const earTint: [number, number, number] = [
      ratio(tip.r, base.r), ratio(tip.g, base.g), ratio(tip.b, base.b),
    ];

    const geometries: THREE.BufferGeometry[] = [];
    const maxY = spec.height + spec.ear;
    for (const part of parts) {
      const pos = part.geometry.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(pos.count * 3);
      for (let v = 0; v < pos.count; v++) {
        const t = Math.min(1, pos.getY(v) / maxY);
        const shade = part.low + (part.high - part.low) * t;
        const mix = part.low === 1 ? 1 : t;
        colors[v * 3] = shade * (1 + (earTint[0] - 1) * mix);
        colors[v * 3 + 1] = shade * (1 + (earTint[1] - 1) * mix);
        colors[v * 3 + 2] = shade * (1 + (earTint[2] - 1) * mix);
      }
      part.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometries.push(part.geometry);
    }
    return this.assets.registerGeometry(`crop:${crop}`, mergeGeometries(geometries));
  }

  createGrassInstances(
    positions: { x: number; y: number; z: number; scale: number }[],
    palette: BiomePalette,
  ): THREE.InstancedMesh {
    const geometry = this.assets.getGeometry('grassTuft') ?? this.buildGrassTuftGeometry();
    const material = this.assets.getMaterial({
      color: palette.grass, flatShading: true, doubleSided: true, vertexColors: true,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, positions.length));
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    // Die Instanzfarbe wirkt multiplikativ auf die Materialfarbe: der
    // Zielton "grassAlt" wird deshalb als Verhaeltnis zu "grass" gesetzt.
    const baseA = new THREE.Color(palette.grass);
    const baseB = new THREE.Color(palette.grassAlt);
    const ratio = (a: number, b: number): number => (b > 0.02 ? Math.min(2.2, a / b) : 1);
    const alt: [number, number, number] = [
      ratio(baseB.r, baseA.r), ratio(baseB.g, baseA.g), ratio(baseB.b, baseA.b),
    ];

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]!;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, (i * 2.399963) % (Math.PI * 2), 0);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const t = Math.abs((Math.sin(i * 12.9898) * 43758.5453) % 1);
      color.setRGB(
        1 + (alt[0] - 1) * t, 1 + (alt[1] - 1) * t, 1 + (alt[2] - 1) * t,
      );
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

  /**
   * Streudetails fuer den Boden: kurze Halme, Blumen und Kiesel.
   *
   * Alles in je einer Instanz-Zeichnung, damit auch mehrere tausend Objekte
   * praktisch nichts kosten. Ohne diese Schicht wirken Wiesen und Ortsplaetze
   * wie einfarbige Flaechen.
   */
  createDetailInstances(
    kind: 'blade' | 'flower' | 'pebble',
    positions: { x: number; y: number; z: number; scale: number; tint: number }[],
    palette: BiomePalette,
  ): THREE.InstancedMesh {
    const geometry = this.detailGeometry(kind);
    const material = this.assets.getMaterial({
      color: '#ffffff', flatShading: true,
      doubleSided: kind !== 'pebble',
    });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, positions.length));
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();

    const palettes: Record<typeof kind, [string, string]> = {
      blade: [palette.grass, palette.grassAlt],
      flower: ['#ffffff', '#ffffff'],
      pebble: [palette.slope, palette.peak],
    };
    const flowerColors = ['#f2d24b', '#e8737f', '#d8a8f0', '#f5f0e0', '#8fd8f2'];
    const [a, b] = palettes[kind];
    const baseA = new THREE.Color(a);
    const baseB = new THREE.Color(b);

    for (let i = 0; i < positions.length; i++) {
      const p = positions[i]!;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, p.tint * Math.PI * 2, 0);
      dummy.scale.set(p.scale, p.scale * (kind === 'blade' ? 1.15 : 1), p.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      if (kind === 'flower') {
        color.set(flowerColors[Math.floor(p.tint * flowerColors.length) % flowerColors.length]!);
      } else {
        color.copy(baseA).lerp(baseB, p.tint);
        color.offsetHSL(0, 0, (p.tint - 0.5) * 0.08);
      }
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = kind === 'pebble';
    mesh.name = `detail-${kind}`;
    mesh.count = positions.length;
    return mesh;
  }

  private detailGeometry(kind: 'blade' | 'flower' | 'pebble'): THREE.BufferGeometry {
    const key = `detail-${kind}`;
    const cached = this.assets.getGeometry(key);
    if (cached) return cached;

    let geometry: THREE.BufferGeometry;
    if (kind === 'blade') {
      // Drei schmale, nach oben spitz zulaufende Halme in Sternform. Ein
      // Rechteck wuerde aus der Naehe wie ein Pappschild aussehen.
      const positions: number[] = [];
      const normals: number[] = [];
      const uvs: number[] = [];
      const blades = 3;
      for (let i = 0; i < blades; i++) {
        const angle = (i / blades) * Math.PI * 2 + 0.4;
        const dx = Math.cos(angle);
        const dz = Math.sin(angle);
        // Leichte Neigung, damit der Halm nicht kerzengerade steht.
        const tipX = dx * 0.09;
        const tipZ = dz * 0.09;
        const halfX = -dz * 0.045;
        const halfZ = dx * 0.045;
        positions.push(
          -halfX, 0, -halfZ,
          halfX, 0, halfZ,
          tipX, 0.34, tipZ,
        );
        for (let n = 0; n < 3; n++) {
          normals.push(-dz, 0.35, dx);
        }
        uvs.push(0, 0, 1, 0, 0.5, 1);
      }
      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      geometry.computeBoundingSphere();
    } else if (kind === 'flower') {
      // Stiel, Bluetenmitte und fuenf Blaetter - eine flache Scheibe auf
      // einem Stiel sieht aus der Naehe wie ein Nagel aus.
      const parts: THREE.BufferGeometry[] = [];
      const stem = new THREE.CylinderGeometry(0.012, 0.016, 0.22, 3);
      stem.translate(0, 0.11, 0);
      parts.push(stem);
      const leaf = new THREE.PlaneGeometry(0.05, 0.07);
      leaf.rotateX(-Math.PI / 2.6);
      leaf.translate(0.03, 0.1, 0);
      parts.push(leaf);
      const petals = 5;
      for (let i = 0; i < petals; i++) {
        const angle = (i / petals) * Math.PI * 2;
        const petal = new THREE.PlaneGeometry(0.075, 0.05);
        petal.rotateX(-Math.PI / 2);
        petal.rotateZ(0.35);
        petal.translate(Math.cos(angle) * 0.05, 0.225, Math.sin(angle) * 0.05);
        petal.rotateY(angle);
        parts.push(petal);
      }
      const core = new THREE.IcosahedronGeometry(0.032, 0);
      core.scale(1, 0.7, 1);
      core.translate(0, 0.235, 0);
      parts.push(core);
      geometry = mergeGeometries(parts);
    } else {
      geometry = new THREE.DodecahedronGeometry(0.16, 0);
      geometry.scale(1, 0.5, 1.2);
      geometry.translate(0, 0.04, 0);
    }
    return this.assets.registerGeometry(key, geometry);
  }

  private buildGrassTuftGeometry(): THREE.BufferGeometry {
    // Drei gekreuzte Quads ergeben aus jeder Richtung ein volles Bueschel.
    const geometries: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 3; i++) {
      const plane = new THREE.PlaneGeometry(0.85, 0.95, 1, 2);
      plane.translate(0, 0.475, 0);
      plane.rotateY((i / 3) * Math.PI);
      // Unten dunkel, oben hell - das Bueschel bekommt dadurch Tiefe und
      // das Material darf Scheitelfarben nutzen (Vorbedingung dafuer,
      // dass die Instanzfarbe ueberhaupt sichtbar wird).
      const pos = plane.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(pos.count * 3);
      for (let v = 0; v < pos.count; v++) {
        const shade = 0.68 + Math.min(1, pos.getY(v) / 0.95) * 0.38;
        colors[v * 3] = shade;
        colors[v * 3 + 1] = shade;
        colors[v * 3 + 2] = shade;
      }
      plane.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geometries.push(plane);
    }
    const merged = mergeGeometries(geometries);
    return this.assets.registerGeometry('grassTuft', merged);
  }
}

/** Verschmilzt mehrere Geometrien zu einer (Position/Normal/UV/Farbe). */
export function mergeGeometries(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  let vertexCount = 0;
  let indexCount = 0;
  // Scheitelfarben nur uebernehmen, wenn ALLE Teile welche haben - sonst
  // blieben die uebrigen Scheitel schwarz und schluckten das Material.
  let withColor = list.length > 0;
  for (const g of list) {
    vertexCount += g.attributes.position.count;
    indexCount += g.index ? g.index.count : g.attributes.position.count;
    if (!g.attributes.color) withColor = false;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const colors = withColor ? new Float32Array(vertexCount * 3) : null;
  const indices = new Uint32Array(indexCount);

  let vOffset = 0;
  let iOffset = 0;
  for (const g of list) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nrm = g.attributes.normal as THREE.BufferAttribute | undefined;
    const uv = g.attributes.uv as THREE.BufferAttribute | undefined;
    const col = g.attributes.color as THREE.BufferAttribute | undefined;
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
      if (colors && col) {
        colors[(vOffset + i) * 3] = col.getX(i);
        colors[(vOffset + i) * 3 + 1] = col.getY(i);
        colors[(vOffset + i) * 3 + 2] = col.getZ(i);
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
  if (colors) out.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeBoundingSphere();
  return out;
}
