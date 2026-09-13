import type { RenderStats } from '@/engine/Renderer';
import { Logger } from '@/core/Logger';

export interface DebugSource {
  stats(): RenderStats;
  info(): Record<string, string | number>;
  quality(): string;
}

/**
 * Entwickler-Anzeige (F1).
 *
 * Zeigt Bildrate, Zeichenaufrufe, Speicherzahlen und den Spielzustand sowie
 * die letzten Protokollmeldungen. Wird nur auf Anforderung aufgebaut und
 * aktualisiert sich viermal je Sekunde, damit die Anzeige nicht flackert
 * und keine Messzeit kostet.
 */
export class DebugOverlay {
  private readonly root: HTMLElement;
  private readonly statsNode: HTMLElement;
  private readonly infoNode: HTMLElement;
  private readonly logNode: HTMLElement;
  private timer = 0;
  private visible = false;

  constructor(parent: HTMLElement, private readonly source: DebugSource) {
    this.statsNode = document.createElement('div');
    this.infoNode = document.createElement('div');
    this.logNode = document.createElement('div');
    this.logNode.className = 'debug-log';

    this.root = document.createElement('div');
    this.root.className = 'debug-overlay';
    this.root.hidden = true;
    this.root.append(this.statsNode, this.infoNode, this.logNode);
    parent.appendChild(this.root);
  }

  get isVisible(): boolean { return this.visible; }

  toggle(): boolean {
    this.visible = !this.visible;
    this.root.hidden = !this.visible;
    if (this.visible) this.refresh();
    return this.visible;
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.25;
    this.refresh();
  }

  private refresh(): void {
    const s = this.source.stats();
    this.statsNode.textContent = [
      `${s.fps.toFixed(0)} FPS (${s.frameMs.toFixed(1)} ms)`,
      `Qualitaet: ${this.source.quality()}`,
      `Zeichenaufrufe: ${s.drawCalls}`,
      `Dreiecke: ${s.triangles.toLocaleString('de-DE')}`,
      `Geometrien: ${s.geometries} · Texturen: ${s.textures} · Programme: ${s.programs}`,
    ].join('\n');

    const info = this.source.info();
    this.infoNode.textContent = Object.entries(info)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    const errors = Logger.getErrorCount();
    this.logNode.textContent = [
      `Fehler im Protokoll: ${errors}`,
      ...Logger.getRecords().slice(-6).map((e) => `${e.level} [${e.scope}] ${e.message}`),
    ].join('\n');
    this.logNode.classList.toggle('has-errors', errors > 0);
  }

  dispose(): void {
    this.root.remove();
  }
}
