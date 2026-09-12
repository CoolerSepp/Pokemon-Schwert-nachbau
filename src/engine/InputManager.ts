import { GameConfig } from '@/core/Config';
import { EventBus } from '@/core/EventBus';
import { clamp } from '@/core/MathUtils';

export const GAME_ACTIONS = [
  'moveForward', 'moveBackward', 'moveLeft', 'moveRight',
  'sprint', 'jump', 'interact', 'cancel', 'menu', 'map',
  'cameraLeft', 'cameraRight', 'cameraUp', 'cameraDown',
  'zoomIn', 'zoomOut', 'quickSave', 'debug', 'nextItem', 'prevItem',
  'confirm', 'up', 'down', 'left', 'right',
] as const;
export type GameAction = (typeof GAME_ACTIONS)[number];

export type Bindings = Record<GameAction, string[]>;

export const DEFAULT_BINDINGS: Bindings = {
  moveForward: ['KeyW', 'ArrowUp'],
  moveBackward: ['KeyS', 'ArrowDown'],
  moveLeft: ['KeyA', 'ArrowLeft'],
  moveRight: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  jump: ['Space'],
  interact: ['KeyE', 'Enter'],
  cancel: ['Escape', 'KeyX', 'Backspace'],
  menu: ['KeyM', 'Tab'],
  map: ['KeyN'],
  cameraLeft: ['KeyQ'],
  cameraRight: ['KeyC'],
  cameraUp: ['PageUp'],
  cameraDown: ['PageDown'],
  zoomIn: ['Equal', 'NumpadAdd'],
  zoomOut: ['Minus', 'NumpadSubtract'],
  quickSave: ['F5'],
  debug: ['F1'],
  nextItem: ['BracketRight'],
  prevItem: ['BracketLeft'],
  confirm: ['Enter', 'KeyE', 'Space'],
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
};

/** Gamepad-Zuordnung (Standard-Layout). */
const PAD_BUTTONS: Partial<Record<GameAction, number[]>> = {
  interact: [0],
  confirm: [0],
  cancel: [1],
  menu: [9],
  map: [8],
  jump: [0],
  sprint: [2],
  zoomIn: [5],
  zoomOut: [4],
  up: [12], down: [13], left: [14], right: [15],
  moveForward: [12], moveBackward: [13], moveLeft: [14], moveRight: [15],
};

export interface InputEvents extends Record<string, unknown> {
  actionPressed: { action: GameAction };
  actionReleased: { action: GameAction };
  pointerLockChange: { locked: boolean };
}

interface AxisState { x: number; y: number; }

/**
 * Eingabeverwaltung fuer Tastatur, Maus und Gamepad.
 *
 * Zustandsbasiert (nicht ereignisgetrieben) fuer Bewegung, ereignisgetrieben
 * fuer Menues. Belegungen sind frei konfigurierbar (Anforderung 49).
 */
export class InputManager {
  readonly events = new EventBus<InputEvents>();
  private bindings: Bindings = structuredClone(DEFAULT_BINDINGS);
  private keyToActions = new Map<string, GameAction[]>();
  private readonly down = new Set<GameAction>();
  private readonly pressedThisFrame = new Set<GameAction>();
  private readonly releasedThisFrame = new Set<GameAction>();
  private readonly rawKeys = new Set<string>();

  private mouseDelta: AxisState = { x: 0, y: 0 };
  private wheelDelta = 0;
  private pointerLocked = false;
  private rightMouseDown = false;
  private padIndex: number | null = null;
  private padAxes: AxisState = { x: 0, y: 0 };
  private padCameraAxes: AxisState = { x: 0, y: 0 };
  private padButtonsDown = new Set<number>();
  private enabled = true;
  private listenersAttached = false;
  private detachers: (() => void)[] = [];

  constructor(private readonly target: HTMLElement = document.body) {
    this.rebuildLookup();
  }

