import * as THREE from 'three';
import { RNG } from '@/core/RNG';
import type { WeatherKind } from '@/data/schema';

/** Aussehen und Bewegung einer Wetterart. */
interface WeatherProfile {
  /** Art der Darstellung. */
  form: 'none' | 'rain' | 'flakes' | 'dust';
  /** Anteil des Partikelbudgets (0..1). */
  density: number;
  /** Fallgeschwindigkeit in Metern je Sekunde (negativ = nach unten). */
  fallSpeed: number;
  /** Seitliche Windgeschwindigkeit. */
  wind: number;
  /** Seitliches Pendeln (nur Flocken). */
  sway: number;
  /** Streifenlaenge (nur Regen). */
  streak: number;
  size: number;
  color: number;
  opacity: number;
  /** Sekunden zwischen Blitzen; 0 = keine Blitze. */
  lightning: number;
}

const NONE: WeatherProfile = {
  form: 'none', density: 0, fallSpeed: 0, wind: 0, sway: 0,
  streak: 0, size: 0, color: 0xffffff, opacity: 0, lightning: 0,
};

const PROFILES: Record<WeatherKind, WeatherProfile> = {
  clear: NONE,
  cloudy: NONE,
  harshSun: NONE,
  fog: {
    form: 'dust', density: 0.35, fallSpeed: -0.25, wind: 0.8, sway: 0.4,
    streak: 0, size: 0.55, color: 0xdfe6ec, opacity: 0.16, lightning: 0,
  },
  rain: {
    form: 'rain', density: 0.7, fallSpeed: -26, wind: 2.5, sway: 0,
    streak: 0.85, size: 0, color: 0x9fc4e8, opacity: 0.5, lightning: 0,
  },
  heavyRain: {
    form: 'rain', density: 1, fallSpeed: -34, wind: 5, sway: 0,
    streak: 1.25, size: 0, color: 0x8fb6de, opacity: 0.62, lightning: 0,
  },
  thunderstorm: {
    form: 'rain', density: 1, fallSpeed: -38, wind: 8, sway: 0,
    streak: 1.4, size: 0, color: 0x9ab0cc, opacity: 0.66, lightning: 7,
  },
  snow: {
    form: 'flakes', density: 0.6, fallSpeed: -1.9, wind: 0.9, sway: 1.1,
    streak: 0, size: 0.17, color: 0xffffff, opacity: 0.85, lightning: 0,
  },
  blizzard: {
    form: 'flakes', density: 1, fallSpeed: -3.4, wind: 9, sway: 1.6,
    streak: 0, size: 0.2, color: 0xf4faff, opacity: 0.95, lightning: 0,
  },
  sandstorm: {
    form: 'dust', density: 0.9, fallSpeed: -1.2, wind: 13, sway: 0.9,
    streak: 0, size: 0.22, color: 0xd8b878, opacity: 0.6, lightning: 0,
  },
};

/**
 * Erzeugt eine weiche runde Punkttextur.
 *
 * Ohne Textur zeichnet Three.js Punkte als harte Quadrate; die Textur wird
 * zur Laufzeit gezeichnet, damit das Spiel ohne Bilddateien auskommt.
 */
function buildFlakeTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2, size / 2, 0, size / 2, size / 2, size / 2,
    );
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Halbe Kantenlaenge der Box, in der Partikel um die Kamera kreisen. */
const BOX_XZ = 26;
const BOX_TOP = 22;
const BOX_BOTTOM = -8;

/**
 * Sichtbares Wetter: Regen, Schnee, Sand und Nebelflocken.
 *
 * Die Partikel leben in einer Box, die der Kamera folgt und an den Raendern
 * umbricht - so genuegen wenige hundert Partikel fuer den Eindruck eines
 * flaechendeckenden Wetters. Regen wird als Liniensegment gezeichnet
 * (zwei Punkte je Tropfen), Schnee und Sand als Punktwolke.
 */
export class WeatherSystem {
  readonly object = new THREE.Group();

