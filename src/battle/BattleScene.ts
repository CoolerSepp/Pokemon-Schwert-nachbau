import * as THREE from 'three';
import type { Biome, ElementType, WeatherKind } from '@/data/schema';
import type { AssetManager } from '@/engine/AssetManager';
import type { Creature } from '@/creatures/Creature';
import { buildCreatureModel, disposeCreatureModel, type CreatureModel } from '@/creatures/CreatureModel';
import { CreatureAnimator, type AnimationState } from '@/animation/CreatureAnimator';
import { buildHumanoid, type HumanoidModel } from '@/player/PlayerModel';
import { HumanoidAnimator } from '@/player/HumanoidAnimator';
import {
  BIOME_PALETTES, BIOME_GROUND_TEXTURE, buildSky, buildBackdrop, backdropOuterRadius,
} from '@/world/TerrainMesh';
import { Effects } from '@/effects/Effects';
import { damp } from '@/core/MathUtils';
import { RNG } from '@/core/RNG';
import type { NpcAppearance } from '@/data/schema';

export type BattleSlot = 'player' | 'enemy';

interface SlotState {
  model: CreatureModel | null;
  animator: CreatureAnimator | null;
  creature: Creature | null;
  basePosition: THREE.Vector3;
  visible: boolean;
}

/**
 * Dreidimensionale Kampfbuehne.
 *
 * Eine eigene Szene, damit die Weltszene unberuehrt bleibt und der Wechsel
 * sofort erfolgt. Die Buehne uebernimmt Biom und Wetter des Fundorts, damit
 * der Kampf nicht wie ein zusammenhangloser Raum wirkt.
 */
/**
 * Grundwinkel der Kampfkamera.
 *
 * Bewusst so gewaehlt, dass die eigene Kreatur links im Vordergrund steht und
 * der Gegner rechts weiter hinten: dadurch ist ohne Beschriftung erkennbar,
 * welche Seite wem gehoert. Bei einer Seitenansicht auf gleicher Tiefe wirkt
 * die Zuordnung dagegen vertauscht.
 */
const BASE_VIEW_ANGLE = 0.30;

export class BattleScene {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly effects: Effects;

  private readonly slots: Record<BattleSlot, SlotState> = {
    player: {
      model: null, animator: null, creature: null,
      basePosition: new THREE.Vector3(-2.8, 0, 3.2), visible: false,
    },
    enemy: {
      model: null, animator: null, creature: null,
      basePosition: new THREE.Vector3(2.8, 0, -3.2), visible: false,
    },
  };

  private readonly sun: THREE.DirectionalLight;
  private readonly ambient: THREE.HemisphereLight;
  private readonly rim: THREE.DirectionalLight;
  private readonly platformPlayer: THREE.Mesh;
  private readonly platformEnemy: THREE.Mesh;
  private readonly ground: THREE.Mesh;
  private sky: THREE.Mesh | null = null;
  /** Bergkulisse hinter der Kampfbuehne (nur im Freien). */
  private backdrop: THREE.Group | null = null;
  private trainerModel: HumanoidModel | null = null;
  private trainerAnimator: HumanoidAnimator | null = null;
  private playerModel: HumanoidModel | null = null;
  private playerAnimator: HumanoidAnimator | null = null;
  private crowd: THREE.InstancedMesh | null = null;
  private crowdExcitement = 0;
  /** Raid-Verbuendete neben dem Spielerplatz. */
  private readonly allies: {
    creature: Creature;
    model: CreatureModel;
    animator: CreatureAnimator;
  }[] = [];

  private cameraAngle = 0;
  private cameraTargetAngle = 0;
  private cameraDistance = 11.5;
  private cameraTargetDistance = 11.5;
  private cameraHeight = 4.3;
  private cameraTargetHeight = 4.3;
  private readonly lookTarget = new THREE.Vector3(0, 1.2, 0);
  private readonly smoothLook = new THREE.Vector3(0, 1.2, 0);
  private shake = 0;
  private shakeDecay = 1;
  private readonly rng = new RNG('battle-scene');
  private time = 0;

  constructor(private readonly assets: AssetManager, particleBudget = 900) {
    this.scene.name = 'battle';
    // Die Fernebene muss hinter der Himmelskugel liegen. Lag sie davor,
    // wurde der Himmel oberhalb der Berge weggeschnitten und es blieb ein
    // schwarzes Loch im Bild.
    this.camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.15, 1600);

