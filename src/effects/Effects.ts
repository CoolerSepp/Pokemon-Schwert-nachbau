import * as THREE from 'three';
import type { ElementType } from '@/data/schema';
import { TYPE_COLORS } from '@/ui/uiHelpers';
import { ParticleSystem } from './ParticleSystem';

export interface FlashOptions {
  color: string;
  intensity: number;
  seconds: number;
}

/** Zeitlich begrenzte Lichtquelle fuer Effekte. */
interface TempLight {
  light: THREE.PointLight;
  remaining: number;
  total: number;
  intensity: number;
}

/** Kurzlebiges Mesh (Ringe, Wellen). */
interface TempMesh {
  mesh: THREE.Mesh;
  remaining: number;
  total: number;
  grow: number;
  fade: boolean;
}

/**
 * Zentrale Effekt-Schnittstelle (Anforderung 54).
 *
 * Alle Effekte laufen ueber ein gemeinsames Partikelsystem und wenige
 * wiederverwendete Meshes - dadurch bleiben Draw Calls und Allokationen gering.
 */
export class Effects {
  readonly particles: ParticleSystem;
  private readonly group = new THREE.Group();
  private readonly lights: TempLight[] = [];
  private readonly meshes: TempMesh[] = [];
  private readonly ringGeometry: THREE.RingGeometry;
  private readonly sphereGeometry: THREE.SphereGeometry;
  private screenFlash: ((color: string, seconds: number) => void) | null = null;

  constructor(scene: THREE.Scene, particleBudget = 900) {
    this.particles = new ParticleSystem(particleBudget);
    this.group.name = 'effects';
    this.group.add(this.particles.object);
    scene.add(this.group);
    this.ringGeometry = new THREE.RingGeometry(0.7, 1, 28);
    this.sphereGeometry = new THREE.SphereGeometry(1, 16, 12);
  }

  /** Callback fuer den Bildschirm-Blitz (von der Oberflaeche gesetzt). */
  setScreenFlashHandler(handler: (color: string, seconds: number) => void): void {
    this.screenFlash = handler;
  }

  // ------------------------------------------------------------- Basiseffekte

  flash(color = '#ffffff', seconds = 0.22): void {
    this.screenFlash?.(color, seconds);
  }

  light(position: THREE.Vector3, color: string, intensity: number, seconds: number): void {
    const light = new THREE.PointLight(new THREE.Color(color), intensity, 24, 1.7);
    light.position.copy(position);
    this.group.add(light);
    this.lights.push({ light, remaining: seconds, total: seconds, intensity });
  }

