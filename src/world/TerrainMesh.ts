import * as THREE from 'three';
import type { Biome } from '@/data/schema';
import { clamp01 } from '@/core/MathUtils';
import { ValueNoise2D } from '@/core/Noise';
import type { TerrainField } from './TerrainField';
import type { TextureFactory, TextureKind } from '@/engine/TextureFactory';

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
/** Ein Wegstueck, das in die Bodenfarbe eingezeichnet wird. */
export interface PathSegment {
  ax: number; az: number;
  bx: number; bz: number;
  width: number;
}

/** Abstand eines Punktes zu einer Strecke. */
function distanceToSegment(x: number, z: number, s: PathSegment): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const lenSq = dx * dx + dz * dz;
  const t = lenSq === 0 ? 0
    : Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / lenSq));
  return Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
}

/** Bodentextur je Biom. */
export const BIOME_GROUND_TEXTURE: Record<Biome, TextureKind> = {
  grassland: 'grass', meadow: 'grass', forest: 'grass', wetland: 'grass',
  rocky: 'rock', mountain: 'rock', cave: 'rock', ruins: 'stone',
  snow: 'snow', desert: 'sand', coastal: 'sand',
  volcanic: 'rock', urban: 'grass', industrial: 'dirt',
};

export function buildTerrainMesh(
  field: TerrainField,
  biome: Biome,
  options: {
    segments?: number; seed?: number; paths?: PathSegment[];
    textures?: TextureFactory;
  } = {},
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
  const paths = options.paths ?? [];
  // Wege sind eine abgetretene, hellere Variante des Hangmaterials.
  const pathColor = new THREE.Color(palette.slope).lerp(new THREE.Color('#c9b48d'), 0.3);

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
    // Helligkeit und Farbton streuen, sonst bleibt der Boden eine Flaeche.
    // Grosse Flecken (broad) geben Wiesen Struktur, die feine Sprenkelung
    // bricht die Dreiecksraster auf.
    tmp.offsetHSL((fine - 0.5) * 0.02, (broad - 0.5) * 0.06, (fine - 0.5) * 0.13
      + (broad - 0.5) * 0.08);
    // Fels/Erde erst an wirklich steilen Haengen: sonst faerben sich flache
    // Huegel sandfarben und rahmen jedes Gebiet wie einen Sandkasten ein.
    if (slope > 0.26) tmp.lerp(slopeC, clamp01((slope - 0.26) / 0.5) * 0.92);
    if (normalizedHeight > 0.68) tmp.lerp(peakC, clamp01((normalizedHeight - 0.68) / 0.32) * 0.85);

    // Trampelpfade zwischen Haeusern und Ortsausgaengen.
    if (paths.length > 0) {
      let strength = 0;
      for (const segment of paths) {
        const dist = distanceToSegment(x, z, segment);
        const half = segment.width / 2;
        if (dist > half + 1.4) continue;
        // Weicher Rand, zusaetzlich vom Rauschen ausgefranst.
        const edge = 1 - clamp01((dist - half * 0.5) / (half * 0.5 + 0.9));
        strength = Math.max(strength, edge * (0.72 + fine * 0.5));
      }
      if (strength > 0) tmp.lerp(pathColor, clamp01(strength) * 0.92);
    }

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  // Textur und Vertexfarben zusammen: die Textur bringt die feine Koernung,
  // die Vertexfarben Biom, Hoehe, Haenge und Wege. Ohne Textur bleibt der
  // Boden eine glatte Farbflaeche.
  const groundTexture = options.textures
    ? options.textures.get(BIOME_GROUND_TEXTURE[biome], '#ffffff')
    : null;
  let map: THREE.Texture | null = null;
  if (groundTexture) {
    map = groundTexture.clone();
    map.needsUpdate = true;
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    // Eine Kachel je sechs Meter: fein genug fuer die Nahsicht, gross genug,
    // dass die Wiederholung aus der Ferne nicht als Muster auffaellt.
    map.repeat.set(field.width / 6, field.depth / 6);
  }

  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true,
    map,
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

/**
 * Himmelskuppel mit Verlauf, Wolkenband, Sonne und Sternen.
 *
 * Alles im Shader berechnet: keine Texturen, ein einziger Zeichenaufruf.
 * `sunDirection`, `cloudAmount` und `nightAmount` werden vom WorldManager
 * jede Bildwiederholung nachgefuehrt, damit der Himmel dem Tagesverlauf und
 * dem Wetter folgt.
 */
/**
 * Baut die Fernkulisse: zwei Bergketten hinter dem begehbaren Gebiet.
 *
 * Ohne sie endet die Welt am Rand des Spielfelds und der Blick faellt ins
 * Leere - man kann nicht "in die Landschaft schauen". Die Ketten liegen
 * ausserhalb des Spielfelds, tragen keine Kollision und bestehen aus zwei
 * zusammengefassten Meshes, kosten also zwei Zeichenaufrufe.
 *
 * Die Hoehen kommen aus Rauschen, das auf dem Kreis abgetastet wird - so
 * schliesst die Kette nahtlos und hat trotzdem unregelmaessige Gipfel.
 */
const BACKDROP_LAYERS = [
  // Naehere Kette: kraeftiger. Ferne Kette: hoeher, blasser, weiter weg.
  { radius: 1.05, offset: 40, height: 26, spread: 34, blend: 0.32, freq: 3.2 },
  { radius: 1.35, offset: 130, height: 78, spread: 90, blend: 0.6, freq: 1.9 },
] as const;

/** Aussenradius der Kulisse - der Himmel muss weiter reichen als sie. */
export function backdropOuterRadius(innerRadius: number): number {
  let max = 0;
  for (const l of BACKDROP_LAYERS) {
    max = Math.max(max, innerRadius * l.radius + l.offset + l.spread);
  }
  return max;
}

export function buildBackdrop(
  palette: BiomePalette, innerRadius: number, seed: number, heightScale = 1,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'backdrop';
  const noise = new ValueNoise2D(seed + 4211);

  const layers = BACKDROP_LAYERS.map((l) => ({
    ...l, radius: innerRadius * l.radius + l.offset, height: l.height * heightScale,
  }));

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li]!;
    const segments = 128;
    const positions: number[] = [];
    const colors: number[] = [];

    // Farben: unten Vegetation, oben Fels/Schnee - beide in Richtung
    // Horizontfarbe verschoben, damit Entfernung auch ohne Nebel wirkt.
    const haze = new THREE.Color(palette.skyBottom);
    const low = new THREE.Color(palette.groundAlt).lerp(haze, layer.blend);
    const high = new THREE.Color(palette.peak).lerp(haze, layer.blend * 0.8);
    const tmp = new THREE.Color();

    const heightAt = (i: number): number => {
      const a = (i / segments) * Math.PI * 2;
      const n = noise.fbm(
        Math.cos(a) * layer.freq + 10, Math.sin(a) * layer.freq + 10, 3, 2, 0.45,
      );
      const ridge = 1 - Math.abs(noise.sample(Math.cos(a) * 1.3, Math.sin(a) * 1.3) * 2 - 1);
      return layer.height * (0.35 + n * 0.9 + ridge * 0.35);
    };

    // Schattierung steckt in den Scheitelfarben, nicht im Licht: eine
    // Kulisse aus DoubleSide-Dreiecken bekommt sonst je nach Blickrichtung
    // schwarze Flaechen, weil die Normalen von der Sonne wegzeigen.
    const push = (x: number, y: number, z: number, c: THREE.Color, shade = 1): void => {
      positions.push(x, y, z);
      colors.push(c.r * shade, c.g * shade, c.b * shade);
    };

    for (let i = 0; i < segments; i++) {
      const a0 = (i / segments) * Math.PI * 2;
      const a1 = ((i + 1) / segments) * Math.PI * 2;
      const h0 = heightAt(i);
      const h1 = heightAt(i + 1);
      const rIn = layer.radius;
      const rMid = layer.radius + layer.spread * 0.55;
      const rOut = layer.radius + layer.spread;

      const p = (r: number, a: number, y: number): [number, number, number] =>
        [Math.cos(a) * r, y, Math.sin(a) * r];

      const base0 = p(rIn, a0, -6);
      const base1 = p(rIn, a1, -6);
      const peak0 = p(rMid, a0, h0);
      const peak1 = p(rMid, a1, h1);
      const back0 = p(rOut, a0, h0 * 0.28);
      const back1 = p(rOut, a1, h1 * 0.28);

      const cPeak0 = tmp.copy(low).lerp(high, Math.min(1, h0 / layer.height)).clone();
      const cPeak1 = tmp.copy(low).lerp(high, Math.min(1, h1 / layer.height)).clone();

      // Vorderflanke (zur Kamera hin, heller).
      push(...base0, low); push(...peak1, cPeak1); push(...peak0, cPeak0);
      push(...base0, low); push(...base1, low); push(...peak1, cPeak1);
      // Rueckflanke - verhindert eine offene Silhouette bei hohem Blickwinkel.
      const back = 0.78;
      push(...peak0, cPeak0, back); push(...peak1, cPeak1, back); push(...back1, low, back);
      push(...peak0, cPeak0, back); push(...back1, low, back); push(...back0, low, back);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, fog: true,
    }));
    mesh.name = `backdrop-${li}`;
    mesh.frustumCulled = false;
    mesh.renderOrder = -1;
    group.add(mesh);
  }
  return group;
}

