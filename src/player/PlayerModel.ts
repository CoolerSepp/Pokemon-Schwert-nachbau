import * as THREE from 'three';
import type { AssetManager } from '@/engine/AssetManager';
import type { NpcAppearance } from '@/data/schema';

export interface HumanoidModel {
  root: THREE.Group;
  parts: {
    hips: THREE.Group;
    torso: THREE.Group;
    head: THREE.Group;
    armLeft: THREE.Group;
    armRight: THREE.Group;
    legLeft: THREE.Group;
    legRight: THREE.Group;
    backpack: THREE.Object3D | null;
  };
  height: number;
}

export const DEFAULT_APPEARANCE: NpcAppearance = {
  skin: '#e8c19b',
  hair: '#3a2a1c',
  shirt: '#d84b3b',
  pants: '#3a4a6b',
  accent: '#f0e6d2',
  hat: 'cap',
  height: 1,
  build: 'normal',
};

/**
 * Prozedurales Menschenmodell fuer Spieler und NPCs.
 *
 * Bewusst schlicht gehalten (Low-Poly, klare Silhouette), dafuer vollstaendig
 * parametrisierbar: Hautton, Haare, Kleidung, Statur und Kopfbedeckung kommen
 * aus den Daten, sodass jeder NPC ohne eigenes Asset unterscheidbar ist.
 */
export function buildHumanoid(
  assets: AssetManager, appearance: Partial<NpcAppearance> = {},
): HumanoidModel {
  const look = { ...DEFAULT_APPEARANCE, ...appearance };
  const scale = look.height ?? 1;
  const widthFactor = look.build === 'broad' ? 1.2 : look.build === 'slim' ? 0.85 : 1;

  const mat = (color: string, emissive = 0) =>
    assets.getMaterial({ color, flatShading: true, emissive });
  const box = (
    w: number, h: number, d: number, color: string,
    pos: [number, number, number], emissive = 0,
  ) => {
    const m = new THREE.Mesh(assets.getShape('box', 1), mat(color, emissive));
    m.scale.set(w / 2, h / 2, d / 2);
    m.position.set(pos[0], pos[1], pos[2]);
    m.castShadow = true;
    return m;
  };
  const sphere = (
    r: number, color: string, pos: [number, number, number],
    scaleXYZ: [number, number, number] = [1, 1, 1],
  ) => {
    const m = new THREE.Mesh(assets.getShape('sphere', 2), mat(color));
    m.scale.set(r * scaleXYZ[0], r * scaleXYZ[1], r * scaleXYZ[2]);
    m.position.set(pos[0], pos[1], pos[2]);
    m.castShadow = true;
    return m;
  };

  const root = new THREE.Group();
  root.name = 'humanoid';

  const hips = new THREE.Group();
  hips.position.y = 0.88 * scale;
  root.add(hips);

  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(box(0.42 * widthFactor * scale, 0.56 * scale, 0.26 * scale, look.shirt, [0, 0.28 * scale, 0]));
  torso.add(box(0.44 * widthFactor * scale, 0.1 * scale, 0.28 * scale, look.accent, [0, 0.06 * scale, 0]));

  const head = new THREE.Group();
  head.position.y = 0.62 * scale;
  torso.add(head);
  head.add(sphere(0.16 * scale, look.skin, [0, 0.16 * scale, 0], [1, 1.12, 1]));
  // Haare als Kappe ueber dem Schaedel.
  head.add(sphere(0.165 * scale, look.hair, [0, 0.2 * scale, -0.01 * scale], [1, 0.72, 1.02]));
  for (const sx of [-1, 1]) {
    head.add(sphere(0.026 * scale, '#1c1c22', [sx * 0.06 * scale, 0.17 * scale, 0.135 * scale]));
  }
  if (look.hat && look.hat !== 'none') {
    switch (look.hat) {
      case 'cap':
        head.add(sphere(0.175 * scale, look.accent, [0, 0.24 * scale, 0], [1, 0.6, 1]));
        head.add(box(0.26 * scale, 0.03 * scale, 0.18 * scale, look.accent, [0, 0.24 * scale, 0.17 * scale]));
        break;
      case 'beanie':
        head.add(sphere(0.18 * scale, look.accent, [0, 0.24 * scale, 0], [1, 0.75, 1]));
        break;
      case 'helmet':
        head.add(sphere(0.19 * scale, '#9aa4b0', [0, 0.22 * scale, 0], [1, 0.9, 1]));
        break;
      case 'crown':
        head.add(box(0.3 * scale, 0.1 * scale, 0.3 * scale, '#f0c84b', [0, 0.34 * scale, 0]));
        break;
      case 'band':
        head.add(box(0.34 * scale, 0.06 * scale, 0.34 * scale, look.accent, [0, 0.26 * scale, 0]));
        break;
    }
  }

  const makeLimb = (
    isArm: boolean, side: -1 | 1,
  ): THREE.Group => {
    const g = new THREE.Group();
    const len = isArm ? 0.5 * scale : 0.56 * scale;
    const thickness = (isArm ? 0.12 : 0.15) * widthFactor * scale;
    g.position.set(
      side * (isArm ? 0.26 * widthFactor : 0.12 * widthFactor) * scale,
      isArm ? 0.5 * scale : 0,
      0,
    );
    const limb = box(thickness, len, thickness, isArm ? look.shirt : look.pants,
      [0, -len / 2, 0]);
    g.add(limb);
    if (isArm) {
      g.add(sphere(thickness * 0.62, look.skin, [0, -len - thickness * 0.2, 0]));
    } else {
      g.add(box(thickness * 1.1, 0.09 * scale, thickness * 1.8, '#3a2f28',
        [0, -len - 0.04 * scale, 0.03 * scale]));
    }
    return g;
  };

  const armLeft = makeLimb(true, -1);
  const armRight = makeLimb(true, 1);
  torso.add(armLeft, armRight);
  const legLeft = makeLimb(false, -1);
  const legRight = makeLimb(false, 1);
  hips.add(legLeft, legRight);

  // Rucksack als Erkennungsmerkmal des Spielers.
  const backpack = box(0.3 * widthFactor * scale, 0.36 * scale, 0.16 * scale,
    look.accent, [0, 0.3 * scale, -0.2 * scale]);
  torso.add(backpack);

  root.traverse((o) => { o.castShadow = true; });

  return {
    root,
    parts: { hips, torso, head, armLeft, armRight, legLeft, legRight, backpack },
    height: 1.78 * scale,
  };
}