    this.ambient = new THREE.HemisphereLight(0xcfe4f2, 0x4a4030, 0.95);
    this.scene.add(this.ambient);

    this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    this.sun.position.set(6, 12, 8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -16;
    this.sun.shadow.camera.right = 16;
    this.sun.shadow.camera.top = 16;
    this.sun.shadow.camera.bottom = -16;
    this.sun.shadow.camera.far = 45;
    this.sun.shadow.bias = -0.0012;
    this.scene.add(this.sun);

    this.rim = new THREE.DirectionalLight(0x9fb4cc, 0.45);
    this.rim.position.set(-8, 5, -9);
    this.scene.add(this.rim);

    // Der Boden reicht bis an die Bergkulisse: sonst klafft zwischen
    // Buehnenrand und Horizont eine Luecke, durch die der Himmel scheint.
    const groundGeo = new THREE.CircleGeometry(190, 64);
    groundGeo.rotateX(-Math.PI / 2);
    this.ground = new THREE.Mesh(
      groundGeo,
      new THREE.MeshLambertMaterial({ color: 0x6faa4f, flatShading: true }),
    );
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.platformPlayer = this.makePlatform(this.slots.player.basePosition, 3.1);
    this.platformEnemy = this.makePlatform(this.slots.enemy.basePosition, 2.7);
    this.scene.add(this.platformPlayer, this.platformEnemy);

    this.scene.fog = new THREE.Fog(0xcfe4f2, 22, 76);
    this.effects = new Effects(this.scene, particleBudget);
  }

  private makePlatform(position: THREE.Vector3, radius: number): THREE.Mesh {
    const geo = new THREE.CylinderGeometry(radius, radius * 1.14, 0.42, 26);
    const mesh = new THREE.Mesh(
      geo, new THREE.MeshLambertMaterial({ color: 0x7fbf5f, flatShading: true }),
    );
    mesh.position.copy(position);
    mesh.position.y = -0.14;
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    return mesh;
  }

  /** Passt Buehne und Licht an Fundort, Wetter und Tageszeit an. */
  configure(options: {
    biome: Biome; weather: WeatherKind; indoor: boolean;
    sunColor: THREE.Color; ambientColor: THREE.Color; fogColor: THREE.Color;
    sunIntensity: number; ambientIntensity: number;
    stadium?: { primary: string; secondary: string };
  }): void {
    const palette = BIOME_PALETTES[options.biome];
    (this.ground.material as THREE.MeshLambertMaterial).color.set(palette.ground);
    (this.platformPlayer.material as THREE.MeshLambertMaterial).color.set(palette.groundAlt);
    (this.platformEnemy.material as THREE.MeshLambertMaterial).color.set(palette.groundAlt);

    if (options.stadium) {
      (this.ground.material as THREE.MeshLambertMaterial).color.set(options.stadium.primary);
      (this.platformPlayer.material as THREE.MeshLambertMaterial).color.set(options.stadium.secondary);
      (this.platformEnemy.material as THREE.MeshLambertMaterial).color.set(options.stadium.secondary);
    }

    this.sun.color.copy(options.sunColor);
    this.sun.intensity = Math.max(0.5, options.sunIntensity);
    this.ambient.color.copy(options.ambientColor);
    this.ambient.groundColor.set(palette.ground);
    this.ambient.intensity = Math.max(0.55, options.ambientIntensity);
    (this.scene.fog as THREE.Fog).color.copy(options.fogColor);
    (this.scene.fog as THREE.Fog).near = options.indoor ? 14 : 70;
    // Draussen reicht der Nebel bis hinter die Kulisse - sonst waere der
    // Horizont eine leere Flaeche statt einer Landschaft.
    (this.scene.fog as THREE.Fog).far = options.indoor ? 52 : 560;

    // Boden bekommt die Bodentextur des Bioms; eine einfarbige Scheibe
    // wirkt wie ein Platzhalter.
    const groundMaterial = this.ground.material as THREE.MeshLambertMaterial;
    groundMaterial.map = options.indoor
      ? null
      : this.assets.textures.get(BIOME_GROUND_TEXTURE[options.biome], palette.ground);
    if (groundMaterial.map) {
      groundMaterial.map = groundMaterial.map.clone();
      groundMaterial.map.needsUpdate = true;
      groundMaterial.map.repeat.set(30, 30);
      groundMaterial.color.set('#ffffff');
    }
    groundMaterial.needsUpdate = true;

    this.clearScenery();
    if (!options.indoor) {
      // Weit genug weg, damit die Berge als Ferne gelesen werden und nicht
      // als Wand direkt hinter der Buehne.
      // Der Innenradius liegt hinter der Bodenscheibe (Radius 190), sonst
      // wuechsen die Huegel mitten aus der Kampfflaeche heraus.
      const inner = 175;
      this.sky = buildSky(
        palette.skyTop, palette.skyBottom,
        backdropOuterRadius(inner) + 180,
      );
      this.scene.add(this.sky);
      this.backdrop = buildBackdrop(palette, inner, 7331, 0.85);
      this.backdrop.position.y = -1.5;
      this.scene.add(this.backdrop);
    }
  }

