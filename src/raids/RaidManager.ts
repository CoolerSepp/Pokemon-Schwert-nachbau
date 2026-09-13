import * as THREE from 'three';
import { GameData } from '@/data/GameData';
import { RNG } from '@/core/RNG';
import { Logger } from '@/core/Logger';
import type { AreaRuntime } from '@/world/AreaRuntime';
import type { RaidData } from '@/data/schema';

const log = Logger.scope('Raid');

export interface DenState {
  id: string;
  tier: number;
  x: number;
  z: number;
  y: number;
  /** Zugeordnete Raid-Definition. */
  raidId: string;
  /** Index des Bosses in der Raid-Definition. */
  bossIndex: number;
  /** Bereits besiegt (bis zur naechsten Erneuerung). */
  cleared: boolean;
  /** Aktiv = es leuchtet und kann betreten werden. */
  active: boolean;
}

interface DenVisual {
  state: DenState;
  group: THREE.Group;
  beam: THREE.Mesh;
  core: THREE.Mesh;
  glow: THREE.Mesh;
  phase: number;
}

/** Farbe der Lichtsaeule nach Stufe. */
const TIER_COLORS = [0x8fd6ff, 0x7fe0a0, 0xffd166, 0xff8f5e, 0xff5ea8];

/**
 * Energiepunkte (Raid-Nester) in der Welt.
 *
 * Jedes Nest bekommt beim Betreten des Gebietes einen Boss zugelost. Die
 * Auslosung haengt nur von Nest-Kennung und Spieltag ab und ist damit
 * reproduzierbar: derselbe Tag zeigt dieselben Bosse, ein neuer Tag
 * erneuert alle Nester.
 */
export class RaidManager {
  readonly object = new THREE.Group();
  private readonly visuals: DenVisual[] = [];
  private readonly states = new Map<string, DenState>();
  private readonly cleared = new Set<string>();
  private elapsed = 0;
  private day = 0;

  constructor() {
    this.object.name = 'raidDens';
  }

  get dens(): readonly DenState[] {
    return this.visuals.map((v) => v.state);
  }

  get activeCount(): number {
    return this.visuals.filter((v) => v.state.active).length;
  }

  /** Setzt den Spieltag; ein neuer Tag erneuert alle Nester. */
  setDay(day: number): void {
    if (day === this.day) return;
    this.day = day;
    this.cleared.clear();
    for (const visual of this.visuals) {
      const fresh = this.rollDen(visual.state.id, visual.state.tier, visual.state.x, visual.state.z, visual.state.y);
      Object.assign(visual.state, fresh);
      this.applyVisualState(visual);
    }
  }

  /** Baut die Nester eines Gebietes auf. */
  load(area: AreaRuntime, day: number): void {
    this.clear();
    this.day = day;
    const dens = area.data.raidDens ?? [];
    if (dens.length === 0) return;

    for (const den of dens) {
      const [x, z] = den.pos;
      const y = area.heightAt(x, z);
      const state = this.rollDen(den.id, den.tier, x, z, y);
      this.states.set(den.id, state);
      this.visuals.push(this.buildVisual(state));
    }
    log.info(`${this.visuals.length} Energiepunkte in "${area.data.id}" aufgebaut`);
  }

  /** Lost Boss und Aktivierung eines Nestes aus. */
  private rollDen(id: string, tier: number, x: number, z: number, y: number): DenState {
    const rng = new RNG(`den-${id}-${this.day}`);
    const raid = GameData.raids.tryGet(`raid_tier${tier}`);
    const bossCount = raid?.bosses.length ?? 0;
    return {
      id, tier, x, z, y,
      raidId: raid?.id ?? '',
      bossIndex: bossCount > 0 ? rng.int(0, bossCount - 1) : 0,
      cleared: this.cleared.has(id),
      // Nicht jedes Nest leuchtet an jedem Tag.
      active: bossCount > 0 && rng.chance(0.75),
    };
  }

  private buildVisual(state: DenState): DenVisual {
    const color = TIER_COLORS[Math.min(TIER_COLORS.length - 1, state.tier - 1)]!;
    const group = new THREE.Group();
    group.position.set(state.x, state.y, state.z);

    // Steinring um die Oeffnung.
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.5, 0.32, 6, 16),
      new THREE.MeshLambertMaterial({ color: 0x6b6257 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.16;
    ring.castShadow = false;
    ring.receiveShadow = true;
    group.add(ring);

    // Dunkle Oeffnung.
    const hole = new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 16),
      new THREE.MeshBasicMaterial({ color: 0x161018 }),
    );
    hole.rotation.x = -Math.PI / 2;
    hole.position.y = 0.06;
    group.add(hole);

