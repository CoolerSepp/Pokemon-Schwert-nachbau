import * as THREE from 'three';
import type { AssetManager } from '@/engine/AssetManager';
import { RNG } from '@/core/RNG';
import type { BuildingPlacement } from '@/data/schema';

export interface BuildingResult {
  object: THREE.Group;
  /** Grundflaeche fuer die Kollision. */
  footprint: { width: number; depth: number };
  /** Tuerposition relativ zum Gebaeudemittelpunkt (lokal, ungedreht). */
  door: { x: number; z: number; width: number } | null;
  height: number;
}

const WALL_COLORS = ['#efe4d2', '#e6d5bb', '#dcc9ae', '#f2ece0', '#d8cbb8', '#e8d8c0'];
const ROOF_COLORS = ['#b5533f', '#8f5a3f', '#4f6f8f', '#7a4f6b', '#5f7a4f', '#8f7a3f'];
const TRIM_COLORS = ['#6b4f33', '#4a4a52', '#7a5f3f', '#3f5f6b'];

/**
 * Prozedurale Gebaeude.
 *
 * Jeder Gebaeudetyp hat eine eigene, wiedererkennbare Silhouette - Arenen
 * sind kuppelfoermig, Heilstationen haben ein markantes Dach, Haeuser sind
 * schlicht. Varianten steuern Farbe und Proportionen.
 */
export class BuildingFactory {
  /** Fenstermaterialien nach Farbe - gemeinsam, damit das Nachtlicht wirkt. */
  private readonly windowMaterials = new Map<string, THREE.MeshLambertMaterial>();

  constructor(private readonly assets: AssetManager) {}

  create(placement: BuildingPlacement, accent?: string): BuildingResult {
    const rng = new RNG(`${placement.kind}-${placement.variant ?? 0}-${placement.pos[0]}-${placement.pos[1]}`);
    const scale = placement.scale ?? 1;
    switch (placement.kind) {
      case 'house': return this.house(rng, scale, false);
      case 'hut': return this.house(rng, scale * 0.78, true);
      case 'shop': return this.shop(rng, scale, accent ?? '#3f7fbf');
      case 'center': return this.center(rng, scale, accent ?? '#d8455f');
      case 'gym': return this.gym(rng, scale, accent ?? '#7fc44b');
      case 'stadium': return this.stadium(rng, scale, accent ?? '#7fc44b');
      case 'lab': return this.lab(rng, scale);
      case 'station': return this.station(rng, scale);
      case 'tower': return this.tower(rng, scale);
      case 'warehouse': return this.warehouse(rng, scale);
      case 'ruin': return this.ruin(rng, scale);
    }
  }