  /** Entfernt Himmel und Kulisse der vorigen Kampfumgebung. */
  private clearScenery(): void {
    if (this.sky) {
      this.scene.remove(this.sky);
      (this.sky.material as THREE.Material).dispose();
      this.sky.geometry.dispose();
      this.sky = null;
    }
    if (this.backdrop) {
      this.scene.remove(this.backdrop);
      this.backdrop.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      });
      this.backdrop = null;
    }
  }

  /** Setzt eine Kreatur auf einen Platz. `sizeFactor` vergroessert Raid-Bosse. */
  setCreature(slot: BattleSlot, creature: Creature | null, sizeFactor = 1): void {
    const state = this.slots[slot];
    if (state.model) {
      this.scene.remove(state.model.root);
      state.model = null;
      state.animator = null;
    }
    state.creature = creature;
    if (!creature) {
      state.visible = false;
      return;
    }

    const model = buildCreatureModel(creature.species.model, this.assets, {
      scale: creature.modelScale * sizeFactor,
      variantTint: creature.isVariant ? 0.42 : undefined,
      castShadow: true,
    });
    model.root.position.copy(state.basePosition);
    // Kreaturen schauen einander an.
    model.root.rotation.y = slot === 'player' ? Math.PI * 0.72 : Math.PI * 1.72;
    this.scene.add(model.root);
    state.model = model;
    state.animator = new CreatureAnimator(model);
    state.animator.snapToRest();
    state.animator.play('idle');
    state.visible = true;
  }

  /** Setzt den gegnerischen Trainer (falls vorhanden) und den Spieler. */
  setTrainers(enemyAppearance: NpcAppearance | null, playerAppearance: NpcAppearance): void {
    if (this.trainerModel) {
      this.scene.remove(this.trainerModel.root);
      this.trainerModel = null;
      this.trainerAnimator = null;
    }
    if (enemyAppearance) {
      this.trainerModel = buildHumanoid(this.assets, enemyAppearance);
      this.trainerModel.root.position.set(6.2, 0, -6.8);
      this.trainerModel.root.rotation.y = Math.PI * 1.25;
      this.scene.add(this.trainerModel.root);
      this.trainerAnimator = new HumanoidAnimator(this.trainerModel);
      this.trainerAnimator.play('idle');
    }
    if (!this.playerModel) {
      this.playerModel = buildHumanoid(this.assets, playerAppearance);
      this.playerModel.root.position.set(-6.8, 0, 6.6);
      this.playerModel.root.rotation.y = Math.PI * 0.25;
      this.scene.add(this.playerModel.root);
      this.playerAnimator = new HumanoidAnimator(this.playerModel);
      this.playerAnimator.play('idle');
    }
  }

  /**
   * Stellt die Raid-Verbuendeten neben dem Spielerplatz auf.
   *
   * Sie kaempfen in der Engine tatsaechlich mit; hier bekommen sie ein
   * sichtbares Modell, das bei einem K.o. verschwindet.
   */
  setAllies(allies: readonly { creature: Creature }[]): void {
    this.clearAllies();
    // Hinter und links neben der eigenen Kreatur: dort sind sie sichtbar,
    // verdecken aber weder die Textbox noch den Gegner.
    const spots: [number, number][] = [[-5.4, 0.2], [-7.4, 2.6], [-4.0, -2.2]];
    allies.slice(0, spots.length).forEach((ally, index) => {
      const [x, z] = spots[index]!;
      const model = buildCreatureModel(ally.creature.species.model, this.assets, {
        scale: ally.creature.modelScale * 0.7,
        castShadow: true,
      });
      model.root.position.set(x, 0, z);
      model.root.rotation.y = Math.PI * 0.78;
      this.scene.add(model.root);
      const animator = new CreatureAnimator(model);
      animator.snapToRest();
      animator.play('idle');
      this.allies.push({ creature: ally.creature, model, animator });
    });
  }

  /** Blendet besiegte Verbuendete aus. */
  refreshAllies(): void {
    for (const ally of this.allies) {
      ally.model.root.visible = !ally.creature.isFainted;
    }
  }

  private clearAllies(): void {
    for (const ally of this.allies) {
      this.scene.remove(ally.model.root);
      disposeCreatureModel(ally.model);
    }
    this.allies.length = 0;
  }

  /** Fuegt Publikumsraenge hinzu (Arena- und Ligakaempfe). */
  addCrowd(color: string): void {
    if (this.crowd) return;

    // Tribuenenringe, damit die Zuschauer nicht in der Luft stehen.
    for (let ring = 0; ring < 4; ring++) {
      const radius = 19 + ring * 2.1;
      const height = 0.9 + ring * 1.25;
      const geometry = new THREE.CylinderGeometry(radius + 1.05, radius + 1.05, height, 40, 1, true);
      const stand = new THREE.Mesh(
        geometry,
        this.assets.getMaterial({
          color: ring % 2 === 0 ? '#6b7280' : '#5b626d',
          flatShading: true, doubleSided: true,
        }),
      );
      stand.position.y = height / 2;
      stand.receiveShadow = true;
      stand.name = 'stand';
      this.scene.add(stand);
    }

    const count = 220;
    const geometry = this.assets.getShape('capsule', 1);
    const material = this.assets.getMaterial({ color, flatShading: true });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const dummy = new THREE.Object3D();
    const tint = new THREE.Color();
    const base = new THREE.Color(color);

    for (let i = 0; i < count; i++) {
      const ring = Math.floor(i / 55);
      const angle = ((i % 55) / 55) * Math.PI * 2;
      const radius = 19 + ring * 2.1;
      // Auf der Oberkante des jeweiligen Rangs sitzen.
      dummy.position.set(
        Math.cos(angle) * radius,
        0.9 + ring * 1.25 + 0.42,
        Math.sin(angle) * radius,
      );
      dummy.scale.set(0.26, 0.36, 0.26);
      dummy.rotation.y = -angle;
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // Zuschauer sind bunt gemischt, nicht einfarbig wie Buesche.
      tint.setHSL(
        this.rng.next(),
        this.rng.float(0.35, 0.75),
        this.rng.float(0.42, 0.68),
      );
      if (this.rng.chance(0.22)) tint.set(base);
      mesh.setColorAt(i, tint);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.name = 'crowd';
    this.scene.add(mesh);
    this.crowd = mesh;
  }

  /** Publikumsreaktion - die Raenge bewegen sich sichtbar staerker. */
  cheer(intensity: number): void {
    this.crowdExcitement = Math.min(1, this.crowdExcitement + intensity);
  }

  getSlot(slot: BattleSlot): SlotState { return this.slots[slot]; }

  /** Weltposition einer Kreatur - Ankerpunkt fuer Effekte. */
  positionOf(slot: BattleSlot, heightFactor = 0.6): THREE.Vector3 {
    const state = this.slots[slot];
    const height = state.model?.height ?? 1.2;
    return new THREE.Vector3(
      state.basePosition.x,
      state.basePosition.y + height * heightFactor,
      state.basePosition.z,
    );
  }

  playAnimation(slot: BattleSlot, state: AnimationState, speed = 1, onDone?: () => void): void {
    this.slots[slot].animator?.play(state, speed, onDone);
  }

  /** Laesst eine Kreatur zum Gegner vorstossen und zurueckkehren. */
  lunge(slot: BattleSlot): void {
    this.playAnimation(slot, 'attack');
  }

  setCameraFocus(mode: 'wide' | 'player' | 'enemy' | 'closeup' | 'gigantic'): void {
    switch (mode) {
      case 'wide':
        this.cameraTargetAngle = 0;
        this.cameraTargetDistance = 11;
        this.cameraTargetHeight = 4.6;
        break;
      case 'player':
        this.cameraTargetAngle = -0.5;
        this.cameraTargetDistance = 8;
        this.cameraTargetHeight = 3.4;
        break;
      case 'enemy':
        this.cameraTargetAngle = 0.5;
        this.cameraTargetDistance = 8;
        this.cameraTargetHeight = 3.4;
        break;
      case 'closeup':
        this.cameraTargetDistance = 6.4;
        this.cameraTargetHeight = 2.8;
        break;
      case 'gigantic':
        this.cameraTargetAngle = 0.2;
        this.cameraTargetDistance = 18;
        this.cameraTargetHeight = 8.5;
        break;
    }
  }

  shakeCamera(intensity: number, seconds: number): void {
    this.shake = Math.max(this.shake, intensity);
    this.shakeDecay = seconds;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.time += dt;
    for (const slot of ['player', 'enemy'] as BattleSlot[]) {
      this.slots[slot].animator?.update(dt);
    }
    for (const ally of this.allies) ally.animator.update(dt);
    this.trainerAnimator?.update(dt);
    this.playerAnimator?.update(dt);
    this.effects.update(dt);

    // Kamera langsam umkreisen, damit die Szene lebendig wirkt.
    this.cameraAngle = damp(this.cameraAngle, this.cameraTargetAngle, 0.25, dt);
    this.cameraDistance = damp(this.cameraDistance, this.cameraTargetDistance, 0.25, dt);
    this.cameraHeight = damp(this.cameraHeight, this.cameraTargetHeight, 0.25, dt);
    const drift = Math.sin(this.time * 0.18) * 0.05;
    const angle = this.cameraAngle + drift + BASE_VIEW_ANGLE;

    this.camera.position.set(
      Math.sin(angle) * this.cameraDistance,
      this.cameraHeight,
      Math.cos(angle) * this.cameraDistance,
    );

    // Blickpunkt bewusst ueber Kopfhoehe: dadurch liegt der Horizont tiefer
    // im Bild und der Himmel bleibt sichtbar.
    this.lookTarget.set(0, 2.5, 0);
    this.smoothLook.x = damp(this.smoothLook.x, this.lookTarget.x, 0.16, dt);
    this.smoothLook.y = damp(this.smoothLook.y, this.lookTarget.y, 0.16, dt);
    this.smoothLook.z = damp(this.smoothLook.z, this.lookTarget.z, 0.16, dt);
    this.camera.lookAt(this.smoothLook);

    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt / Math.max(0.05, this.shakeDecay));
      const a = this.shake * this.shake;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }

    if (this.crowd && this.crowdExcitement > 0) {
      this.crowdExcitement = Math.max(0, this.crowdExcitement - dt * 0.5);
      this.animateCrowd();
    }
    if (this.sky) this.sky.rotation.y += dt * 0.004;
  }

  /** Laesst die Raenge im Takt der Aufregung auf und ab huepfen. */
  private animateCrowd(): void {
    if (!this.crowd) return;
    const dummy = new THREE.Object3D();
    const matrix = new THREE.Matrix4();
    const count = this.crowd.count;
    for (let i = 0; i < count; i++) {
      this.crowd.getMatrixAt(i, matrix);
      dummy.position.setFromMatrixPosition(matrix);
      const ring = Math.floor(i / 55);
      const baseY = 0.9 + ring * 1.25 + 0.42;
      const hop = Math.abs(Math.sin(this.time * 7 + i * 0.7)) * this.crowdExcitement * 0.4;
      dummy.position.y = baseY + hop;
      dummy.scale.set(0.26, 0.36, 0.26);
      dummy.rotation.y = -((i % 55) / 55) * Math.PI * 2;
      dummy.updateMatrix();
      this.crowd.setMatrixAt(i, dummy.matrix);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
  }

  /** Effekt an der Position eines Platzes. */
  effectAt(slot: BattleSlot, type: ElementType, scale = 1): void {
    this.effects.byType(type, this.positionOf(slot), scale);
  }

  reset(): void {
    this.setCreature('player', null);
    this.setCreature('enemy', null);
    this.clearAllies();
    this.effects.clear();
    this.crowdExcitement = 0;
    this.setCameraFocus('wide');
  }

  dispose(): void {
    this.reset();
    this.effects.dispose();
    this.clearScenery();
    this.ground.geometry.dispose();
    (this.ground.material as THREE.Material).dispose();
    this.platformPlayer.geometry.dispose();
    this.platformEnemy.geometry.dispose();
    this.scene.clear();
  }
}
