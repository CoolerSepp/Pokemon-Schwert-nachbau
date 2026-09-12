import * as THREE from 'three';
import { RNG } from '@/core/RNG';

export interface ParticleBurstOptions {
  position: THREE.Vector3;
  count: number;
  color: string;
  /** Zweite Farbe fuer einen Verlauf. */
  color2?: string;
  size: number;
  speed: number;
  spread: number;
  lifetime: number;
  gravity: number;
  /** Startgeschwindigkeit nach oben. */
  upward?: number;
  /** Ringfoermige statt kugelfoermiger Verteilung. */
  ring?: boolean;
  /** Aufsteigende Spirale. */
  spiral?: boolean;
  /** Fuer dauerhafte Effekte: Emitter bleibt aktiv. */
  continuous?: boolean;
}

/**
 * GPU-freundliches Partikelsystem auf Basis eines einzigen Points-Objekts.
 *
 * Alle Partikel teilen sich einen Draw Call; tote Partikel werden ueber einen
 * freien Index wiederverwendet (Object Pooling, Anforderung 48).
 */
export class ParticleSystem {
  readonly object: THREE.Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly velocities: Float32Array;
  private readonly lifetimes: Float32Array;
  private readonly maxLifetimes: Float32Array;
  private readonly gravities: Float32Array;
  private readonly spiralPhase: Float32Array;
  private readonly capacity: number;
  private aliveCount = 0;
  private readonly rng = new RNG('particles');
  private readonly geometry: THREE.BufferGeometry;

  constructor(capacity = 900) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.sizes = new Float32Array(capacity);
    this.velocities = new Float32Array(capacity * 3);
    this.lifetimes = new Float32Array(capacity);
    this.maxLifetimes = new Float32Array(capacity);
    this.gravities = new Float32Array(capacity);
    this.spiralPhase = new Float32Array(capacity);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setDrawRange(0, 0);

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {},
      vertexShader: `
        attribute float size;
        varying vec3 vColor;
        void main() {
          vColor = color;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (260.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          // Weiche runde Partikel ohne Textur.
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      vertexColors: true,
    });

    this.object = new THREE.Points(this.geometry, material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 900;
    this.object.name = 'particles';
  }

  get activeCount(): number { return this.aliveCount; }

  /** Erzeugt einen Partikelausbruch. */
  burst(options: ParticleBurstOptions): void {
    const colorA = new THREE.Color(options.color);
    const colorB = new THREE.Color(options.color2 ?? options.color);
    const count = Math.min(options.count, this.capacity - this.aliveCount);

    for (let i = 0; i < count; i++) {
      const index = this.aliveCount++;
      const p3 = index * 3;

      this.positions[p3] = options.position.x + this.rng.float(-0.1, 0.1);
      this.positions[p3 + 1] = options.position.y + this.rng.float(-0.1, 0.1);
      this.positions[p3 + 2] = options.position.z + this.rng.float(-0.1, 0.1);

      let vx: number;
      let vy: number;
      let vz: number;
      if (options.ring) {
        const angle = (i / count) * Math.PI * 2;
        vx = Math.cos(angle) * options.speed;
        vz = Math.sin(angle) * options.speed;
        vy = (options.upward ?? 0) + this.rng.float(-0.2, 0.4);
      } else {
        const theta = this.rng.float(0, Math.PI * 2);
        const phi = Math.acos(this.rng.float(-1, 1));
        const speed = options.speed * this.rng.float(0.55, 1);
        vx = Math.sin(phi) * Math.cos(theta) * speed * options.spread;
        vy = Math.cos(phi) * speed * options.spread + (options.upward ?? 0);
        vz = Math.sin(phi) * Math.sin(theta) * speed * options.spread;
      }
      this.velocities[p3] = vx;
      this.velocities[p3 + 1] = vy;
      this.velocities[p3 + 2] = vz;

      const mix = this.rng.next();
      const color = colorA.clone().lerp(colorB, mix);
      this.colors[p3] = color.r;
      this.colors[p3 + 1] = color.g;
      this.colors[p3 + 2] = color.b;

      this.sizes[index] = options.size * this.rng.float(0.6, 1.35);
      const life = options.lifetime * this.rng.float(0.7, 1.15);
      this.lifetimes[index] = life;
      this.maxLifetimes[index] = life;
      this.gravities[index] = options.gravity;
      this.spiralPhase[index] = options.spiral ? this.rng.float(0, Math.PI * 2) : -1;
    }
    this.markDirty();
  }

  update(dt: number): void {
    let i = 0;
    while (i < this.aliveCount) {
      this.lifetimes[i]! -= dt;
      if (this.lifetimes[i]! <= 0) {
        this.swapRemove(i);
        continue;
      }
      const p3 = i * 3;
      if (this.spiralPhase[i]! >= 0) {
        // Spiralbewegung: Geschwindigkeit um die Y-Achse drehen.
        this.spiralPhase[i]! += dt * 6;
        const angle = this.spiralPhase[i]!;
        const radius = 0.9;
        this.positions[p3] += Math.cos(angle) * radius * dt;
        this.positions[p3 + 2] += Math.sin(angle) * radius * dt;
      }
      this.velocities[p3 + 1]! -= this.gravities[i]! * dt;
      this.positions[p3] += this.velocities[p3]! * dt;
      this.positions[p3 + 1] += this.velocities[p3 + 1]! * dt;
      this.positions[p3 + 2] += this.velocities[p3 + 2]! * dt;

      // Groesse laeuft mit der Restlebenszeit aus.
      const t = this.lifetimes[i]! / this.maxLifetimes[i]!;
      this.sizes[i] = this.sizes[i]! * (0.985 + t * 0.012);
      i++;
    }
    this.markDirty();
  }

  private swapRemove(index: number): void {
    const last = this.aliveCount - 1;
    if (index !== last) {
      const a = index * 3;
      const b = last * 3;
      for (let k = 0; k < 3; k++) {
        this.positions[a + k] = this.positions[b + k]!;
        this.colors[a + k] = this.colors[b + k]!;
        this.velocities[a + k] = this.velocities[b + k]!;
      }
      this.sizes[index] = this.sizes[last]!;
      this.lifetimes[index] = this.lifetimes[last]!;
      this.maxLifetimes[index] = this.maxLifetimes[last]!;
      this.gravities[index] = this.gravities[last]!;
      this.spiralPhase[index] = this.spiralPhase[last]!;
    }
    this.aliveCount--;
  }

  private markDirty(): void {
    this.geometry.setDrawRange(0, this.aliveCount);
    (this.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }

  clear(): void {
    this.aliveCount = 0;
    this.markDirty();
  }

  dispose(): void {
    this.geometry.dispose();
    (this.object.material as THREE.Material).dispose();
    this.object.removeFromParent();
  }
}
