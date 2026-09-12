import * as THREE from 'three';
import type { Biome } from '@/data/schema';
import { clamp01 } from '@/core/MathUtils';
import { ValueNoise2D } from '@/core/Noise';
import type { TerrainField } from './TerrainField';

export interface BiomePalette {
  ground: string;
  groundAlt: string;
  slope: string;
  peak: string;
  water: string;
  /** Farbe fuer hohes Gras. */
  grass: string;
  grassAlt: string;
  fog: string;
  skyTop: string;
  skyBottom: string;
}

/** Farbpaletten je Biom - bestimmen den Gesamteindruck eines Gebiets. */
export const BIOME_PALETTES: Record<Biome, BiomePalette> = {
  grassland: {
    ground: '#7bbf5a', groundAlt: '#6aab4d', slope: '#a08961', peak: '#c4b89b',
    water: '#3f8fc4', grass: '#5ea347', grassAlt: '#8fcc63',
    fog: '#cfe4f2', skyTop: '#4a9fe0', skyBottom: '#bfe4f7',
  },
  meadow: {
    ground: '#8fcc63', groundAlt: '#a4d873', slope: '#b09a70', peak: '#d8ccaa',
    water: '#55a8d8', grass: '#6fb84f', grassAlt: '#b8dd7a',
    fog: '#dff0f7', skyTop: '#56a8e4', skyBottom: '#d0eefb',
  },
  forest: {
    ground: '#4f8a42', groundAlt: '#3e7236', slope: '#6b5a3f', peak: '#8f7f5f',
    water: '#356f94', grass: '#417a38', grassAlt: '#67a355',
    fog: '#9fc4b0', skyTop: '#3a86bf', skyBottom: '#a7d4e0',
  },
  rocky: {
    ground: '#9b8f7a', groundAlt: '#877b66', slope: '#6f6455', peak: '#c9c0ae',
    water: '#4380a8', grass: '#7d8a55', grassAlt: '#9aa86b',
    fog: '#d2ccbe', skyTop: '#5c9ac4', skyBottom: '#cfd8de',
  },
  mountain: {
    ground: '#8a8272', groundAlt: '#756d5e', slope: '#5f584c', peak: '#e8eef2',
    water: '#3f78a0', grass: '#6f8555', grassAlt: '#8b9c66',
    fog: '#c6d2da', skyTop: '#4b8ec9', skyBottom: '#c9dce8',
  },
  snow: {
    ground: '#e6eef5', groundAlt: '#d3e0ea', slope: '#a8b6c2', peak: '#ffffff',
    water: '#6fa8cc', grass: '#c6d8e0', grassAlt: '#dfeaf1',
    fog: '#dfe9f2', skyTop: '#7fb0d8', skyBottom: '#e2eef7',
  },
  desert: {
    ground: '#dcc088', groundAlt: '#c9a96c', slope: '#a88b56', peak: '#f0ddb0',
    water: '#4fa0c4', grass: '#c2b071', grassAlt: '#d8c98f',
    fog: '#f0e2c2', skyTop: '#5fb0dd', skyBottom: '#f5e9cc',
  },
  wetland: {
    ground: '#6f9464', groundAlt: '#5b8054', slope: '#7a6a4e', peak: '#9b8f6f',
    water: '#41786b', grass: '#5d8f4f', grassAlt: '#7fa85f',
    fog: '#b8ccbd', skyTop: '#4f90b5', skyBottom: '#c4dbdf',
  },
  coastal: {
    ground: '#c9be96', groundAlt: '#b5a97f', slope: '#8f8468', peak: '#e0d8bd',
    water: '#2f8fc4', grass: '#7db05f', grassAlt: '#a3c97a',
    fog: '#d8eaf2', skyTop: '#3f9edd', skyBottom: '#cdeaf8',
  },
  cave: {
    ground: '#4a4239', groundAlt: '#3a342d', slope: '#2f2a24', peak: '#6b6155',
    water: '#2a4f6b', grass: '#3f5540', grassAlt: '#4f6b4a',
    fog: '#1b1814', skyTop: '#141110', skyBottom: '#241f1a',
  },
  volcanic: {
    ground: '#5b4238', groundAlt: '#452f28', slope: '#33241f', peak: '#7a5b4a',
    water: '#c94b1f', grass: '#6b4a33', grassAlt: '#8a5f3f',
    fog: '#6b4437', skyTop: '#8f3f24', skyBottom: '#d8734b',
  },
  urban: {
    ground: '#9aa08f', groundAlt: '#87907d', slope: '#7a7466', peak: '#b8bcae',
    water: '#4a8fbf', grass: '#6fa85a', grassAlt: '#8fc472',
    fog: '#d4e0e6', skyTop: '#4f9cd4', skyBottom: '#c9e2f0',
  },
  industrial: {
    ground: '#7a7568', groundAlt: '#666255', slope: '#57534a', peak: '#918c7d',
    water: '#4f7085', grass: '#6b7a4f', grassAlt: '#879a63',
    fog: '#b8bcb4', skyTop: '#6f8798', skyBottom: '#c2ccd0',
  },
  ruins: {
    ground: '#8a8370', groundAlt: '#75705f', slope: '#635d4f', peak: '#a8a08a',
    water: '#3f6b80', grass: '#6b7d4f', grassAlt: '#8a9a63',
    fog: '#c2bfae', skyTop: '#5a7f9b', skyBottom: '#c4c9c0',
  },
};