  private box(
    size: [number, number, number], color: string, pos: [number, number, number],
    opts: { rot?: [number, number, number]; metal?: number; emissive?: number; opacity?: number } = {},
  ): THREE.Mesh {
    const geo = this.assets.getShape('box', 1);
    const mat = this.assets.getMaterial({
      color, flatShading: true, metalness: opts.metal ?? 0,
      emissive: opts.emissive ?? 0, opacity: opts.opacity ?? 1,
    });
    const m = new THREE.Mesh(geo, mat);
    m.scale.set(size[0] * 0.5, size[1] * 0.5, size[2] * 0.5);
    m.position.set(pos[0], pos[1], pos[2]);
    if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  private shape(
    kind: Parameters<AssetManager['getShape']>[0], size: [number, number, number],
    color: string, pos: [number, number, number],
    opts: { rot?: [number, number, number]; detail?: number; metal?: number; emissive?: number; opacity?: number } = {},
  ): THREE.Mesh {
    const geo = this.assets.getShape(kind, opts.detail ?? 2);
    const mat = this.assets.getMaterial({
      color, flatShading: true, metalness: opts.metal ?? 0,
      emissive: opts.emissive ?? 0, opacity: opts.opacity ?? 1,
    });
    const m = new THREE.Mesh(geo, mat);
    const halfY = kind === 'cone' || kind === 'cylinder' ? 0.5 : 1;
    m.scale.set(size[0], size[1] * halfY, size[2]);
    m.position.set(pos[0], pos[1], pos[2]);
    if (opts.rot) m.rotation.set(opts.rot[0], opts.rot[1], opts.rot[2]);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  /** Tuer mit Rahmen an der Vorderseite (+Z). */
  private addDoor(g: THREE.Group, width: number, height: number, depth: number, color: string): void {
    g.add(this.box([width + 0.24, height + 0.2, 0.16], color, [0, (height + 0.2) / 2, depth / 2 + 0.02]));
    g.add(this.box([width, height, 0.1], '#3a2a1c', [0, height / 2, depth / 2 + 0.1]));
  }

  /**
   * Fenster mit Rahmen, Scheibe, Sprossen und Sims - auf Vorder- und
   * Rueckseite. Eine nackte farbige Flaeche wirkt aus der Naehe wie ein
   * aufgemalter Fleck.
   */
  private addWindows(
    g: THREE.Group, wallWidth: number, wallDepth: number, y: number,
    count: number, color = '#9fd8f2', frame = '#f5efe2', size = 0.78,
  ): void {
    const step = wallWidth / (count + 1);
    const halfDepth = wallDepth / 2;
    for (let i = 1; i <= count; i++) {
      const x = -wallWidth / 2 + step * i;
      for (const side of [1, -1]) {
        const z = side * (halfDepth + 0.04);
        // Rahmen
        g.add(this.box([size + 0.2, size + 0.2, 0.1], frame, [x, y, z]));
        // Scheibe
        const pane = this.box([size, size, 0.06], color, [x, y, z + side * 0.05]);
        pane.material = this.windowMaterial(color);
        g.add(pane);
        // Sprossenkreuz
        g.add(this.box([size + 0.02, 0.07, 0.09], frame, [x, y, z + side * 0.06]));
        g.add(this.box([0.07, size + 0.02, 0.09], frame, [x, y, z + side * 0.06]));
        // Sims
        g.add(this.box([size + 0.34, 0.1, 0.28], frame, [x, y - size / 2 - 0.14, z + side * 0.1]));
      }
    }
  }

  /**
   * Gemeinsames Fenstermaterial.
   *
   * Wird nachts vom WorldManager zum Leuchten gebracht - ein bewohnter Ort
   * ohne Licht in den Fenstern wirkt tot.
   */
  private windowMaterial(color: string): THREE.MeshLambertMaterial {
    const existing = this.windowMaterials.get(color);
    if (existing) return existing;
    const material = new THREE.MeshLambertMaterial({
      color: new THREE.Color(color),
      // Warmes Licht von innen: tagsueber kaum sichtbar, nachts deutlich.
      emissive: new THREE.Color('#ffcf8a'),
      emissiveIntensity: 0.1,
      flatShading: true,
    });
    this.windowMaterials.set(color, material);
    return material;
  }

  /** Setzt das Fensterleuchten (0 = Tag, 1 = Nacht). */
  setNightGlow(amount: number): void {
    const value = 0.1 + Math.max(0, Math.min(1, amount)) * 0.95;
    for (const material of this.windowMaterials.values()) {
      material.emissiveIntensity = value;
    }
  }

  /** Sockel: dunkles Band am Fuss der Wand. */
  private addPlinth(g: THREE.Group, w: number, d: number, color: string, height = 0.34): void {
    g.add(this.box([w + 0.22, height, d + 0.22], color, [0, height / 2, 0]));
  }

  /** Eckbalken an den vier Hausecken. */
  private addCorners(g: THREE.Group, w: number, h: number, d: number, color: string): void {
    const t = 0.22;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        g.add(this.box([t, h, t], color, [sx * (w / 2 - t * 0.3), h / 2, sz * (d / 2 - t * 0.3)]));
      }
    }
  }