  private readonly rng = new RNG('weather-particles');
  private readonly budget: number;

  private readonly rainGeometry: THREE.BufferGeometry;
  private readonly rainPositions: Float32Array;
  private readonly rainMaterial: THREE.LineBasicMaterial;
  private readonly rain: THREE.LineSegments;

  private readonly pointGeometry: THREE.BufferGeometry;
  private readonly pointPositions: Float32Array;
  private readonly pointMaterial: THREE.PointsMaterial;
  private readonly flakeTexture: THREE.Texture;
  private readonly points: THREE.Points;

  /** Zustand je Partikel: x, y, z, Phase. */
  private readonly state: Float32Array;
  private readonly maxParticles: number;

  private profile: WeatherProfile = NONE;
  private active = 0;
  private elapsed = 0;
  private lightningTimer = 0;
  private flashValue = 0;
  private indoor = false;

  /** Wird beim Einschlag eines Blitzes gerufen (Donner, Bildschirmblitz). */
  onLightning: (() => void) | null = null;

  constructor(particleBudget: number) {
    this.object.name = 'weather';
    this.object.frustumCulled = false;
    this.budget = Math.max(120, Math.floor(particleBudget * 1.6));
    this.maxParticles = this.budget;

    this.state = new Float32Array(this.maxParticles * 4);
    this.rainPositions = new Float32Array(this.maxParticles * 6);
    this.pointPositions = new Float32Array(this.maxParticles * 3);

    this.rainGeometry = new THREE.BufferGeometry();
    this.rainGeometry.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainGeometry.setDrawRange(0, 0);
    this.rainMaterial = new THREE.LineBasicMaterial({
      color: 0x9fc4e8, transparent: true, opacity: 0.5, depthWrite: false, fog: false,
    });
    this.rain = new THREE.LineSegments(this.rainGeometry, this.rainMaterial);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.rain.renderOrder = 5;
    this.object.add(this.rain);

    this.pointGeometry = new THREE.BufferGeometry();
    this.pointGeometry.setAttribute('position', new THREE.BufferAttribute(this.pointPositions, 3));
    this.pointGeometry.setDrawRange(0, 0);
    this.flakeTexture = buildFlakeTexture();
    this.pointMaterial = new THREE.PointsMaterial({
      color: 0xffffff, size: 0.18, sizeAttenuation: true, map: this.flakeTexture,
      transparent: true, opacity: 0.8, depthWrite: false, fog: false,
      alphaTest: 0.02,
    });
    this.points = new THREE.Points(this.pointGeometry, this.pointMaterial);
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.points.renderOrder = 5;
    this.object.add(this.points);
  }

  /** Aktuelle Blitzhelligkeit (0..1) - hebt kurzzeitig das Umgebungslicht. */
  get flash(): number { return this.flashValue; }
  get activeParticles(): number { return this.active; }

  setWeather(weather: WeatherKind, indoor: boolean): void {
    this.indoor = indoor;
    this.profile = PROFILES[weather] ?? NONE;
    this.active = indoor ? 0 : Math.floor(this.maxParticles * this.profile.density);
    this.lightningTimer = this.profile.lightning > 0
      ? this.rng.float(1.5, this.profile.lightning) : 0;
    this.flashValue = 0;

    const p = this.profile;
    this.rain.visible = !indoor && p.form === 'rain' && this.active > 0;
    this.points.visible = !indoor && (p.form === 'flakes' || p.form === 'dust') && this.active > 0;
    this.rainMaterial.color.setHex(p.color);
    this.rainMaterial.opacity = p.opacity;
    this.pointMaterial.color.setHex(p.color);
    this.pointMaterial.opacity = p.opacity;
    this.pointMaterial.size = p.size;
    this.rainGeometry.setDrawRange(0, this.rain.visible ? this.active * 2 : 0);
    this.pointGeometry.setDrawRange(0, this.points.visible ? this.active : 0);
    if (this.active > 0) this.scatter();
  }

