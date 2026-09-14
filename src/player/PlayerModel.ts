import * as THREE from 'three';
import { StaticBatcher } from '@/world/StaticBatcher';
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

  // --- Rumpf: Brust breiter als Taille, dazu Kragen und Schultern ---------
  const torso = new THREE.Group();
  hips.add(torso);
  const chestW = 0.44 * widthFactor * scale;
  const waistW = 0.34 * widthFactor * scale;
  torso.add(box(waistW, 0.2 * scale, 0.22 * scale, look.pants, [0, 0.1 * scale, 0]));
  torso.add(box(chestW, 0.38 * scale, 0.25 * scale, look.shirt, [0, 0.38 * scale, 0]));
  // Guertel
  torso.add(box(waistW * 1.06, 0.07 * scale, 0.24 * scale, '#3a2f28', [0, 0.2 * scale, 0]));
  // Kragen und Halsansatz
  torso.add(box(0.2 * scale, 0.08 * scale, 0.19 * scale, look.accent, [0, 0.58 * scale, 0]));
  torso.add(box(0.13 * scale, 0.09 * scale, 0.13 * scale, look.skin, [0, 0.6 * scale, 0]));
  // Weiche Schultern
  for (const sx of [-1, 1]) {
    torso.add(sphere(0.1 * widthFactor * scale, look.shirt,
      [sx * chestW * 0.5, 0.53 * scale, 0], [1, 0.85, 1]));
  }
  // Brusttasche als kleines Detail
  torso.add(box(0.08 * scale, 0.08 * scale, 0.02 * scale, look.pants,
    [chestW * 0.26, 0.38 * scale, 0.13 * scale]));

  // --- Kopf ---------------------------------------------------------------
  const head = new THREE.Group();
  head.position.y = 0.66 * scale;
  torso.add(head);
  head.add(sphere(0.155 * scale, look.skin, [0, 0.15 * scale, 0], [1, 1.14, 0.98]));
  // Haare: Kappe plus Pony ueber der Stirn.
  head.add(sphere(0.163 * scale, look.hair, [0, 0.19 * scale, -0.012 * scale], [1, 0.74, 1.03]));
  head.add(box(0.26 * scale, 0.06 * scale, 0.08 * scale, look.hair,
    [0, 0.23 * scale, 0.125 * scale]));
  // Ohren
  for (const sx of [-1, 1]) {
    head.add(sphere(0.035 * scale, look.skin, [sx * 0.15 * scale, 0.15 * scale, 0], [0.6, 1, 1]));
  }
  // Augen mit hellem Glanzpunkt, damit das Gesicht nicht leer wirkt.
  for (const sx of [-1, 1]) {
    head.add(sphere(0.028 * scale, '#1c1c22', [sx * 0.062 * scale, 0.16 * scale, 0.132 * scale]));
    head.add(sphere(0.009 * scale, '#ffffff',
      [sx * 0.07 * scale, 0.178 * scale, 0.146 * scale]));
  }
  // Nase und angedeuteter Mund
  head.add(box(0.03 * scale, 0.04 * scale, 0.035 * scale, look.skin,
    [0, 0.125 * scale, 0.15 * scale]));
  head.add(box(0.05 * scale, 0.012 * scale, 0.02 * scale, '#9b5f4f',
    [0, 0.088 * scale, 0.148 * scale]));

  if (look.hat && look.hat !== 'none') {
    switch (look.hat) {
      case 'cap':
        head.add(sphere(0.178 * scale, look.accent, [0, 0.235 * scale, 0], [1, 0.68, 1]));
        // Schirm in der Hemdfarbe - das gibt der Figur Wiedererkennung.
        head.add(box(0.29 * scale, 0.035 * scale, 0.22 * scale, look.shirt,
          [0, 0.215 * scale, 0.18 * scale]));
        head.add(box(0.2 * scale, 0.04 * scale, 0.02 * scale, look.shirt,
          [0, 0.265 * scale, 0.15 * scale]));
        break;
      case 'beanie':
        head.add(sphere(0.178 * scale, look.accent, [0, 0.235 * scale, 0], [1, 0.78, 1]));
        head.add(sphere(0.04 * scale, look.accent, [0, 0.37 * scale, 0]));
        break;
      case 'helmet':
        head.add(sphere(0.188 * scale, '#9aa4b0', [0, 0.215 * scale, 0], [1, 0.92, 1]));
        head.add(box(0.36 * scale, 0.03 * scale, 0.1 * scale, '#78828e',
          [0, 0.2 * scale, 0.14 * scale]));
        break;
      case 'crown':
        head.add(box(0.3 * scale, 0.07 * scale, 0.3 * scale, '#f0c84b', [0, 0.31 * scale, 0]));
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2;
          head.add(box(0.05 * scale, 0.09 * scale, 0.05 * scale, '#f0c84b',
            [Math.cos(a) * 0.12 * scale, 0.38 * scale, Math.sin(a) * 0.12 * scale]));
        }
        break;
      case 'band':
        head.add(box(0.33 * scale, 0.055 * scale, 0.33 * scale, look.accent,
          [0, 0.25 * scale, 0]));
        break;
    }
  }

  // --- Gliedmassen --------------------------------------------------------
  const makeLimb = (isArm: boolean, side: -1 | 1): THREE.Group => {
    const g = new THREE.Group();
    const len = isArm ? 0.5 * scale : 0.56 * scale;
    const thick = (isArm ? 0.115 : 0.15) * widthFactor * scale;
    g.position.set(
      side * (isArm ? 0.25 * widthFactor : 0.11 * widthFactor) * scale,
      isArm ? 0.5 * scale : 0.04 * scale,
      0,
    );
    if (isArm) {
      // Oberarm im Hemdstoff, Unterarm als Haut, dazu eine Hand.
      g.add(box(thick, len * 0.55, thick, look.shirt, [0, -len * 0.27, 0]));
      g.add(box(thick * 0.88, len * 0.5, thick * 0.88, look.skin, [0, -len * 0.76, 0]));
      g.add(sphere(thick * 0.62, look.skin, [0, -len - thick * 0.12, 0], [1, 0.9, 1.1]));
    } else {
      // Oberschenkel etwas kraeftiger als Wade, dazu ein richtiger Schuh.
      g.add(box(thick, len * 0.55, thick, look.pants, [0, -len * 0.27, 0]));
      g.add(box(thick * 0.86, len * 0.5, thick * 0.86, look.pants, [0, -len * 0.76, 0]));
      g.add(box(thick * 1.15, 0.1 * scale, thick * 2.0, '#3a2f28',
        [0, -len - 0.05 * scale, 0.05 * scale]));
      g.add(box(thick * 1.18, 0.05 * scale, thick * 1.2, '#f0ece2',
        [0, -len - 0.1 * scale, 0.02 * scale]));
    }
    return g;
  };

  const armLeft = makeLimb(true, -1);
  const armRight = makeLimb(true, 1);
  torso.add(armLeft, armRight);
  const legLeft = makeLimb(false, -1);
  const legRight = makeLimb(false, 1);
  hips.add(legLeft, legRight);

  // --- Rucksack mit Traegern ---------------------------------------------
  // Der Ruecken ist die Ansicht, die im Spiel dauernd zu sehen ist - der
  // Rucksack bleibt deshalb kompakt und farblich ruhig.
  const backpack = new THREE.Group();
  backpack.add(box(0.26 * widthFactor * scale, 0.28 * scale, 0.14 * scale, look.pants,
    [0, 0.38 * scale, -0.19 * scale]));
  backpack.add(box(0.27 * widthFactor * scale, 0.09 * scale, 0.15 * scale, look.accent,
    [0, 0.49 * scale, -0.19 * scale]));
  backpack.add(box(0.06 * scale, 0.06 * scale, 0.04 * scale, '#3a2f28',
    [0, 0.38 * scale, -0.26 * scale]));
  // Traeger ueber den Schultern - schmal, sonst wirken sie wie Hosentraeger.
  for (const sx of [-1, 1]) {
    backpack.add(box(0.04 * scale, 0.3 * scale, 0.04 * scale, look.pants,
      [sx * 0.14 * widthFactor * scale, 0.44 * scale, 0.12 * scale]));
  }
  torso.add(backpack);

  root.traverse((o) => { o.castShadow = true; });

  // Jedes Koerperteil zu einem Mesh je Material zusammenfassen.
  //
  // Eine Figur bestand aus ueber vierzig kleinen Meshes; sechs Bewohner in
  // einem Dorf waren damit rund 250 Zeichenaufrufe - mehr als die ganze
  // Bebauung. Die Teile eines Knochens bewegen sich nie gegeneinander,
  // also lassen sie sich gefahrlos verschmelzen. Der Rucksack bleibt
  // eigenstaendig, weil er von aussen ein- und ausgeblendet wird.
  mergeBoneParts(torso, [backpack]);
  for (const bone of [head, armLeft, armRight, legLeft, legRight]) mergeBoneParts(bone, []);

  return {
    root,
    parts: { hips, torso, head, armLeft, armRight, legLeft, legRight, backpack },
    height: 1.78 * scale,
  };
}

/**
 * Gibt die beim Zusammenfassen erzeugten Geometrien einer Figur frei.
 *
 * Nur die verschmolzenen Knochen-Meshes gehoeren der Figur; alle anderen
 * Geometrien kommen aus dem gemeinsamen Formenspeicher und duerfen nicht
 * freigegeben werden - sonst verschwaenden sie fuer alle anderen Figuren.
 */
export function disposeHumanoid(model: HumanoidModel): void {
  model.root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.parent?.name !== 'bone') return;
    mesh.geometry.dispose();
  });
}

/**
 * Verschmilzt die Meshes eines Knochens, laesst aber die aufgezaehlten
 * Unterobjekte unberuehrt.
 */
function mergeBoneParts(bone: THREE.Group, keep: THREE.Object3D[]): void {
  const meshes = bone.children.filter(
    (child) => (child as THREE.Mesh).isMesh && !keep.includes(child),
  );
  if (meshes.length < 2) return;
  const batcher = new StaticBatcher();
  for (const mesh of meshes) batcher.add(mesh, bone);
  const merged = batcher.build('bone');
  if (!merged) return;
  for (const mesh of meshes) bone.remove(mesh);
  bone.add(merged);
}
