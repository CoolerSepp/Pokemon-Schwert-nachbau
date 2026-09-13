import { Registry } from './Registry';
import { Logger } from '@/core/Logger';
import type {
  AbilityData, AreaData, CutsceneData, DialogueTreeData, ElementType, GymData,
  ItemData, LeagueData, MoveData, NatureData, QuestData, RaidData, ShopData, SpeciesData,
  StoryStageData, TrainerData, TypeChartData,
} from './schema';
import { ELEMENT_TYPES } from './schema';

const log = Logger.scope('GameData');

/**
 * Zentrale Inhalts-Registry.
 *
 * Alle JSON-Dateien unter /data werden zur Build-Zeit eingesammelt und dem
 * Verzeichnis entsprechend einer Registry zugeordnet. Eine neue Kreatur/
 * Attacke/Quest benoetigt damit ausschliesslich eine neue Datei im passenden
 * Ordner - kein Eingriff in Systemcode (Anforderung 51).
 */
class GameDataRegistry {
  readonly species = new Registry<SpeciesData>('Kreatur');
  readonly moves = new Registry<MoveData>('Attacke');
  readonly abilities = new Registry<AbilityData>('Faehigkeit');
  readonly items = new Registry<ItemData>('Gegenstand');
  readonly trainers = new Registry<TrainerData>('Trainer');
  readonly areas = new Registry<AreaData>('Gebiet');
  readonly dialogues = new Registry<DialogueTreeData>('Dialog');
  readonly quests = new Registry<QuestData>('Quest');
  readonly shops = new Registry<ShopData>('Laden');
  readonly gyms = new Registry<GymData>('Arena');
  readonly raids = new Registry<RaidData>('Raid');
  readonly leagues = new Registry<LeagueData>('Liga');
  readonly cutscenes = new Registry<CutsceneData>('Cutscene');
  readonly storyStages = new Registry<StoryStageData & { id: string }>('Story-Stufe');
  readonly natures = new Registry<NatureData>('Natur');

  private typeChart: Record<string, Record<string, number>> = {};
  private loaded = false;
  /** Nach Dex-Nummer sortierte Artenliste - fuer den Kreaturen-Index. */
  private dexOrder: SpeciesData[] = [];

  get isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Laedt alle Inhalte. Idempotent.
   * `modules` erlaubt es Tests, einen eigenen Satz einzuspeisen.
   */
  load(modules?: Record<string, unknown>): void {
    if (this.loaded) return;
    const files =
      modules ??
      (import.meta.glob('/data/**/*.json', { eager: true, import: 'default' }) as Record<
        string,
        unknown
      >);

    const routes: { dir: string; sink: (value: unknown, path: string) => void }[] = [
      { dir: 'creatures', sink: (v, p) => this.ingest(this.species, v, p) },
      { dir: 'moves', sink: (v, p) => this.ingest(this.moves, v, p) },
      { dir: 'abilities', sink: (v, p) => this.ingest(this.abilities, v, p) },
      { dir: 'items', sink: (v, p) => this.ingest(this.items, v, p) },
      { dir: 'trainers', sink: (v, p) => this.ingest(this.trainers, v, p) },
      { dir: 'regions', sink: (v, p) => this.ingest(this.areas, v, p) },
      { dir: 'routes', sink: (v, p) => this.ingest(this.areas, v, p) },
      { dir: 'gyms', sink: (v, p) => this.ingest(this.gyms, v, p) },
      { dir: 'dialogue', sink: (v, p) => this.ingest(this.dialogues, v, p) },
      { dir: 'quests', sink: (v, p) => this.ingest(this.quests, v, p) },
      { dir: 'shops', sink: (v, p) => this.ingest(this.shops, v, p) },
      { dir: 'raids', sink: (v, p) => this.ingest(this.raids, v, p) },
      { dir: 'league', sink: (v, p) => this.ingest(this.leagues, v, p) },
      { dir: 'story', sink: (v, p) => this.ingestStory(v, p) },
      { dir: 'natures', sink: (v, p) => this.ingest(this.natures, v, p) },
      { dir: 'types', sink: (v) => this.ingestTypeChart(v) },
      { dir: 'encounters', sink: (v, p) => this.ingest(this.areas, v, p) },
      { dir: 'evolution', sink: () => undefined },
    ];

    for (const [path, value] of Object.entries(files)) {
      const route = routes.find((r) => path.includes(`/${r.dir}/`));
      if (!route) {
        log.warn(`Unbekanntes Datenverzeichnis fuer "${path}" - wird ignoriert`);
        continue;
      }
      route.sink(value, path);
    }

    this.dexOrder = this.species.all().sort((a, b) => a.dex - b.dex);
    this.validateTypeChart();
    this.loaded = true;
    log.info(
      `Inhalte geladen: ${this.species.size} Kreaturen, ${this.moves.size} Attacken, ` +
        `${this.items.size} Gegenstaende, ${this.areas.size} Gebiete, ` +
        `${this.trainers.size} Trainer, ${this.dialogues.size} Dialoge, ${this.quests.size} Quests`,
    );
  }