  /** Verteilt alle aktiven Partikel neu in der Box. */
  private scatter(): void {
    for (let i = 0; i < this.active; i++) {
      const o = i * 4;
      this.state[o] = this.rng.float(-BOX_XZ, BOX_XZ);
      this.state[o + 1] = this.rng.float(BOX_BOTTOM, BOX_TOP);
      this.state[o + 2] = this.rng.float(-BOX_XZ, BOX_XZ);
      this.state[o + 3] = this.rng.float(0, Math.PI * 2);
    }
  }

  /**
   * Bewegt die Partikel und haelt die Box an der Kameraposition.
   * Die Positionen im Zustand sind relativ zur Box, die Geometrie liegt in
   * Weltkoordinaten - so bleibt der Umbruch an den Raendern unsichtbar.
   */
  update(dt: number, camX: number, camY: number, camZ: number): void {
    if (this.profile.lightning > 0 && !this.indoor) this.updateLightning(dt);
    if (this.active === 0) return;

    this.elapsed += dt;
    const p = this.profile;
    const baseY = camY + 4;

    for (let i = 0; i < this.active; i++) {
      const o = i * 4;
      let x = this.state[o]!;
      let y = this.state[o + 1]!;
      let z = this.state[o + 2]!;
      const phase = this.state[o + 3]!;

      y += p.fallSpeed * dt;
      x += p.wind * dt;
      if (p.sway > 0) {
        x += Math.sin(this.elapsed * 1.7 + phase) * p.sway * dt;
        z += Math.cos(this.elapsed * 1.3 + phase) * p.sway * dt;
      }

      // Umbruch an allen sechs Seiten der Box.
      if (y < BOX_BOTTOM) { y = BOX_TOP; x = this.rng.float(-BOX_XZ, BOX_XZ); z = this.rng.float(-BOX_XZ, BOX_XZ); }
      else if (y > BOX_TOP) y = BOX_BOTTOM;
      if (x > BOX_XZ) x -= BOX_XZ * 2; else if (x < -BOX_XZ) x += BOX_XZ * 2;
      if (z > BOX_XZ) z -= BOX_XZ * 2; else if (z < -BOX_XZ) z += BOX_XZ * 2;

      this.state[o] = x;
      this.state[o + 1] = y;
      this.state[o + 2] = z;

      const wx = camX + x;
      const wy = baseY + y;
      const wz = camZ + z;

      if (p.form === 'rain') {
        const b = i * 6;
        this.rainPositions[b] = wx;
        this.rainPositions[b + 1] = wy;
        this.rainPositions[b + 2] = wz;
        // Der Streifen zeigt entgegen der Flugrichtung.
        const scale = p.streak / Math.abs(p.fallSpeed);
        this.rainPositions[b + 3] = wx - p.wind * scale;
        this.rainPositions[b + 4] = wy + p.streak;
        this.rainPositions[b + 5] = wz;
      } else {
        const b = i * 3;
        this.pointPositions[b] = wx;
        this.pointPositions[b + 1] = wy;
        this.pointPositions[b + 2] = wz;
      }
    }

    if (p.form === 'rain') {
      this.rainGeometry.attributes.position!.needsUpdate = true;
      this.rainGeometry.computeBoundingSphere();
    } else {
      this.pointGeometry.attributes.position!.needsUpdate = true;
      this.pointGeometry.computeBoundingSphere();
    }
  }

  private updateLightning(dt: number): void {
    if (this.flashValue > 0) {
      this.flashValue = Math.max(0, this.flashValue - dt * 2.6);
    }
    this.lightningTimer -= dt;
    if (this.lightningTimer > 0) return;
    this.lightningTimer = this.rng.float(this.profile.lightning * 0.6, this.profile.lightning * 1.6);
    this.flashValue = this.rng.float(0.7, 1);
    this.onLightning?.();
  }

  dispose(): void {
    this.rainGeometry.dispose();
    this.rainMaterial.dispose();
    this.pointGeometry.dispose();
    this.pointMaterial.dispose();
    this.flakeTexture.dispose();
    this.object.clear();
    this.onLightning = null;
  }
}