  /** Expandierender Ring am Boden - Aufschlag, Schockwelle. */
  shockwave(position: THREE.Vector3, color: string, size = 3, seconds = 0.55): void {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.ringGeometry, material);
    mesh.position.copy(position);
    mesh.position.y += 0.08;
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.setScalar(0.4);
    this.group.add(mesh);
    this.meshes.push({ mesh, remaining: seconds, total: seconds, grow: size, fade: true });
  }

  /** Kugelfoermige Aura um eine Position. */
  aura(position: THREE.Vector3, color: string, size = 1.6, seconds = 0.8): void {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color), transparent: true, opacity: 0.42,
      depthWrite: false, side: THREE.BackSide,
    });
    const mesh = new THREE.Mesh(this.sphereGeometry, material);
    mesh.position.copy(position);
    mesh.scale.setScalar(size * 0.4);
    this.group.add(mesh);
    this.meshes.push({ mesh, remaining: seconds, total: seconds, grow: size, fade: true });
  }

  // --------------------------------------------------------- Typische Effekte

  explosion(position: THREE.Vector3, color = '#ff8f3b', scale = 1): void {
    this.particles.burst({
      position, count: Math.round(60 * scale), color, color2: '#ffe08a',
      size: 0.32 * scale, speed: 7 * scale, spread: 1, lifetime: 0.7, gravity: 5,
    });
    this.shockwave(position, color, 4 * scale, 0.5);
    this.light(position, color, 5 * scale, 0.4);
    this.flash(color, 0.14);
  }

  fire(position: THREE.Vector3, scale = 1): void {
    this.particles.burst({
      position, count: Math.round(44 * scale), color: '#ff6b2b', color2: '#ffd84b',
      size: 0.3 * scale, speed: 3.4 * scale, spread: 0.8,
      lifetime: 0.66, gravity: -2.4, upward: 2.2,
    });
    this.light(position, '#ff8f3b', 4 * scale, 0.42);
  }

  water(position: THREE.Vector3, scale = 1): void {
    this.particles.burst({
      position, count: Math.round(50 * scale), color: '#4fa8e0', color2: '#c4f0ff',
      size: 0.26 * scale, speed: 4.6 * scale, spread: 0.9,
      lifetime: 0.72, gravity: 9, upward: 2.6,
    });
    this.shockwave(position, '#7fd8ff', 2.6 * scale, 0.42);
  }

  lightning(position: THREE.Vector3, scale = 1): void {
    this.particles.burst({
      position, count: Math.round(38 * scale), color: '#ffe84b', color2: '#ffffff',
      size: 0.24 * scale, speed: 9 * scale, spread: 1, lifetime: 0.32, gravity: 0,
    });
    this.light(position, '#fff08a', 8 * scale, 0.2);
    this.flash('#ffffcc', 0.1);
  }

  grass(position: THREE.Vector3, scale = 1): void {
    this.particles.burst({
      position, count: Math.round(42 * scale), color: '#7fc44b', color2: '#d8e88f',
      size: 0.26 * scale, speed: 3.8 * scale, spread: 0.95,
      lifetime: 0.8, gravity: 3.2, upward: 1.4, spiral: true,
    });
  }

  ice(position: THREE.Vector3, scale = 1): void {
    this.particles.burst({
      position, count: Math.round(46 * scale), color: '#a0e8ff', color2: '#ffffff',
      size: 0.22 * scale, speed: 4.2 * scale, spread: 1, lifetime: 0.9, gravity: 2.4,
    });
    this.light(position, '#bfeaff', 3 * scale, 0.35);
  }

  heal(position: THREE.Vector3, scale = 1): void {
    this.particles.burst({
      position, count: Math.round(34 * scale), color: '#7fe0a8', color2: '#ffffff',
      size: 0.2 * scale, speed: 1.1 * scale, spread: 0.6,
      lifetime: 1.1, gravity: -2.2, upward: 1.8, ring: true,
    });
    this.light(position, '#7fe0a8', 2.6 * scale, 0.7);
  }

  capture(position: THREE.Vector3): void {
    this.particles.burst({
      position, count: 40, color: '#ffffff', color2: '#ffd84b',
      size: 0.24, speed: 2.4, spread: 0.8, lifetime: 0.55, gravity: 0, ring: true,
    });
    this.light(position, '#ffe08a', 4, 0.4);
  }

  captureSuccess(position: THREE.Vector3): void {
    this.particles.burst({
      position, count: 70, color: '#ffe84b', color2: '#ffffff',
      size: 0.3, speed: 5, spread: 1, lifetime: 1.2, gravity: 2, upward: 3,
    });
    this.flash('#ffffff', 0.2);
    this.light(position, '#ffe84b', 6, 0.8);
  }

  evolution(position: THREE.Vector3): void {
    this.particles.burst({
      position, count: 90, color: '#ffffff', color2: '#c4a8ff',
      size: 0.26, speed: 2.6, spread: 0.5,
      lifetime: 1.5, gravity: -1.6, upward: 3.2, spiral: true,
    });
    this.aura(position, '#e0d8ff', 3.2, 1.4);
    this.light(position, '#ffffff', 7, 1.4);
    this.flash('#ffffff', 0.6);
  }

  gigantic(position: THREE.Vector3): void {
    this.particles.burst({
      position, count: 110, color: '#ff5b9b', color2: '#c48fff',
      size: 0.4, speed: 7.5, spread: 1, lifetime: 1.3, gravity: -2, upward: 2,
    });
    this.shockwave(position, '#ff5b9b', 9, 1.0);
    this.aura(position, '#ff8fd8', 6, 1.2);
    this.light(position, '#ff5b9b', 9, 1.2);
    this.flash('#ffd8f0', 0.4);
  }

  /** Effekt passend zum Attackentyp - Standardfall fuer alle Attacken. */
  byType(type: ElementType, position: THREE.Vector3, scale = 1): void {
    switch (type) {
      case 'fire': this.fire(position, scale); break;
      case 'water': this.water(position, scale); break;
      case 'electric': this.lightning(position, scale); break;
      case 'grass': this.grass(position, scale); break;
      case 'ice': this.ice(position, scale); break;
      default: {
        const color = TYPE_COLORS[type];
        this.particles.burst({
          position, count: Math.round(36 * scale), color, color2: '#ffffff',
          size: 0.26 * scale, speed: 4.4 * scale, spread: 1,
          lifetime: 0.6, gravity: 3.4,
        });
        this.light(position, color, 3.4 * scale, 0.3);
      }
    }
  }

  /** Staubwolke beim Auftreffen eines physischen Angriffs. */
  impact(position: THREE.Vector3, scale = 1): void {
    this.particles.burst({
      position, count: Math.round(22 * scale), color: '#e0d8c4', color2: '#b8ac94',
      size: 0.22 * scale, speed: 3.2 * scale, spread: 0.9,
      lifetime: 0.42, gravity: 6, upward: 0.8,
    });
  }

  update(dt: number): void {
    this.particles.update(dt);

    for (let i = this.lights.length - 1; i >= 0; i--) {
      const entry = this.lights[i]!;
      entry.remaining -= dt;
      if (entry.remaining <= 0) {
        this.group.remove(entry.light);
        entry.light.dispose();
        this.lights.splice(i, 1);
        continue;
      }
      entry.light.intensity = entry.intensity * (entry.remaining / entry.total);
    }

    for (let i = this.meshes.length - 1; i >= 0; i--) {
      const entry = this.meshes[i]!;
      entry.remaining -= dt;
      if (entry.remaining <= 0) {
        this.group.remove(entry.mesh);
        (entry.mesh.material as THREE.Material).dispose();
        this.meshes.splice(i, 1);
        continue;
      }
      const t = 1 - entry.remaining / entry.total;
      entry.mesh.scale.setScalar(0.4 + entry.grow * t);
      if (entry.fade) {
        (entry.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;
      }
    }
  }

  clear(): void {
    this.particles.clear();
    for (const entry of this.lights) {
      this.group.remove(entry.light);
      entry.light.dispose();
    }
    this.lights.length = 0;
    for (const entry of this.meshes) {
      this.group.remove(entry.mesh);
      (entry.mesh.material as THREE.Material).dispose();
    }
    this.meshes.length = 0;
  }

  dispose(): void {
    this.clear();
    this.particles.dispose();
    this.ringGeometry.dispose();
    this.sphereGeometry.dispose();
    this.group.removeFromParent();
  }
}