  /**
   * Giebeldreieck aus gestapelten Platten.
   *
   * Ohne Giebel steht das Satteldach wie ein Deckel auf offenen Waenden.
   */
  private addGable(
    g: THREE.Group, w: number, h: number, z: number, roofH: number, color: string,
  ): void {
    // Echtes Dreieck statt einer Treppe aus Quadern: nur so schliesst der
    // Giebel buendig mit den Dachflaechen ab.
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0);
    shape.lineTo(w / 2, 0);
    shape.lineTo(0, roofH);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: false });
    geometry.translate(0, 0, -0.09);
    const material = this.assets.getMaterial({ color, flatShading: true });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, h, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }

  /** Fenster an den beiden Laengsseiten (+X und -X). */
  private addSideWindows(
    g: THREE.Group, wallDepth: number, wallWidth: number, y: number,
    count: number, color: string, frame: string, size: number,
  ): void {
    const step = wallDepth / (count + 1);
    const halfWidth = wallWidth / 2;
    for (let i = 1; i <= count; i++) {
      const z = -wallDepth / 2 + step * i;
      for (const side of [1, -1]) {
        const x = side * (halfWidth + 0.04);
        g.add(this.box([0.1, size + 0.2, size + 0.2], frame, [x, y, z]));
        const pane = this.box([0.06, size, size], color, [x + side * 0.05, y, z]);
        pane.material = this.windowMaterial(color);
        g.add(pane);
        g.add(this.box([0.09, 0.07, size + 0.02], frame, [x + side * 0.06, y, z]));
        g.add(this.box([0.09, size + 0.02, 0.07], frame, [x + side * 0.06, y, z]));
        g.add(this.box([0.28, 0.1, size + 0.34], frame, [x + side * 0.1, y - size / 2 - 0.14, z]));
      }
    }
  }

  private house(rng: RNG, scale: number, small: boolean): BuildingResult {
    const g = new THREE.Group();
    const w = (small ? 4.2 : rng.float(5.4, 7.2)) * scale;
    const d = (small ? 4.0 : rng.float(5.0, 6.6)) * scale;
    const h = (small ? 2.6 : rng.float(3.0, 3.8)) * scale;
    const wall = rng.pick(WALL_COLORS);
    const roof = rng.pick(ROOF_COLORS);
    const trim = rng.pick(TRIM_COLORS);

    g.add(this.box([w, h, d], wall, [0, h / 2, 0]));
    this.addPlinth(g, w, d, trim, 0.38 * scale);
    this.addCorners(g, w, h, d, trim);

    // Satteldach aus zwei geneigten Platten, mit Ueberstand und Randbrett.
    const roofH = h * 0.55;
    const slope = Math.atan2(roofH, w / 2);
    const panelLen = Math.hypot(w / 2, roofH) * 1.12;
    const roofDepth = d * 1.18;
    for (const dir of [-1, 1]) {
      g.add(this.box([panelLen, 0.18 * scale, roofDepth], roof,
        [(dir * w) / 4, h + roofH / 2, 0], { rot: [0, 0, -dir * slope] }));
      // Dunkles Randbrett an der Traufe.
      g.add(this.box([panelLen, 0.1 * scale, 0.2], trim,
        [(dir * w) / 4, h + roofH / 2 - 0.06, roofDepth / 2], { rot: [0, 0, -dir * slope] }));
      g.add(this.box([panelLen, 0.1 * scale, 0.2], trim,
        [(dir * w) / 4, h + roofH / 2 - 0.06, -roofDepth / 2], { rot: [0, 0, -dir * slope] }));
    }
    // Firstbalken
    g.add(this.box([0.26, 0.26, roofDepth * 1.01], trim, [0, h + roofH + 0.06, 0]));
    // Giebel schliessen die Stirnseiten.
    for (const side of [1, -1]) {
      this.addGable(g, w * 0.985, h, side * (d / 2 - 0.06), roofH, wall);
    }
    // Schornstein mit Krone.
    const chimX = w * 0.28;
    g.add(this.box([0.52 * scale, 1.3 * scale, 0.52 * scale], trim,
      [chimX, h + roofH * 0.85, d * 0.2]));
    g.add(this.box([0.68 * scale, 0.16 * scale, 0.68 * scale], '#4a4038',
      [chimX, h + roofH * 0.85 + 0.68 * scale, d * 0.2]));

    this.addWindows(g, w * 0.78, d, h * 0.62, small ? 1 : 2, '#bfe4f7', wall, 0.8 * scale);
    this.addSideWindows(g, d * 0.72, w, h * 0.62, small ? 1 : 2, '#bfe4f7', wall, 0.8 * scale);
    this.addDoor(g, 1.1 * scale, 2.0 * scale, d, trim);
    // Eingangsstufe und kleines Vordach.
    g.add(this.box([1.8 * scale, 0.16 * scale, 0.9 * scale], '#b8ae9b',
      [0, 0.08 * scale, d / 2 + 0.45 * scale]));
    g.add(this.box([1.9 * scale, 0.12 * scale, 1.0 * scale], roof,
      [0, 2.35 * scale, d / 2 + 0.35 * scale], { rot: [0.22, 0, 0] }));

    return {
      object: g, footprint: { width: w, depth: d },
      door: { x: 0, z: d / 2 + 0.6, width: 1.4 * scale },
      height: h + roofH,
    };
  }

  private shop(rng: RNG, scale: number, accent: string): BuildingResult {
    const g = new THREE.Group();
    const w = rng.float(7.6, 9.0) * scale;
    const d = rng.float(6.0, 7.0) * scale;
    const h = rng.float(3.4, 4.0) * scale;
    g.add(this.box([w, h, d], '#eee6d8', [0, h / 2, 0]));
    g.add(this.box([w * 1.06, 0.5 * scale, d * 1.06], accent, [0, h + 0.25 * scale, 0]));
    // Markise ueber dem Eingang.
    g.add(this.box([w * 0.6, 0.14, 1.5 * scale], accent,
      [0, h * 0.72, d / 2 + 0.7 * scale], { rot: [0.28, 0, 0] }));
    g.add(this.box([w * 0.5, 0.7 * scale, 0.1], '#ffffff', [0, h * 0.86, d / 2 + 0.06],
      { emissive: 0.18 }));
    this.addWindows(g, w * 0.86, d, h * 0.5, 3);
    this.addDoor(g, 1.6 * scale, 2.3 * scale, d, accent);
    return {
      object: g, footprint: { width: w, depth: d },
      door: { x: 0, z: d / 2 + 0.7, width: 2 * scale }, height: h + 0.5 * scale,
    };
  }

  private center(rng: RNG, scale: number, accent: string): BuildingResult {
    const g = new THREE.Group();
    const w = rng.float(9.0, 10.2) * scale;
    const d = rng.float(7.0, 8.2) * scale;
    const h = rng.float(3.6, 4.2) * scale;
    g.add(this.box([w, h, d], '#f5f0e6', [0, h / 2, 0]));
    // Halbrundes Dach als Wiedererkennungsmerkmal.
    g.add(this.shape('cylinder', [w * 0.52, d * 1.02, w * 0.52], accent,
      [0, h, 0], { rot: [Math.PI / 2, 0, 0], detail: 3 }));
    g.add(this.box([1.5 * scale, 0.45 * scale, 0.2], '#ffffff',
      [0, h + w * 0.28, d * 0.34], { emissive: 0.4 }));
    g.add(this.box([0.45 * scale, 1.5 * scale, 0.2], '#ffffff',
      [0, h + w * 0.28, d * 0.34], { emissive: 0.4 }));
    this.addWindows(g, w * 0.8, d, h * 0.55, 3);
    this.addDoor(g, 2.0 * scale, 2.5 * scale, d, accent);
    return {
      object: g, footprint: { width: w, depth: d },
      door: { x: 0, z: d / 2 + 0.8, width: 2.4 * scale }, height: h + w * 0.5,
    };
  }

  private gym(rng: RNG, scale: number, accent: string): BuildingResult {
    const g = new THREE.Group();
    const w = rng.float(13, 15.5) * scale;
    const d = rng.float(10, 12) * scale;
    const h = rng.float(7.0, 8.4) * scale;
    g.add(this.box([w, h, d], '#d8d2c4', [0, h / 2, 0]));
    // Kuppel
    g.add(this.shape('sphere', [w * 0.5, h * 0.42, d * 0.5], accent, [0, h, 0], { detail: 3 }));
    // Bandmuster
    for (let i = 0; i < 4; i++) {
      g.add(this.box([w * 1.01, 0.4 * scale, d * 1.01], accent,
        [0, h * (0.2 + i * 0.2), 0], { opacity: 0.9 }));
    }
    // Eingangsportal
    g.add(this.box([5 * scale, 4 * scale, 0.5 * scale], '#2b3440', [0, 2 * scale, d / 2 + 0.2]));
    g.add(this.box([4.2 * scale, 3.2 * scale, 0.2], '#5fb0d8',
      [0, 1.9 * scale, d / 2 + 0.5], { emissive: 0.3 }));
    // Leuchtendes Emblem
    g.add(this.shape('sphere', [1.5 * scale, 1.5 * scale, 0.3 * scale], accent,
      [0, h * 0.78, d / 2 + 0.3], { emissive: 0.65, detail: 2 }));
    return {
      object: g, footprint: { width: w, depth: d },
      door: { x: 0, z: d / 2 + 1.0, width: 4 * scale }, height: h + h * 0.42,
    };
  }

  private stadium(rng: RNG, scale: number, accent: string): BuildingResult {
    const g = new THREE.Group();
    const r = rng.float(15, 18) * scale;
    const h = rng.float(8.5, 10.5) * scale;
    g.add(this.shape('cylinder', [r, h, r], '#cfc9bb', [0, h / 2, 0], { detail: 4 }));
    g.add(this.shape('cylinder', [r * 1.06, 1.2 * scale, r * 1.06], accent, [0, h, 0], { detail: 4 }));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(this.box([1.0 * scale, h * 1.15, 1.0 * scale], '#b8b2a4',
        [Math.cos(a) * r * 0.99, h * 0.58, Math.sin(a) * r * 0.99]));
      g.add(this.box([1.6 * scale, 0.8 * scale, 1.6 * scale], '#fff2c4',
        [Math.cos(a) * r * 0.99, h * 1.18, Math.sin(a) * r * 0.99], { emissive: 0.7 }));
    }
    g.add(this.box([6 * scale, 5 * scale, 0.6 * scale], '#2b3440', [0, 2.5 * scale, r]));
    return {
      object: g, footprint: { width: r * 2, depth: r * 2 },
      door: { x: 0, z: r + 1.2, width: 5 * scale }, height: h + 1.5 * scale,
    };
  }

  private lab(rng: RNG, scale: number): BuildingResult {
    const g = new THREE.Group();
    const w = rng.float(10.4, 12) * scale;
    const d = rng.float(8, 9.4) * scale;
    const h = rng.float(4.4, 5.2) * scale;
    g.add(this.box([w, h, d], '#e4eaee', [0, h / 2, 0]));
    g.add(this.box([w * 1.03, 0.4 * scale, d * 1.03], '#8fa4b5', [0, h, 0]));
    g.add(this.shape('cylinder', [2.2 * scale, 2.6 * scale, 2.2 * scale], '#c4d8e6',
      [w * 0.26, h + 1.3 * scale, 0], { detail: 3, opacity: 0.85 }));
    g.add(this.shape('sphere', [2.2 * scale, 1.5 * scale, 2.2 * scale], '#9fc4d8',
      [w * 0.26, h + 2.6 * scale, 0], { detail: 3, opacity: 0.8 }));
    this.addWindows(g, w * 0.85, d, h * 0.58, 4, '#b5e0f2');
    this.addDoor(g, 2.0 * scale, 2.5 * scale, d, '#7a8fa0');
    return {
      object: g, footprint: { width: w, depth: d },
      door: { x: 0, z: d / 2 + 0.8, width: 2.4 * scale }, height: h + 4 * scale,
    };
  }

  private station(rng: RNG, scale: number): BuildingResult {
    const g = new THREE.Group();
    const w = rng.float(11, 13.5) * scale;
    const d = rng.float(6.6, 7.8) * scale;
    const h = rng.float(4.0, 4.8) * scale;
    g.add(this.box([w, h, d], '#d4c9b5', [0, h / 2, 0]));
    g.add(this.box([w * 1.1, 0.5 * scale, d * 1.3], '#5f6b7a', [0, h + 0.25 * scale, 0]));
    for (const x of [-w * 0.4, w * 0.4]) {
      g.add(this.box([0.4 * scale, h * 1.2, 0.4 * scale], '#5f6b7a', [x, h * 0.6, d * 0.62]));
    }
    g.add(this.box([3 * scale, 0.9 * scale, 0.15], '#2b3440',
      [0, h * 0.82, d / 2 + 0.1], { emissive: 0.2 }));
    this.addDoor(g, 2.4 * scale, 2.6 * scale, d, '#5f6b7a');
    return {
      object: g, footprint: { width: w, depth: d },
      door: { x: 0, z: d / 2 + 0.8, width: 2.8 * scale }, height: h + 0.5 * scale,
    };
  }

  private tower(rng: RNG, scale: number): BuildingResult {
    const g = new THREE.Group();
    const r = 3.2 * scale;
    const h = rng.float(11, 16) * scale;
    g.add(this.shape('cylinder', [r, h, r], '#c9bfa8', [0, h / 2, 0], { detail: 3 }));
    g.add(this.shape('cylinder', [r * 1.18, 0.6 * scale, r * 1.18], '#8f8474', [0, h, 0], { detail: 3 }));
    g.add(this.shape('cone', [r * 1.1, 3.2 * scale, r * 1.1], '#7a4f5f',
      [0, h + 1.9 * scale, 0], { detail: 3 }));
    for (let i = 0; i < 3; i++) {
      g.add(this.box([0.7 * scale, 1.1 * scale, 0.2], '#ffe9a0',
        [0, h * (0.3 + i * 0.22), r], { emissive: 0.3 }));
    }
    this.addDoor(g, 1.4 * scale, 2.3 * scale, r * 2, '#6b4f33');
    return {
      object: g, footprint: { width: r * 2, depth: r * 2 },
      door: { x: 0, z: r + 0.7, width: 1.8 * scale }, height: h + 5 * scale,
    };
  }

  private warehouse(rng: RNG, scale: number): BuildingResult {
    const g = new THREE.Group();
    const w = rng.float(13.5, 17) * scale;
    const d = rng.float(9, 11.5) * scale;
    const h = rng.float(5.4, 6.8) * scale;
    g.add(this.box([w, h, d], '#8f8f8a', [0, h / 2, 0], { metal: 0.3 }));
    g.add(this.shape('cylinder', [w * 0.5, d * 1.02, w * 0.5], '#6f7a80',
      [0, h, 0], { rot: [Math.PI / 2, 0, 0], detail: 3, metal: 0.4 }));
    for (let i = 0; i < 5; i++) {
      g.add(this.box([0.25 * scale, h, 0.25 * scale], '#5f676d',
        [-w / 2 + (i + 0.5) * (w / 5), h / 2, d / 2 + 0.15], { metal: 0.5 }));
    }
    g.add(this.box([4 * scale, 3.5 * scale, 0.3], '#4a5158', [0, 1.75 * scale, d / 2 + 0.2]));
    return {
      object: g, footprint: { width: w, depth: d },
      door: { x: 0, z: d / 2 + 0.8, width: 4 * scale }, height: h + w * 0.5,
    };
  }

  private ruin(rng: RNG, scale: number): BuildingResult {
    const g = new THREE.Group();
    const w = rng.float(7, 12) * scale;
    const d = rng.float(6, 10) * scale;
    const h = rng.float(2.5, 5) * scale;
    // Bruchstueckhafte Waende.
    const segs = 6;
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const hh = h * rng.float(0.25, 1);
      g.add(this.box([w / segs, hh, 0.6 * scale], '#a89f88',
        [-w / 2 + (t + 0.5 / segs) * w, hh / 2, -d / 2]));
    }
    for (let i = 0; i < 4; i++) {
      const hh = h * rng.float(0.4, 1);
      g.add(this.shape('cylinder', [0.45 * scale, hh, 0.45 * scale], '#b5ab95',
        [-w / 2 + (i + 0.5) * (w / 4), hh / 2, d / 2 - 0.5], { detail: 2 }));
    }
    g.add(this.box([w, 0.25 * scale, d], '#9b9384', [0, 0.12 * scale, 0]));
    return {
      object: g, footprint: { width: w, depth: d },
      door: null, height: h,
    };
  }
}
