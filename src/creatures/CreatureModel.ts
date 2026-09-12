import * as THREE from 'three';
import type { ModelBlueprint, ModelPart, PartRole, RigKind } from '@/data/schema';
import type { AssetManager } from '@/engine/AssetManager';

/** Ein instanziiertes Koerperteil mit seinem Ruhezustand. */
export interface ModelPartInstance {
  role: PartRole;
  pivot: THREE.Group;
  mesh: THREE.Mesh;
  restPosition: THREE.Vector3;
  restRotation: THREE.Euler;
  /** Index innerhalb aller Teile derselben Rolle (fuer L/R-Versatz). */
  roleIndex: number;
}

export interface CreatureModel {
  root: THREE.Group;
  rig: RigKind;
  parts: ModelPartInstance[];
  byRole: Map<PartRole, ModelPartInstance[]>;
  hover: number;
  idleSpeed: number;
  /** Hoehe der Bounding-Box in Metern - fuer Kamera und HUD-Anker. */
  height: number;
  radius: number;
}

const SHAPE_SCALE_FIX: Partial<Record<string, THREE.Vector3>> = {
  // Basisgeometrien haben Kantenlaenge 2 bzw. Radius 1 - hier auf die in den
  // Bauplaenen benutzten Halbmasse normiert.
  box: new THREE.Vector3(0.5, 0.5, 0.5),
  cone: new THREE.Vector3(1, 0.5, 1),
  cylinder: new THREE.Vector3(1, 0.5, 1),
  plane: new THREE.Vector3(0.5, 0.5, 1),
  capsule: new THREE.Vector3(1, 1, 1),
};

function resolveColor(blueprint: ModelBlueprint, key: string): string {
  if (key.startsWith('#')) return key;
  return blueprint.palette[key] ?? blueprint.palette.primary ?? '#cccccc';
}

/** Standardanker: Gliedmassen drehen um den Ansatz, nicht um die Mitte. */
function defaultAnchor(part: ModelPart): [number, number, number] {
  if (part.anchor) return part.anchor;
  const role = part.role;
  if (role.startsWith('leg') || role.startsWith('arm')) {
    return [0, -part.size[1], 0];
  }
  if (role === 'tail') return [0, 0, -part.size[2]];
  return [0, 0, 0];
}

/**
 * Baut aus einem JSON-Bauplan ein animierbares 3D-Modell.
 *
 * Jedes Teil bekommt einen eigenen Drehpunkt (Group), damit die prozedurale
 * Animation Gliedmassen korrekt schwingen lassen kann. Geometrien und
 * Materialien kommen aus dem AssetManager und werden zwischen allen
 * Exemplaren derselben Art geteilt.
 */
export function buildCreatureModel(
  blueprint: ModelBlueprint,
  assets: AssetManager,
  options: { scale?: number; variantTint?: number; castShadow?: boolean } = {},
): CreatureModel {
  const root = new THREE.Group();
  root.name = 'creature';
  const parts: ModelPartInstance[] = [];
  const byRole = new Map<PartRole, ModelPartInstance[]>();
  const pivotsByRole = new Map<PartRole, THREE.Group>();
  const scale = (blueprint.scale ?? 1) * (options.scale ?? 1);

  const box = new THREE.Box3();
  const tmp = new THREE.Vector3();

  // Erster Durchlauf: Teile ohne Eltern (damit Eltern existieren, wenn
  // Kinder angehaengt werden).
  const ordered = [...blueprint.parts].sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0));

  for (const part of ordered) {
    const pivot = new THREE.Group();
    pivot.name = `${part.role}`;
    pivot.position.set(part.pos[0], part.pos[1], part.pos[2]);
    if (part.rot) pivot.rotation.set(part.rot[0], part.rot[1], part.rot[2]);

    const geometry = assets.getShape(part.shape, part.detail ?? 2);
    let color = resolveColor(blueprint, part.color);
    if (options.variantTint !== undefined) {
      color = shiftHue(color, options.variantTint);
    }
    const material = assets.getMaterial({
      color,
      flatShading: part.flatShading ?? true,
      metalness: part.metal ?? 0,
      emissive: part.emissive ?? 0,
      opacity: part.opacity ?? 1,
      doubleSided: part.shape === 'plane',
    });

    const mesh = new THREE.Mesh(geometry, material);
    const fix = SHAPE_SCALE_FIX[part.shape];
    mesh.scale.set(
      part.size[0] * (fix?.x ?? 1),
      part.size[1] * (fix?.y ?? 1),
      part.size[2] * (fix?.z ?? 1),
    );
    if (part.shape === 'capsule') {
      // CapsuleGeometry ist bereits 2*(radius)+laenge hoch; auf Halbmass normieren.
      mesh.scale.set(part.size[0], part.size[1] / 1.55, part.size[2]);
    }
    const anchor = defaultAnchor(part);
    mesh.position.set(anchor[0], anchor[1], anchor[2]);
    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = false;
    pivot.add(mesh);

    const parentPivot = part.parent ? pivotsByRole.get(part.parent) : undefined;
    if (parentPivot) {
      // Position ist absolut angegeben - in den Elternraum umrechnen.
      parentPivot.updateMatrixWorld(true);
      const local = parentPivot.worldToLocal(
        new THREE.Vector3(part.pos[0], part.pos[1], part.pos[2]),
      );
      pivot.position.copy(local);
      parentPivot.add(pivot);
    } else {
      root.add(pivot);
    }
    if (!pivotsByRole.has(part.role)) pivotsByRole.set(part.role, pivot);

    const list = byRole.get(part.role) ?? [];
    const instance: ModelPartInstance = {
      role: part.role,
      pivot,
      mesh,
      restPosition: pivot.position.clone(),
      restRotation: pivot.rotation.clone(),
      roleIndex: list.length,
    };
    list.push(instance);
    byRole.set(part.role, list);
    parts.push(instance);
  }

  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  box.getSize(tmp);

  return {
    root,
    rig: blueprint.rig,
    parts,
    byRole,
    hover: (blueprint.hover ?? 0) * scale,
    idleSpeed: blueprint.idleSpeed ?? 1,
    height: Number.isFinite(tmp.y) ? tmp.y : scale,
    radius: Number.isFinite(tmp.x) ? Math.max(tmp.x, tmp.z) * 0.5 : scale * 0.4,
  };
}

/** Verschiebt einen Farbton - fuer die seltene Farbvariante. */
export function shiftHue(hex: string, amount: number): string {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL((hsl.h + amount) % 1, Math.min(1, hsl.s * 1.25 + 0.1), hsl.l);
  return `#${color.getHexString()}`;
}

/** Gibt alle Meshes eines Modells frei (Geometrien sind geteilt und bleiben). */
export function disposeCreatureModel(model: CreatureModel): void {
  model.root.removeFromParent();
  model.parts.length = 0;
  model.byRole.clear();
}
