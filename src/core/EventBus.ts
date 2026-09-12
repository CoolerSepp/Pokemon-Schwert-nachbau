/**
 * Typisierter Event-Bus.
 *
 * Bewusst ohne globale Singleton-Instanz: jede `Game`-Instanz besitzt ihren
 * eigenen Bus, damit Tests isoliert laufen und keine Listener zwischen
 * Spielsitzungen ueberleben (Memory-Leak-Vermeidung, Anforderung 61).
 */

export type Unsubscribe = () => void;

type Handler<T> = (payload: T) => void;

interface Subscription {
  handler: Handler<never>;
  once: boolean;
  /** Kleinere Zahl = frueher aufgerufen. */
  order: number;
  /** Wird beim Abmelden waehrend eines Emits gesetzt. */
  dead: boolean;
}

export class EventBus<EventMap extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof EventMap, Subscription[]>();
  private emitDepth = 0;
  private needsCompact = false;

  on<K extends keyof EventMap>(
    event: K,
    handler: Handler<EventMap[K]>,
    order = 0,
  ): Unsubscribe {
    return this.add(event, handler, false, order);
  }

  once<K extends keyof EventMap>(
    event: K,
    handler: Handler<EventMap[K]>,
    order = 0,
  ): Unsubscribe {
    return this.add(event, handler, true, order);
  }

  /** Wartet asynchron auf das naechste Auftreten eines Events. */
  next<K extends keyof EventMap>(event: K): Promise<EventMap[K]> {
    return new Promise((resolve) => {
      this.once(event, resolve as Handler<EventMap[K]>);
    });
  }

  off<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): void {
    const subs = this.listeners.get(event);
    if (!subs) return;
    for (const sub of subs) {
      if (sub.handler === (handler as Handler<never>)) sub.dead = true;
    }
    this.compact(event);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const subs = this.listeners.get(event);
    if (!subs || subs.length === 0) return;

    this.emitDepth++;
    // Kopie: Handler duerfen sich waehrend des Emits an-/abmelden.
    const snapshot = subs.slice();
    for (const sub of snapshot) {
      if (sub.dead) continue;
      if (sub.once) {
        sub.dead = true;
        this.needsCompact = true;
      }
      (sub.handler as Handler<EventMap[K]>)(payload);
    }
    this.emitDepth--;
    if (this.emitDepth === 0 && this.needsCompact) {
      this.needsCompact = false;
      for (const key of this.listeners.keys()) this.compact(key);
    }
  }

  /** Anzahl aktiver Listener - primaer fuer Leak-Tests. */
  listenerCount(event?: keyof EventMap): number {
    if (event !== undefined) {
      return (this.listeners.get(event) ?? []).filter((s) => !s.dead).length;
    }
    let total = 0;
    for (const subs of this.listeners.values()) {
      total += subs.filter((s) => !s.dead).length;
    }
    return total;
  }

  clear(event?: keyof EventMap): void {
    if (event !== undefined) this.listeners.delete(event);
    else this.listeners.clear();
  }

  private add<K extends keyof EventMap>(
    event: K,
    handler: Handler<EventMap[K]>,
    once: boolean,
    order: number,
  ): Unsubscribe {
    let subs = this.listeners.get(event);
    if (!subs) {
      subs = [];
      this.listeners.set(event, subs);
    }
    const sub: Subscription = {
      handler: handler as Handler<never>,
      once,
      order,
      dead: false,
    };
    subs.push(sub);
    subs.sort((a, b) => a.order - b.order);
    return () => {
      sub.dead = true;
      this.needsCompact = true;
      if (this.emitDepth === 0) this.compact(event);
    };
  }

  private compact(event: keyof EventMap): void {
    if (this.emitDepth > 0) {
      this.needsCompact = true;
      return;
    }
    const subs = this.listeners.get(event);
    if (!subs) return;
    const alive = subs.filter((s) => !s.dead);
    if (alive.length === 0) this.listeners.delete(event);
    else if (alive.length !== subs.length) this.listeners.set(event, alive);
  }
}