export function buildSky(top: string, bottom: string, radius: number): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 32, 20);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(top) },
      bottomColor: { value: new THREE.Color(bottom) },
      sunDirection: { value: new THREE.Vector3(0.4, 0.6, 0.3).normalize() },
      sunColor: { value: new THREE.Color('#fff4d0') },
      cloudAmount: { value: 0.45 },
      nightAmount: { value: 0 },
      time: { value: 0 },
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
      uniform vec3 sunDirection;
      uniform vec3 sunColor;
      uniform float cloudAmount;
      uniform float nightAmount;
      uniform float time;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;

      // Wertrauschen mit weicher Interpolation - Grundlage der Wolken.
      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
          mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p *= 2.02;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec3 dir = normalize(vWorldPosition + vec3(0.0, offset, 0.0));
        float h = dir.y;
        vec3 sky = mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0));

        // Sonne (oder Mond): weicher Kern mit Hof.
        float sunDot = max(dot(dir, normalize(sunDirection)), 0.0);
        float disc = smoothstep(0.9975, 0.9995, sunDot);
        float halo = pow(sunDot, 90.0) * 0.5 + pow(sunDot, 8.0) * 0.16;
        sky += sunColor * (disc * 1.4 + halo);

        // Sterne: nur nachts und nur oberhalb des Horizonts.
        if (nightAmount > 0.01 && h > 0.02) {
          // Ein Stern je Rasterzelle, als runder Punkt um einen zufaelligen
          // Mittelpunkt. Ohne den Abstandsabfall leuchtet die ganze Zelle und
          // die Sterne wirken wie kurze Striche.
          vec2 starCoord = dir.xz / max(h, 0.08) * 38.0;
          vec2 cell = floor(starCoord);
          vec2 local = fract(starCoord);
          float pick = hash(cell);
          vec2 center = vec2(hash(cell + 3.7), hash(cell + 8.3));
          float dist = length(local - center);
          float dot1 = 1.0 - smoothstep(0.0, 0.09, dist);
          float twinkle = 0.65 + 0.35 * sin(time * 2.2 + pick * 60.0);
          float bright = step(0.86, pick) * dot1 * twinkle;
          sky += vec3(0.88, 0.92, 1.0) * bright * nightAmount * smoothstep(0.02, 0.3, h);
        }

        // Wolkenband: zwei versetzte Rauschebenen, mit der Hoehe ausgeblendet.
        if (cloudAmount > 0.01 && h > 0.0) {
          vec2 uv = dir.xz / max(h + 0.12, 0.12);
          float drift = time * 0.004;
          float base = fbm(uv * 0.55 + vec2(drift, drift * 0.6));
          float detail = fbm(uv * 1.6 - vec2(drift * 1.7, drift));
          float density = base * 0.72 + detail * 0.28;
          float coverage = mix(0.74, 0.34, clamp(cloudAmount, 0.0, 1.0));
          float cloud = smoothstep(coverage, coverage + 0.22, density);
          cloud *= smoothstep(0.02, 0.22, h) * (1.0 - smoothstep(0.75, 1.0, h) * 0.45);

          // Von der Sonne angestrahlte Kante hellt auf, der Kern bleibt grau.
          float lit = clamp(dot(normalize(sunDirection), vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5, 0.0, 1.0);
          vec3 cloudColor = mix(vec3(0.42, 0.46, 0.55), vec3(1.0, 0.99, 0.96), lit);
          cloudColor = mix(cloudColor * 0.55, cloudColor, 1.0 - nightAmount * 0.7);
          cloudColor += sunColor * halo * 0.6;
          sky = mix(sky, cloudColor, cloud * 0.92);
        }

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return mesh;
}