  attach(): void {
    if (this.listenersAttached) return;
    this.listenersAttached = true;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.enabled) return;
      if (e.repeat) return;
      // Browser-Standardverhalten nur fuer belegte Tasten unterdruecken.
      const actions = this.keyToActions.get(e.code);
      if (actions) e.preventDefault();
      this.rawKeys.add(e.code);
      for (const action of actions ?? []) {
        if (!this.down.has(action)) {
          this.down.add(action);
          this.pressedThisFrame.add(action);
          this.events.emit('actionPressed', { action });
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.rawKeys.delete(e.code);
      for (const action of this.keyToActions.get(e.code) ?? []) {
        // Nur freigeben, wenn keine andere gebundene Taste noch gedrueckt ist.
        const stillDown = this.bindings[action].some((code) => this.rawKeys.has(code));
        if (!stillDown && this.down.delete(action)) {
          this.releasedThisFrame.add(action);
          this.events.emit('actionReleased', { action });
        }
      }
    };
    const onBlur = () => this.releaseAll();
    const onMouseMove = (e: MouseEvent) => {
      if (this.pointerLocked || this.rightMouseDown) {
        this.mouseDelta.x += e.movementX;
        this.mouseDelta.y += e.movementY;
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 2) this.rightMouseDown = true;
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) this.rightMouseDown = false;
    };
    const onWheel = (e: WheelEvent) => {
      this.wheelDelta += e.deltaY;
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onPointerLock = () => {
      this.pointerLocked = document.pointerLockElement === this.target;
      this.events.emit('pointerLockChange', { locked: this.pointerLocked });
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    this.target.addEventListener('wheel', onWheel, { passive: true });
    this.target.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('pointerlockchange', onPointerLock);

    this.detachers = [
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur),
      () => window.removeEventListener('mousemove', onMouseMove),
      () => window.removeEventListener('mousedown', onMouseDown),
      () => window.removeEventListener('mouseup', onMouseUp),
      () => this.target.removeEventListener('wheel', onWheel),
      () => this.target.removeEventListener('contextmenu', onContextMenu),
      () => document.removeEventListener('pointerlockchange', onPointerLock),
    ];
  }

  /** Loest alle Listener - verhindert Lecks bei Neustart (Anforderung 61). */
  detach(): void {
    for (const off of this.detachers) off();
    this.detachers = [];
    this.listenersAttached = false;
    this.releaseAll();
    this.events.clear();
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.releaseAll();
  }

  private releaseAll(): void {
    for (const action of this.down) {
      this.releasedThisFrame.add(action);
      this.events.emit('actionReleased', { action });
    }
    this.down.clear();
    this.rawKeys.clear();
    this.padButtonsDown.clear();
    this.mouseDelta = { x: 0, y: 0 };
  }

  setBindings(bindings: Partial<Bindings>): void {
    this.bindings = { ...this.bindings, ...bindings } as Bindings;
    this.rebuildLookup();
  }

  getBindings(): Bindings {
    return structuredClone(this.bindings);
  }

  resetBindings(): void {
    this.bindings = structuredClone(DEFAULT_BINDINGS);
    this.rebuildLookup();
  }

  private rebuildLookup(): void {
    this.keyToActions.clear();
    for (const action of GAME_ACTIONS) {
      for (const code of this.bindings[action] ?? []) {
        const list = this.keyToActions.get(code) ?? [];
        list.push(action);
        this.keyToActions.set(code, list);
      }
    }
  }

  /** Muss einmal pro Bild nach der Auswertung aufgerufen werden. */
  endFrame(): void {
    this.pressedThisFrame.clear();
    this.releasedThisFrame.clear();
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
    this.wheelDelta = 0;
  }

