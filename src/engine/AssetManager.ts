import * as THREE from 'three';
import { Logger } from '@/core/Logger';
import type { PartShape } from '@/data/schema';
import { TextureFactory, type TextureKind } from './TextureFactory';

const log = Logger.scope('Assets');

export interface MaterialSpec {
  color: string;
  flatShading?: boolean;
  metalness?: number;
  emissive?: number;
  opacity?: number;
  roughness?: number;
  doubleSided?: boolean;
  /** Prozedurale Textur; ohne Angabe bleibt die Flaeche einfarbig. */
  texture?: TextureKind;
  /** Wiederholungen der Textur auf der Flaeche. */
  textureRepeat?: number;
}

/**
 * Verwaltet und teilt Geometrien, Materialien und optionale externe Modelle.
 *
 * Geometrien und Materialien werden dedupliziert: eine Welt aus tausenden
 * Objekten benutzt nur wenige Dutzend GPU-Ressourcen (Anforderung 48).
 */
export class AssetManager {
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly materials = new Map<string, THREE.Material>();
  /** Prozedurale Texturen - erzeugt keine Dateien, zeichnet auf Canvas. */
  readonly textures = new TextureFactory();
  private readonly gltfCache = new Map<string, THREE.Group>();
  private disposed = false;

  /** Basisgeometrie mit Einheitsgroesse; Skalierung erfolgt per Mesh. */
  getShape(shape: PartShape, detail = 2): THREE.BufferGeometry {
    const key = `${shape}:${detail}`;
    const cached = this.geometries.get(key);
    if (cached) return cached;

    const geo = AssetManager.createShape(shape, detail);
    geo.name = key;
    this.geometries.set(key, geo);
    return geo;
  }

  static createShape(shape: PartShape, detail: number): THREE.BufferGeometry {
    const seg = Math.max(3, 4 + detail * 3);
    switch (shape) {
      case 'sphere':
        return new THREE.SphereGeometry(1, seg + 2, Math.max(3, Math.ceil(seg * 0.6)));
      case 'box':
        return new THREE.BoxGeometry(2, 2, 2);
      case 'capsule':
        return new THREE.CapsuleGeometry(1, 1.1, Math.max(2, detail + 1), seg);
      case 'cone':
        return new THREE.ConeGeometry(1, 2, seg);
      case 'cylinder':
        return new THREE.CylinderGeometry(1, 1, 2, seg);
      case 'torus':
        return new THREE.TorusGeometry(1, 0.36, Math.max(4, detail * 3), seg);
      case 'tetra':
        return new THREE.TetrahedronGeometry(1, 0);
      case 'octa':
        return new THREE.OctahedronGeometry(1, 0);
      case 'dodeca':
        return new THREE.DodecahedronGeometry(1, 0);
      case 'plane':
        return new THREE.PlaneGeometry(2, 2, 1, 1);
    }
  }

  /** Freiform-Geometrie registrieren (Terrain, Gebaeude). */
  registerGeometry(key: string, geometry: THREE.BufferGeometry): THREE.BufferGeometry {
    const existing = this.geometries.get(key);
    if (existing && existing !== geometry) existing.dispose();
    geometry.name = key;
    this.geometries.set(key, geometry);
    return geometry;
  }

  getGeometry(key: string): THREE.BufferGeometry | undefined {
    return this.geometries.get(key);
  }

  getMaterial(spec: MaterialSpec): THREE.Material {
    const key = [
      spec.color, spec.flatShading ? 1 : 0, spec.metalness ?? 0,
      spec.emissive ?? 0, spec.opacity ?? 1, spec.roughness ?? 0.85,
      spec.doubleSided ? 1 : 0, spec.texture ?? '-', spec.textureRepeat ?? 1,
    ].join('|');
    const cached = this.materials.get(key);
    if (cached) return cached;

    const color = new THREE.Color(spec.color);
    const transparent = (spec.opacity ?? 1) < 1;
    let material: THREE.Material;

    // Textur in der Materialfarbe einfaerben und die Grundfarbe auf Weiss
    // setzen, sonst wuerde die Farbe doppelt wirken.
    let map: THREE.Texture | null = null;
    if (spec.texture) {
      const source = this.textures.get(spec.texture, spec.color);
      const repeat = spec.textureRepeat ?? 1;
      if (repeat === 1) {
        map = source;
      } else {
        // Eigene Kopie, damit unterschiedliche Wiederholungen moeglich sind.
        map = source.clone();
        map.needsUpdate = true;
        map.wrapS = THREE.RepeatWrapping;
        map.wrapT = THREE.RepeatWrapping;
        map.repeat.set(repeat, repeat);
      }
    }

    if ((spec.metalness ?? 0) > 0.05) {
      material = new THREE.MeshStandardMaterial({
        color,
        flatShading: spec.flatShading ?? false,
        metalness: spec.metalness ?? 0,
        roughness: spec.roughness ?? 0.5,
        transparent,
        opacity: spec.opacity ?? 1,
        side: spec.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        emissive: (spec.emissive ?? 0) > 0 ? color : new THREE.Color(0x000000),
        emissiveIntensity: spec.emissive ?? 0,
        map,
      });
    } else {
      // Lambert ist deutlich guenstiger und reicht fuer den Low-Poly-Stil.
      material = new THREE.MeshLambertMaterial({
        color,
        flatShading: spec.flatShading ?? false,
        transparent,
        opacity: spec.opacity ?? 1,
        side: spec.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        emissive: (spec.emissive ?? 0) > 0 ? color : new THREE.Color(0x000000),
        emissiveIntensity: spec.emissive ?? 0,
        map,
      });
    }
    // Die Textur traegt die Farbe bereits; die Materialfarbe bleibt neutral,
    // damit der Ton nicht doppelt aufgetragen wird.
    if (map) (material as THREE.MeshLambertMaterial).color.set('#ffffff');
    material.name = key;
    this.materials.set(key, material);
    return material;
  }

  /**
   * Laedt ein externes glTF/GLB-Modell, falls vorhanden.
   *
   * Das Spiel funktioniert vollstaendig ohne externe Assets (prozedurale
   * Modelle); dieser Pfad existiert, damit eigene Modelle spaeter ohne
   * Codeaenderung ergaenzt werden koennen (Anforderung 52).
   */
  async loadModel(url: string): Promise<THREE.Group | null> {
    const cached = this.gltfCache.get(url);
    if (cached) return cached.clone(true);
    try {
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(url);
      const group = gltf.scene;
      group.userData.animations = gltf.animations;
      this.gltfCache.set(url, group);
      log.info(`Modell geladen: ${url}`);
      return group.clone(true);
    } catch (err) {
      log.warn(`Modell "${url}" nicht verfuegbar - prozedurales Modell wird benutzt`, err);
      return null;
    }
  }

  get stats(): { geometries: number; materials: number; models: number } {
    return {
      geometries: this.geometries.size,
      materials: this.materials.size,
      models: this.gltfCache.size,
    };
  }

  dispose(): void {
    this.textures.dispose();
    if (this.disposed) return;
    this.disposed = true;
    for (const g of this.geometries.values()) g.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.geometries.clear();
    this.materials.clear();
    this.gltfCache.clear();
  }
}

/** Entsorgt einen Teilbaum vollstaendig (Geometrien bleiben, sie sind geteilt). */
export function disposeObject(root: THREE.Object3D, disposeGeometry = false): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (disposeGeometry && mesh.geometry) mesh.geometry.dispose();
  });
  root.removeFromParent();
}