    // Bodenschein um die Oeffnung.
    const glow = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 24),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.35, depthWrite: false,
        blending: THREE.AdditiveBlending, fog: false,
      }),
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.04;
    glow.renderOrder = 3;
    group.add(glow);

    // Leuchtender Kern.
    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 1),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending,
        depthWrite: false, fog: false,
      }),
    );
    core.position.y = 0.8;
    core.renderOrder = 5;
    group.add(core);

    // Lichtsaeule: additiv, damit sie auch bei Tag als Licht wirkt.
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 1.5, 30, 14, 1, true),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
        depthWrite: false, fog: false, blending: THREE.AdditiveBlending,
      }),
    );
    beam.position.y = 15;
    beam.renderOrder = 4;
    group.add(beam);

    this.object.add(group);
    const visual: DenVisual = {
      state, group, beam, core, glow, phase: Math.random() * Math.PI * 2,
    };
    this.applyVisualState(visual);
    return visual;
  }

  private applyVisualState(visual: DenVisual): void {
    const lit = visual.state.active && !visual.state.cleared;
    visual.beam.visible = lit;
    visual.glow.visible = lit;
    (visual.core.material as THREE.MeshBasicMaterial).opacity = lit ? 0.95 : 0.2;
  }

  /** Laesst Kern und Lichtsaeule pulsieren. */
  update(dt: number): void {
    this.elapsed += dt;
    for (const visual of this.visuals) {
      if (!visual.state.active || visual.state.cleared) continue;
      const pulse = 0.5 + Math.sin(this.elapsed * 2 + visual.phase) * 0.5;
      visual.core.position.y = 0.8 + pulse * 0.2;
      visual.core.rotation.y += dt * 0.8;
      visual.core.scale.setScalar(0.9 + pulse * 0.25);
      (visual.beam.material as THREE.MeshBasicMaterial).opacity = 0.2 + pulse * 0.2;
      (visual.glow.material as THREE.MeshBasicMaterial).opacity = 0.26 + pulse * 0.2;
    }
  }

  /** Naechstes Nest innerhalb der Reichweite. */
  denNear(x: number, z: number, range: number): DenState | null {
    let best: DenState | null = null;
    let bestDist = range * range;
    for (const visual of this.visuals) {
      const state = visual.state;
      const dx = state.x - x;
      const dz = state.z - z;
      const distSq = dx * dx + dz * dz;
      if (distSq <= bestDist) {
        bestDist = distSq;
        best = state;
      }
    }
    return best;
  }

  denById(id: string): DenState | null {
    return this.states.get(id) ?? null;
  }

  /** Die Raid-Definition eines Nestes. */
  raidFor(state: DenState): RaidData | null {
    return GameData.raids.tryGet(state.raidId) ?? null;
  }

  /** Der ausgeloste Boss eines Nestes. */
  bossFor(state: DenState): RaidData['bosses'][number] | null {
    const raid = this.raidFor(state);
    if (!raid) return null;
    return raid.bosses[state.bossIndex % raid.bosses.length] ?? null;
  }

  /** Markiert ein Nest als geleert. */
  markCleared(id: string): void {
    this.cleared.add(id);
    const visual = this.visuals.find((v) => v.state.id === id);
    if (!visual) return;
    visual.state.cleared = true;
    this.applyVisualState(visual);
  }

  serialize(): { day: number; cleared: string[] } {
    return { day: this.day, cleared: [...this.cleared] };
  }

  deserialize(state: { day: number; cleared: string[] } | undefined): void {
    if (!state) return;
    this.day = state.day;
    this.cleared.clear();
    for (const id of state.cleared) this.cleared.add(id);
    for (const visual of this.visuals) {
      visual.state.cleared = this.cleared.has(visual.state.id);
      this.applyVisualState(visual);
    }
  }

  clear(): void {
    for (const visual of this.visuals) {
      visual.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
      this.object.remove(visual.group);
    }
    this.visuals.length = 0;
    this.states.clear();
  }

  dispose(): void {
    this.clear();
    this.object.clear();
  }
}
