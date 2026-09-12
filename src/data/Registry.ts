import { Logger } from '@/core/Logger';

const log = Logger.scope('Registry');

export interface RegistryEntry {
  id: string;
}

/**
 * Generische, unveraenderliche Inhalts-Registry.
 *
 * Wird einmalig beim Start aus JSON gefuellt. `get` wirft bewusst, weil ein
 * fehlender Inhalt ein Datenfehler ist, der frueh auffallen soll - stilles
 * Zurueckfallen auf Platzhalter wuerde defekte Inhalte verschleiern
 * (Anforderung 60).
 */
export class Registry<T extends RegistryEntry> {
  private readonly items = new Map<string, T>();

  constructor(readonly label: string) {}

  register(entry: T, source = '<inline>'): void {
    if (!entry || typeof entry.id !== 'string' || entry.id.length === 0) {
      throw new Error(`${this.label}: Eintrag ohne gueltige "id" aus ${source}`);
    }
    if (this.items.has(entry.id)) {
      log.warn(`${this.label}: doppelte ID "${entry.id}" (${source}) wird ueberschrieben`);
    }
    this.items.set(entry.id, entry);
  }

  registerAll(entries: readonly T[], source = '<inline>'): void {
    for (const e of entries) this.register(e, source);
  }

  get(id: string): T {
    const item = this.items.get(id);
    if (!item) {
      throw new Error(
        `${this.label}: unbekannte ID "${id}". Verfuegbar: ${this.ids().slice(0, 8).join(', ')}${this.size > 8 ? ', ...' : ''}`,
      );
    }
    return item;
  }

  tryGet(id: string): T | undefined {
    return this.items.get(id);
  }

  has(id: string): boolean {
    return this.items.has(id);
  }

  get size(): number {
    return this.items.size;
  }

  ids(): string[] {
    return [...this.items.keys()];
  }

  all(): T[] {
    return [...this.items.values()];
  }

  filter(predicate: (entry: T) => boolean): T[] {
    return this.all().filter(predicate);
  }

  clear(): void {
    this.items.clear();
  }
}
