import * as THREE from 'three';
import { Logger } from '@/core/Logger';

const log = Logger.scope('Batch');

interface Bucket {
  material: THREE.Material;
  geometries: THREE.BufferGeometry[];
  castShadow: boolean;
  receiveShadow: boolean;
}

/** Schluessel, unter dem zwei Meshes dieselbe Zeichnung teilen koennen. */
function materialKey(material: THREE.Material, castShadow: boolean, receiveShadow: boolean): string {
  const m = material as THREE.MeshLambertMaterial & {
    flatShading?: boolean; emissive?: THREE.Color;
  };
  return [
    material.type,
    m.color?.getHexString() ?? '-',
    m.emissive?.getHexString() ?? '-',
    m.flatShading ? 'f' : 's',
    material.transparent ? `t${material.opacity.toFixed(2)}` : 'o',
    material.side,
    castShadow ? 'C' : '-',
    receiveShadow ? 'R' : '-',
  ].join('|');
}

/**
 * Fasst unbewegte Objekte zu wenigen Zeichenaufrufen zusammen.
 *
 * Jeder Baum, Stein und Zaun besteht aus mehreren kleinen Meshes. Einzeln
 * gezeichnet ergeben sie in grossen Gebieten mehrere tausend Zeichenaufrufe -
 * die haeufigste Ursache fuer Ruckeln auf schwachen Geraeten (Anforderung 48).
 * Hier werden alle Geometrien mit gleichem Material in eine gemeinsame
 * Geometrie ueberfuehrt; Position, Drehung und Skalierung werden dabei fest
 * eingebacken.
 *
 * Die Quellobjekte bleiben unveraendert - der Aufrufer entscheidet, ob er sie
 * durch das Ergebnis ersetzt.
 */
export class StaticBatcher {
  private readonly buckets = new Map<string, Bucket>();
  private sourceMeshes = 0;

  /** Nimmt alle Meshes eines Objektbaums auf. */
  add(object: THREE.Object3D): void {
    object.updateWorldMatrix(true, true);
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.visible) return;
      // Mehrmaterial-Meshes und Instanzen bleiben unangetastet.
      if (Array.isArray(mesh.material)) return;
      if ((mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return;
      const geometry = mesh.geometry;
      if (!geometry || !geometry.attributes.position) return;

      const key = materialKey(mesh.material, mesh.castShadow, mesh.receiveShadow);
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = {
          material: mesh.material,
          geometries: [],
          castShadow: mesh.castShadow,
          receiveShadow: mesh.receiveShadow,
        };
        this.buckets.set(key, bucket);
      }
      const baked = geometry.clone();
      baked.applyMatrix4(mesh.matrixWorld);
      // Nur die Attribute behalten, die alle Geometrien gemeinsam haben.
      for (const name of Object.keys(baked.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv') {
          baked.deleteAttribute(name);
        }
      }
      if (!baked.attributes.normal) baked.computeVertexNormals();
      if (!baked.attributes.uv) {
        const count = baked.attributes.position.count;
        baked.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      }
      bucket.geometries.push(baked);
      this.sourceMeshes++;
    });
  }

  get meshCount(): number { return this.sourceMeshes; }
  get bucketCount(): number { return this.buckets.size; }

  /** Baut die zusammengefassten Meshes; leert danach die Sammlung. */
  build(name: string): THREE.Group | null {
    if (this.buckets.size === 0) return null;
    const group = new THREE.Group();
    group.name = name;

    for (const bucket of this.buckets.values()) {
      const merged = mergeGeometryList(bucket.geometries);
      for (const geometry of bucket.geometries) geometry.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, bucket.material);
      mesh.castShadow = bucket.castShadow;
      mesh.receiveShadow = bucket.receiveShadow;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
    }
    log.debug(
      `"${name}": ${this.sourceMeshes} Meshes zu ${group.children.length} Zeichenaufrufen zusammengefasst`,
    );
    this.buckets.clear();
    this.sourceMeshes = 0;
    return group.children.length > 0 ? group : null;
  }
}

/**
 * Fuegt Geometrien mit gleichem Attributsatz zusammen.
 *
 * Bewusst ohne Abhaengigkeit von den Three.js-Beispielmodulen, damit der
 * Build keine zusaetzlichen Pfade braucht.
 */
export function mergeGeometryList(list: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (list.length === 0) return null;
  if (list.length === 1) return list[0]!.clone();

  let vertexCount = 0;
  let indexCount = 0;
  for (const g of list) {
    vertexCount += g.attributes.position!.count;
    indexCount += g.index ? g.index.count : g.attributes.position!.count;
  }

  const position = new Float32Array(vertexCount * 3);
  const normal = new Float32Array(vertexCount * 3);
  const uv = new Float32Array(vertexCount * 2);
  const index = vertexCount > 65535
    ? new Uint32Array(indexCount)
    : new Uint16Array(indexCount);

  let vertexOffset = 0;
  let indexOffset = 0;
  for (const g of list) {
    const pos = g.attributes.position as THREE.BufferAttribute;
    const nrm = g.attributes.normal as THREE.BufferAttribute | undefined;
    const tex = g.attributes.uv as THREE.BufferAttribute | undefined;
    const count = pos.count;

    position.set(pos.array as ArrayLike<number>, vertexOffset * 3);
    if (nrm) normal.set(nrm.array as ArrayLike<number>, vertexOffset * 3);
    if (tex) uv.set(tex.array as ArrayLike<number>, vertexOffset * 2);

    if (g.index) {
      const src = g.index.array as ArrayLike<number>;
      for (let i = 0; i < src.length; i++) index[indexOffset + i] = src[i]! + vertexOffset;
      indexOffset += src.length;
    } else {
      for (let i = 0; i < count; i++) index[indexOffset + i] = vertexOffset + i;
      indexOffset += count;
    }
    vertexOffset += count;
  }

  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}
