import { GameConfig } from '@/core/Config';
import { Logger } from '@/core/Logger';
import type { SerializedPlayerState } from '@/player/PlayerState';

const log = Logger.scope('Save');

export interface SaveMeta {
  slot: string;
  savedAt: number;
  playerName: string;
  playtimeSeconds: number;
  badgeCount: number;
  partySize: number;
  caughtCount: number;
  areaName: string;
  storyStage: number;
  version: number;
}

export interface SaveData {
  meta: SaveMeta;
  state: SerializedPlayerState;
}

export interface SlotInfo {
  slot: string;
  meta: SaveMeta | null;
}

/**
 * Spielstandverwaltung.
 *
 * Bevorzugt IndexedDB (grosszuegiges Kontingent, asynchron); faellt auf
 * localStorage zurueck, wenn IndexedDB nicht verfuegbar ist. Beide Pfade sind
 * implementiert - ohne Speichern waere das Spiel nicht ernsthaft spielbar.
 */
export class SaveManager {
  private db: IDBDatabase | null = null;
  private useFallback = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = new Promise<void>((resolve) => {
      if (typeof indexedDB === 'undefined') {
        this.useFallback = true;
        log.warn('IndexedDB nicht verfuegbar - localStorage wird benutzt');
        resolve();
        return;
      }
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open(GameConfig.save.dbName, 1);
      } catch (err) {
        // Beim Oeffnen einer Datei ueber file:// verweigert der Browser
        // IndexedDB sofort - dann uebernimmt der localStorage-Pfad.
        this.useFallback = true;
        log.warn('IndexedDB gesperrt - localStorage wird benutzt', err);
        resolve();
        return;
      }
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(GameConfig.save.storeName)) {
          db.createObjectStore(GameConfig.save.storeName);
        }
      };
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      request.onerror = () => {
        this.useFallback = true;
        log.warn('IndexedDB konnte nicht geoeffnet werden - localStorage wird benutzt');
        resolve();
      };
      // Blockierte Datenbanken duerfen den Start nicht aufhalten.
      request.onblocked = () => {
        this.useFallback = true;
        resolve();
      };
    });
    return this.initPromise;
  }

  /** Alle Slots inklusive Autospeicherplatz. */
  slotIds(): string[] {
    const slots = Array.from(
      { length: GameConfig.save.slotCount }, (_, i) => `slot${i + 1}`,
    );
    return [GameConfig.save.autosaveSlot, ...slots];
  }

  async save(slot: string, data: SaveData): Promise<boolean> {
    await this.init();
    try {
      if (this.db && !this.useFallback) {
        await this.idbPut(slot, data);
      } else {
        localStorage.setItem(this.fallbackKey(slot), JSON.stringify(data));
      }
      log.info(`Spielstand "${slot}" gespeichert`);
      return true;
    } catch (err) {
      log.error(`Speichern in "${slot}" fehlgeschlagen`, err);
      return false;
    }
  }

  async load(slot: string): Promise<SaveData | null> {
    await this.init();
    try {
      const data = this.db && !this.useFallback
        ? await this.idbGet(slot)
        : this.fallbackGet(slot);
      if (!data) return null;
      if (data.meta.version > GameConfig.saveVersion) {
        log.warn(`Spielstand "${slot}" stammt aus einer neueren Version`);
        return null;
      }
      return data;
    } catch (err) {
      log.error(`Laden von "${slot}" fehlgeschlagen`, err);
      return null;
    }
  }

  async remove(slot: string): Promise<boolean> {
    await this.init();
    try {
      if (this.db && !this.useFallback) await this.idbDelete(slot);
      else localStorage.removeItem(this.fallbackKey(slot));
      return true;
    } catch (err) {
      log.error(`Loeschen von "${slot}" fehlgeschlagen`, err);
      return false;
    }
  }

  async listSlots(): Promise<SlotInfo[]> {
    await this.init();
    const out: SlotInfo[] = [];
    for (const slot of this.slotIds()) {
      const data = await this.load(slot);
      out.push({ slot, meta: data?.meta ?? null });
    }
    return out;
  }

  async hasAnySave(): Promise<boolean> {
    const slots = await this.listSlots();
    return slots.some((s) => s.meta !== null);
  }

  // ---------------------------------------------------------------- Intern

  private fallbackKey(slot: string): string {
    return `${GameConfig.save.dbName}:${slot}`;
  }

  private fallbackGet(slot: string): SaveData | null {
    try {
      const raw = localStorage.getItem(this.fallbackKey(slot));
      return raw ? (JSON.parse(raw) as SaveData) : null;
    } catch (err) {
      log.warn(`Spielstand "${slot}" konnte nicht gelesen werden`, err);
      return null;
    }
  }

  private idbPut(slot: string, data: SaveData): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(GameConfig.save.storeName, 'readwrite');
      tx.objectStore(GameConfig.save.storeName).put(data, slot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  private idbGet(slot: string): Promise<SaveData | null> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(GameConfig.save.storeName, 'readonly');
      const request = tx.objectStore(GameConfig.save.storeName).get(slot);
      request.onsuccess = () => resolve((request.result as SaveData | undefined) ?? null);
      request.onerror = () => reject(request.error);
    });
  }

  private idbDelete(slot: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(GameConfig.save.storeName, 'readwrite');
      tx.objectStore(GameConfig.save.storeName).delete(slot);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /** Lesbares Datum eines Spielstands. */
  static formatDate(timestamp: number): string {
    return new Date(timestamp).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
}