  private ingest<T extends { id: string }>(
    registry: Registry<T>,
    value: unknown,
    path: string,
  ): void {
    if (Array.isArray(value)) registry.registerAll(value as T[], path);
    else if (value && typeof value === 'object') registry.register(value as T, path);
    else throw new Error(`${path}: JSON muss ein Objekt oder Array sein`);
  }

  private ingestStory(value: unknown, path: string): void {
    // Story-Ordner enthaelt Stufen (mit `stage`) und Cutscenes (mit `steps`).
    const entries = Array.isArray(value) ? value : [value];
    for (const raw of entries) {
      const entry = raw as Record<string, unknown>;
      if ('steps' in entry) this.cutscenes.register(entry as unknown as CutsceneData, path);
      else if ('stage' in entry)
        this.storyStages.register(entry as unknown as StoryStageData & { id: string }, path);
      else throw new Error(`${path}: Story-Eintrag ist weder Stufe noch Cutscene`);
    }
  }

  private ingestTypeChart(value: unknown): void {
    const data = value as TypeChartData;
    if (!data || typeof data.chart !== 'object') {
      throw new Error('Typentabelle: Feld "chart" fehlt');
    }
    this.typeChart = data.chart;
  }

  private validateTypeChart(): void {
    for (const attacker of ELEMENT_TYPES) {
      const row = this.typeChart[attacker];
      if (!row) throw new Error(`Typentabelle: Zeile fuer "${attacker}" fehlt`);
      for (const defender of ELEMENT_TYPES) {
        if (typeof row[defender] !== 'number') {
          throw new Error(`Typentabelle: Wert ${attacker} -> ${defender} fehlt`);
        }
      }
    }
  }

  /** Effektivitaets-Multiplikator einer Attacke gegen einen einzelnen Typ. */
  effectiveness(attackType: ElementType, defenderType: ElementType): number {
    return this.typeChart[attackType]?.[defenderType] ?? 1;
  }

  /** Gesamteffektivitaet gegen ein (moeglicherweise doppeltes) Typenpaar. */
  effectivenessAgainst(attackType: ElementType, defenderTypes: readonly ElementType[]): number {
    let mult = 1;
    for (const t of defenderTypes) mult *= this.effectiveness(attackType, t);
    return mult;
  }

  getDexOrder(): readonly SpeciesData[] {
    return this.dexOrder;
  }

  /** Nur fuer Tests: setzt die Registry zurueck. */
  reset(): void {
    for (const r of [
      this.species, this.moves, this.abilities, this.items, this.trainers,
      this.areas, this.dialogues, this.quests, this.shops, this.gyms,
      this.raids, this.leagues, this.cutscenes, this.storyStages, this.natures,
    ]) {
      r.clear();
    }
    this.typeChart = {};
    this.dexOrder = [];
    this.loaded = false;
  }
}

export const GameData = new GameDataRegistry();
export type { GameDataRegistry };