export interface TerrainMeshResult {
  mesh: THREE.Mesh;
  water: THREE.Mesh | null;
  geometry: THREE.BufferGeometry;
}

/**
 * Erzeugt das Terrain-Mesh aus einem Hoehenfeld.
 *
 * Faerbung ueber Vertex-Farben statt Texturen: keine Texturdateien noetig,
 * sehr guenstig im Speicher, und der Farbverlauf ergibt sich aus Hoehe und
 * Steigung - das liefert automatisch Fels an Haengen und Gras in der Ebene.
 */
export function buildTerrainMesh(
  field: TerrainField,
  biome: Biome,
  options: { segments?: number; seed?: number } = {},
): TerrainMeshResult {
  const palette = BIOME_PALETTES[biome];
  // Aufloesung an die Gebietsgroesse koppeln, aber deckeln.
  const targetSeg = options.segments
    ?? Math.min(190, Math.max(28, Math.round(Math.max(field.width, field.depth) / 2.2)));
  const segX = Math.min(targetSeg, Math.max(8, Math.round(targetSeg * (field.width / Math.max(field.width, field.depth)))));
  const segZ = Math.min(targetSeg, Math.max(8, Math.round(targetSeg * (field.depth / Math.max(field.width, field.depth)))));

  const geometry = new THREE.PlaneGeometry(field.width, field.depth, segX, segZ);
  geometry.rotateX(-Math.PI / 2);
  // PlaneGeometry ist zentriert - auf [0..w] x [0..d] verschieben.
  geometry.translate(field.width / 2, 0, field.depth / 2);

  const position = geometry.attributes.position as THREE.BufferAttribute;
  const count = position.count;
  const colors = new Float32Array(count * 3);

  const groundA = new THREE.Color(palette.ground);
  const groundB = new THREE.Color(palette.groundAlt);
  const slopeC = new THREE.Color(palette.slope);
  const peakC = new THREE.Color(palette.peak);
  const tmp = new THREE.Color();
  const tint = new ValueNoise2D(options.seed ?? 1234);

  const range = Math.max(0.001, field.maxHeight - field.minHeight);

  for (let i = 0; i < count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const h = field.heightAt(x, z);
    position.setY(i, h);

    const normalizedHeight = clamp01((h - field.minHeight) / range);
    const slope = clamp01(field.slopeAt(x, z) * 2.4);
    // Zwei Rauschfrequenzen: grosse Flecken und feine Sprenkelung. Ohne das
    // wirkt der Boden wie eine einfarbige Flaeche.
    const broad = tint.fbm(x * 0.022, z * 0.022, 3);
    const fine = tint.fbm(x * 0.16, z * 0.16, 2);
    const variation = clamp01(broad * 0.72 + fine * 0.28);

    tmp.copy(groundA).lerp(groundB, variation);
    // Leichte Helligkeitsstreuung bricht die Einfarbigkeit zusaetzlich auf.
    tmp.offsetHSL(0, 0, (fine - 0.5) * 0.07);
    if (slope > 0.1) tmp.lerp(slopeC, clamp01((slope - 0.1) / 0.45));
    if (normalizedHeight > 0.68) tmp.lerp(peakC, clamp01((normalizedHeight - 0.68) / 0.32) * 0.85);

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();

  let water: THREE.Mesh | null = null;
  if (field.waterLevel !== null) {
    const waterGeo = new THREE.PlaneGeometry(field.width, field.depth, 1, 1);
    waterGeo.rotateX(-Math.PI / 2);
    waterGeo.translate(field.width / 2, field.waterLevel, field.depth / 2);
    const waterMat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(palette.water),
      transparent: true,
      opacity: 0.76,
      depthWrite: false,
    });
    water = new THREE.Mesh(waterGeo, waterMat);
    water.name = 'water';
    water.receiveShadow = false;
    water.renderOrder = 1;
  }

  return { mesh, water, geometry };
}

/** Erzeugt einen einfachen, GPU-guenstigen Himmelsgradienten. */
export function buildSky(top: string, bottom: string, radius: number): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 22, 14);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(top) },
      bottomColor: { value: new THREE.Color(bottom) },
      offset: { value: radius * 0.08 },
      exponent: { value: 0.72 },
    },
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}