  /** Gamepad-Zustand einlesen (muss pro Bild aufgerufen werden). */
  pollGamepad(): void {
    if (typeof navigator.getGamepads !== 'function') return;
    const pads = navigator.getGamepads();
    let pad: Gamepad | null = null;
    for (const p of pads) {
      if (p && p.connected) { pad = p; break; }
    }
    if (!pad) {
      this.padIndex = null;
      this.padAxes = { x: 0, y: 0 };
      this.padCameraAxes = { x: 0, y: 0 };
      return;
    }
    this.padIndex = pad.index;

    const dead = (v: number) => (Math.abs(v) < 0.18 ? 0 : v);
    this.padAxes = { x: dead(pad.axes[0] ?? 0), y: dead(pad.axes[1] ?? 0) };
    this.padCameraAxes = { x: dead(pad.axes[2] ?? 0), y: dead(pad.axes[3] ?? 0) };

    for (const [action, buttons] of Object.entries(PAD_BUTTONS) as [GameAction, number[]][]) {
      const pressed = buttons.some((b) => pad!.buttons[b]?.pressed);
      const wasDown = this.padButtonsDown.has(buttons[0]!);
      if (pressed && !wasDown) {
        this.padButtonsDown.add(buttons[0]!);
        if (!this.down.has(action)) {
          this.down.add(action);
          this.pressedThisFrame.add(action);
          this.events.emit('actionPressed', { action });
        }
      } else if (!pressed && wasDown) {
        this.padButtonsDown.delete(buttons[0]!);
        const stillDown = this.bindings[action].some((code) => this.rawKeys.has(code));
        if (!stillDown && this.down.delete(action)) {
          this.releasedThisFrame.add(action);
          this.events.emit('actionReleased', { action });
        }
      }
    }
  }

  isDown(action: GameAction): boolean { return this.down.has(action); }
  wasPressed(action: GameAction): boolean { return this.pressedThisFrame.has(action); }
  wasReleased(action: GameAction): boolean { return this.releasedThisFrame.has(action); }

  /** Bewegungsachsen aus Tastatur oder linkem Stick, normalisiert. */
  getMoveAxis(): AxisState {
    let x = (this.isDown('moveRight') ? 1 : 0) - (this.isDown('moveLeft') ? 1 : 0);
    let y = (this.isDown('moveForward') ? 1 : 0) - (this.isDown('moveBackward') ? 1 : 0);
    if (x === 0 && y === 0 && this.padIndex !== null) {
      x = this.padAxes.x;
      y = -this.padAxes.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  /** Kameradrehung aus Maus, Tasten oder rechtem Stick (in Radiant). */
  getLookDelta(deltaSeconds: number, sensitivity = 1): AxisState {
    const mouseScale = GameConfig.camera.mouseSensitivity * sensitivity;
    let x = this.mouseDelta.x * mouseScale;
    let y = this.mouseDelta.y * mouseScale;

    const keyTurn = (this.isDown('cameraRight') ? 1 : 0) - (this.isDown('cameraLeft') ? 1 : 0);
    const keyPitch = (this.isDown('cameraDown') ? 1 : 0) - (this.isDown('cameraUp') ? 1 : 0);
    x += keyTurn * 2.2 * deltaSeconds * sensitivity;
    y += keyPitch * 1.6 * deltaSeconds * sensitivity;

    if (this.padIndex !== null) {
      x += this.padCameraAxes.x * GameConfig.camera.padSensitivity * deltaSeconds * sensitivity;
      y += this.padCameraAxes.y * GameConfig.camera.padSensitivity * deltaSeconds * sensitivity;
    }
    return { x, y };
  }

  /** Zoomaenderung aus Mausrad und Tasten. */
  getZoomDelta(deltaSeconds: number): number {
    let zoom = this.wheelDelta * GameConfig.camera.zoomSpeed;
    zoom += ((this.isDown('zoomOut') ? 1 : 0) - (this.isDown('zoomIn') ? 1 : 0))
      * 6 * deltaSeconds;
    return clamp(zoom, -3, 3);
  }

  get isPointerLocked(): boolean { return this.pointerLocked; }
  get hasGamepad(): boolean { return this.padIndex !== null; }

  requestPointerLock(): void {
    if (!this.pointerLocked) void this.target.requestPointerLock?.();
  }

  exitPointerLock(): void {
    if (this.pointerLocked) document.exitPointerLock?.();
  }
}
