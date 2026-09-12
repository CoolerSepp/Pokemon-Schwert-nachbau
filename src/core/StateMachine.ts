/**
 * Minimale, explizite State-Machine.
 *
 * Bewusst ohne Vererbung: States sind Daten-Objekte mit optionalen Hooks,
 * damit sie in Tests ohne Renderer instanziiert werden koennen.
 */
export interface StateDefinition<TContext, TName extends string> {
  name: TName;
  onEnter?(ctx: TContext, from: TName | null): void;
  onUpdate?(ctx: TContext, dt: number): void;
  onExit?(ctx: TContext, to: TName): void;
  /** Erlaubte Folgezustaende. `undefined` = alle erlaubt. */
  transitions?: readonly TName[];
}

export class StateMachine<TContext, TName extends string> {
  private readonly states = new Map<TName, StateDefinition<TContext, TName>>();
  private current: StateDefinition<TContext, TName> | null = null;
  private pending: TName | null = null;
  readonly history: TName[] = [];

  constructor(
    private readonly ctx: TContext,
    states: readonly StateDefinition<TContext, TName>[],
    private readonly onTransition?: (from: TName | null, to: TName) => void,
  ) {
    for (const s of states) this.states.set(s.name, s);
  }

  get currentName(): TName | null {
    return this.current?.name ?? null;
  }

  has(name: TName): boolean {
    return this.states.has(name);
  }

  canTransitionTo(name: TName): boolean {
    if (!this.states.has(name)) return false;
    if (!this.current) return true;
    const allowed = this.current.transitions;
    return allowed === undefined || allowed.includes(name);
  }

  /** Sofortiger Wechsel. Wirft, wenn der Uebergang nicht erlaubt ist. */
  transitionTo(name: TName): void {
    const next = this.states.get(name);
    if (!next) throw new Error(`StateMachine: unbekannter Zustand "${name}"`);
    if (this.current && !this.canTransitionTo(name)) {
      throw new Error(
        `StateMachine: Uebergang "${this.current.name}" -> "${name}" nicht erlaubt`,
      );
    }
    const from = this.current?.name ?? null;
    this.current?.onExit?.(this.ctx, name);
    this.current = next;
    this.history.push(name);
    if (this.history.length > 64) this.history.shift();
    this.onTransition?.(from, name);
    next.onEnter?.(this.ctx, from);
  }

  /** Wechsel erst zum naechsten `update` - verhindert Re-Entrancy. */
  queueTransition(name: TName): void {
    this.pending = name;
  }

  update(dt: number): void {
    if (this.pending !== null) {
      const next = this.pending;
      this.pending = null;
      this.transitionTo(next);
    }
    this.current?.onUpdate?.(this.ctx, dt);
  }
}
