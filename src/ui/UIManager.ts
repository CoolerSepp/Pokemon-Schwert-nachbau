import { EventBus } from '@/core/EventBus';
import { Logger } from '@/core/Logger';
import type { GameAction, InputManager } from '@/engine/InputManager';

const log = Logger.scope('UI');

export interface ScreenContext {
  root: HTMLElement;
  ui: UIManager;
}

/**
 * Eine Oberflaechen-Ebene (Dialog, Menue, Kampf-HUD ...).
 *
 * Bildschirme bauen ihr DOM einmal auf und aktualisieren danach nur noch
 * Textknoten - dadurch bleibt die DOM-Last minimal (Anforderung 48).
 */
export interface Screen {
  readonly id: string;
  /** Blockiert dieser Bildschirm die Spielereingabe dahinter? */
  readonly modal: boolean;
  /** Laesst dieser Bildschirm den darunter liegenden sichtbar? */
  readonly transparent?: boolean;
  mount(ctx: ScreenContext): HTMLElement;
  unmount?(): void;
  update?(dt: number): void;
  /** Liefert true, wenn die Aktion verarbeitet wurde. */
  handleAction?(action: GameAction): boolean;
  onShow?(): void;
  onHide?(): void;
}

export interface UIEvents extends Record<string, unknown> {
  screenPushed: { id: string };
  screenPopped: { id: string };
  stackEmpty: Record<string, never>;
}

interface Toast {
  element: HTMLElement;
  remaining: number;
}

/**
 * Verwaltet den Stapel aus Oberflaechen-Ebenen.
 *
 * Nur die oberste Ebene bekommt Eingaben; Ebenen darunter bleiben sichtbar,
 * wenn sie als transparent markiert sind (z.B. HUD unter dem Menue).
 */
export class UIManager {
  readonly events = new EventBus<UIEvents>();
  private readonly stack: { screen: Screen; element: HTMLElement }[] = [];
  private readonly registered = new Map<string, Screen>();
  private readonly toasts: Toast[] = [];
  private readonly toastLayer: HTMLElement;
  private readonly screenLayer: HTMLElement;

  constructor(private readonly root: HTMLElement, private readonly input: InputManager) {
    this.screenLayer = document.createElement('div');
    this.screenLayer.className = 'ui-screens';
    this.root.appendChild(this.screenLayer);

    this.toastLayer = document.createElement('div');
    this.toastLayer.className = 'ui-toasts';
    this.root.appendChild(this.toastLayer);

    this.input.events.on('actionPressed', ({ action }) => this.routeAction(action));
  }

  register(screen: Screen): void {
    this.registered.set(screen.id, screen);
  }

  get(id: string): Screen | undefined {
    return this.registered.get(id);
  }

  get topScreen(): Screen | null {
    return this.stack[this.stack.length - 1]?.screen ?? null;
  }

  get depth(): number { return this.stack.length; }

  /** Blockiert die oberste Ebene die Spielsteuerung? */
  get blocksGameplay(): boolean {
    return this.stack.some((entry) => entry.screen.modal);
  }

  isOpen(id: string): boolean {
    return this.stack.some((e) => e.screen.id === id);
  }

  push(id: string): Screen | null {
    const screen = this.registered.get(id);
    if (!screen) {
      log.error(`Unbekannter Bildschirm "${id}"`);
      return null;
    }
    if (this.isOpen(id)) return screen;

    const element = screen.mount({ root: this.screenLayer, ui: this });
    element.classList.add('ui-screen');
    element.dataset.screen = id;
    this.screenLayer.appendChild(element);
    this.stack.push({ screen, element });
    this.refreshVisibility();
    screen.onShow?.();
    this.events.emit('screenPushed', { id });
    return screen;
  }

  pop(id?: string): void {
    if (this.stack.length === 0) return;
    const index = id
      ? this.stack.findIndex((e) => e.screen.id === id)
      : this.stack.length - 1;
    if (index < 0) return;
    const [entry] = this.stack.splice(index, 1);
    if (!entry) return;
    entry.screen.onHide?.();
    entry.screen.unmount?.();
    entry.element.remove();
    this.refreshVisibility();
    this.events.emit('screenPopped', { id: entry.screen.id });
    if (this.stack.length === 0) this.events.emit('stackEmpty', {});
  }

  popAll(): void {
    while (this.stack.length > 0) this.pop();
  }

  /** Ersetzt den obersten Bildschirm. */
  replace(id: string): Screen | null {
    this.pop();
    return this.push(id);
  }

  private refreshVisibility(): void {
    // Einblendungen ausweichen lassen, solange ein Menue offen ist.
    this.toastLayer.classList.toggle('modal-open', this.blocksGameplay);

    // Alles unterhalb der obersten undurchsichtigen Ebene ausblenden.
    let visibleFrom = 0;
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (!this.stack[i]!.screen.transparent) {
        visibleFrom = i;
        break;
      }
    }
    for (let i = 0; i < this.stack.length; i++) {
      this.stack[i]!.element.hidden = i < visibleFrom;
    }
  }

  private routeAction(action: GameAction): void {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const screen = this.stack[i]!.screen;
      if (screen.handleAction?.(action)) return;
      if (screen.modal) return;
    }
  }

  update(dt: number): void {
    for (const entry of this.stack) entry.screen.update?.(dt);
    this.updateToasts(dt);
  }

  /** Kurze Einblendung am oberen Bildschirmrand. */
  toast(text: string, kind: 'info' | 'warn' | 'success' = 'info', seconds = 3): void {
    const el = document.createElement('div');
    el.className = `ui-toast ui-toast-${kind}`;
    el.textContent = text;
    this.toastLayer.appendChild(el);
    // Neuzeichnen erzwingen, damit der Einblendeffekt greift.
    void el.offsetWidth;
    el.classList.add('visible');
    this.toasts.push({ element: el, remaining: seconds });
    while (this.toasts.length > 4) {
      const oldest = this.toasts.shift();
      oldest?.element.remove();
    }
  }

  private updateToasts(dt: number): void {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const toast = this.toasts[i]!;
      toast.remaining -= dt;
      if (toast.remaining <= 0.4) toast.element.classList.remove('visible');
      if (toast.remaining <= 0) {
        toast.element.remove();
        this.toasts.splice(i, 1);
      }
    }
  }

  dispose(): void {
    this.popAll();
    this.toasts.length = 0;
    this.toastLayer.remove();
    this.screenLayer.remove();
    this.events.clear();
  }
}

// ---------------------------------------------------------------------------
// DOM-Hilfsfunktionen - kleine Bausteine statt eines Frameworks.
// ---------------------------------------------------------------------------

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: {
    className?: string;
    text?: string;
    html?: string;
    attrs?: Record<string, string>;
    style?: Partial<CSSStyleDeclaration>;
    children?: (HTMLElement | null | undefined)[];
    onClick?: (e: MouseEvent) => void;
  } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.html !== undefined) node.innerHTML = options.html;
  if (options.attrs) {
    for (const [k, v] of Object.entries(options.attrs)) node.setAttribute(k, v);
  }
  if (options.style) Object.assign(node.style, options.style);
  for (const child of options.children ?? []) if (child) node.appendChild(child);
  if (options.onClick) node.addEventListener('click', options.onClick as EventListener);
  return node;
}

export function clearChildren(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}
